/**
 * Sunrise-Sunset.org API Service
 * Provides sunrise, sunset, and twilight times for drone flight planning
 * Civil twilight end is critical for determining latest safe flight time
 */

interface SunriseSunsetData {
  sunrise: string // ISO 8601 timestamp
  sunset: string // ISO 8601 timestamp
  solarNoon: string // ISO 8601 timestamp
  dayLength: number // seconds
  civilTwilight: {
    begin: string // ISO 8601 timestamp
    end: string // ISO 8601 timestamp
  }
  nauticalTwilight: {
    begin: string // ISO 8601 timestamp
    end: string // ISO 8601 timestamp
  }
  astronomicalTwilight: {
    begin: string // ISO 8601 timestamp
    end: string // ISO 8601 timestamp
  }
}

interface SunriseSunsetApiResponse {
  results: {
    sunrise: string
    sunset: string
    solar_noon: string
    day_length: string
    civil_twilight_begin: string
    civil_twilight_end: string
    nautical_twilight_begin: string
    nautical_twilight_end: string
    astronomical_twilight_begin: string
    astronomical_twilight_end: string
  }
  status: string
  tzId?: string
}

interface SunTimesRequest {
  lat: number
  lng: number
  date?: Date
  tzId?: string
}

const API_BASE_URL = 'https://api.sunrise-sunset.org/json'
const DEFAULT_TIMEZONE = 'Asia/Tokyo'

// In-memory cache for same-day requests
const cache = new Map<string, SunriseSunsetData>()

/**
 * Fetch sunrise and sunset times for a location and date
 * @param request Location and date parameters
 * @returns Sunrise/sunset data with twilight times
 */
export async function fetchSunriseSunset(request: SunTimesRequest): Promise<SunriseSunsetData> {
  const { lat, lng, date = new Date(), tzId = DEFAULT_TIMEZONE } = request
  
  // Check cache first
  const cacheKey = getCacheKey(lat, lng, date, tzId)
  const cached = cache.get(cacheKey)
  if (cached) {
    return cached
  }
  
  try {
    const dateStr = formatDateForApi(date)
    const url = `${API_BASE_URL}?lat=${lat}&lng=${lng}&date=${dateStr}&formatted=0&tzid=${tzId}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Sunrise-Sunset API returned ${response.status}`)
    }
    
    const apiData: SunriseSunsetApiResponse = await response.json()
    
    if (apiData.status !== 'OK') {
      throw new Error(`API returned status: ${apiData.status}`)
    }
    
    const data = parseSunriseSunsetResponse(apiData)
    
    // Cache the result
    cache.set(cacheKey, data)
    
    // Clean old cache entries (keep only today's data)
    cleanCache()
    
    return data
  } catch (error) {
    console.error('Failed to fetch sunrise/sunset times:', error)
    return createFallbackSunTimes(lat, lng, date, tzId)
  }
}

/**
 * Get civil twilight end time (critical for drone operations)
 * Drones typically must land before civil twilight ends
 * @param lat Latitude
 * @param lng Longitude
 * @param date Date to check (defaults to today)
 * @returns Civil twilight end time as Date object
 */
export async function getCivilTwilightEnd(
  lat: number,
  lng: number,
  date: Date = new Date()
): Promise<Date> {
  const sunTimes = await fetchSunriseSunset({ lat, lng, date })
  return new Date(sunTimes.civilTwilight.end)
}

/**
 * Check if a given time is within daylight hours
 * @param lat Latitude
 * @param lng Longitude
 * @param time Time to check (defaults to now)
 * @returns True if within daylight (sunrise to civil twilight end)
 */
export async function isDaylight(
  lat: number,
  lng: number,
  time: Date = new Date()
): Promise<boolean> {
  const sunTimes = await fetchSunriseSunset({ lat, lng, date: time })
  const sunrise = new Date(sunTimes.sunrise)
  const twilightEnd = new Date(sunTimes.civilTwilight.end)
  
  return time >= sunrise && time <= twilightEnd
}

/**
 * Get minutes until civil twilight end
 * Useful for determining flight time remaining
 * @param lat Latitude
 * @param lng Longitude
 * @returns Minutes until twilight end (negative if already past)
 */
export async function getMinutesUntilTwilightEnd(
  lat: number,
  lng: number
): Promise<number> {
  const twilightEnd = await getCivilTwilightEnd(lat, lng)
  const now = new Date()
  const diffMs = twilightEnd.getTime() - now.getTime()
  return Math.floor(diffMs / (1000 * 60))
}

