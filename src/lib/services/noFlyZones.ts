/**
 * No-Fly Zone Data Service
 * 小型無人機等飛行禁止法の対象施設
 */

import { createCirclePolygon, calculateDistance } from '../utils/geo'

interface NoFlyFacility {
  id: string
  name: string
  nameEn?: string
  type: 'government' | 'imperial' | 'nuclear' | 'defense' | 'airport' | 'foreign_mission'
  coordinates: [number, number]
  radiusKm: number
  zone: 'red' | 'yellow'
}

// 小型無人機等飛行禁止法の対象施設
export const NO_FLY_FACILITIES: NoFlyFacility[] = [
  // 国の重要施設（レッドゾーン）
  {
    id: 'diet',
    name: '国会議事堂',
    nameEn: 'National Diet Building',
    type: 'government',
    coordinates: [139.7450, 35.6759],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'kantei',
    name: '首相官邸',
    nameEn: 'Prime Minister\'s Official Residence',
    type: 'government',
    coordinates: [139.7412, 35.6731],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'supreme-court',
    name: '最高裁判所',
    nameEn: 'Supreme Court of Japan',
    type: 'government',
    coordinates: [139.7424, 35.6795],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'imperial-palace',
    name: '皇居',
    nameEn: 'Imperial Palace',
    type: 'imperial',
    coordinates: [139.7528, 35.6852],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'akasaka-palace',
    name: '赤坂御所',
    nameEn: 'Akasaka Palace',
    type: 'imperial',
    coordinates: [139.7310, 35.6753],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'togu-palace',
    name: '東宮御所',
    nameEn: 'Togu Palace',
    type: 'imperial',
    coordinates: [139.7270, 35.6763],
    radiusKm: 0.3,
    zone: 'red'
  },
  // 危機管理行政機関
  {
    id: 'mlit',
    name: '国土交通省',
    nameEn: 'Ministry of Land, Infrastructure, Transport and Tourism',
    type: 'government',
    coordinates: [139.7501, 35.6746],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'npa',
    name: '警察庁',
    nameEn: 'National Police Agency',
    type: 'government',
    coordinates: [139.7500, 35.6773],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'mod',
    name: '防衛省',
    nameEn: 'Ministry of Defense',
    type: 'defense',
    coordinates: [139.7285, 35.6933],
    radiusKm: 0.3,
    zone: 'red'
  },
  // 原子力発電所（レッドゾーン）
  {
    id: 'kashiwazaki-kariwa',
    name: '柏崎刈羽原子力発電所',
    nameEn: 'Kashiwazaki-Kariwa Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [138.5962, 37.4305],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'hamaoka',
    name: '浜岡原子力発電所',
    nameEn: 'Hamaoka Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [138.1433, 34.6227],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'ohi',
    name: '大飯発電所',
    nameEn: 'Ohi Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [135.6536, 35.5408],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'takahama',
    name: '高浜発電所',
    nameEn: 'Takahama Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [135.5056, 35.5219],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'genkai',
    name: '玄海原子力発電所',
    nameEn: 'Genkai Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [129.8378, 33.5156],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'sendai-npp',
    name: '川内原子力発電所',
    nameEn: 'Sendai Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [130.1900, 31.8353],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'ikata',
    name: '伊方発電所',
    nameEn: 'Ikata Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [132.3083, 33.4906],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'shimane',
    name: '島根原子力発電所',
    nameEn: 'Shimane Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [132.9978, 35.5389],
    radiusKm: 0.3,
    zone: 'red'
  },
  {
    id: 'tomari',
    name: '泊発電所',
    nameEn: 'Tomari Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [140.5114, 43.0353],
    radiusKm: 0.3,
    zone: 'red'
  },
  // 在外公館等（イエローゾーン）- 主要なもの
  {
    id: 'us-embassy',
    name: 'アメリカ大使館',
    nameEn: 'Embassy of the United States',
    type: 'foreign_mission',
    coordinates: [139.7425, 35.6678],
    radiusKm: 0.3,
    zone: 'yellow'
  },
  {
    id: 'china-embassy',
    name: '中国大使館',
    nameEn: 'Embassy of China',
    type: 'foreign_mission',
    coordinates: [139.7353, 35.6558],
    radiusKm: 0.3,
    zone: 'yellow'
  },
  {
    id: 'russia-embassy',
    name: 'ロシア大使館',
    nameEn: 'Embassy of Russia',
    type: 'foreign_mission',
    coordinates: [139.7439, 35.6630],
    radiusKm: 0.3,
    zone: 'yellow'
  },
  {
    id: 'korea-embassy',
    name: '韓国大使館',
    nameEn: 'Embassy of the Republic of Korea',
    type: 'foreign_mission',
    coordinates: [139.7297, 35.6611],
    radiusKm: 0.3,
    zone: 'yellow'
  },
  {
    id: 'uk-embassy',
    name: 'イギリス大使館',
    nameEn: 'Embassy of the United Kingdom',
    type: 'foreign_mission',
    coordinates: [139.7467, 35.6758],
    radiusKm: 0.3,
    zone: 'yellow'
  },
  {
    id: 'france-embassy',
    name: 'フランス大使館',
    nameEn: 'Embassy of France',
    type: 'foreign_mission',
    coordinates: [139.7403, 35.6636],
    radiusKm: 0.3,
    zone: 'yellow'
  }
]

