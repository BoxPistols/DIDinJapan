/**
 * No-Fly Zone Data Service
 * 小型無人機等飛行禁止法の対象施設
 *
 * データソース:
 * - 警察庁「小型無人機等飛行禁止法に基づく対象施設」
 *   https://www.npa.go.jp/bureau/security/kogatamujinki/index.html
 * - 国土交通省「無人航空機の飛行禁止空域」
 *   https://www.mlit.go.jp/koku/koku_tk10_000003.html
 *
 * 注意事項:
 * - 座標・半径は参考値であり、正確な禁止区域は公式情報で確認してください
 * - レッドゾーン: 施設上空は完全飛行禁止
 * - イエローゾーン: 周辺300m、事前通報・許可が必要
 * - 原発データはmap-auto-waypointプロジェクトより移植
 *   （座標は公開情報に基づく推定値）
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
  category?: string // サブカテゴリ（原発の運転状況等）
  source?: string   // データソース
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
    radiusKm: 0.2,
    zone: 'red'
  },
  {
    id: 'kantei',
    name: '首相官邸',
    nameEn: 'Prime Minister\'s Official Residence',
    type: 'government',
    coordinates: [139.7412, 35.6731],
    radiusKm: 0.2,
    zone: 'red'
  },
  {
    id: 'supreme-court',
    name: '最高裁判所',
    nameEn: 'Supreme Court of Japan',
    type: 'government',
    coordinates: [139.7424, 35.6795],
    radiusKm: 0.2,
    zone: 'red'
  },
  {
    id: 'imperial-palace',
    name: '皇居',
    nameEn: 'Imperial Palace',
    type: 'imperial',
    coordinates: [139.7528, 35.6852],
    radiusKm: 0.2,
    zone: 'red'
  },
  {
    id: 'akasaka-palace',
    name: '赤坂御所',
    nameEn: 'Akasaka Palace',
    type: 'imperial',
    coordinates: [139.7310, 35.6753],
    radiusKm: 0.2,
    zone: 'red'
  },
  {
    id: 'togu-palace',
    name: '東宮御所',
    nameEn: 'Togu Palace',
    type: 'imperial',
    coordinates: [139.7270, 35.6763],
    radiusKm: 0.2,
    zone: 'red'
  },
  // 危機管理行政機関
  {
    id: 'mlit',
    name: '国土交通省',
    nameEn: 'Ministry of Land, Infrastructure, Transport and Tourism',
    type: 'government',
    coordinates: [139.7501, 35.6746],
    radiusKm: 0.2,
    zone: 'red'
  },
  {
    id: 'npa',
    name: '警察庁',
    nameEn: 'National Police Agency',
    type: 'government',
    coordinates: [139.7500, 35.6773],
    radiusKm: 0.2,
    zone: 'red'
  },
  {
    id: 'mod',
    name: '防衛省',
    nameEn: 'Ministry of Defense',
    type: 'defense',
    coordinates: [139.7285, 35.6933],
    radiusKm: 0.2,
    zone: 'red'
  },
  // ============================================
  // 原子力発電所（レッドゾーン）
  // ※ 座標はmap-auto-waypointおよび公開情報より
  // ※ 実際の禁止区域は施設ごとに異なる場合があります
  // ============================================
  // ===== 北海道電力 =====
  {
    id: 'tomari',
    name: '泊発電所',
    nameEn: 'Tomari Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [140.5136, 43.0339],
    radiusKm: 0.2,
    zone: 'red',
    category: '停止中',
    source: '北海道電力'
  },
  // ===== 東北電力 =====
  {
    id: 'higashidori',
    name: '東通原子力発電所',
    nameEn: 'Higashidori Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [141.3861, 41.1861],
    radiusKm: 0.2,
    zone: 'red',
    category: '停止中',
    source: '東北電力'
  },
  {
    id: 'onagawa',
    name: '女川原子力発電所',
    nameEn: 'Onagawa Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [141.5003, 38.4019],
    radiusKm: 0.2,
    zone: 'red',
    category: '一部運転中',
    source: '東北電力'
  },
  // ===== 東京電力 =====
  {
    id: 'fukushima-daiichi',
    name: '福島第一原子力発電所',
    nameEn: 'Fukushima Daiichi Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [141.0328, 37.4211],
    radiusKm: 0.2,
    zone: 'red',
    category: '廃炉作業中',
    source: '東京電力'
  },
  {
    id: 'fukushima-daini',
    name: '福島第二原子力発電所',
    nameEn: 'Fukushima Daini Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [141.0250, 37.3167],
    radiusKm: 0.2,
    zone: 'red',
    category: '廃炉決定',
    source: '東京電力'
  },
  {
    id: 'kashiwazaki-kariwa',
    name: '柏崎刈羽原子力発電所',
    nameEn: 'Kashiwazaki-Kariwa Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [138.5978, 37.4286],
    radiusKm: 0.2,
    zone: 'red',
    category: '停止中',
    source: '東京電力'
  },
  // ===== 日本原子力発電 =====
  {
    id: 'tokai-daini',
    name: '東海第二発電所',
    nameEn: 'Tokai Daini Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [140.6072, 36.4664],
    radiusKm: 0.2,
    zone: 'red',
    category: '停止中',
    source: '日本原子力発電'
  },
  {
    id: 'tsuruga',
    name: '敦賀発電所',
    nameEn: 'Tsuruga Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [136.0186, 35.7514],
    radiusKm: 0.2,
    zone: 'red',
    category: '停止中',
    source: '日本原子力発電'
  },
  // ===== 中部電力 =====
  {
    id: 'hamaoka',
    name: '浜岡原子力発電所',
    nameEn: 'Hamaoka Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [138.1428, 34.6219],
    radiusKm: 0.2,
    zone: 'red',
    category: '停止中',
    source: '中部電力'
  },
  // ===== 北陸電力 =====
  {
    id: 'shika',
    name: '志賀原子力発電所',
    nameEn: 'Shika Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [136.7289, 37.0600],
    radiusKm: 0.2,
    zone: 'red',
    category: '停止中',
    source: '北陸電力'
  },
  // ===== 関西電力 =====
  {
    id: 'mihama',
    name: '美浜発電所',
    nameEn: 'Mihama Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [135.9581, 35.7017],
    radiusKm: 0.2,
    zone: 'red',
    category: '一部運転中',
    source: '関西電力'
  },
  {
    id: 'ohi',
    name: '大飯発電所',
    nameEn: 'Ohi Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [135.6561, 35.5422],
    radiusKm: 0.2,
    zone: 'red',
    category: '運転中',
    source: '関西電力'
  },
  {
    id: 'takahama',
    name: '高浜発電所',
    nameEn: 'Takahama Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [135.5050, 35.5203],
    radiusKm: 0.2,
    zone: 'red',
    category: '運転中',
    source: '関西電力'
  },
  // ===== 中国電力 =====
  {
    id: 'shimane',
    name: '島根原子力発電所',
    nameEn: 'Shimane Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [132.9992, 35.5386],
    radiusKm: 0.2,
    zone: 'red',
    category: '一部運転中',
    source: '中国電力'
  },
  // ===== 四国電力 =====
  {
    id: 'ikata',
    name: '伊方発電所',
    nameEn: 'Ikata Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [132.3094, 33.4903],
    radiusKm: 0.2,
    zone: 'red',
    category: '運転中',
    source: '四国電力'
  },
  // ===== 九州電力 =====
  {
    id: 'genkai',
    name: '玄海原子力発電所',
    nameEn: 'Genkai Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [129.8369, 33.5153],
    radiusKm: 0.2,
    zone: 'red',
    category: '運転中',
    source: '九州電力'
  },
  {
    id: 'sendai-npp',
    name: '川内原子力発電所',
    nameEn: 'Sendai Nuclear Power Plant',
    type: 'nuclear',
    coordinates: [130.1894, 31.8339],
    radiusKm: 0.2,
    zone: 'red',
    category: '運転中',
    source: '九州電力'
  },
  // ============================================
  // 在日米軍施設（レッドゾーン）
  // ※ 小型無人機等飛行禁止法の対象施設
  // ※ 施設上空および周辺300mは飛行禁止
  // ============================================
  {
    id: 'yokota-ab',
    name: '横田基地',
    nameEn: 'Yokota Air Base',
    type: 'defense',
    coordinates: [139.3486, 35.7483],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'atsugi-naf',
    name: '厚木基地',
    nameEn: 'Naval Air Facility Atsugi',
    type: 'defense',
    coordinates: [139.4500, 35.4547],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'yokosuka-nb',
    name: '横須賀基地',
    nameEn: 'U.S. Fleet Activities Yokosuka',
    type: 'defense',
    coordinates: [139.6667, 35.2833],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'zama-camp',
    name: '座間キャンプ',
    nameEn: 'Camp Zama',
    type: 'defense',
    coordinates: [139.4000, 35.4833],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'kadena-ab',
    name: '嘉手納基地',
    nameEn: 'Kadena Air Base',
    type: 'defense',
    coordinates: [127.7683, 26.3517],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'futenma-mcas',
    name: '普天間基地',
    nameEn: 'MCAS Futenma',
    type: 'defense',
    coordinates: [127.7558, 26.2744],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'misawa-ab-us',
    name: '三沢基地（米軍）',
    nameEn: 'Misawa Air Base (USAF)',
    type: 'defense',
    coordinates: [141.3686, 40.7033],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'iwakuni-mcas',
    name: '岩国基地',
    nameEn: 'MCAS Iwakuni',
    type: 'defense',
    coordinates: [132.2361, 34.1456],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  {
    id: 'sasebo-nfj',
    name: '佐世保基地',
    nameEn: 'U.S. Fleet Activities Sasebo',
    type: 'defense',
    coordinates: [129.7167, 33.1500],
    radiusKm: 0.2,
    zone: 'red',
    category: '在日米軍',
    source: '警察庁'
  },
  // ============================================
  // イエローゾーン（黄色ゾーン）
  // 赤ゾーン（レッドゾーン）対象外の施設のみ
  // 在外公館周辺300m - 事前通報・許可が必要
  // ============================================
  // 在外公館等（イエローゾーン）
  // ※ 外国公館周辺300mは事前通報が必要
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
  // 在外公館のイエローゾーン
  const foreignMissions = getFacilitiesByZone('yellow').map(facility => ({
    type: 'Feature' as const,
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

  // レッドゾーン対象施設の周辺300m
  // ※ radiusKm: 0.5km = 0.2km敷地（赤ゾーン）+ 0.3km周辺（黄色ゾーン）
  const redZoneFacilities = getFacilitiesByZone('red')
  const peripheryZones = redZoneFacilities.map(facility => ({
    type: 'Feature' as const,
    properties: {
      id: facility.id + '-perimeter',
      name: facility.name + '周辺',
      nameEn: facility.nameEn ? facility.nameEn + ' (Perimeter)' : 'Perimeter',
      type: facility.type,
      radiusKm: 0.5,
      zone: 'yellow' as const,
      isPerimeter: true
    },
    geometry: createCirclePolygon(facility.coordinates, 0.5)
  }))

  return {
    type: 'FeatureCollection',
    features: [...foreignMissions, ...peripheryZones]
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
 * 緊急用務空域 - 警察・消防等の緊急活動区域
 */
