/**
 * Japan Drone Map Library - Type Definitions
 */

import maplibregl from 'maplibre-gl'

// ============================================
// Base Map Types
// ============================================
/**
 * Configuration for a base map layer
 * @interface BaseMapConfig
 */
export interface BaseMapConfig {
  id: string /** Unique identifier for the base map */
  name: string /** Display name of the base map */
  style: string | maplibregl.StyleSpecification /** MapLibre GL style definition */
}

/** Type for available base map selections */
export type BaseMapKey = 'osm' | 'gsi' | 'pale' | 'photo'

// ============================================
// Layer Types
// ============================================
/**
 * Configuration for a single geographic layer (prefecture DID data)
 * @interface LayerConfig
 */
export interface LayerConfig {
  id: string /** Unique identifier for the layer */
  name: string /** Display name of the layer (prefecture name) */
  path: string /** Path to GeoJSON data file */
  color: string /** Hex color code for layer visualization */
}

/**
 * Grouped collection of layers organized by region
 * @interface LayerGroup
 */
export interface LayerGroup {
  name: string /** Region name (e.g., "関東", "近畿") */
  layers: LayerConfig[] /** Array of layers in this region */
}

/**
 * Runtime state of a layer in the UI
 * @interface LayerState
 */
export interface LayerState {
  id: string /** Layer identifier */
  visible: boolean /** Whether the layer is currently visible on the map */
}

// ============================================
// Overlay Types
// ============================================
/**
 * Configuration for geographic/weather overlay layers
 * @interface GeoOverlay
 */
export interface GeoOverlay {
  id: string /** Unique identifier for the overlay */
  name: string /** Display name of the overlay */
  tiles: string[] /** Array of tile URLs or GeoJSON paths */
  geojson?: string /** Path to GeoJSON data file */
  opacity: number /** Opacity level (0-1) */
  category: 'geo' | 'weather' | 'restriction' /** Category of overlay data */
  minZoom?: number /** Minimum zoom level to display overlay */
  maxZoom?: number /** Maximum zoom level to display overlay */
  description?: string /** Description of the overlay */
}

export interface WeatherOverlay {
  id: string
  name: string
  opacity: number
  dynamic: boolean
  updateInterval?: number // milliseconds
}

// ============================================
// Restriction Zone Types (ドローン飛行禁止エリア)
// ============================================
export type RestrictionType =
  | 'airport' // 空港等周辺空域
  | 'did' // 人口集中地区
  | 'emergency' // 緊急用務空域
  | 'manned' // 有人機発着エリア
  | 'remote_id' // リモートID特定区域
  | 'no_fly_red' // 小型無人機等飛行禁止法 レッドゾーン
  | 'no_fly_yellow' // 小型無人機等飛行禁止法 イエローゾーン

export interface RestrictionZone {
  id: string
  name: string
  type: RestrictionType
  color: string
  opacity: number
  path?: string // GeoJSON path
  tiles?: string[] // Tile URL
  geojsonTileTemplate?: string // GeoJSON tile URL template (e.g. https://.../{z}/{x}/{y}.geojson)
  description?: string
}

export interface RestrictionCategory {
  id: string
  name: string
  zones: RestrictionZone[]
}

// ============================================
// Airport Types
// ============================================
export interface Airport {
  id: string
  name: string
  nameEn?: string
  type: 'international' | 'domestic' | 'military' | 'heliport'
  coordinates: [number, number] // [lng, lat]
  radiusKm: number // 空港周辺の制限半径
  surfaces?: AirportSurface[]
}

export interface AirportSurface {
  type: 'horizontal' | 'conical' | 'approach' | 'transitional'
  heightLimit: number // meters
  geometry: GeoJSON.Geometry
}

// ============================================
// Weather Data Types
// ============================================
export interface WindData {
  speed: number // m/s
  direction: number // degrees
  gust?: number // m/s
}

export interface WeatherData {
  timestamp: number
  wind?: WindData
  rain?: number // mm/h
  visibility?: number // meters
}

// ============================================
// Search Types
// ============================================
/**
 * Single item in the searchable index of geographic features
 * @interface SearchIndexItem
 */
export interface SearchIndexItem {
  prefName: string /** Prefecture name (都道府県) */
  cityName: string /** City/municipality name (市区町村) */
  bbox: [
    number,
    number,
    number,
    number
  ] /** Bounding box for the feature [minLng, minLat, maxLng, maxLat] */
  layerId: string /** Associated layer identifier */
}

