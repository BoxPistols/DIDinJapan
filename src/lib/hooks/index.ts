/**
 * Custom React Hooks for Drone Flight Safety
 * 
 * This module provides hooks for:
 * - Mesh code conversion
 * - Weather data fetching and monitoring
 * - Network coverage checking
 * - Flight window calculation (daylight/twilight)
 * - Comprehensive operation safety assessment
 */

export { 
  useMeshCodeConversion,
  type MeshCodeConversionResult
} from './useMeshCodeConversion'

export { 
  useWeatherMesh,
  useCurrentWeatherForecast,
  classifyWindLevel,
  type WeatherMeshResult,
  type JmaMeshWeatherData,
  type JmaTimeSeriesData,
  type WindLevel
} from './useWeatherMesh'

export { 
  useNetworkCoverage,
  type NetworkCoverageResult
} from './useNetworkCoverage'

export { 
  useFlightWindow,
  type FlightWindowResult
} from './useFlightWindow'

export { 
  useOperationSafety,
  getSafetyLevelColor,
  getSafetyLevelText,
  type OperationSafetyResult,
  type SafetyReason,
  type SafetyLevel
} from './useOperationSafety'