export function generateEmergencyAirspaceGeoJSON(): GeoJSON.FeatureCollection {
  const mockEmergencies: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    radiusKm: number
    altitudeLimit?: { min: number; max: number }
    validPeriod?: { start: string; end: string }
    authority: { name: string; contact?: string; notamNumber?: string }
    reason: 'disaster' | 'fire' | 'police' | 'rescue' | 'other'
    priority: 'high' | 'medium' | 'low'
    status: 'active' | 'scheduled' | 'expired'
    description?: string
  }> = [
    {
      id: 'emergency-1',
      name: '大規模火災対応区域（見本）',
      nameEn: 'Large Fire Response Area (Sample)',
      coordinates: [139.7500, 35.6800],
      radiusKm: 1.0,
      altitudeLimit: { min: 0, max: 300 },
      validPeriod: {
        start: '2024-01-15T09:00:00+09:00',
        end: '2024-01-15T18:00:00+09:00'
      },
      authority: {
        name: '東京消防庁',
        contact: '03-3212-2111',
        notamNumber: 'A0123/24'
      },
      reason: 'fire',
      priority: 'high',
      status: 'active',
      description: '高層ビル火災に伴う消防ヘリコプター活動区域'
    },
    {
      id: 'emergency-2',
      name: '警察捜索活動区域（見本）',
      nameEn: 'Police Search Operation Area (Sample)',
      coordinates: [139.7400, 35.6900],
      radiusKm: 0.8,
      altitudeLimit: { min: 0, max: 200 },
      validPeriod: {
        start: '2024-01-16T06:00:00+09:00',
        end: '2024-01-16T20:00:00+09:00'
      },
      authority: {
        name: '警視庁航空隊',
        contact: '03-3581-4321',
        notamNumber: 'A0124/24'
      },
      reason: 'police',
      priority: 'medium',
      status: 'active',
      description: '行方不明者捜索に伴う警察ヘリ活動区域'
    },
    {
      id: 'emergency-3',
      name: '災害救助活動区域（見本）',
      nameEn: 'Disaster Rescue Area (Sample)',
      coordinates: [139.6900, 35.7100],
      radiusKm: 1.5,
      altitudeLimit: { min: 0, max: 500 },
      validPeriod: {
        start: '2024-01-17T00:00:00+09:00',
        end: '2024-01-20T23:59:59+09:00'
      },
      authority: {
        name: '国土交通省 地方整備局',
        contact: '048-600-1000',
        notamNumber: 'A0125/24'
      },
      reason: 'disaster',
      priority: 'high',
      status: 'active',
      description: '地震災害に伴う救助・物資輸送ヘリ活動区域'
    },
    {
      id: 'emergency-4',
      name: '医療搬送活動区域（見本）',
      nameEn: 'Medical Transport Area (Sample)',
      coordinates: [139.7800, 35.6600],
      radiusKm: 0.5,
      altitudeLimit: { min: 0, max: 150 },
      authority: {
        name: '東京都福祉保健局',
        contact: '03-5320-4111'
      },
      reason: 'rescue',
      priority: 'high',
      status: 'active',
      description: 'ドクターヘリ離着陸時の一時的制限空域'
    },
    {
      id: 'emergency-5',
      name: '要人警護空域（見本）',
      nameEn: 'VIP Security Airspace (Sample)',
      coordinates: [139.7450, 35.6759],
      radiusKm: 0.3,
      altitudeLimit: { min: 0, max: 1000 },
      validPeriod: {
        start: '2024-02-01T08:00:00+09:00',
        end: '2024-02-01T12:00:00+09:00'
      },
      authority: {
        name: '警視庁警備部',
        notamNumber: 'A0200/24'
      },
      reason: 'other',
      priority: 'high',
      status: 'scheduled',
      description: '国賓来日に伴う警備空域'
    }
  ]

  const features: GeoJSON.Feature[] = mockEmergencies.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      radiusKm: item.radiusKm,
      type: 'emergency',
      altitudeLimit: item.altitudeLimit,
      validPeriod: item.validPeriod,
      authority: item.authority,
      reason: item.reason,
      priority: item.priority,
      status: item.status,
      description: item.description
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate mock GeoJSON for Manned Aircraft Landing Areas
 * 有人機発着エリア - ヘリポート・臨時着陸地
 */
