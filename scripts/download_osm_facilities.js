import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import notifier from 'node-notifier'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter'
]
const OUTPUT_DIR = path.join(__dirname, '../public/data/facilities')
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1200

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

const buildQuery = (body) => `
[out:json][timeout:180];
area["ISO3166-1"="JP"][admin_level=2]->.a;
(
${body}
);
out center tags;
`

const QUERIES = [
  {
    output: 'landing_sites.geojson',
    category: 'landing',
    parts: [
      `
  node["aeroway"="aerodrome"](area.a);
  way["aeroway"="aerodrome"](area.a);
  relation["aeroway"="aerodrome"](area.a);`,
      `
  node["aeroway"="heliport"](area.a);
  way["aeroway"="heliport"](area.a);
  relation["aeroway"="heliport"](area.a);`
    ]
  },
  {
    output: 'military_bases.geojson',
    category: 'military',
    parts: [
      `
  node["military"="base"](area.a);
  way["military"="base"](area.a);
  relation["military"="base"](area.a);`,
      `
  node["military"="barracks"](area.a);
  way["military"="barracks"](area.a);
  relation["military"="barracks"](area.a);`,
      `
  node["military"="airfield"](area.a);
  way["military"="airfield"](area.a);
  relation["military"="airfield"](area.a);`,
      `
  node["landuse"="military"](area.a);
  way["landuse"="military"](area.a);
  relation["landuse"="military"](area.a);`
    ]
  },
  {
    output: 'fire_stations.geojson',
    category: 'fire',
    parts: [
      `
  node["amenity"="fire_station"](area.a);
  way["amenity"="fire_station"](area.a);
  relation["amenity"="fire_station"](area.a);`
    ]
  },
  {
    output: 'medical_facilities.geojson',
    category: 'medical',
    parts: [
      `
  node["amenity"="hospital"](area.a);
  way["amenity"="hospital"](area.a);
  relation["amenity"="hospital"](area.a);`,
      `
  node["amenity"="clinic"](area.a);
  way["amenity"="clinic"](area.a);
  relation["amenity"="clinic"](area.a);`
    ]
  }
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const pickName = (tags) => {
  if (!tags) return '名称不明'
  return (
    tags.name ||
    tags['name:ja'] ||
    tags['name:en'] ||
    tags.operator ||
    tags.ref ||
    '名称不明'
  )
}

const toPoint = (element) => {
  if (element.type === 'node' && typeof element.lat === 'number' && typeof element.lon === 'number') {
    return [element.lon, element.lat]
  }
  if (element.center && typeof element.center.lat === 'number' && typeof element.center.lon === 'number') {
    return [element.center.lon, element.center.lat]
  }
  return null
}

const toFeature = (element, category) => {
  const coord = toPoint(element)
  if (!coord) return null
  const tags = element.tags || {}
  return {
    type: 'Feature',
    properties: {
      id: `${element.type}/${element.id}`,
      name: pickName(tags),
      category,
      source: 'OSM',
      osmType: element.type,
      osmId: element.id,
      aeroway: tags.aeroway,
      military: tags.military,
      amenity: tags.amenity,
      landuse: tags.landuse,
      operator: tags.operator
    },
    geometry: {
      type: 'Point',
      coordinates: coord
    }
  }
}

const fetchOverpass = async (query, label) => {
  let lastError = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: query
        })

        if (!response.ok) {
          throw new Error(`Overpass error: ${response.status} ${response.statusText}`)
        }
        return response.json()
      } catch (error) {
        lastError = error
        console.warn(`[${label}] ${endpoint} failed (attempt ${attempt})`, error?.message || error)
        await sleep(RETRY_BASE_MS * attempt)
      }
    }
  }
  throw lastError ?? new Error(`Overpass error: ${label}`)
}

const run = async () => {
  for (const config of QUERIES) {
    console.log(`Fetching ${config.output}...`)
    const seen = new Set()
    const features = []
    const failures = []

    for (let index = 0; index < config.parts.length; index += 1) {
      const part = config.parts[index]
      const query = buildQuery(part)
      const label = `${config.output}#${index + 1}`
      try {
        const json = await fetchOverpass(query, label)
        for (const element of json.elements || []) {
          const key = `${element.type}/${element.id}`
          if (seen.has(key)) continue
          seen.add(key)
          const feature = toFeature(element, config.category)
          if (feature) features.push(feature)
        }
      } catch (error) {
        failures.push({ label, error })
        console.warn(`Failed part ${label}:`, error?.message || error)
      }
      await sleep(1200)
    }

    const outPath = path.join(OUTPUT_DIR, config.output)
    fs.writeFileSync(
      outPath,
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
      'utf-8'
    )
    console.log(`Saved ${features.length} features -> ${outPath}`)

    if (failures.length > 0) {
      console.warn(
        `Partial failures for ${config.output}: ${failures.map((f) => f.label).join(', ')}`
      )
    }
  }

  notifier.notify({
    title: 'OSM施設データダウンロード完了',
    message: 'すべてのデータ取得が完了しました',
    sound: false
  })
}

run().catch((error) => {
  console.error('Failed to download facilities:', error)
  notifier.notify({
    title: 'OSM施設データダウンロード失敗',
    message: 'エラーが発生しました',
    sound: false
  })
  process.exit(1)
})