// ============================================
// Map State Types
// ============================================
export interface MapState {
  center: [number, number]
  zoom: number
  baseMap: BaseMapKey
}

export interface LayerVisibilityState {
  layers: Map<string, LayerState>
  overlays: Map<string, boolean>
  weather: Map<string, boolean>
  restrictions: Map<string, boolean>
}

// ============================================
// Event Types
// ============================================
export interface LayerClickEvent {
  layerId: string
  feature: GeoJSON.Feature
  lngLat: { lng: number; lat: number }
}

export interface MapClickEvent {
  lngLat: { lng: number; lat: number }
  features: GeoJSON.Feature[]
}

// ============================================
// Configuration Types
// ============================================
export interface JapanDroneMapConfig {
  apiKeys?: {
    openWeatherMap?: string
  }
  initialCenter?: [number, number]
  initialZoom?: number
  defaultBaseMap?: BaseMapKey
  enabledCategories?: {
    did?: boolean
    restrictions?: boolean
    weather?: boolean
    geo?: boolean
  }
}

// ============================================
// Component Props Types
// ============================================
export interface MapContainerProps {
  config?: JapanDroneMapConfig
  onMapLoad?: (map: maplibregl.Map) => void
  onLayerClick?: (event: LayerClickEvent) => void
}

export interface LayerControlProps {
  categories: RestrictionCategory[]
  layerGroups: LayerGroup[]
  onToggleLayer: (layerId: string) => void
  onToggleCategory: (categoryId: string) => void
}

// ============================================
// Mock Data Types - 見本データ用型定義
// ============================================

/**
 * 共通のGeoJSONフィーチャープロパティ
 */
export interface BaseFeatureProperties {
  id: string
  name: string
  nameEn?: string
  description?: string
  source?: string
  lastUpdated?: string
}

/**
 * 緊急用務空域
 * Emergency Airspace - 警察・消防等の緊急活動区域
 */
export interface EmergencyAirspace extends BaseFeatureProperties {
  type: 'emergency'
  coordinates: [number, number]
  radiusKm: number
  altitudeLimit?: {
    min: number // meters AGL
    max: number // meters AGL
  }
  validPeriod?: {
    start: string // ISO 8601
    end: string // ISO 8601
  }
  authority: {
    name: string // 管理機関名
    contact?: string // 連絡先
    notamNumber?: string // NOTAM番号
  }
  reason: 'disaster' | 'fire' | 'police' | 'rescue' | 'other'
  priority: 'high' | 'medium' | 'low'
  status: 'active' | 'scheduled' | 'expired'
}

/**
 * 有人機発着エリア
 * Manned Aircraft Landing Area - ヘリポート・臨時着陸地
 */
export interface MannedAircraftLanding extends BaseFeatureProperties {
  type: 'manned'
  coordinates: [number, number]
  radiusKm: number
  altitudeLimit?: {
    min: number
    max: number
  }
  facilityType: 'heliport' | 'temporary' | 'hospital' | 'rooftop' | 'agricultural'
  surfaceType?: 'concrete' | 'asphalt' | 'grass' | 'unpaved'
  dimensions?: {
    length: number // meters
    width: number // meters
  }
  operator: {
    name: string
    contact?: string
    operatingHours?: string
  }
  lighting?: boolean
  windsock?: boolean
  fuelAvailable?: boolean
  status: 'operational' | 'closed' | 'limited'
}

/**
 * リモートID特定区域
 * Remote ID Required Zone - リモートID機能必須区域
 */
export interface RemoteIDZone extends BaseFeatureProperties {
  type: 'remote_id'
  coordinates: [number, number]
  radiusKm: number
  polygon?: GeoJSON.Polygon
  requirement: {
    remoteIdRequired: boolean
    registrationRequired: boolean
    flightPlanRequired: boolean
  }
  exemptions?: string[]
  enforcementDate: string
  authority: {
    name: string
    regulationReference?: string
  }
}

/**
 * 地物（建物・構造物）
 * Building/Structure - 障害物となる建造物
 */