export function generateMannedAircraftLandingGeoJSON(): GeoJSON.FeatureCollection {
  const mockLandings: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    radiusKm: number
    altitudeLimit?: { min: number; max: number }
    facilityType: 'heliport' | 'temporary' | 'hospital' | 'rooftop' | 'agricultural'
    surfaceType?: 'concrete' | 'asphalt' | 'grass' | 'unpaved'
    dimensions?: { length: number; width: number }
    operator: { name: string; contact?: string; operatingHours?: string }
    lighting?: boolean
    windsock?: boolean
    fuelAvailable?: boolean
    status: 'operational' | 'closed' | 'limited'
    description?: string
  }> = [
    {
      id: 'manned-1',
      name: '東京ヘリポート（見本）',
      nameEn: 'Tokyo Heliport (Sample)',
      coordinates: [139.8100, 35.6400],
      radiusKm: 0.6,
      altitudeLimit: { min: 0, max: 200 },
      facilityType: 'heliport',
      surfaceType: 'concrete',
      dimensions: { length: 100, width: 30 },
      operator: {
        name: '東京都港湾局',
        contact: '03-5463-0223',
        operatingHours: '07:00-21:00'
      },
      lighting: true,
      windsock: true,
      fuelAvailable: true,
      status: 'operational',
      description: '公共ヘリポート、定期便及び緊急用途'
    },
    {
      id: 'manned-2',
      name: '聖路加国際病院屋上ヘリポート（見本）',
      nameEn: 'St. Luke\'s Hospital Rooftop Heliport (Sample)',
      coordinates: [139.7720, 35.6680],
      radiusKm: 0.3,
      altitudeLimit: { min: 0, max: 150 },
      facilityType: 'hospital',
      surfaceType: 'concrete',
      dimensions: { length: 25, width: 25 },
      operator: {
        name: '聖路加国際病院',
        contact: '03-3541-5151',
        operatingHours: '24時間（緊急時）'
      },
      lighting: true,
      windsock: true,
      fuelAvailable: false,
      status: 'operational',
      description: 'ドクターヘリ・救急搬送用'
    },
    {
      id: 'manned-3',
      name: '臨時農薬散布離着陸場（見本）',
      nameEn: 'Temporary Agricultural Landing Site (Sample)',
      coordinates: [139.6500, 35.8000],
      radiusKm: 0.4,
      altitudeLimit: { min: 0, max: 100 },
      facilityType: 'agricultural',
      surfaceType: 'grass',
      dimensions: { length: 50, width: 30 },
      operator: {
        name: 'JA農協 北多摩',
        contact: '042-XXX-XXXX',
        operatingHours: '日の出〜日没'
      },
      lighting: false,
      windsock: true,
      fuelAvailable: false,
      status: 'limited',
      description: '農薬散布ヘリコプター用臨時離着陸場（季節限定）'
    },
    {
      id: 'manned-4',
      name: '新宿三井ビル屋上ヘリポート（見本）',
      nameEn: 'Shinjuku Mitsui Building Heliport (Sample)',
      coordinates: [139.6920, 35.6930],
      radiusKm: 0.25,
      altitudeLimit: { min: 0, max: 250 },
      facilityType: 'rooftop',
      surfaceType: 'concrete',
      dimensions: { length: 20, width: 20 },
      operator: {
        name: '三井不動産',
        operatingHours: '緊急時のみ'
      },
      lighting: true,
      windsock: false,
      fuelAvailable: false,
      status: 'limited',
      description: '緊急避難用屋上ヘリポート'
    },
    {
      id: 'manned-5',
      name: '臨時訓練場（見本）',
      nameEn: 'Temporary Training Ground (Sample)',
      coordinates: [139.5800, 35.7200],
      radiusKm: 0.5,
      facilityType: 'temporary',
      surfaceType: 'unpaved',
      dimensions: { length: 80, width: 60 },
      operator: {
        name: '警視庁航空隊',
        operatingHours: '09:00-17:00（訓練日のみ）'
      },
      lighting: false,
      windsock: true,
      fuelAvailable: false,
      status: 'operational',
      description: 'ヘリコプター離着陸訓練用臨時場外離着陸場'
    },
    {
      id: 'manned-6',
      name: '災害時臨時離着陸場（見本）',
      nameEn: 'Emergency Temporary Landing Site (Sample)',
      coordinates: [139.7100, 35.7500],
      radiusKm: 0.35,
      facilityType: 'temporary',
      surfaceType: 'asphalt',
      dimensions: { length: 40, width: 40 },
      operator: {
        name: '東京都総務局',
        contact: '03-5388-2453'
      },
      lighting: false,
      windsock: false,
      fuelAvailable: false,
      status: 'closed',
      description: '災害発生時に開設される臨時離着陸場（平常時は閉鎖）'
    }
  ]

  const features: GeoJSON.Feature[] = mockLandings.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      radiusKm: item.radiusKm,
      type: 'manned',
      altitudeLimit: item.altitudeLimit,
      facilityType: item.facilityType,
      surfaceType: item.surfaceType,
      dimensions: item.dimensions,
      operator: item.operator,
      lighting: item.lighting,
      windsock: item.windsock,
      fuelAvailable: item.fuelAvailable,
      status: item.status,
      description: item.description
    },
    geometry: createCirclePolygon(item.coordinates, item.radiusKm)
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Generate mock GeoJSON for Remote ID Required Zone
 * リモートID特定区域 - リモートID機能必須区域
 */
