/**
 * JMA (Japan Meteorological Agency) Mesh Weather API Service
 * Provides mesh-based weather forecasts for Japan
 */

interface JmaMeshWeatherData {
  windSpeed: number // m/s
  windDirection: number // degrees (0-360)
  precipitationProbability: number // percentage (0-100)
  temperature: number // celsius
  timestamp: string // ISO 8601
  meshCode: string
}

interface JmaTimeSeriesData {
  meshCode: string
  forecasts: JmaMeshWeatherData[]
}

interface JmaApiResponse {
  validTime: string
  // Simplified structure - actual JMA API has more complex nested data
  [key: string]: any
}

const JMA_BASE_URL = 'https://www.jma.go.jp/bosai/jmatile/data/wdist'

/**
 * Fetch current weather data for a specific mesh code
 * @param meshCode JMA mesh code (e.g., "53394547")
 * @returns Weather data (currently returns mock data with "(見本)" marker)
 *
 * Note: JMA public API requires specific endpoint format.
 * For production, integrate with actual JMA data distribution service.
 */
export async function fetchMeshWeather(meshCode: string): Promise<JmaMeshWeatherData> {
  // Currently using mock data - JMA public API integration pending
  // Real implementation would use: https://www.jma.go.jp/bosai/forecast/data/forecast/{areaCode}.json
  return createMockWeatherData(meshCode)
}

/**
 * Fetch time series weather forecast (5-minute intervals, up to 72 hours)
 * @param meshCode JMA mesh code
 * @param hours Number of hours to forecast (max 72)
 * @returns Time series forecast data (currently returns mock data with "(見本)" marker)
 *
 * Note: JMA public API integration pending. Returns mock data for now.
 */
export async function fetchMeshTimeSeries(
  meshCode: string,
  hours: number = 24
): Promise<JmaTimeSeriesData> {
  const maxHours = Math.min(hours, 72)
  // Currently using mock data - JMA public API integration pending
  return createMockTimeSeries(meshCode, maxHours)
}

/**
 * Convert lat/lng to JMA mesh code (3rd mesh - approximately 1km)
 * @param lat Latitude
 * @param lng Longitude
 * @returns JMA mesh code
 */
export function latLngToMeshCode(lat: number, lng: number): string {
  // Simplified mesh code calculation
  // Actual JMA mesh system is more complex
  const latCode = Math.floor((lat * 60) / 40)
  const lngCode = Math.floor(((lng - 100) * 60) / 60)
  
  return `${latCode}${lngCode}0000`
}

/**
 * Create mock weather data with "(見本)" marker
 */
function createMockWeatherData(meshCode: string): JmaMeshWeatherData {
  return {
    windSpeed: 3.5,
    windDirection: 180,
    precipitationProbability: 20,
    temperature: 22,
    timestamp: new Date().toISOString(),
    meshCode: `(見本)${meshCode}`
  }
}

/**
 * Create mock time series data with "(見本)" marker
 */
function createMockTimeSeries(meshCode: string, hours: number): JmaTimeSeriesData {
  const intervals = (hours * 60) / 5
  const forecasts: JmaMeshWeatherData[] = []
  
  for (let i = 0; i < intervals; i++) {
    const forecastTime = new Date(Date.now() + i * 5 * 60 * 1000)
    const hour = forecastTime.getHours()
    
    // Vary conditions by time of day for realism
    const tempVariation = Math.sin((hour / 24) * Math.PI * 2) * 5
    const windVariation = Math.random() * 2
    
    forecasts.push({
      windSpeed: 3.5 + windVariation,
      windDirection: 180 + (i % 360),
      precipitationProbability: 20 + (hour > 14 && hour < 18 ? 30 : 0),
      temperature: 22 + tempVariation,
      timestamp: forecastTime.toISOString(),
      meshCode: `(見本)${meshCode}`
    })
  }
  
  return {
    meshCode: `(見本)${meshCode}`,
    forecasts
  }
}

/**
 * Check if weather data is mock data
 */
export function isMockData(data: JmaMeshWeatherData | JmaTimeSeriesData): boolean {
  const meshCode = 'meshCode' in data ? data.meshCode : ''
  return meshCode.includes('(見本)')
}

/**
 * Format weather data for display
 */
export function formatWeatherData(data: JmaMeshWeatherData): string {
  const prefix = isMockData(data) ? '(見本) ' : ''
  return `${prefix}風速: ${data.windSpeed.toFixed(1)}m/s, 気温: ${data.temperature.toFixed(1)}°C, 降水確率: ${data.precipitationProbability}%`
}

export const JmaMeshService = {
  fetchWeather: fetchMeshWeather,
  fetchTimeSeries: fetchMeshTimeSeries,
  latLngToMeshCode,
  isMockData,
  formatWeatherData
}
