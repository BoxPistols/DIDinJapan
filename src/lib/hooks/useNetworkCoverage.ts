import { useState, useEffect, useCallback } from 'react'
import { 
  checkLTEAvailability, 
  getNetworkCoverage,
  type NetworkCoverageInfo,
  type SignalStrength
} from '../services/networkCoverage'

export interface NetworkCoverageResult {
  hasLTE: boolean
  signalStrength: SignalStrength
  loading: boolean
  error: string | null
  coverageInfo: NetworkCoverageInfo | null
  refetch: () => Promise<void>
}

/**
 * Hook to check LTE availability and network coverage
 * 
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @param carrier - Optional carrier filter (e.g., 'docomo', 'au', 'softbank')
 * @returns Network coverage information with loading state
 * 
 * @example
 * ```tsx
 * const { hasLTE, signalStrength, loading } = useNetworkCoverage(35.6595, 139.7004)
 * 
 * if (loading) return <div>Checking network coverage...</div>
 * if (!hasLTE) return <div>No LTE coverage available</div>
 * ```
 */
export function useNetworkCoverage(
  lat: number,
  lng: number,
  carrier?: string
): NetworkCoverageResult {
  const [hasLTE, setHasLTE] = useState<boolean>(false)
  const [signalStrength, setSignalStrength] = useState<SignalStrength>('none')
  const [coverageInfo, setCoverageInfo] = useState<NetworkCoverageInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCoverage = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Check basic LTE availability
      const lteAvailable = checkLTEAvailability(lat, lng)
      setHasLTE(lteAvailable)

      // Get comprehensive coverage info
      const coverage = await getNetworkCoverage({ lat, lng, carrier })
      setCoverageInfo(coverage)
      setSignalStrength(coverage.signalStrength)
      setHasLTE(coverage.hasLTE)
      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check network coverage'
      setError(errorMessage)
      setHasLTE(false)
      setSignalStrength('none')
      setCoverageInfo(null)
    } finally {
      setLoading(false)
    }
  }, [lat, lng, carrier])

  useEffect(() => {
    fetchCoverage()
  }, [fetchCoverage])

  const refetch = useCallback(async () => {
    await fetchCoverage()
  }, [fetchCoverage])

  return {
    hasLTE,
    signalStrength,
    loading,
    error,
    coverageInfo,
    refetch
  }
}
