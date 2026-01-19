/**
 * Mesh Code Converter Utility
 * Converts latitude/longitude coordinates to JMA (Japan Meteorological Agency) standard mesh codes
 * 
 * Mesh Code System:
 * - 1st level mesh: ~80km grid
 * - 2nd level mesh: ~10km grid  
 * - 3rd level mesh: ~1km grid
 * 
 * Simplified implementation for weather data lookup
 * Reference: https://www.jma.go.jp/jma/kishou/know/mesh/meshinfo.html
 */

/**
 * Convert latitude/longitude to simplified mesh code (8 digits)
 * This generates a simplified mesh code suitable for weather data lookup
 * 
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @returns Mesh code as string (8 digits)
 * 
 * @example
 * // Tokyo Shibuya area
 * const code = latLngToMeshCode(35.6595, 139.7004)
 * console.log(code) // "53393599"
 */
export function latLngToMeshCode(lat: number, lng: number): string {
  // Validate input
  if (lat < 20 || lat > 46 || lng < 122 || lng > 154) {
    throw new Error('Coordinates out of Japan bounds')
  }

  // 1st level mesh (2 digits each)
  const p = Math.floor(lat * 1.5)
  const q = Math.floor(lng - 100)

  // 2nd level mesh (1 digit each, 0-7)
  const lat_1 = lat * 60 - p * 40
  const lng_1 = (lng - 100) * 60 - q * 40
  const a = Math.min(Math.floor(lat_1 / 5), 7)
  const b = Math.min(Math.floor(lng_1 / 7.5), 7)

  // 3rd level mesh (1 digit each, 0-9)
  const lat_2 = lat_1 - a * 5
  const lng_2 = lng_1 - b * 7.5
  const m = Math.min(Math.floor(lat_2 / 0.5), 9)
  const n = Math.min(Math.floor(lng_2 / 0.75), 9)

  // Format as 8-digit mesh code
  const meshCode = `${String(p).padStart(2, '0')}${String(q).padStart(2, '0')}${a}${b}${m}${n}`
  
  return meshCode
}

/**
 * Convert mesh code to center coordinates
 * 
 * @param meshCode - 8-digit mesh code
 * @returns Object with latitude and longitude of mesh center
 * 
 * @example
 * const center = meshCodeToLatLng("53393599")
 * console.log(center) // { lat: 35.xxx, lng: 139.xxx }
 */
export function meshCodeToLatLng(meshCode: string): { lat: number; lng: number } {
  if (meshCode.length !== 8) {
    throw new Error('Mesh code must be 8 digits for 3rd level mesh')
  }

  const p = parseInt(meshCode.substring(0, 2), 10)
  const q = parseInt(meshCode.substring(2, 4), 10)
  const a = parseInt(meshCode.substring(4, 5), 10)
  const b = parseInt(meshCode.substring(5, 6), 10)
  const m = parseInt(meshCode.substring(6, 7), 10)
  const n = parseInt(meshCode.substring(7, 8), 10)

  // Calculate southwest corner
  const lat_sw = p / 1.5 + a * 5 / 60 + m * 0.5 / 60
  const lng_sw = q + 100 + b * 7.5 / 60 + n * 0.75 / 60

  // Return center of mesh
  const lat = lat_sw + 0.25 / 60 // Add half of 0.5 minutes
  const lng = lng_sw + 0.375 / 60 // Add half of 0.75 minutes

  return { lat, lng }
}

/**
 * Get bounding box for a mesh code
 * 
 * @param meshCode - 8-digit mesh code
 * @returns Bounding box [minLng, minLat, maxLng, maxLat]
 */
export function meshCodeToBBox(meshCode: string): [number, number, number, number] {
  if (meshCode.length !== 8) {
    throw new Error('Mesh code must be 8 digits for 3rd level mesh')
  }

  const p = parseInt(meshCode.substring(0, 2), 10)
  const q = parseInt(meshCode.substring(2, 4), 10)
  const a = parseInt(meshCode.substring(4, 5), 10)
  const b = parseInt(meshCode.substring(5, 6), 10)
  const m = parseInt(meshCode.substring(6, 7), 10)
  const n = parseInt(meshCode.substring(7, 8), 10)

  // Calculate southwest corner
  const minLat = p / 1.5 + a * 5 / 60 + m * 0.5 / 60
  const minLng = q + 100 + b * 7.5 / 60 + n * 0.75 / 60

  // Calculate northeast corner (add mesh size: 0.5 minutes lat, 0.75 minutes lng)
  const maxLat = minLat + 0.5 / 60
  const maxLng = minLng + 0.75 / 60

  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Get surrounding mesh codes (8 neighbors + center)
 * 
 * @param meshCode - Center mesh code
 * @returns Array of 9 mesh codes (center + 8 neighbors)
 */
export function getSurroundingMeshCodes(meshCode: string): string[] {
  const center = meshCodeToLatLng(meshCode)
  const meshSizeLat = 0.5 / 60 // 0.5 minutes in degrees
  const meshSizeLng = 0.75 / 60 // 0.75 minutes in degrees

  const meshCodes: string[] = []
  
  // Generate 3x3 grid of mesh codes
  for (let latOffset = -1; latOffset <= 1; latOffset++) {
    for (let lngOffset = -1; lngOffset <= 1; lngOffset++) {
      try {
        const lat = center.lat + latOffset * meshSizeLat
        const lng = center.lng + lngOffset * meshSizeLng
        const code = latLngToMeshCode(lat, lng)
        meshCodes.push(code)
      } catch {
        // Skip if out of bounds
      }
    }
  }

  return meshCodes
}

/**
 * Check if a mesh code is valid
 * 
 * @param meshCode - Mesh code to validate
 * @returns true if valid, false otherwise
 */
export function isValidMeshCode(meshCode: string): boolean {
  if (typeof meshCode !== 'string' || meshCode.length !== 8) {
    return false
  }

  // Check if all characters are digits
  if (!/^\d{8}$/.test(meshCode)) {
    return false
  }

  try {
    const coords = meshCodeToLatLng(meshCode)
    // Check if coordinates are within Japan bounds
    return coords.lat >= 20 && coords.lat <= 46 && coords.lng >= 122 && coords.lng <= 154
  } catch {
    return false
  }
}
