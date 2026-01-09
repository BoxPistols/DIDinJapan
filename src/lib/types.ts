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
  opacity: number /** Opacity level (0-1) */
  category: 'geo' | 'weather' | 'restriction' /** Category of overlay data */
  minZoom?: number /** Minimum zoom level to display overlay */
  maxZoom?: number /** Maximum zoom level to display overlay */
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
  | 'airport'           // 空港等周辺空域
  | 'did'               // 人口集中地区
  | 'emergency'         // 緊急用務空域
  | 'manned'            // 有人機発着エリア
  | 'remote_id'         // リモートID特定区域
  | 'no_fly_red'        // 小型無人機等飛行禁止法 レッドゾーン
  | 'no_fly_yellow'     // 小型無人機等飛行禁止法 イエローゾーン

export interface RestrictionZone {
  id: string
  name: string
  type: RestrictionType
  color: string
  opacity: number
  path?: string          // GeoJSON path
  tiles?: string[]       // Tile URL
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
  speed: number      // m/s
  direction: number  // degrees
  gust?: number      // m/s
}

export interface WeatherData {
  timestamp: number
  wind?: WindData
  rain?: number      // mm/h
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
  bbox: [number, number, number, number] /** Bounding box for the feature [minLng, minLat, maxLng, maxLat] */
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
