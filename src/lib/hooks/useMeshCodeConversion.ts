import { useState, useEffect, useMemo } from 'react'
import { latLngToMeshCode, isValidMeshCode } from '../utils/meshCodeConverter'

export interface MeshCodeConversionResult {
  meshCode: string | null
  lat: number
  lng: number
  isValid: boolean
  error: string | null
}

/**
 * Hook that converts lat/lng to mesh code using the meshCodeConverter utility
 * 
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @returns Mesh code conversion result with validation
 * 
 * @example
 * ```tsx
 * const { meshCode, isValid, error } = useMeshCodeConversion(35.6595, 139.7004)
 * if (isValid) {
 *   console.log('Mesh code:', meshCode)
 * }
 * ```
 */
export function useMeshCodeConversion(
  lat: number,
  lng: number
): MeshCodeConversionResult {
  const [error, setError] = useState<string | null>(null)
  const [meshCode, setMeshCode] = useState<string | null>(null)

  useEffect(() => {
    try {
      const code = latLngToMeshCode(lat, lng)
      setMeshCode(code)
      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to convert coordinates'
      setError(errorMessage)
      setMeshCode(null)
    }
  }, [lat, lng])

  const isValid = useMemo(() => {
    return meshCode !== null && isValidMeshCode(meshCode) && error === null
  }, [meshCode, error])

  return {
    meshCode,
    lat,
    lng,
    isValid,
    error
  }
}
