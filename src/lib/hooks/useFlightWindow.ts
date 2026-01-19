import { useState, useEffect, useCallback } from 'react'
import {
  getCivilTwilightEnd,
  isDaylight,
  getMinutesUntilTwilightEnd
} from '../services/sunriseSunset'

export interface FlightWindowResult {
  flightAllowedNow: boolean
  minutesRemaining: number
  civilTwilightEnd: Date | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to determine flight time window based on civil twilight
 * Drones must land before civil twilight ends
 * 
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @param date - Date to check (defaults to current date)
 * @returns Flight window information with loading state
 * 
 * @example
 * ```tsx
 * const { flightAllowedNow, minutesRemaining, civilTwilightEnd } = useFlightWindow(35.6595, 139.7004)
 * 
 * if (!flightAllowedNow) {
 *   return <div>Flight not allowed - after civil twilight</div>
 * }
 * 
 * if (minutesRemaining < 30) {
 *   return <div>Warning: Only {minutesRemaining} minutes until twilight end</div>
 * }
 * ```
 */
export function useFlightWindow(
  lat: number,
  lng: number,
  date?: Date
): FlightWindowResult {
  const [flightAllowedNow, setFlightAllowedNow] = useState<boolean>(false)
  const [minutesRemaining, setMinutesRemaining] = useState<number>(0)
  const [civilTwilightEnd, setCivilTwilightEnd] = useState<Date | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Use stable date reference - only use date's day, not the object itself
  const dateKey = date ? date.toDateString() : new Date().toDateString()

  const fetchFlightWindow = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const targetDate = date ?? new Date()
      // Get civil twilight end time
      const twilightEnd = await getCivilTwilightEnd(lat, lng, targetDate)
      setCivilTwilightEnd(twilightEnd)

      // Check if current time is within daylight
      const isAllowed = await isDaylight(lat, lng, new Date())
      setFlightAllowedNow(isAllowed)

      // Get minutes remaining until twilight end
      const minutes = await getMinutesUntilTwilightEnd(lat, lng)
      setMinutesRemaining(minutes)

      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch flight window'
      setError(errorMessage)
      setFlightAllowedNow(false)
      setMinutesRemaining(0)
      setCivilTwilightEnd(null)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, dateKey])

  useEffect(() => {
    fetchFlightWindow()

    // Update every minute to keep minutesRemaining accurate
    const interval = setInterval(() => {
      fetchFlightWindow()
    }, 60000) // 60 seconds

    return () => clearInterval(interval)
  }, [fetchFlightWindow])

  const refetch = useCallback(async () => {
    await fetchFlightWindow()
  }, [fetchFlightWindow])

  return {
    flightAllowedNow,
    minutesRemaining,
    civilTwilightEnd,
    loading,
    error,
    refetch
  }
}