export interface Building extends BaseFeatureProperties {
  type: 'building'
  coordinates: [number, number]
  radiusKm?: number
  polygon?: GeoJSON.Polygon
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
  height: {
    ground: number // meters - 地上高
    asl: number // meters - 海抜高度
    rooftop?: number // meters - 屋上設備高さ
  }
  obstacleLight?: {
    type: 'low' | 'medium' | 'high'
    color: 'red' | 'white' | 'dual'
  }
  owner?: {
    name: string
    contact?: string
  }
  materials?: string[]
  constructionYear?: number
  importance: 'critical' | 'major' | 'minor'
}

/**
 * 風向・風量観測点
 * Wind Field - 気象観測データ
 */
export interface WindObservation extends BaseFeatureProperties {
  type: 'wind'
  coordinates: [number, number]
  observation: {
    direction: number // degrees (0-360)
    speed: number // m/s
    gust?: number // m/s - 突風
    variability?: number // degrees - 風向変動幅
  }
  altitude: number // meters AGL - 観測高度
  timestamp: string // ISO 8601
  station: {
    id: string
    name: string
    type: 'amedas' | 'airport' | 'private' | 'buoy'
    elevation: number // meters ASL
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
}

/**
 * LTE電波強度
 * LTE Coverage - 携帯電話通信カバレッジ
 */
export interface LTECoverage extends BaseFeatureProperties {
  type: 'lte'
  coordinates: [number, number]
  radiusKm: number
  polygon?: GeoJSON.Polygon
  coverage: {
    strength: number // dBm or percentage (0-100)
    quality: 'excellent' | 'good' | 'fair' | 'poor' | 'none'
    bandwidth?: number // Mbps
    latency?: number // ms
  }
  carrier: {
    name: string // e.g., 'NTT Docomo', 'au', 'SoftBank', 'Rakuten'
    frequency?: number[] // MHz bands
    technology: 'LTE' | '5G' | 'LTE-A' | 'mixed'
  }
  altitude?: {
    groundLevel: number // 地上での強度
    altitude50m?: number // 50m高度での強度
    altitude100m?: number // 100m高度での強度
    altitude150m?: number // 150m高度での強度
  }
  reliability?: number // 通信安定性 (0-100%)
  lastMeasured: string // ISO 8601
}

/**
 * 気象レーダーデータ
 * Weather Radar - 降水量データ
 */
export interface WeatherRadarData extends BaseFeatureProperties {
  type: 'radar'
  timestamp: string
  coverage: {
    bbox: [number, number, number, number]
    resolution: number // km
  }
  precipitation: {
    type: 'rain' | 'snow' | 'mixed'
    intensity: number // mm/h
    accumulated?: number // mm
  }
}

/**
 * 飛行計画ポイント
 * Flight Plan Point - 飛行経路の地点
 */
export interface FlightPlanPoint extends BaseFeatureProperties {
  type: 'waypoint'
  coordinates: [number, number]
  altitude: number // meters AGL
  speed?: number // m/s
  action?: 'takeoff' | 'landing' | 'hover' | 'photo' | 'video' | 'turn' | 'waypoint'
  waitTime?: number // seconds
  heading?: number // degrees
  gimbalAngle?: number // degrees
  order: number
}

/**
 * 飛行経路
 * Flight Route - 完全な飛行計画
 */
export interface FlightRoute extends BaseFeatureProperties {
  type: 'route'
  points: FlightPlanPoint[]
  totalDistance: number // km
  estimatedDuration: number // minutes
  maxAltitude: number // meters
  aircraft?: {
    model: string
    weight: number // kg
    registration?: string
  }
  pilot?: {
    name: string
    license?: string
    contact?: string
  }
  purpose:
    | 'survey'
    | 'inspection'
    | 'photography'
    | 'delivery'
    | 'agriculture'
    | 'training'
    | 'other'
  status: 'draft' | 'submitted' | 'approved' | 'completed' | 'cancelled'
}

// ============================================
// GeoJSON Feature Type Guards
// ============================================

export type MockFeatureProperties =
  | EmergencyAirspace
  | MannedAircraftLanding
  | RemoteIDZone
  | Building
  | WindObservation
  | LTECoverage

export interface TypedFeature<T extends MockFeatureProperties> extends GeoJSON.Feature {
  properties: T
}

export interface TypedFeatureCollection<T extends MockFeatureProperties>
  extends GeoJSON.FeatureCollection {
  features: Array<TypedFeature<T>>
}
