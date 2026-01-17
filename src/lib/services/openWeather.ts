/**
 * OpenWeatherMap API Service - Wind and Weather Data
 * https://openweathermap.org/api/weather-map-2.0
 */

import { WindData, WeatherData } from '../types'
import { degreesToJapanese } from '../utils/geo'

// OpenWeatherMap layer types
export type OWMLayer = 'clouds_new' | 'precipitation_new' | 'pressure_new' | 'wind_new' | 'temp_new'

const OWM_TILE_BASE = 'https://tile.openweathermap.org/map'

/**
 * Build OpenWeatherMap tile URL
 * Note: Requires API key for production use
 */
export function buildOWMTileUrl(layer: OWMLayer, apiKey?: string): string {
  if (apiKey) {
    return `${OWM_TILE_BASE}/${layer}/{z}/{x}/{y}.png?appid=${apiKey}`
  }
  // Demo/preview URL (limited functionality)
  return `${OWM_TILE_BASE}/${layer}/{z}/{x}/{y}.png`
}

/**
 * Fetch current weather data for a location
 */
export async function fetchWeatherData(
  lat: number,
  lon: number,
  apiKey: string
): Promise<WeatherData | null> {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    )
    const data = await response.json()

    return {
      timestamp: data.dt * 1000,
      wind: {
        speed: data.wind?.speed ?? 0,
        direction: data.wind?.deg ?? 0,
        gust: data.wind?.gust
      },
      rain: data.rain?.['1h'],
      visibility: data.visibility
    }
  } catch (error) {
    console.error('Failed to fetch weather data:', error)
    return null
  }
}

/**
 * Fetch wind data for a specific location
 */
export async function fetchWindData(
  lat: number,
  lon: number,
  apiKey: string
): Promise<WindData | null> {
  const weather = await fetchWeatherData(lat, lon, apiKey)
  return weather?.wind ?? null
}

/**
 * Alternative: Use Windy.com embed (no API key required)
 * Returns an iframe URL for embedding wind map
 */
export function getWindyEmbedUrl(lat: number, lon: number, zoom: number = 8): string {
  return `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=${zoom}&level=surface&overlay=wind&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&detailLat=${lat}&detailLon=${lon}&metricWind=m%2Fs&metricTemp=%C2%B0C&radarRange=-1`
}

/**
 * Alternative: Use earth.nullschool.net visualization
 */
export function getEarthNullschoolUrl(lat: number, lon: number, zoom: number = 1000): string {
  return `https://earth.nullschool.net/#current/wind/surface/level/orthographic=${lon},${lat},${zoom}`
}

/**
 * Get wind speed category (Beaufort scale simplified)
 */
export function getWindCategory(speedMs: number): {
  level: number
  name: string
  nameJa: string
  color: string
} {
  if (speedMs < 0.5) {
    return { level: 0, name: 'Calm', nameJa: '静穏', color: '#00E5FF' }
  } else if (speedMs < 3.4) {
    return { level: 1, name: 'Light', nameJa: '軽風', color: '#00E676' }
  } else if (speedMs < 7.9) {
    return { level: 2, name: 'Moderate', nameJa: '和風', color: '#FFEB3B' }
  } else if (speedMs < 13.9) {
    return { level: 3, name: 'Strong', nameJa: '強風', color: '#FF9800' }
  } else if (speedMs < 20.8) {
    return { level: 4, name: 'Gale', nameJa: '暴風', color: '#F44336' }
  } else {
    return { level: 5, name: 'Storm', nameJa: '猛烈な風', color: '#9C27B0' }
  }
}

/**
 * Format wind data for display
 */
export function formatWindData(wind: WindData): string {
  const direction = degreesToJapanese(wind.direction)
  const category = getWindCategory(wind.speed)

  let result = `${direction}の風 ${wind.speed.toFixed(1)}m/s (${category.nameJa})`
  if (wind.gust) {
    result += ` 瞬間最大${wind.gust.toFixed(1)}m/s`
  }
  return result
}

export const OpenWeatherService = {
  buildTileUrl: buildOWMTileUrl,
  fetchWeather: fetchWeatherData,
  fetchWind: fetchWindData,
  getWindyEmbed: getWindyEmbedUrl,
  getEarthNullschool: getEarthNullschoolUrl,
  getWindCategory,
  formatWind: formatWindData
}
