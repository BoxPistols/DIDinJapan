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

  // JMA mesh system constants:
  // - 1.5 = conversion factor for latitude (1° = 1.5 mesh units)
  // - 100 = base longitude offset for Japan region
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

// ============================================================================
// Multi-level Mesh Support (1st, 2nd, 3rd level)
// ============================================================================

/**
 * Convert latitude/longitude to 1st level mesh code (4 digits)
 * 1st level mesh: ~80km grid
 *
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @returns Mesh code as string (4 digits)
 *
 * @example
 * const code = latLngToMeshCode1st(35.6595, 139.7004)
 * console.log(code) // "5339"
 */
export function latLngToMeshCode1st(lat: number, lng: number): string {
  if (lat < 20 || lat > 46 || lng < 122 || lng > 154) {
    throw new Error('Coordinates out of Japan bounds')
  }

  const p = Math.floor(lat * 1.5)
  const q = Math.floor(lng - 100)

  return `${String(p).padStart(2, '0')}${String(q).padStart(2, '0')}`
}

/**
 * Convert latitude/longitude to 2nd level mesh code (6 digits)
 * 2nd level mesh: ~10km grid
 *
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @returns Mesh code as string (6 digits)
 *
 * @example
 * const code = latLngToMeshCode2nd(35.6595, 139.7004)
 * console.log(code) // "533935"
 */
export function latLngToMeshCode2nd(lat: number, lng: number): string {
  if (lat < 20 || lat > 46 || lng < 122 || lng > 154) {
    throw new Error('Coordinates out of Japan bounds')
  }

  const p = Math.floor(lat * 1.5)
  const q = Math.floor(lng - 100)

  const lat_1 = lat * 60 - p * 40
  const lng_1 = (lng - 100) * 60 - q * 40
  const a = Math.min(Math.floor(lat_1 / 5), 7)
  const b = Math.min(Math.floor(lng_1 / 7.5), 7)

  return `${String(p).padStart(2, '0')}${String(q).padStart(2, '0')}${a}${b}`
}

/**
 * Convert 1st level mesh code to center coordinates
 *
 * @param meshCode - 4-digit mesh code
 * @returns Object with latitude and longitude of mesh center
 */
export function meshCode1stToLatLng(meshCode: string): { lat: number; lng: number } {
  if (meshCode.length !== 4) {
    throw new Error('Mesh code must be 4 digits for 1st level mesh')
  }

  const p = parseInt(meshCode.substring(0, 2), 10)
  const q = parseInt(meshCode.substring(2, 4), 10)

  // Calculate southwest corner
  const lat_sw = p / 1.5
  const lng_sw = q + 100

  // Return center of mesh (add half of mesh size)
  // 1st level mesh: 40 minutes lat, 1 degree lng
  const lat = lat_sw + 40 / 60 / 2
  const lng = lng_sw + 0.5

  return { lat, lng }
}

/**
 * Convert 2nd level mesh code to center coordinates
 *
 * @param meshCode - 6-digit mesh code
 * @returns Object with latitude and longitude of mesh center
 */
export function meshCode2ndToLatLng(meshCode: string): { lat: number; lng: number } {
  if (meshCode.length !== 6) {
    throw new Error('Mesh code must be 6 digits for 2nd level mesh')
  }

  const p = parseInt(meshCode.substring(0, 2), 10)
  const q = parseInt(meshCode.substring(2, 4), 10)
  const a = parseInt(meshCode.substring(4, 5), 10)
  const b = parseInt(meshCode.substring(5, 6), 10)

  // Calculate southwest corner
  const lat_sw = p / 1.5 + a * 5 / 60
  const lng_sw = q + 100 + b * 7.5 / 60

  // Return center of mesh (add half of mesh size)
  // 2nd level mesh: 5 minutes lat, 7.5 minutes lng
  const lat = lat_sw + 2.5 / 60
  const lng = lng_sw + 3.75 / 60

  return { lat, lng }
}

