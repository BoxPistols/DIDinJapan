import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchMeshTimeSeries } from '../services/jmaMesh'

export interface JmaMeshWeatherData {
  windSpeed: number
  windDirection: number
  precipitationProbability: number
  temperature: number
  timestamp: string
  meshCode: string
}

export interface JmaTimeSeriesData {
  meshCode: string
  forecasts: JmaMeshWeatherData[]
}

export type WindLevel = 'safe' | 'caution' | 'warning' | 'danger'

export interface WeatherMeshResult {
  data: JmaTimeSeriesData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Classify wind level based on wind speed
 * - 0-2 m/s: safe
 * - 2-5 m/s: caution
 * - 5-10 m/s: warning
 * - 10+ m/s: danger
 */
export function classifyWindLevel(windSpeed: number): WindLevel {
  if (windSpeed < 2) return 'safe'
  if (windSpeed < 5) return 'caution'
  if (windSpeed < 10) return 'warning'
  return 'danger'
}

/**
 * Hook to fetch and manage JMA mesh weather data
 * 
 * @param meshCode - JMA mesh code (8 digits)
 * @param hours - Number of hours to forecast (default: 24, max: 72)
 * @returns Weather data with loading and error states
 * 
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useWeatherMesh('53393599', 24)
 * 
 * if (loading) return <div>Loading weather data...</div>
 * if (error) return <div>Error: {error}</div>
 * 
 * const windLevel = classifyWindLevel(data.forecasts[0].windSpeed)
 * ```
 */
export function useWeatherMesh(
  meshCode: string | null,
  hours: number = 24
): WeatherMeshResult {
  const [data, setData] = useState<JmaTimeSeriesData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!meshCode) {
      setError('Mesh code is required')
      setData(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const timeSeries = await fetchMeshTimeSeries(meshCode, hours)
      setData(timeSeries)
      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch weather data'
      setError(errorMessage)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [meshCode, hours])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refetch = useCallback(async () => {
    await fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch
  }
}

/**
 * Hook to get current weather forecast from time series data
 */
export function useCurrentWeatherForecast(data: JmaTimeSeriesData | null) {
  return useMemo(() => {
    if (!data || data.forecasts.length === 0) return null
    return data.forecasts[0]
  }, [data])
}
