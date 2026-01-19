/**
 * Geographic Utility Functions
 */

/**
 * Calculate bounding box from GeoJSON geometry
 */
export function calculateBBox(geometry: GeoJSON.Geometry): [number, number, number, number] {
  let minLng = 180
  let minLat = 90
  let maxLng = -180
  let maxLat = -90

  const processCoord = (coord: readonly unknown[]) => {
    const lng = coord[0]
    const lat = coord[1]
    if (typeof lng !== 'number' || typeof lat !== 'number') return
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  const traverse = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return
    const first = coords[0]
    if (typeof first === 'number') {
      processCoord(coords)
      return
    }
    for (const child of coords) traverse(child)
  }

  if ('coordinates' in geometry) {
    traverse(geometry.coordinates)
  }

  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Calculate distance between two points (Haversine formula)
 * @returns distance in kilometers
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Create a circle polygon around a point
 * @param center [lng, lat]
 * @param radiusKm radius in kilometers
 * @param points number of points to approximate circle (default: 32 for smooth but efficient circles)
 */
export function createCirclePolygon(
  center: [number, number],
  radiusKm: number,
  points: number = 32
): GeoJSON.Polygon {
  const coords: [number, number][] = []
  const [lng, lat] = center

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 360
    const point = destinationPoint(lat, lng, radiusKm, angle)
    coords.push([point[1], point[0]])
  }

  return {
    type: 'Polygon',
    coordinates: [coords]
  }
}

/**
 * Calculate destination point given start point, distance and bearing
 */
function destinationPoint(
  lat: number,
  lng: number,
  distanceKm: number,
  bearing: number
): [number, number] {
  const R = 6371 // Earth's radius in km
  const d = distanceKm / R
  const brng = toRad(bearing)
  const lat1 = toRad(lat)
  const lng1 = toRad(lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  )

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    )

  return [toDeg(lat2), toDeg(lng2)]
}

function toDeg(rad: number): number {
  return rad * (180 / Math.PI)
}

/**
 * Check if a point is inside a polygon
 */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Merge multiple bounding boxes into one
 */
export function mergeBBoxes(
  bboxes: [number, number, number, number][]
): [number, number, number, number] {
  if (bboxes.length === 0) {
    return [0, 0, 0, 0]
  }

  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const [bMinLng, bMinLat, bMaxLng, bMaxLat] of bboxes) {
    if (bMinLng < minLng) minLng = bMinLng
    if (bMinLat < minLat) minLat = bMinLat
    if (bMaxLng > maxLng) maxLng = bMaxLng
    if (bMaxLat > maxLat) maxLat = bMaxLat
  }

  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(lng: number, lat: number): string {
  const lngDir = lng >= 0 ? 'E' : 'W'
  const latDir = lat >= 0 ? 'N' : 'S'
  return `${Math.abs(lat).toFixed(6)}°${latDir}, ${Math.abs(lng).toFixed(6)}°${lngDir}`
}

/**
 * Convert decimal degrees to degrees, minutes, seconds format (DMS)
 * @param decimal Decimal degrees
 * @param isLat Whether the coordinate is latitude
 * @param locale 'en' for N/S/E/W suffix, 'ja' for 北緯/南緯/東経/西経 prefix
 */