export function generateRemoteIDZoneGeoJSON(): GeoJSON.FeatureCollection {
  const mockRemoteID: Array<{
    id: string
    name: string
    nameEn?: string
    coordinates: [number, number]
    radiusKm: number
    requirement: {
      remoteIdRequired: boolean
      registrationRequired: boolean
      flightPlanRequired: boolean
    }
    exemptions?: string[]
    enforcementDate: string
    authority: { name: string; regulationReference?: string }
    description?: string
  }> = [
    {
      id: 'remoteid-1',
      name: '東京都心リモートID特定区域（見本）',
      nameEn: 'Tokyo Central Remote ID Zone (Sample)',
      coordinates: [139.7450, 35.6750],
      radiusKm: 3.0,
      requirement: {
        remoteIdRequired: true,
        registrationRequired: true,
        flightPlanRequired: true
      },
      exemptions: ['100g未満の機体', '屋内飛行', '係留飛行'],
      enforcementDate: '2022-06-20',
      authority: {
        name: '国土交通省航空局',
        regulationReference: '航空法第132条の87'
      },
      description: '都心部における無人航空機のリモートID発信義務区域'
    },
    {
      id: 'remoteid-2',
      name: '成田空港周辺リモートID特定区域（見本）',
      nameEn: 'Narita Airport Remote ID Zone (Sample)',
      coordinates: [140.3929, 35.7720],
      radiusKm: 5.0,
      requirement: {
        remoteIdRequired: true,
        registrationRequired: true,
        flightPlanRequired: true
      },
      exemptions: ['100g未満の機体'],
      enforcementDate: '2022-06-20',
      authority: {
        name: '国土交通省航空局',
        regulationReference: '航空法第132条の87'
      },
      description: '空港周辺における無人航空機監視強化区域'
    },
    {
      id: 'remoteid-3',
      name: '羽田空港周辺リモートID特定区域（見本）',
      nameEn: 'Haneda Airport Remote ID Zone (Sample)',
      coordinates: [139.7798, 35.5494],
      radiusKm: 4.0,
      requirement: {
        remoteIdRequired: true,
        registrationRequired: true,
        flightPlanRequired: true
      },
      exemptions: ['100g未満の機体'],
      enforcementDate: '2022-06-20',
      authority: {
        name: '国土交通省航空局',
        regulationReference: '航空法第132条の87'
      },
      description: '空港周辺における無人航空機監視強化区域'
    },
    {
      id: 'remoteid-4',
      name: '国会周辺リモートID特定区域（見本）',
      nameEn: 'National Diet Remote ID Zone (Sample)',
      coordinates: [139.7450, 35.6759],
      radiusKm: 1.0,
      requirement: {
        remoteIdRequired: true,
        registrationRequired: true,
        flightPlanRequired: true
      },
      enforcementDate: '2022-06-20',
      authority: {
        name: '国土交通省航空局',
        regulationReference: '航空法第132条の87'
      },
      description: '重要施設周辺における無人航空機監視強化区域'
    },
    {
      id: 'remoteid-5',
      name: '大規模イベント会場（見本）',
      nameEn: 'Large Event Venue Remote ID Zone (Sample)',
      coordinates: [139.7100, 35.6800],
      radiusKm: 0.8,
      requirement: {
        remoteIdRequired: true,
        registrationRequired: true,
        flightPlanRequired: true
      },
      exemptions: ['主催者承認機体'],
      enforcementDate: '2024-03-01',
      authority: {
        name: '東京都',
        regulationReference: '条例第XX号'
      },
      description: '大規模イベント開催に伴う一時的なリモートID必須区域'
    }
  ]

  const features: GeoJSON.Feature[] = mockRemoteID.map(item => ({
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      radiusKm: item.radiusKm,
      type: 'remote-id',
      requirement: item.requirement,
      exemptions: item.exemptions,
      enforcementDate: item.enforcementDate,
      authority: item.authority,
      description: item.description
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
