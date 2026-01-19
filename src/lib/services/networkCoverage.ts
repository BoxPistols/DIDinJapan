/**
 * Network Coverage Service (Mock Implementation)
 * 
 * NOTE: This is a simplified mock service pending integration of user-reported data.
 * OpenSignal and CellMapper do not provide programmatic APIs for real-time coverage data.
 * 
 * In production, this should be replaced with:
 * 1. User-reported signal strength data stored in a database
 * 2. Carrier-provided coverage maps (if available)
 * 3. Machine learning models trained on historical coverage data
 * 4. Integration with drone telemetry for real-time signal monitoring
 */

export type SignalStrength = 'excellent' | 'good' | 'fair' | 'poor' | 'none'

export interface NetworkCoverageInfo {
  hasLTE: boolean
  signalStrength: SignalStrength
  estimatedBandwidth: number // Mbps
  carriers: string[] // Available carriers at location
  confidence: number // 0-1, confidence in the estimate
  isMockData: boolean
}

export interface CoverageCheckRequest {
  lat: number
  lng: number
  carrier?: string // Optional carrier filter (e.g., 'docomo', 'au', 'softbank')
}

// Simple heuristic zones for mock data
// Urban areas (Tokyo region): lat 35-36, lng 139-140
const TOKYO_BOUNDS = {
  latMin: 35.0,
  latMax: 36.0,
  lngMin: 139.0,
  lngMax: 140.0
}

// Major carriers in Japan
const JAPANESE_CARRIERS = ['docomo', 'au', 'softbank', 'rakuten']

/**
 * Check LTE availability for a location
 * @param lat Latitude
 * @param lng Longitude
 * @returns True if LTE is estimated to be available
 */
export function checkLTEAvailability(lat: number, lng: number): boolean {
  // Simplified heuristic: assume LTE available almost everywhere in Japan
  // In reality, mountainous areas and remote islands may have limited coverage
  
  // Japan bounds: roughly 24-46°N, 123-154°E
  const isInJapan = lat >= 24 && lat <= 46 && lng >= 123 && lng <= 154
  
  if (!isInJapan) {
    return false
  }
  
  // Assume 95% coverage within Japan bounds
  // In production, use actual coverage maps
  return Math.random() > 0.05
}

/**
 * Estimate signal strength for a location
 * @param lat Latitude
 * @param lng Longitude
 * @param carrier Optional carrier to check
 * @returns Signal strength estimate
 */
export function estimateSignalStrength(
  lat: number,
  lng: number,
  carrier?: string
): SignalStrength {
  // Urban area (Tokyo region) heuristic
  const isUrban = isInUrbanArea(lat, lng)
  
  // Distance from urban center affects signal strength
  const distanceFromCenter = calculateDistanceFromCenter(lat, lng)
  
  if (isUrban && distanceFromCenter < 10) {
    return 'excellent'
  } else if (isUrban || distanceFromCenter < 30) {
    return 'good'
  } else if (distanceFromCenter < 100) {
    return 'fair'
  } else if (distanceFromCenter < 200) {
    return 'poor'
  } else {
    return 'none'
  }
}

/**
 * Get comprehensive network coverage information
 * @param request Coverage check parameters
 * @returns Network coverage information
 */
export async function getNetworkCoverage(
  request: CoverageCheckRequest
): Promise<NetworkCoverageInfo> {
  const { lat, lng, carrier } = request
  
  const hasLTE = checkLTEAvailability(lat, lng)
  const signalStrength = estimateSignalStrength(lat, lng, carrier)
  
  // Estimate bandwidth based on signal strength
  const estimatedBandwidth = getBandwidthEstimate(signalStrength)
  
  // Available carriers (simplified - assume all major carriers available)
  const carriers = hasLTE 
    ? (carrier ? [carrier] : JAPANESE_CARRIERS)
    : []
  
  // Low confidence since this is mock data
  const confidence = 0.3
  
  return {
    hasLTE,
    signalStrength,
    estimatedBandwidth,
    carriers,
    confidence,
    isMockData: true
  }
}

/**
 * Get signal strength as numeric value (for UI display)
 * @param strength Signal strength category
 * @returns Numeric value 0-5
 */
export function getSignalStrengthNumeric(strength: SignalStrength): number {
  switch (strength) {
    case 'excellent':
      return 5
    case 'good':
      return 4
    case 'fair':
      return 3
    case 'poor':
      return 2
    case 'none':
      return 0
    default:
      return 0
  }
}

/**
 * Get estimated bandwidth based on signal strength
 * @param strength Signal strength
 * @returns Estimated bandwidth in Mbps
 */
function getBandwidthEstimate(strength: SignalStrength): number {
  switch (strength) {
    case 'excellent':
      return 50 // 50 Mbps
    case 'good':
      return 30
    case 'fair':
      return 15
    case 'poor':
      return 5
    case 'none':
      return 0
    default:
      return 0
  }
}

/**
 * Check if location is in urban area
 */
function isInUrbanArea(lat: number, lng: number): boolean {
  // Tokyo metropolitan area
  return (
    lat >= TOKYO_BOUNDS.latMin &&
    lat <= TOKYO_BOUNDS.latMax &&
    lng >= TOKYO_BOUNDS.lngMin &&
    lng <= TOKYO_BOUNDS.lngMax
  )
}

/**
 * Calculate approximate distance from Tokyo center (km)
 * Uses simple Pythagorean approximation for rough distance
 */
function calculateDistanceFromCenter(lat: number, lng: number): number {
  const TOKYO_CENTER_LAT = 35.6762
  const TOKYO_CENTER_LNG = 139.6503
  
  // Rough conversion: 1 degree ≈ 111 km
  const latDiff = (lat - TOKYO_CENTER_LAT) * 111
  const lngDiff = (lng - TOKYO_CENTER_LNG) * 111 * Math.cos((lat * Math.PI) / 180)
  
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff)
}

/**
 * Format coverage info for display
 */
export function formatCoverageInfo(info: NetworkCoverageInfo): string {
  const mockPrefix = info.isMockData ? '(推定) ' : ''
  const lteStatus = info.hasLTE ? 'あり' : 'なし'
  const signalText = getSignalStrengthText(info.signalStrength)
  
  return `${mockPrefix}LTE: ${lteStatus}, 信号強度: ${signalText}, 推定速度: ${info.estimatedBandwidth}Mbps`
}

/**
 * Get Japanese text for signal strength
 */
function getSignalStrengthText(strength: SignalStrength): string {
  switch (strength) {
    case 'excellent':
      return '非常に良い'
    case 'good':
      return '良い'
    case 'fair':
      return '普通'
    case 'poor':
      return '悪い'
    case 'none':
      return 'なし'
    default:
      return '不明'
  }
}

/**
 * Check if network coverage is adequate for drone operations
 * Drones typically need at least 'fair' signal for safe telemetry
 */
export function isAdequateForDroneOps(info: NetworkCoverageInfo): boolean {
  const numericStrength = getSignalStrengthNumeric(info.signalStrength)
  return info.hasLTE && numericStrength >= 3 // Fair or better
}

export const NetworkCoverageService = {
  checkLTEAvailability,
  estimateSignalStrength,
  getNetworkCoverage,
  getSignalStrengthNumeric,
  formatCoverageInfo,
  isAdequateForDroneOps
}
