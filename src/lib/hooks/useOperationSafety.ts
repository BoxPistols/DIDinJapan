import { useMemo, useCallback } from 'react'
import { useWeatherMesh, classifyWindLevel } from './useWeatherMesh'
import { useNetworkCoverage } from './useNetworkCoverage'
import { useFlightWindow } from './useFlightWindow'

export type SafetyLevel = 'safe' | 'caution' | 'warning' | 'danger' | 'prohibited'

export interface SafetyReason {
  category: 'weather' | 'network' | 'daylight' | 'wind' | 'precipitation'
  severity: 'info' | 'warning' | 'critical'
  message: string
  // Structured data to avoid string parsing
  value?: number
  unit?: string
  threshold?: number
}

export interface OperationSafetyResult {
  canFly: boolean
  reasons: SafetyReason[]
  safetyLevel: SafetyLevel
  nextSafeWindow: Date | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  // Expose raw data for advanced use cases
  weatherData?: {
    windSpeed?: number
    windDirection?: number
    precipitationProbability?: number
    temperature?: number
  }
  networkData?: {
    hasLTE: boolean
    signalStrength: string
  }
  flightWindowData?: {
    flightAllowedNow: boolean
    minutesRemaining: number | null
  }
}

/**
 * Hook that combines all safety checks for drone operations
 * Evaluates weather, network coverage, and daylight conditions
 * 
 * Safety Rules:
 * - canFly = false if wind >= 10 m/s
 * - canFly = false if !hasLTE
 * - canFly = false if !flightAllowedNow (after civil twilight)
 * - canFly = false if precipitation > 50%
 * 
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @param meshCode - JMA mesh code (8 digits)
 * @returns Comprehensive safety assessment
 * 
 * @example
 * ```tsx
 * const safety = useOperationSafety(35.6595, 139.7004, '53393599')
 * 
 * if (safety.loading) return <div>Checking safety conditions...</div>
 * 
 * if (!safety.canFly) {
 *   return (
 *     <div>
 *       <h3>Flight Not Allowed</h3>
 *       <ul>
 *         {safety.reasons.map((reason, i) => (
 *           <li key={i}>{reason.message}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   )
 * }
 * ```
 */