/**
 * Parse API response into typed data structure
 */
function parseSunriseSunsetResponse(apiData: SunriseSunsetApiResponse): SunriseSunsetData {
  const { results } = apiData
  
  // Parse day_length from seconds string
  const dayLength = parseInt(results.day_length, 10)
  
  return {
    sunrise: results.sunrise,
    sunset: results.sunset,
    solarNoon: results.solar_noon,
    dayLength,
    civilTwilight: {
      begin: results.civil_twilight_begin,
      end: results.civil_twilight_end
    },
    nauticalTwilight: {
      begin: results.nautical_twilight_begin,
      end: results.nautical_twilight_end
    },
    astronomicalTwilight: {
      begin: results.astronomical_twilight_begin,
      end: results.astronomical_twilight_end
    }
  }
}

/**
 * Create fallback sun times with conservative estimates
 * Used when API is unavailable
 */
function createFallbackSunTimes(
  lat: number,
  lng: number,
  date: Date,
  tzId: string
): SunriseSunsetData {
  // Conservative estimates for Japan (35°N)
  // Sunrise ~6:00, Sunset ~18:00, Civil twilight ~30 minutes after sunset
  const baseDate = new Date(date)
  baseDate.setHours(0, 0, 0, 0)
  
  const sunrise = new Date(baseDate.getTime() + 6 * 60 * 60 * 1000)
  const sunset = new Date(baseDate.getTime() + 18 * 60 * 60 * 1000)
  const civilTwilightBegin = new Date(sunrise.getTime() - 30 * 60 * 1000)
  const civilTwilightEnd = new Date(sunset.getTime() + 30 * 60 * 1000)
  const nauticalTwilightBegin = new Date(sunrise.getTime() - 60 * 60 * 1000)
  const nauticalTwilightEnd = new Date(sunset.getTime() + 60 * 60 * 1000)
  const astronomicalTwilightBegin = new Date(sunrise.getTime() - 90 * 60 * 1000)
  const astronomicalTwilightEnd = new Date(sunset.getTime() + 90 * 60 * 1000)
  const solarNoon = new Date(baseDate.getTime() + 12 * 60 * 60 * 1000)
  const dayLength = 12 * 60 * 60 // 12 hours in seconds
  
  console.warn('Using fallback sun times - actual times may vary')
  
  return {
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
    solarNoon: solarNoon.toISOString(),
    dayLength,
    civilTwilight: {
      begin: civilTwilightBegin.toISOString(),
      end: civilTwilightEnd.toISOString()
    },
    nauticalTwilight: {
      begin: nauticalTwilightBegin.toISOString(),
      end: nauticalTwilightEnd.toISOString()
    },
    astronomicalTwilight: {
      begin: astronomicalTwilightBegin.toISOString(),
      end: astronomicalTwilightEnd.toISOString()
    }
  }
}

/**
 * Format date for API (YYYY-MM-DD)
 */
function formatDateForApi(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Generate cache key
 */
function getCacheKey(lat: number, lng: number, date: Date, tzId: string): string {
  const dateStr = formatDateForApi(date)
  return `${lat.toFixed(4)}_${lng.toFixed(4)}_${dateStr}_${tzId}`
}

/**
 * Clean cache entries older than today
 */
function cleanCache(): void {
  const today = formatDateForApi(new Date())
  const keysToDelete: string[] = []
  
  for (const key of cache.keys()) {
    if (!key.includes(today)) {
      keysToDelete.push(key)
    }
  }
  
  keysToDelete.forEach(key => cache.delete(key))
}

/**
 * Format sun times for display
 */
export function formatSunTimes(data: SunriseSunsetData): string {
  const sunrise = new Date(data.sunrise)
  const sunset = new Date(data.sunset)
  const twilightEnd = new Date(data.civilTwilight.end)
  
  const formatTime = (date: Date) => date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  })
  
  return `日の出: ${formatTime(sunrise)}, 日の入: ${formatTime(sunset)}, 薄明終了: ${formatTime(twilightEnd)}`
}

export const SunriseSunsetService = {
  fetchSunriseSunset,
  getCivilTwilightEnd,
  isDaylight,
  getMinutesUntilTwilightEnd,
  formatSunTimes
}
