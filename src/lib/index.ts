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
  getAllLayers
} from './config/layers'
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
  MILITARY_BASES,
  getAllAirports,
  generateAirportGeoJSON,
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

// Utilities
export {
  calculateBBox,
  calculateDistance,
  createCirclePolygon,
  pointInPolygon,
  mergeBBoxes,
  formatCoordinates,
  degreesToCompass,
  degreesToJapanese,
  generateBuildingsGeoJSON,
  generateWindFieldGeoJSON,
  generateLTECoverageGeoJSON
} from './utils/geo'

// Library metadata
export const VERSION = '1.0.0'
export const LIBRARY_NAME = 'did-map'