export function useOperationSafety(
  lat: number,
  lng: number,
  meshCode: string | null
): OperationSafetyResult {
  // Fetch all safety data
  const weather = useWeatherMesh(meshCode)
  const network = useNetworkCoverage(lat, lng)
  const flightWindow = useFlightWindow(lat, lng)

  // Combined loading state
  const loading = weather.loading || network.loading || flightWindow.loading

  // Combined error state
  const error = weather.error || network.error || flightWindow.error

  // Safety evaluation
  const safetyEvaluation = useMemo(() => {
    const reasons: SafetyReason[] = []
    let canFly = true
    let safetyLevel: SafetyLevel = 'safe'

    // Check if data is available
    if (!weather.data || !flightWindow.civilTwilightEnd) {
      return {
        canFly: false,
        reasons: [{
          category: 'weather' as const,
          severity: 'critical' as const,
          message: 'Unable to load safety data'
        }],
        safetyLevel: 'prohibited' as SafetyLevel,
        nextSafeWindow: null
      }
    }

    const currentForecast = weather.data.forecasts[0]
    
    // Check wind speed (critical: >= 10 m/s)
    if (currentForecast.windSpeed >= 10) {
      canFly = false
      safetyLevel = 'danger'
      reasons.push({
        category: 'wind',
        severity: 'critical',
        message: `Wind speed too high: ${currentForecast.windSpeed.toFixed(1)} m/s (max: 10 m/s)`,
        value: currentForecast.windSpeed,
        unit: 'm/s',
        threshold: 10
      })
    } else if (currentForecast.windSpeed >= 5) {
      safetyLevel = 'warning'
      reasons.push({
        category: 'wind',
        severity: 'warning',
        message: `Moderate wind speed: ${currentForecast.windSpeed.toFixed(1)} m/s (caution advised)`,
        value: currentForecast.windSpeed,
        unit: 'm/s',
        threshold: 5
      })
    } else if (currentForecast.windSpeed >= 2) {
      if (safetyLevel === 'safe') safetyLevel = 'caution'
      reasons.push({
        category: 'wind',
        severity: 'info',
        message: `Light wind: ${currentForecast.windSpeed.toFixed(1)} m/s`,
        value: currentForecast.windSpeed,
        unit: 'm/s',
        threshold: 2
      })
    }

    // Check precipitation (critical: > 50%)
    if (currentForecast.precipitationProbability > 50) {
      canFly = false
      if (safetyLevel !== 'danger') safetyLevel = 'danger'
      reasons.push({
        category: 'precipitation',
        severity: 'critical',
        message: `High precipitation probability: ${currentForecast.precipitationProbability}% (max: 50%)`,
        value: currentForecast.precipitationProbability,
        unit: '%',
        threshold: 50
      })
    } else if (currentForecast.precipitationProbability > 30) {
      if (safetyLevel === 'safe') safetyLevel = 'caution'
      reasons.push({
        category: 'precipitation',
        severity: 'warning',
        message: `Moderate precipitation probability: ${currentForecast.precipitationProbability}%`,
        value: currentForecast.precipitationProbability,
        unit: '%',
        threshold: 30
      })
    }

    // Check LTE availability (critical)
    if (!network.hasLTE) {
      canFly = false
      safetyLevel = 'prohibited'
      reasons.push({
        category: 'network',
        severity: 'critical',
        message: 'No LTE coverage available at this location'
      })
    } else if (network.signalStrength === 'poor') {
      if (safetyLevel === 'safe') safetyLevel = 'caution'
      reasons.push({
        category: 'network',
        severity: 'warning',
        message: 'Poor network signal strength'
      })
    }

    // Check daylight / civil twilight (critical)
    if (!flightWindow.flightAllowedNow) {
      canFly = false
      safetyLevel = 'prohibited'
      reasons.push({
        category: 'daylight',
        severity: 'critical',
        message: 'Flight not allowed after civil twilight end'
      })
    } else if (flightWindow.minutesRemaining < 30 && flightWindow.minutesRemaining > 0) {
      if (safetyLevel === 'safe') safetyLevel = 'caution'
      reasons.push({
        category: 'daylight',
        severity: 'warning',
        message: `Only ${flightWindow.minutesRemaining} minutes until civil twilight end`
      })
    }

    // Calculate next safe window
    let nextSafeWindow: Date | null = null
    if (!canFly) {
      if (!flightWindow.flightAllowedNow && flightWindow.civilTwilightEnd) {
        // Next day's sunrise
        const tomorrow = new Date(flightWindow.civilTwilightEnd)
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(6, 0, 0, 0) // Approximate sunrise
        nextSafeWindow = tomorrow
      } else if (currentForecast.windSpeed >= 10) {
        // Check future forecasts for better conditions
        const betterForecast = weather.data.forecasts.find(f => f.windSpeed < 10)
        if (betterForecast) {
          nextSafeWindow = new Date(betterForecast.timestamp)
        }
      }
    }

    // Add info message if all conditions are safe
    if (canFly && reasons.length === 0) {
      reasons.push({
        category: 'weather',
        severity: 'info',
        message: 'All safety conditions met - flight authorized'
      })
    }

    return {
      canFly,
      reasons,
      safetyLevel,
      nextSafeWindow
    }
  }, [weather.data, network.hasLTE, network.signalStrength, flightWindow.flightAllowedNow, flightWindow.minutesRemaining, flightWindow.civilTwilightEnd])

  // Refetch all data
  const refetch = useCallback(async () => {
    await Promise.all([
      weather.refetch(),
      network.refetch(),
      flightWindow.refetch()
    ])
  }, [weather.refetch, network.refetch, flightWindow.refetch])

  return {
    canFly: safetyEvaluation.canFly,
    reasons: safetyEvaluation.reasons,
    safetyLevel: safetyEvaluation.safetyLevel,
    nextSafeWindow: safetyEvaluation.nextSafeWindow,
    loading,
    error,
    refetch,
    // Expose raw data for advanced use cases (avoids string parsing)
    weatherData: weather.data?.forecasts[0] ? {
      windSpeed: weather.data.forecasts[0].windSpeed,
      windDirection: weather.data.forecasts[0].windDirection,
      precipitationProbability: weather.data.forecasts[0].precipitationProbability,
      temperature: weather.data.forecasts[0].temperature
    } : undefined,
    networkData: {
      hasLTE: network.hasLTE,
      signalStrength: network.signalStrength
    },
    flightWindowData: {
      flightAllowedNow: flightWindow.flightAllowedNow,
      minutesRemaining: flightWindow.minutesRemaining
    }
  }
}

/**
 * Get safety level color for UI display
 */
export function getSafetyLevelColor(level: SafetyLevel): string {
  switch (level) {
    case 'safe':
      return '#22c55e' // green
    case 'caution':
      return '#eab308' // yellow
    case 'warning':
      return '#f97316' // orange
    case 'danger':
      return '#ef4444' // red
    case 'prohibited':
      return '#991b1b' // dark red
    default:
      return '#6b7280' // gray
  }
}

/**
 * Get safety level text for UI display
 */
export function getSafetyLevelText(level: SafetyLevel): string {
  switch (level) {
    case 'safe':
      return '安全'
    case 'caution':
      return '注意'
    case 'warning':
      return '警告'
    case 'danger':
      return '危険'
    case 'prohibited':
      return '飛行禁止'
    default:
      return '不明'
  }
}
