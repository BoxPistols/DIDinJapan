/**
 * JMA (Japan Meteorological Agency) Mesh Weather API Service
 * Provides mesh-based weather forecasts for Japan
 */

import { latLngToMeshCode } from '../utils/meshCodeConverter'

interface JmaMeshWeatherData {
  windSpeed: number
  windDirection: number
  precipitationProbability: number
  temperature: number
  timestamp: string
  meshCode: string
}

interface JmaTimeSeriesData {
  meshCode: string
  forecasts: JmaMeshWeatherData[]
}

/**
 * Fetch weather data for a specific mesh code
 * Currently uses mock data - replace with actual JMA API integration
 */
export async function fetchMeshWeather(meshCode: string): Promise<JmaMeshWeatherData> {
  // TODO: Replace with actual JMA API integration
  // For now, return mock data
  return createMockWeatherData(meshCode)
}

/**
 * Fetch time series weather data for a specific mesh code
 * Currently uses mock data - replace with actual JMA API integration
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
