/**
 * Type-Safe ID Constants
 *
 * Union types and `as const` patterns for compile-time type checking.
 * Prevents typos and enables IDE autocomplete.
 */

// ============================================
// Prefecture IDs (都道府県コード)
// ============================================
export const PREFECTURE_CODES = [
  '01', '02', '03', '04', '05', '06', '07', // 北海道・東北
  '08', '09', '10', '11', '12', '13', '14', // 関東
  '15', '16', '17', '18', '19', '20', '21', '22', '23', // 中部
  '24', '25', '26', '27', '28', '29', '30', // 近畿
  '31', '32', '33', '34', '35', // 中国
  '36', '37', '38', '39', // 四国
  '40', '41', '42', '43', '44', '45', '46', '47' // 九州・沖縄
] as const

export type PrefectureCode = (typeof PREFECTURE_CODES)[number]

// ============================================
// DID Layer IDs (人口集中地区レイヤーID)
// ============================================
export const DID_LAYER_IDS = {
  DID_01: 'did-01',
  DID_02: 'did-02',
  DID_03: 'did-03',
  DID_04: 'did-04',
  DID_05: 'did-05',
  DID_06: 'did-06',
  DID_07: 'did-07',
  DID_08: 'did-08',
  DID_09: 'did-09',
  DID_10: 'did-10',
  DID_11: 'did-11',
  DID_12: 'did-12',
  DID_13: 'did-13',
  DID_14: 'did-14',
  DID_15: 'did-15',
  DID_16: 'did-16',
  DID_17: 'did-17',
  DID_18: 'did-18',
  DID_19: 'did-19',
  DID_20: 'did-20',
  DID_21: 'did-21',
  DID_22: 'did-22',
  DID_23: 'did-23',
  DID_24: 'did-24',
  DID_25: 'did-25',
  DID_26: 'did-26',
  DID_27: 'did-27',
  DID_28: 'did-28',
  DID_29: 'did-29',
  DID_30: 'did-30',
  DID_31: 'did-31',
  DID_32: 'did-32',
  DID_33: 'did-33',
  DID_34: 'did-34',
  DID_35: 'did-35',
  DID_36: 'did-36',
  DID_37: 'did-37',
  DID_38: 'did-38',
  DID_39: 'did-39',
  DID_40: 'did-40',
  DID_41: 'did-41',
  DID_42: 'did-42',
  DID_43: 'did-43',
  DID_44: 'did-44',
  DID_45: 'did-45',
  DID_46: 'did-46',
  DID_47: 'did-47'
} as const

export type DidLayerId = (typeof DID_LAYER_IDS)[keyof typeof DID_LAYER_IDS]

// ============================================
// Base Map IDs (ベースマップID)
// ============================================
export const BASE_MAP_IDS = {
  OSM: 'osm',
  GSI: 'gsi',
  PALE: 'pale',
  PHOTO: 'photo'
} as const

export type BaseMapId = (typeof BASE_MAP_IDS)[keyof typeof BASE_MAP_IDS]

// ============================================
// Geo Overlay IDs (地理情報オーバーレイID)
// ============================================
export const GEO_OVERLAY_IDS = {
  HILLSHADE: 'hillshade',
  RELIEF: 'relief',
  SLOPE: 'slope',
  BUILDINGS: 'buildings',
  TERRAIN_2024_NOTO: 'terrain-2024-noto'
} as const

export type GeoOverlayId = (typeof GEO_OVERLAY_IDS)[keyof typeof GEO_OVERLAY_IDS]

// ============================================
// Weather Overlay IDs (天候オーバーレイID)
// ============================================
export const WEATHER_OVERLAY_IDS = {
  RAIN_RADAR: 'rain-radar',
  WIND: 'wind'
} as const

export type WeatherOverlayId = (typeof WEATHER_OVERLAY_IDS)[keyof typeof WEATHER_OVERLAY_IDS]