/**
 * Get facilities by zone type
 */
export function getFacilitiesByZone(zone: 'red' | 'yellow'): NoFlyFacility[] {
  return NO_FLY_FACILITIES.filter(f => f.zone === zone)
}

/**
 * Generate GeoJSON for red zones
 */
export function generateRedZoneGeoJSON(): GeoJSON.FeatureCollection {
  const facilities = getFacilitiesByZone('red')
  const features: GeoJSON.Feature[] = facilities.map(facility => ({
    type: 'Feature',
    properties: {
      id: facility.id,
      name: facility.name,
      nameEn: facility.nameEn,
      type: facility.type,
      radiusKm: facility.radiusKm,
      zone: facility.zone
    },
    geometry: createCirclePolygon(facility.coordinates, facility.radiusKm)
  }))

  return {
    type: 'FeatureCollection',
    features
  }
}

/**
 * Generate GeoJSON for yellow zones
 */
export function generateYellowZoneGeoJSON(): GeoJSON.FeatureCollection {
  const facilities = getFacilitiesByZone('yellow')
  const features: GeoJSON.Feature[] = facilities.map(facility => ({
    type: 'Feature',
    properties: {
      id: facility.id,
      name: facility.name,
      nameEn: facility.nameEn,
      type: facility.type,
      radiusKm: facility.radiusKm,
      zone: facility.zone
    },
    geometry: createCirclePolygon(facility.coordinates, facility.radiusKm)
  }))

  return {
    type: 'FeatureCollection',
    features
  }
}

/**
 * Generate GeoJSON for all no-fly zones
 */
export function generateAllNoFlyGeoJSON(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = NO_FLY_FACILITIES.map(facility => ({
    type: 'Feature',
    properties: {
      id: facility.id,
      name: facility.name,
      nameEn: facility.nameEn,
      type: facility.type,
      radiusKm: facility.radiusKm,
      zone: facility.zone
    },
    geometry: createCirclePolygon(facility.coordinates, facility.radiusKm)
  }))

  return {
    type: 'FeatureCollection',
    features
  }
}

/**
 * Generate mock GeoJSON for Emergency Airspace
 */
export function generateEmergencyAirspaceGeoJSON(): GeoJSON.FeatureCollection {
  const mockEmergencies: Array<{ id: string; name: string; coordinates: [number, number]; radiusKm: number }> = [
    {
      id: 'emergency-1',
      name: '災害対応エリア（見本）',
      coordinates: [139.7500, 35.6800],
      radiusKm: 1.0
    },
    {
      id: 'emergency-2',
      name: '警急出動エリア（見本）',
      coordinates: [139.7400, 35.6900],
      radiusKm: 0.8
    }
  ]

  const features: GeoJSON.Feature[] = mockEmergencies.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      radiusKm: item.radiusKm,
      type: 'emergency'
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate mock GeoJSON for Manned Aircraft Landing Areas
 */
export function generateMannedAircraftLandingGeoJSON(): GeoJSON.FeatureCollection {
  const mockLandings: Array<{ id: string; name: string; coordinates: [number, number]; radiusKm: number }> = [
    {
      id: 'manned-1',
      name: 'ヘリポート（見本）',
      coordinates: [139.7300, 35.6700],
      radiusKm: 0.6
    },
    {
      id: 'manned-2',
      name: '臨時着陸地（見本）',
      coordinates: [139.7600, 35.6500],
      radiusKm: 0.5
    }
  ]

  const features: GeoJSON.Feature[] = mockLandings.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      radiusKm: item.radiusKm,
      type: 'manned'
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate mock GeoJSON for Remote ID Required Zone
 */
export function generateRemoteIDZoneGeoJSON(): GeoJSON.FeatureCollection {
  const mockRemoteID: Array<{ id: string; name: string; coordinates: [number, number]; radiusKm: number }> = [
    {
      id: 'remoteid-1',
      name: 'リモートID特定区域（見本）',
      coordinates: [139.7450, 35.6750],
      radiusKm: 1.2
    }
  ]

  const features: GeoJSON.Feature[] = mockRemoteID.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      radiusKm: item.radiusKm,
      type: 'remote-id'
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Check if a point is in a no-fly zone
 */
export function isInNoFlyZone(
  lat: number,
  lng: number
): { inZone: boolean; facility?: NoFlyFacility; zone?: 'red' | 'yellow' } {
  for (const facility of NO_FLY_FACILITIES) {
    const distance = calculateDistance(
      lat,
      lng,
      facility.coordinates[1],
      facility.coordinates[0]
    )

    if (distance <= facility.radiusKm) {
      return { inZone: true, facility, zone: facility.zone }
    }
  }

  return { inZone: false }
}

export const NoFlyZoneService = {
  getFacilitiesByZone,
  generateRedZone: generateRedZoneGeoJSON,
  generateYellowZone: generateYellowZoneGeoJSON,
  generateAll: generateAllNoFlyGeoJSON,
  isInZone: isInNoFlyZone
}
