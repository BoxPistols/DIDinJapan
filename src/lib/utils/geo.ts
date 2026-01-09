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

  const processCoord = (coord: number[]) => {
    if (coord[0] < minLng) minLng = coord[0]
    if (coord[0] > maxLng) maxLng = coord[0]
    if (coord[1] < minLat) minLat = coord[1]
    if (coord[1] > maxLat) maxLat = coord[1]
  }

  const traverse = (coords: any): void => {
    if (typeof coords[0] === 'number') {
      processCoord(coords as number[])
    } else {
      coords.forEach(traverse)
    }
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
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
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
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  )

  const lng2 = lng1 + Math.atan2(
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
export function pointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
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
 * Convert wind direction in degrees to compass direction
 */
export function degreesToCompass(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const index = Math.round(degrees / 22.5) % 16
  return directions[index]
}

/**
 * Convert wind direction to Japanese
 */
export function degreesToJapanese(degrees: number): string {
  const directions = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西']
  const index = Math.round(degrees / 22.5) % 16
  return directions[index]
}

/**
 * Generate mock GeoJSON for Buildings (地物)
 */
export function generateBuildingsGeoJSON(): GeoJSON.FeatureCollection {
  const mockBuildings: Array<{ id: string; name: string; coordinates: [number, number]; radiusKm: number }> = [
    {
      id: 'building-1',
      name: '主要駅舎（見本）',
      coordinates: [139.7650, 35.6730],
      radiusKm: 0.3
    },
    {
      id: 'building-2',
      name: '商業施設（見本）',
      coordinates: [139.7500, 35.6850],
      radiusKm: 0.4
    },
    {
      id: 'building-3',
      name: 'オフィスビル（見本）',
      coordinates: [139.7350, 35.6650],
      radiusKm: 0.25
    },
    {
      id: 'building-4',
      name: '公共施設（見本）',
      coordinates: [139.7300, 35.6900],
      radiusKm: 0.35
    }
  ]

  const features: GeoJSON.Feature[] = mockBuildings.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      type: 'building'
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate mock GeoJSON for Wind Field (風向・風量)
 */
export function generateWindFieldGeoJSON(): GeoJSON.FeatureCollection {
  const mockWinds: Array<{ id: string; name: string; coordinates: [number, number]; direction: number; speed: number }> = [
    {
      id: 'wind-1',
      name: '北西の風（見本）',
      coordinates: [139.7500, 35.6800],
      direction: 315,
      speed: 5.2
    },
    {
      id: 'wind-2',
      name: '西の風（見本）',
      coordinates: [139.7400, 35.6700],
      direction: 270,
      speed: 4.8
    },
    {
      id: 'wind-3',
      name: '南西の風（見本）',
      coordinates: [139.7600, 35.6600],
      direction: 225,
      speed: 3.5
    },
    {
      id: 'wind-4',
      name: '北の風（見本）',
      coordinates: [139.7300, 35.6900],
      direction: 0,
      speed: 6.1
    }
  ]

  const features: GeoJSON.Feature[] = mockWinds.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      direction: item.direction,
      speed: item.speed,
      type: 'wind'
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
 */
export function generateLTECoverageGeoJSON(): GeoJSON.FeatureCollection {
  const mockLTE: Array<{ id: string; name: string; coordinates: [number, number]; radiusKm: number; strength: number }> = [
    {
      id: 'lte-1',
      name: '高強度エリア（見本）',
      coordinates: [139.7500, 35.6800],
      radiusKm: 2.0,
      strength: 95
    },
    {
      id: 'lte-2',
      name: '中強度エリア（見本）',
      coordinates: [139.7200, 35.6500],
      radiusKm: 1.5,
      strength: 75
    },
    {
      id: 'lte-3',
      name: '低強度エリア（見本）',
      coordinates: [139.7800, 35.7000],
      radiusKm: 1.2,
      strength: 45
    },
    {
      id: 'lte-4',
      name: 'サービスエリア外（見本）',
      coordinates: [139.7000, 35.6300],
      radiusKm: 0.8,
      strength: 20
    }
  ]

  const features: GeoJSON.Feature[] = mockLTE.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      strength: item.strength,
      type: 'lte'
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}