export const convertDecimalToDMS = (
  decimal: number,
  isLat: boolean,
  locale: 'en' | 'ja' = 'en'
): string => {
  const abs = Math.abs(decimal)
  let degrees = Math.floor(abs)
  let minutes = Math.floor((abs - degrees) * 60)
  let seconds = ((abs - degrees) * 60 - minutes) * 60

  // 丸め処理による繰り上がり対応
  if (parseFloat(seconds.toFixed(2)) >= 60) {
    seconds = 0
    minutes++
    if (minutes >= 60) {
      minutes = 0
      degrees++
    }
  }

  if (locale === 'ja') {
    const direction = isLat ? (decimal >= 0 ? '北緯' : '南緯') : decimal >= 0 ? '東経' : '西経'
    return `${direction}${degrees}°${minutes}'${seconds.toFixed(2)}"`
  }

  const direction = isLat ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'W'
  return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`
}

/**
 * Convert decimal degrees to degrees, minutes, seconds format (DMS)
 * Useful for NOTAM applications that require DMS format
 * Example: 35.681200°, 139.767100° → 35°40'52.32"N, 139°46'01.56"E
 */
export function formatCoordinatesDMS(
  lng: number,
  lat: number,
  options: { locale?: 'en' | 'ja'; separator?: string } = {}
): string {
  const { locale = 'en', separator = ', ' } = options
  const latDMS = convertDecimalToDMS(lat, true, locale)
  const lngDMS = convertDecimalToDMS(lng, false, locale)

  return `${latDMS}${separator}${lngDMS}`
}

/**
 * Convert wind direction in degrees to compass direction
 */
export function degreesToCompass(degrees: number): string {
  const directions = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW'
  ]
  const index = Math.round(degrees / 22.5) % 16
  return directions[index]
}

/**
 * Convert wind direction to Japanese
 */
export function degreesToJapanese(degrees: number): string {
  const directions = [
    '北',
    '北北東',
    '北東',
    '東北東',
    '東',
    '東南東',
    '南東',
    '南南東',
    '南',
    '南南西',
    '南西',
    '西南西',
    '西',
    '西北西',
    '北西',
    '北北西'
  ]
  const index = Math.round(degrees / 22.5) % 16
  return directions[index]
}

/**
 * Generate mock GeoJSON for Buildings (地物)
 * 地物（建物・構造物）- 障害物となる建造物
 */
export function generateBuildingsGeoJSON(): GeoJSON.FeatureCollection {
  const mockBuildings: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    radiusKm: number
    buildingType:
      | 'station'
      | 'commercial'
      | 'office'
      | 'public'
      | 'tower'
      | 'bridge'
      | 'powerline'
      | 'antenna'
      | 'other'
    height: { ground: number; asl: number; rooftop?: number }
    obstacleLight?: { type: 'low' | 'medium' | 'high'; color: 'red' | 'white' | 'dual' }
    owner?: { name: string; contact?: string }
    materials?: string[]
    constructionYear?: number
    importance: 'critical' | 'major' | 'minor'
    description?: string
  }> = [
    {
      id: 'building-1',
      name: '東京駅（見本）',
      nameEn: 'Tokyo Station (Sample)',
      coordinates: [139.7671, 35.6812],
      radiusKm: 0.25,
      buildingType: 'station',
      height: { ground: 46, asl: 50, rooftop: 50 },
      owner: { name: 'JR東日本', contact: '03-5334-1111' },
      materials: ['鉄骨造', 'レンガ'],
      constructionYear: 1914,
      importance: 'critical',
      description: '主要ターミナル駅、周辺は高密度ビル群'
    },
    {
      id: 'building-2',
      name: '東京スカイツリー（見本）',
      nameEn: 'Tokyo Skytree (Sample)',
      coordinates: [139.8107, 35.7101],
      radiusKm: 0.15,
      buildingType: 'tower',
      height: { ground: 634, asl: 640, rooftop: 634 },
      obstacleLight: { type: 'high', color: 'dual' },
      owner: { name: '東武鉄道', contact: '03-5302-3470' },
      materials: ['鉄骨造'],
      constructionYear: 2012,
      importance: 'critical',
      description: '日本最高の電波塔、航空障害灯あり'
    },
    {
      id: 'building-3',
      name: '東京タワー（見本）',
      nameEn: 'Tokyo Tower (Sample)',
      coordinates: [139.7454, 35.6586],
      radiusKm: 0.1,
      buildingType: 'tower',
      height: { ground: 333, asl: 358 },
      obstacleLight: { type: 'high', color: 'red' },
      owner: { name: '日本電波塔株式会社' },
      materials: ['鉄骨造'],
      constructionYear: 1958,
      importance: 'critical',
      description: '電波塔、周辺は飛行制限あり'
    },
    {
      id: 'building-4',
      name: '新宿住友ビル（見本）',
      nameEn: 'Shinjuku Sumitomo Building (Sample)',
      coordinates: [139.6917, 35.6897],
      radiusKm: 0.08,
      buildingType: 'office',
      height: { ground: 210, asl: 245, rooftop: 215 },
      obstacleLight: { type: 'medium', color: 'red' },
      owner: { name: '住友不動産' },
      materials: ['鉄骨鉄筋コンクリート造'],
      constructionYear: 1974,
      importance: 'major',
      description: '超高層オフィスビル'
    },
    {
      id: 'building-5',
      name: '渋谷スクランブルスクエア（見本）',
      nameEn: 'Shibuya Scramble Square (Sample)',
      coordinates: [139.7016, 35.658],
      radiusKm: 0.07,
      buildingType: 'commercial',
      height: { ground: 230, asl: 255, rooftop: 235 },
      obstacleLight: { type: 'medium', color: 'red' },
      owner: { name: '東急グループ' },
      materials: ['鉄骨造'],
      constructionYear: 2019,
      importance: 'major',
      description: '複合商業施設、展望施設あり'
    },
    {
      id: 'building-6',
      name: 'レインボーブリッジ（見本）',
      nameEn: 'Rainbow Bridge (Sample)',
      coordinates: [139.7635, 35.6369],
      radiusKm: 0.8,
      buildingType: 'bridge',
      height: { ground: 126, asl: 126, rooftop: 126 },
      obstacleLight: { type: 'medium', color: 'white' },
      owner: { name: '首都高速道路株式会社' },
      materials: ['鉄骨造'],
      constructionYear: 1993,
      importance: 'major',
      description: '吊り橋、主塔高126m、下部通過時注意'
    },
    {
      id: 'building-7',
      name: '送電線鉄塔群（見本）',
      nameEn: 'Power Line Tower Array (Sample)',
      coordinates: [139.62, 35.75],
      radiusKm: 0.3,
      buildingType: 'powerline',
      height: { ground: 80, asl: 120, rooftop: 85 },
      obstacleLight: { type: 'low', color: 'red' },
      owner: { name: '東京電力パワーグリッド' },
      materials: ['鋼管'],
      importance: 'critical',
      description: '高圧送電線、電磁干渉の可能性あり'
    },
    {
      id: 'building-8',
      name: '携帯基地局アンテナ（見本）',
      nameEn: 'Cell Tower Antenna (Sample)',
      coordinates: [139.73, 35.71],
      radiusKm: 0.05,
      buildingType: 'antenna',
      height: { ground: 45, asl: 65, rooftop: 50 },
      obstacleLight: { type: 'low', color: 'red' },
      owner: { name: 'NTTドコモ' },
      materials: ['鋼管'],
      importance: 'minor',
      description: '携帯電話基地局、ビル屋上設置'
    },
    {
      id: 'building-9',
      name: '国会議事堂（見本）',
      nameEn: 'National Diet Building (Sample)',
      coordinates: [139.745, 35.6759],
      radiusKm: 0.15,
      buildingType: 'public',
      height: { ground: 65, asl: 85 },
      owner: { name: '衆議院・参議院' },
      materials: ['鉄筋コンクリート造', '花崗�ite'],
      constructionYear: 1936,
      importance: 'critical',
      description: '重要施設、飛行禁止区域内'
    },
    {
      id: 'building-10',
      name: '六本木ヒルズ森タワー（見本）',
      nameEn: 'Roppongi Hills Mori Tower (Sample)',
      coordinates: [139.7292, 35.6605],
      radiusKm: 0.1,
      buildingType: 'office',
      height: { ground: 238, asl: 270, rooftop: 250 },
      obstacleLight: { type: 'high', color: 'red' },
      owner: { name: '森ビル株式会社' },
      materials: ['鉄骨造'],
      constructionYear: 2003,
      importance: 'major',
      description: '複合施設、ヘリポート併設'
    }
  ]

  const features: GeoJSON.Feature[] = mockBuildings.map((item) => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      type: 'building',
      buildingType: item.buildingType,
      height: item.height,
      obstacleLight: item.obstacleLight,
      owner: item.owner,
      materials: item.materials,
      constructionYear: item.constructionYear,
      importance: item.importance,
      description: item.description
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate mock GeoJSON for Wind Field (風向・風量)
 * 風向・風量観測点 - 気象観測データ
 */
export function generateWindFieldGeoJSON(): GeoJSON.FeatureCollection {
  const mockWinds: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    observation: {
      direction: number
      speed: number
      gust?: number
      variability?: number
    }
    altitude: number
    timestamp: string
    station: {
      id: string
      name: string
      type: 'amedas' | 'airport' | 'private' | 'buoy'
      elevation: number
    }
    forecast?: {
      direction: number
      speed: number
      validUntil: string
    }
    warnings?: Array<{
      type: 'gale' | 'storm' | 'gusty' | 'turbulence'
      severity: 'advisory' | 'warning' | 'critical'
      message: string
    }>
  }> = [
    {
      id: 'wind-1',
      name: '東京（見本）',
      nameEn: 'Tokyo (Sample)',
      coordinates: [139.75, 35.68],
      observation: {
        direction: 315,
        speed: 5.2,
        gust: 8.5,
        variability: 20
      },
      altitude: 10,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'AMEDAS-44132',
        name: '東京アメダス',
        type: 'amedas',
        elevation: 25
      },
      forecast: {
        direction: 300,
        speed: 6.0,
        validUntil: '2024-01-15T18:00:00+09:00'
      }
    },
    {
      id: 'wind-2',
      name: '羽田空港（見本）',
      nameEn: 'Haneda Airport (Sample)',
      coordinates: [139.7798, 35.5494],
      observation: {
        direction: 270,
        speed: 8.5,
        gust: 14.2,
        variability: 15
      },
      altitude: 10,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'RJTT-METAR',
        name: '東京国際空港気象観測所',
        type: 'airport',
        elevation: 6
      },
      forecast: {
        direction: 280,
        speed: 9.0,
        validUntil: '2024-01-15T18:00:00+09:00'
      },
      warnings: [
        {
          type: 'gusty',
          severity: 'advisory',
          message: '突風に注意（最大瞬間風速15m/s予想）'
        }
      ]
    },
    {
      id: 'wind-3',
      name: '成田空港（見本）',
      nameEn: 'Narita Airport (Sample)',
      coordinates: [140.3929, 35.772],
      observation: {
        direction: 225,
        speed: 6.8,
        gust: 11.0,
        variability: 25
      },
      altitude: 10,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'RJAA-METAR',
        name: '成田国際空港気象観測所',
        type: 'airport',
        elevation: 41
      },
      forecast: {
        direction: 240,
        speed: 7.5,
        validUntil: '2024-01-15T18:00:00+09:00'
      }
    },
    {
      id: 'wind-4',
      name: '練馬（見本）',
      nameEn: 'Nerima (Sample)',
      coordinates: [139.65, 35.74],
      observation: {
        direction: 0,
        speed: 3.2,
        variability: 30
      },
      altitude: 10,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'AMEDAS-44116',
        name: '練馬アメダス',
        type: 'amedas',
        elevation: 38
      }
    },
    {
      id: 'wind-5',
      name: '東京湾観測ブイ（見本）',
      nameEn: 'Tokyo Bay Buoy (Sample)',
      coordinates: [139.82, 35.58],
      observation: {
        direction: 180,
        speed: 7.5,
        gust: 12.0,
        variability: 10
      },
      altitude: 5,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'BUOY-TKY01',
        name: '東京湾観測ブイ',
        type: 'buoy',
        elevation: 0
      },
      warnings: [
        {
          type: 'gale',
          severity: 'warning',
          message: '海上強風注意報発令中'
        }
      ]
    },
    {
      id: 'wind-6',
      name: '大手町（見本）',
      nameEn: 'Otemachi (Sample)',
      coordinates: [139.7671, 35.6896],
      observation: {
        direction: 290,
        speed: 4.1,
        gust: 7.2,
        variability: 35
      },
      altitude: 50,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'PRIV-OTE01',
        name: '大手町ビル風観測点',
        type: 'private',
        elevation: 10
      },
      warnings: [
        {
          type: 'turbulence',
          severity: 'advisory',
          message: 'ビル風による乱流注意'
        }
      ]
    },
    {
      id: 'wind-7',
      name: '八王子（見本）',
      nameEn: 'Hachioji (Sample)',
      coordinates: [139.3167, 35.6667],
      observation: {
        direction: 45,
        speed: 2.8,
        variability: 40
      },
      altitude: 10,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'AMEDAS-44056',
        name: '八王子アメダス',
        type: 'amedas',
        elevation: 123
      }
    },
    {
      id: 'wind-8',
      name: '横浜（見本）',
      nameEn: 'Yokohama (Sample)',
      coordinates: [139.638, 35.4437],
      observation: {
        direction: 200,
        speed: 5.5,
        gust: 9.8,
        variability: 20
      },
      altitude: 10,
      timestamp: '2024-01-15T12:00:00+09:00',
      station: {
        id: 'AMEDAS-46106',
        name: '横浜アメダス',
        type: 'amedas',
        elevation: 39
      },
      forecast: {
        direction: 210,
        speed: 6.0,
        validUntil: '2024-01-15T18:00:00+09:00'
      }
    }
  ]

  const features: GeoJSON.Feature[] = mockWinds.map((item) => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      type: 'wind',
      observation: item.observation,
      altitude: item.altitude,
      timestamp: item.timestamp,
      station: item.station,
      forecast: item.forecast,
      warnings: item.warnings,
      // 簡易表示用
      direction: item.observation.direction,
      speed: item.observation.speed
    },
    geometry: {
      type: 'Point',
      coordinates: [item.coordinates[0], item.coordinates[1]]
    }
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate mock GeoJSON for LTE Coverage (LTE)
 * LTE電波強度 - 携帯電話通信カバレッジ
 */
export function generateLTECoverageGeoJSON(): GeoJSON.FeatureCollection {
  const mockLTE: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    radiusKm: number
    coverage: {
      strength: number
      quality: 'excellent' | 'good' | 'fair' | 'poor' | 'none'
      bandwidth?: number
      latency?: number
    }
    carrier: {
      name: string
      frequency?: number[]
      technology: 'LTE' | '5G' | 'LTE-A' | 'mixed'
    }
    altitude?: {
      groundLevel: number
      altitude50m?: number
      altitude100m?: number
      altitude150m?: number
    }
    reliability?: number
    lastMeasured: string
    description?: string
  }> = [
    {
      id: 'lte-1',
      name: '都心部 5Gエリア（見本）',
      nameEn: 'Central Tokyo 5G Area (Sample)',
      coordinates: [139.7671, 35.6812],
      radiusKm: 1.5,
      coverage: {
        strength: 98,
        quality: 'excellent',
        bandwidth: 500,
        latency: 5
      },
      carrier: {
        name: 'NTT Docomo',
        frequency: [3700, 4500, 28000],
        technology: '5G'
      },
      altitude: {
        groundLevel: 98,
        altitude50m: 95,
        altitude100m: 88,
        altitude150m: 75
      },
      reliability: 99.5,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '東京駅周辺、高速通信エリア'
    },
    {
      id: 'lte-2',
      name: '新宿エリア（見本）',
      nameEn: 'Shinjuku Area (Sample)',
      coordinates: [139.7, 35.69],
      radiusKm: 2.0,
      coverage: {
        strength: 92,
        quality: 'excellent',
        bandwidth: 300,
        latency: 10
      },
      carrier: {
        name: 'au (KDDI)',
        frequency: [2100, 2600, 3500],
        technology: 'LTE-A'
      },
      altitude: {
        groundLevel: 92,
        altitude50m: 88,
        altitude100m: 80,
        altitude150m: 65
      },
      reliability: 98.5,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '新宿副都心エリア'
    },
    {
      id: 'lte-3',
      name: '渋谷エリア（見本）',
      nameEn: 'Shibuya Area (Sample)',
      coordinates: [139.7016, 35.658],
      radiusKm: 1.8,
      coverage: {
        strength: 88,
        quality: 'good',
        bandwidth: 200,
        latency: 15
      },
      carrier: {
        name: 'SoftBank',
        frequency: [900, 1800, 2100],
        technology: 'LTE'
      },
      altitude: {
        groundLevel: 88,
        altitude50m: 82,
        altitude100m: 70,
        altitude150m: 55
      },
      reliability: 97,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '渋谷駅周辺'
    },
    {
      id: 'lte-4',
      name: '多摩ニュータウンエリア（見本）',
      nameEn: 'Tama New Town Area (Sample)',
      coordinates: [139.42, 35.62],
      radiusKm: 3.0,
      coverage: {
        strength: 75,
        quality: 'good',
        bandwidth: 100,
        latency: 25
      },
      carrier: {
        name: 'Rakuten Mobile',
        frequency: [1700],
        technology: 'LTE'
      },
      altitude: {
        groundLevel: 75,
        altitude50m: 68,
        altitude100m: 55,
        altitude150m: 40
      },
      reliability: 92,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '郊外住宅地エリア'
    },
    {
      id: 'lte-5',
      name: '山間部エリア（見本）',
      nameEn: 'Mountain Area (Sample)',
      coordinates: [139.25, 35.75],
      radiusKm: 2.5,
      coverage: {
        strength: 45,
        quality: 'fair',
        bandwidth: 30,
        latency: 50
      },
      carrier: {
        name: 'NTT Docomo',
        frequency: [800],
        technology: 'LTE'
      },
      altitude: {
        groundLevel: 45,
        altitude50m: 55,
        altitude100m: 60,
        altitude150m: 65
      },
      reliability: 80,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '山間部、高度上昇で改善傾向'
    },
    {
      id: 'lte-6',
      name: '海上エリア（見本）',
      nameEn: 'Offshore Area (Sample)',
      coordinates: [139.85, 35.52],
      radiusKm: 4.0,
      coverage: {
        strength: 30,
        quality: 'poor',
        bandwidth: 10,
        latency: 100
      },
      carrier: {
        name: 'au (KDDI)',
        frequency: [800],
        technology: 'LTE'
      },
      altitude: {
        groundLevel: 30,
        altitude50m: 40,
        altitude100m: 50,
        altitude150m: 55
      },
      reliability: 60,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '東京湾沖、通信不安定'
    },
    {
      id: 'lte-7',
      name: '圏外エリア（見本）',
      nameEn: 'No Service Area (Sample)',
      coordinates: [139.15, 35.85],
      radiusKm: 1.5,
      coverage: {
        strength: 5,
        quality: 'none',
        bandwidth: 0,
        latency: 0
      },
      carrier: {
        name: 'N/A',
        technology: 'LTE'
      },
      altitude: {
        groundLevel: 5,
        altitude50m: 10,
        altitude100m: 15,
        altitude150m: 20
      },
      reliability: 0,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '山間部圏外、衛星通信推奨'
    },
    {
      id: 'lte-8',
      name: '羽田空港周辺（見本）',
      nameEn: 'Haneda Airport Area (Sample)',
      coordinates: [139.7798, 35.5494],
      radiusKm: 2.5,
      coverage: {
        strength: 95,
        quality: 'excellent',
        bandwidth: 400,
        latency: 8
      },
      carrier: {
        name: 'Multi-carrier',
        frequency: [700, 900, 1800, 2100, 3500],
        technology: 'mixed'
      },
      altitude: {
        groundLevel: 95,
        altitude50m: 90,
        altitude100m: 82,
        altitude150m: 70
      },
      reliability: 99,
      lastMeasured: '2024-01-10T10:00:00+09:00',
      description: '空港エリア、複数キャリア対応'
    }
  ]

  const features: GeoJSON.Feature[] = mockLTE.map((item) => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      type: 'lte',
      coverage: item.coverage,
      carrier: item.carrier,
      altitude: item.altitude,
      reliability: item.reliability,
      lastMeasured: item.lastMeasured,
      description: item.description,
      // 簡易表示用
      strength: item.coverage.strength
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate GeoJSON for Radio Interference Zones (電波干渉区域)
 * 携帯電話基地局・放送局周辺のドローン制御に影響を与える可能性のある区域
 *
 * データソース: map-auto-waypointプロジェクトより移植
 * 注意: 実際の電波干渉状況は現場での確認が必要です
 */
export function generateRadioInterferenceGeoJSON(): GeoJSON.FeatureCollection {
  const radioZones: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    radiusKm: number
    frequency: string
    interferenceLevel: 'high' | 'medium' | 'low'
    description?: string
  }> = [
    {
      id: 'radio-skytree',
      name: '東京スカイツリー',
      nameEn: 'Tokyo Skytree',
      coordinates: [139.8107, 35.7101],
      radiusKm: 2.0,
      frequency: 'LTE/5G/地デジ',
      interferenceLevel: 'high',
      description: '電波塔、強力な電波発信源'
    },
    {
      id: 'radio-tower',
      name: '東京タワー',
      nameEn: 'Tokyo Tower',
      coordinates: [139.7454, 35.6586],
      radiusKm: 1.5,
      frequency: 'LTE/FM',
      interferenceLevel: 'high',
      description: '電波塔、FM放送・携帯基地局'
    },
    {
      id: 'radio-nhk',
      name: 'NHK菖蒲久喜ラジオ放送所',
      nameEn: 'NHK Shobu-Kuki Radio Station',
      coordinates: [139.5833, 36.0667],
      radiusKm: 3.0,
      frequency: 'AM',
      interferenceLevel: 'high',
      description: 'AM放送局、広範囲に影響'
    },
    {
      id: 'radio-nagoya',
      name: '名古屋テレビ塔',
      nameEn: 'Nagoya TV Tower',
      coordinates: [136.9088, 35.1803],
      radiusKm: 1.0,
      frequency: 'LTE',
      interferenceLevel: 'medium',
      description: 'テレビ塔、携帯基地局併設'
    },
    {
      id: 'radio-tsutenkaku',
      name: '通天閣',
      nameEn: 'Tsutenkaku Tower',
      coordinates: [135.5063, 34.6525],
      radiusKm: 0.8,
      frequency: 'LTE',
      interferenceLevel: 'medium',
      description: '通信アンテナ設置'
    },
    {
      id: 'radio-fukuoka',
      name: '福岡タワー',
      nameEn: 'Fukuoka Tower',
      coordinates: [130.3515, 33.593],
      radiusKm: 1.0,
      frequency: 'LTE',
      interferenceLevel: 'medium',
      description: 'テレビ・携帯電話基地局'
    },
    {
      id: 'radio-sapporo',
      name: '札幌テレビ塔',
      nameEn: 'Sapporo TV Tower',
      coordinates: [141.3566, 43.061],
      radiusKm: 0.8,
      frequency: 'LTE',
      interferenceLevel: 'medium',
      description: 'テレビ塔、通信施設'
    },
    {
      id: 'radio-kyoto',
      name: '京都タワー',
      nameEn: 'Kyoto Tower',
      coordinates: [135.7592, 34.9875],
      radiusKm: 0.6,
      frequency: 'LTE',
      interferenceLevel: 'low',
      description: '通信アンテナ設置'
    },
    {
      id: 'radio-landmark',
      name: '横浜ランドマークタワー',
      nameEn: 'Yokohama Landmark Tower',
      coordinates: [139.6325, 35.455],
      radiusKm: 1.0,
      frequency: 'LTE',
      interferenceLevel: 'medium',
      description: '超高層ビル、複数基地局'
    },
    {
      id: 'radio-abeno',
      name: 'あべのハルカス',
      nameEn: 'Abeno Harukas',
      coordinates: [135.5133, 34.6463],
      radiusKm: 1.0,
      frequency: 'LTE/5G',
      interferenceLevel: 'high',
      description: '日本最高層ビル、5G対応'
    }
  ]

  const features: GeoJSON.Feature[] = radioZones.map((item) => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      type: 'radio',
      radiusKm: item.radiusKm,
      frequency: item.frequency,
      interferenceLevel: item.interferenceLevel,
      description: item.description
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate GeoJSON for Manned Aircraft Zones (有人機発着エリア)
 * 農業用・グライダー・水上飛行機等の離着陸場
 *
 * データソース: map-auto-waypointプロジェクトより移植
 * 注意: 座標・半径は参考値です。正確な情報は航空局で確認してください。
 */
/**
 * Generate GeoJSON for Weather Icons overlay
 * 天気アイコンを地図上に表示するためのポイントデータ
 */
export function generateWeatherIconsGeoJSON(): GeoJSON.FeatureCollection {
  // 日本全国の主要都市に天気アイコンを配置
  const weatherPoints: Array<{
    id: string
    name: string
    coordinates: [number, number]
    weather: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'partly_cloudy' | 'stormy'
    temperature: number
    humidity: number
    windSpeed: number
    precipitation: number
  }> = [
    // 北海道
    { id: 'w-sapporo', name: '札幌', coordinates: [141.35, 43.06], weather: 'snowy', temperature: -2, humidity: 70, windSpeed: 3.2, precipitation: 40 },
    { id: 'w-hakodate', name: '函館', coordinates: [140.73, 41.77], weather: 'cloudy', temperature: 1, humidity: 65, windSpeed: 4.5, precipitation: 20 },
    // 東北
    { id: 'w-sendai', name: '仙台', coordinates: [140.87, 38.27], weather: 'partly_cloudy', temperature: 5, humidity: 55, windSpeed: 3.8, precipitation: 10 },
    { id: 'w-akita', name: '秋田', coordinates: [140.10, 39.72], weather: 'snowy', temperature: 0, humidity: 75, windSpeed: 5.2, precipitation: 50 },
    // 関東
    { id: 'w-tokyo', name: '東京', coordinates: [139.75, 35.68], weather: 'sunny', temperature: 12, humidity: 45, windSpeed: 2.5, precipitation: 0 },
    { id: 'w-yokohama', name: '横浜', coordinates: [139.64, 35.44], weather: 'sunny', temperature: 13, humidity: 48, windSpeed: 3.0, precipitation: 0 },
    { id: 'w-chiba', name: '千葉', coordinates: [140.12, 35.61], weather: 'partly_cloudy', temperature: 11, humidity: 50, windSpeed: 4.2, precipitation: 5 },
    { id: 'w-saitama', name: 'さいたま', coordinates: [139.65, 35.86], weather: 'sunny', temperature: 11, humidity: 42, windSpeed: 2.0, precipitation: 0 },
    // 中部
    { id: 'w-nagoya', name: '名古屋', coordinates: [136.91, 35.18], weather: 'cloudy', temperature: 10, humidity: 55, windSpeed: 2.8, precipitation: 15 },
    { id: 'w-niigata', name: '新潟', coordinates: [139.02, 37.90], weather: 'rainy', temperature: 6, humidity: 80, windSpeed: 4.0, precipitation: 60 },
    { id: 'w-kanazawa', name: '金沢', coordinates: [136.63, 36.59], weather: 'rainy', temperature: 7, humidity: 78, windSpeed: 3.5, precipitation: 55 },
    // 近畿
    { id: 'w-osaka', name: '大阪', coordinates: [135.50, 34.69], weather: 'partly_cloudy', temperature: 11, humidity: 52, windSpeed: 2.2, precipitation: 10 },
    { id: 'w-kyoto', name: '京都', coordinates: [135.77, 35.01], weather: 'cloudy', temperature: 9, humidity: 58, windSpeed: 1.8, precipitation: 20 },
    { id: 'w-kobe', name: '神戸', coordinates: [135.19, 34.69], weather: 'partly_cloudy', temperature: 12, humidity: 50, windSpeed: 3.2, precipitation: 5 },
    // 中国・四国
    { id: 'w-hiroshima', name: '広島', coordinates: [132.46, 34.40], weather: 'sunny', temperature: 13, humidity: 48, windSpeed: 2.5, precipitation: 0 },
    { id: 'w-matsuyama', name: '松山', coordinates: [132.77, 33.84], weather: 'sunny', temperature: 14, humidity: 45, windSpeed: 2.0, precipitation: 0 },
    { id: 'w-takamatsu', name: '高松', coordinates: [134.05, 34.34], weather: 'partly_cloudy', temperature: 12, humidity: 50, windSpeed: 2.8, precipitation: 5 },
    // 九州
    { id: 'w-fukuoka', name: '福岡', coordinates: [130.42, 33.60], weather: 'cloudy', temperature: 14, humidity: 55, windSpeed: 3.0, precipitation: 15 },
    { id: 'w-nagasaki', name: '長崎', coordinates: [129.87, 32.75], weather: 'rainy', temperature: 13, humidity: 70, windSpeed: 4.5, precipitation: 45 },
    { id: 'w-kagoshima', name: '鹿児島', coordinates: [130.56, 31.60], weather: 'partly_cloudy', temperature: 16, humidity: 60, windSpeed: 3.8, precipitation: 20 },
    // 沖縄
    { id: 'w-naha', name: '那覇', coordinates: [127.68, 26.21], weather: 'sunny', temperature: 22, humidity: 65, windSpeed: 5.0, precipitation: 10 },
  ]

  const features: GeoJSON.Feature[] = weatherPoints.map((item) => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      weather: item.weather,
      temperature: item.temperature,
      humidity: item.humidity,
      windSpeed: item.windSpeed,
      precipitation: item.precipitation,
      // アイコン用
      icon: getWeatherIcon(item.weather),
      label: `${item.temperature}°C`
    },
    geometry: {
      type: 'Point',
      coordinates: item.coordinates
    }
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Get weather icon emoji based on weather type
 */
function getWeatherIcon(weather: string): string {
  switch (weather) {
    case 'sunny': return '☀️'
    case 'partly_cloudy': return '⛅'
    case 'cloudy': return '☁️'
    case 'rainy': return '🌧️'
    case 'snowy': return '❄️'
    case 'stormy': return '⛈️'
    default: return '🌡️'
  }
}

export function generateMannedAircraftZonesGeoJSON(): GeoJSON.FeatureCollection {
  const zones: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    radiusKm: number
    zoneType: 'agricultural' | 'glider' | 'seaplane' | 'temporary'
    operator?: string
    operatingHours?: string
    description?: string
  }> = [
    // ===== 農業航空施設 =====
    {
      id: 'manned-tsukuba',
      name: '筑波農業航空施設',
      nameEn: 'Tsukuba Agricultural Aviation Facility',
      coordinates: [140.0833, 36.0833],
      radiusKm: 1.0,
      zoneType: 'agricultural',
      operator: 'JA農協',
      operatingHours: '日の出〜日没（農繁期）',
      description: '農薬散布ヘリコプター用'
    },
    {
      id: 'manned-niigata-agri',
      name: '新潟農業航空基地',
      nameEn: 'Niigata Agricultural Aviation Base',
      coordinates: [139.05, 37.9167],
      radiusKm: 1.0,
      zoneType: 'agricultural',
      operator: 'JA農協',
      description: '水稲防除作業用'
    },
    {
      id: 'manned-tokachi',
      name: '北海道農業航空施設（十勝）',
      nameEn: 'Hokkaido Agricultural Aviation (Tokachi)',
      coordinates: [143.15, 43.0],
      radiusKm: 1.5,
      zoneType: 'agricultural',
      operator: 'JA農協',
      description: '広域農業航空施設'
    },
    {
      id: 'manned-saga-agri',
      name: '佐賀農業航空施設',
      nameEn: 'Saga Agricultural Aviation Facility',
      coordinates: [130.3, 33.2667],
      radiusKm: 1.0,
      zoneType: 'agricultural',
      operator: 'JA農協',
      description: '農薬散布用'
    },
    // ===== グライダー離着陸場 =====
    {
      id: 'manned-sekiyado',
      name: '関宿滑空場',
      nameEn: 'Sekiyado Glider Field',
      coordinates: [139.8333, 36.0],
      radiusKm: 2.0,
      zoneType: 'glider',
      operator: '関宿滑空場管理組合',
      description: '日本グライダー連盟加盟'
    },
    {
      id: 'manned-menuma',
      name: '妻沼滑空場',
      nameEn: 'Menuma Glider Field',
      coordinates: [139.3833, 36.2167],
      radiusKm: 2.0,
      zoneType: 'glider',
      operator: '妻沼滑空場管理組合',
      description: '大学グライダー部利用'
    },
    {
      id: 'manned-itakura',
      name: '板倉滑空場',
      nameEn: 'Itakura Glider Field',
      coordinates: [139.6167, 36.2333],
      radiusKm: 2.0,
      zoneType: 'glider',
      description: 'グライダー訓練用'
    },
    {
      id: 'manned-ono',
      name: '大野滑空場',
      nameEn: 'Ono Glider Field',
      coordinates: [136.5, 35.9833],
      radiusKm: 2.0,
      zoneType: 'glider',
      description: '福井県内グライダー施設'
    },
    // ===== 水上飛行機基地 =====
    {
      id: 'manned-biwa',
      name: '琵琶湖水上機基地',
      nameEn: 'Lake Biwa Seaplane Base',
      coordinates: [136.0833, 35.2833],
      radiusKm: 1.5,
      zoneType: 'seaplane',
      description: '水上飛行機離着水場'
    },
    {
      id: 'manned-ashinoko',
      name: '芦ノ湖水上機離着水場',
      nameEn: 'Lake Ashi Seaplane Landing',
      coordinates: [139.0333, 35.2],
      radiusKm: 1.0,
      zoneType: 'seaplane',
      description: '観光水上飛行機用'
    }
  ]

  const features: GeoJSON.Feature[] = zones.map((item) => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      type: 'manned_aircraft',
      radiusKm: item.radiusKm,
      zoneType: item.zoneType,
      operator: item.operator,
      operatingHours: item.operatingHours,
      description: item.description
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}