// ============================================
// Restriction Zone IDs (制限空域ID)
// ============================================
export const RESTRICTION_ZONE_IDS = {
  // 航空法：空港周辺空域
  AIRPORT_AIRSPACE: 'airport-airspace',
  // 航空法：人口集中地区
  DID_AREA: 'did-area',
  // 小型無人機等飛行禁止法
  NO_FLY_RED: 'no-fly-red',
  NO_FLY_YELLOW: 'no-fly-yellow'
} as const

export type RestrictionZoneId = (typeof RESTRICTION_ZONE_IDS)[keyof typeof RESTRICTION_ZONE_IDS]

// ============================================
// Restriction Category IDs (制限カテゴリID)
// ============================================
export const RESTRICTION_CATEGORY_IDS = {
  NFZ_AIRPORT: 'nfz-airport',
  DID_AREA: 'did-area',
  CRITICAL_FACILITIES: 'critical-facilities'
} as const

export type RestrictionCategoryId =
  (typeof RESTRICTION_CATEGORY_IDS)[keyof typeof RESTRICTION_CATEGORY_IDS]

// ============================================
// Signal Overlay IDs (電波オーバーレイID)
// ============================================
export const SIGNAL_OVERLAY_IDS = {
  LTE_COVERAGE: 'lte-coverage'
} as const

export type SignalOverlayId = (typeof SIGNAL_OVERLAY_IDS)[keyof typeof SIGNAL_OVERLAY_IDS]

// ============================================
// Terrain Layer IDs (地形レイヤーID)
// ============================================
export const TERRAIN_LAYER_IDS = {
  TERRAIN_2024_NOTO: 'terrain-2024-noto',
  TERRAIN_2020_ISHIKAWA: 'terrain-2020-ishikawa'
} as const

export type TerrainLayerId = (typeof TERRAIN_LAYER_IDS)[keyof typeof TERRAIN_LAYER_IDS]

// ============================================
// Type Guards (型ガード)
// ============================================

/**
 * Check if a value is a valid DID layer ID
 */
export function isDidLayerId(id: string): id is DidLayerId {
  return Object.values(DID_LAYER_IDS).includes(id as DidLayerId)
}

/**
 * Check if a value is a valid base map ID
 */
export function isBaseMapId(id: string): id is BaseMapId {
  return Object.values(BASE_MAP_IDS).includes(id as BaseMapId)
}

/**
 * Check if a value is a valid geo overlay ID
 */
export function isGeoOverlayId(id: string): id is GeoOverlayId {
  return Object.values(GEO_OVERLAY_IDS).includes(id as GeoOverlayId)
}

/**
 * Check if a value is a valid weather overlay ID
 */
export function isWeatherOverlayId(id: string): id is WeatherOverlayId {
  return Object.values(WEATHER_OVERLAY_IDS).includes(id as WeatherOverlayId)
}

/**
 * Check if a value is a valid restriction zone ID
 */
export function isRestrictionZoneId(id: string): id is RestrictionZoneId {
  return Object.values(RESTRICTION_ZONE_IDS).includes(id as RestrictionZoneId)
}

/**
 * Check if a value is a valid restriction category ID
 */
export function isRestrictionCategoryId(id: string): id is RestrictionCategoryId {
  return Object.values(RESTRICTION_CATEGORY_IDS).includes(id as RestrictionCategoryId)
}

/**
 * Check if a value is a valid prefecture code
 */
export function isPrefectureCode(code: string): code is PrefectureCode {
  return PREFECTURE_CODES.includes(code as PrefectureCode)
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert prefecture code to DID layer ID
 */
export function prefectureCodeToDidLayerId(code: PrefectureCode): DidLayerId {
  return `did-${code}` as DidLayerId
}

/**
 * Extract prefecture code from DID layer ID
 */
export function didLayerIdToPrefectureCode(id: DidLayerId): PrefectureCode {
  return id.replace('did-', '') as PrefectureCode
}

// ============================================
// All IDs (Combined type)
// ============================================
export type LayerId = DidLayerId | TerrainLayerId
export type OverlayId = GeoOverlayId | WeatherOverlayId | SignalOverlayId
