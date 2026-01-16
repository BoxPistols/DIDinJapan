/**
 * Japan Drone Map Library
 *
 * A comprehensive library for displaying drone flight restriction zones
 * and geographic data overlays in Japan.
 *
 * @packageDocumentation
 */

// Types
export * from './types'

// Configuration
export { BASE_MAPS, DEFAULT_CENTER, DEFAULT_ZOOM } from './config/baseMaps'
export {
  GEO_OVERLAYS,
  WEATHER_OVERLAYS,
  SIGNAL_OVERLAYS,
  RESTRICTION_ZONES,
  NO_FLY_ZONES,
  RESTRICTION_CATEGORIES,
  RESTRICTION_COLORS,
  getAllRestrictionZones
} from './config/overlays'
export {
  LAYER_GROUPS,
  PREFECTURE_COLORS,
  createLayerIdToNameMap,
  getAllLayers,
  TERRAIN_2024_LAYERS,
  TERRAIN_2024_COLOR,
  TERRAIN_2020_COLOR,
  TERRAIN_2020_REFERENCE,
  getTerrain2024Layers,
  ISHIKAWA_NOTO_COMPARISON_LAYERS,
  getComparisonLayers,
  getComparisonLayerMetadata
} from './config/layers'
export type { ComparisonLayerConfig } from './config/layers'
export {
  getPrefectureInfo,
  getAllPrefectureLayerIds,
  findLayersByPrefecture
} from './config/searchIndexes'

// Services
export {
  RainViewerService,
  fetchRainRadarTimestamp,
  buildRainTileUrl,
  formatRadarTimestamp
} from './services/rainViewer'
export {
  OpenWeatherService,
  buildOWMTileUrl,
  fetchWeatherData,
  fetchWindData,
  getWindCategory,
  formatWindData
} from './services/openWeather'
export {
  AirportService,
  MAJOR_AIRPORTS,
  REGIONAL_AIRPORTS,
  MILITARY_BASES,
  HELIPORTS,
  getAllAirports,
  getAllAirportsWithHeliports,
  getNoFlyLawAirports,
  generateAirportGeoJSON,
  generateHeliportGeoJSON,
  isInAirportZone
} from './services/airports'
export {
  NoFlyZoneService,
  NO_FLY_FACILITIES,
  getFacilitiesByZone,
  generateRedZoneGeoJSON,
  generateYellowZoneGeoJSON,
  generateEmergencyAirspaceGeoJSON,
  generateMannedAircraftLandingGeoJSON,
  generateRemoteIDZoneGeoJSON,
  isInNoFlyZone
} from './services/noFlyZones'
export {
  CustomLayerService,
  getCustomLayers,
  addCustomLayer,
  updateCustomLayer,
  removeCustomLayer,
  importCustomLayers,
  exportCustomLayers,
  readGeoJSONFile,
  downloadAsFile
} from './services/customLayers'
export type { CustomLayer, CustomLayerConfig } from './services/customLayers'
export {
  GeocodingService,
  searchAddress,
  reverseGeocode,
  formatAddress,
  getZoomBounds,
  quickSearch,
  debounce,
  MAJOR_CITIES
} from './services/geocoding'
export type { GeocodingResult, SearchOptions } from './services/geocoding'
export {
  fetchElevationFromGSI,
  getCoordinateInfo,
  fetchElevationBatch,
  getRecommendedFlightAltitude,
  clearElevationCache,
  getCacheInfo
} from './services/elevationService'
export type { ElevationData, CoordinateInfo } from './services/elevationService'

// Utilities
export {
  calculateBBox,
  calculateDistance,
  createCirclePolygon,
  pointInPolygon,
  mergeBBoxes,
  formatCoordinates,
  formatCoordinatesDMS,
  degreesToCompass,
  degreesToJapanese,
  generateBuildingsGeoJSON,
  generateWindFieldGeoJSON,
  generateLTECoverageGeoJSON,
  generateRadioInterferenceGeoJSON,
  generateMannedAircraftZonesGeoJSON
} from './utils/geo'

// kokuarea (airport airspace) helpers
export {
  KOKUAREA_STYLE,
  fillKokuareaTileUrl,
  getVisibleTileXYZs,
  classifyKokuareaSurface
} from './kokuarea'
export type { KokuareaSurfaceKind, KokuareaFeatureProperties } from './kokuarea'

// Library metadata
export const VERSION = '1.0.0'
export const LIBRARY_NAME = 'did-map'