/**
 * Get bounding box for a 1st level mesh code
 *
 * @param meshCode - 4-digit mesh code
 * @returns Bounding box [minLng, minLat, maxLng, maxLat]
 */
export function meshCode1stToBBox(meshCode: string): [number, number, number, number] {
  if (meshCode.length !== 4) {
    throw new Error('Mesh code must be 4 digits for 1st level mesh')
  }

  const p = parseInt(meshCode.substring(0, 2), 10)
  const q = parseInt(meshCode.substring(2, 4), 10)

  // Calculate southwest corner
  const minLat = p / 1.5
  const minLng = q + 100

  // Calculate northeast corner (add mesh size: 40 minutes lat, 1 degree lng)
  const maxLat = minLat + 40 / 60
  const maxLng = minLng + 1

  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Get bounding box for a 2nd level mesh code
 *
 * @param meshCode - 6-digit mesh code
 * @returns Bounding box [minLng, minLat, maxLng, maxLat]
 */
export function meshCode2ndToBBox(meshCode: string): [number, number, number, number] {
  if (meshCode.length !== 6) {
    throw new Error('Mesh code must be 6 digits for 2nd level mesh')
  }

  const p = parseInt(meshCode.substring(0, 2), 10)
  const q = parseInt(meshCode.substring(2, 4), 10)
  const a = parseInt(meshCode.substring(4, 5), 10)
  const b = parseInt(meshCode.substring(5, 6), 10)

  // Calculate southwest corner
  const minLat = p / 1.5 + a * 5 / 60
  const minLng = q + 100 + b * 7.5 / 60

  // Calculate northeast corner (add mesh size: 5 minutes lat, 7.5 minutes lng)
  const maxLat = minLat + 5 / 60
  const maxLng = minLng + 7.5 / 60

  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Get bounding box for any level mesh code (auto-detect by length)
 *
 * @param meshCode - 4, 6, or 8 digit mesh code
 * @returns Bounding box [minLng, minLat, maxLng, maxLat]
 */
export function meshCodeToBBoxByLevel(meshCode: string): [number, number, number, number] {
  switch (meshCode.length) {
    case 4:
      return meshCode1stToBBox(meshCode)
    case 6:
      return meshCode2ndToBBox(meshCode)
    case 8:
      return meshCodeToBBox(meshCode)
    default:
      throw new Error(`Invalid mesh code length: ${meshCode.length}. Must be 4, 6, or 8 digits.`)
  }
}

/**
 * Mesh level type
 */
export type MeshLevel = 1 | 2 | 3

/**
 * Get mesh configuration for a zoom level
 *
 * @param zoom - Map zoom level
 * @returns Mesh configuration object
 */
export function getMeshConfigForZoom(zoom: number): {
  level: MeshLevel
  latStep: number
  lngStep: number
  maxCells: number
} {
  if (zoom < 7) {
    return {
      level: 1,
      latStep: 40 / 60,  // 1st level mesh height in degrees
      lngStep: 1,        // 1st level mesh width in degrees
      maxCells: 50
    }
  }
  if (zoom < 10) {
    return {
      level: 2,
      latStep: 5 / 60,   // 2nd level mesh height in degrees
      lngStep: 7.5 / 60, // 2nd level mesh width in degrees
      maxCells: 200
    }
  }
  return {
    level: 3,
    latStep: 0.5 / 60,   // 3rd level mesh height in degrees
    lngStep: 0.75 / 60,  // 3rd level mesh width in degrees
    maxCells: 500
  }
}

/**
 * Generate mesh code for coordinates at specified level
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param level - Mesh level (1, 2, or 3)
 * @returns Mesh code string
 */
export function latLngToMeshCodeByLevel(lat: number, lng: number, level: MeshLevel): string {
  switch (level) {
    case 1:
      return latLngToMeshCode1st(lat, lng)
    case 2:
      return latLngToMeshCode2nd(lat, lng)
    case 3:
      return latLngToMeshCode(lat, lng)
    default:
      throw new Error(`Invalid mesh level: ${level}`)
  }
}
