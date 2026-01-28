import { describe, it, expect } from 'vitest'
import {
  fetchMeshWeather,
  fetchMeshTimeSeries,
  isMockData,
  formatWeatherData,
  JmaMeshService
} from './jmaMesh'

describe('JMA Mesh Service', () => {
  describe('fetchMeshWeather', () => {
    it('should return weather data for a valid mesh code', async () => {
      const data = await fetchMeshWeather('53393599')

      expect(data).toBeDefined()
      expect(data.windSpeed).toBeTypeOf('number')
      expect(data.windDirection).toBeTypeOf('number')
      expect(data.precipitationProbability).toBeTypeOf('number')
      expect(data.temperature).toBeTypeOf('number')
      expect(data.timestamp).toBeTypeOf('string')
      // Mock data returns meshCode with "(見本)" prefix
      expect(data.meshCode).toBe('(見本)53393599')
    })
  })

  describe('fetchMeshTimeSeries', () => {
    it('should return time series data for a valid mesh code', async () => {
      const data = await fetchMeshTimeSeries('53393599', 1)

      expect(data).toBeDefined()
      // Mock data returns meshCode with "(見本)" prefix
      expect(data.meshCode).toBe('(見本)53393599')
      expect(data.forecasts).toBeInstanceOf(Array)
      expect(data.forecasts.length).toBeGreaterThan(0)
    })

    it('should limit forecasts to 72 hours', async () => {
      const data = await fetchMeshTimeSeries('53393599', 100)

      // 72 hours * 12 intervals per hour = 864 max forecasts
      // But implementation may vary based on 5-min intervals
      expect(data.forecasts.length).toBeLessThanOrEqual(72 * 60 / 5)
    })

    it('should return forecasts with all required fields', async () => {
      const data = await fetchMeshTimeSeries('53393599', 1)
      const forecast = data.forecasts[0]

      expect(forecast.windSpeed).toBeTypeOf('number')
      expect(forecast.windDirection).toBeTypeOf('number')
      expect(forecast.precipitationProbability).toBeTypeOf('number')
      expect(forecast.temperature).toBeTypeOf('number')
      expect(forecast.timestamp).toBeTypeOf('string')
    })

    it('should default to 24 hours when no hours specified', async () => {
      const data = await fetchMeshTimeSeries('53393599')

      // 24 hours = 24 * 60 / 5 = 288 intervals
      expect(data.forecasts.length).toBe(288)
    })
  })

  describe('isMockData', () => {
    it('should return true for mock data', async () => {
      const data = await fetchMeshWeather('53393599')
      expect(isMockData(data)).toBe(true)
    })

    it('should detect mock data in time series', async () => {
      const data = await fetchMeshTimeSeries('53393599', 1)
      expect(isMockData(data)).toBe(true)
    })

    it('should return false for data without (見本) marker', () => {
      const data = {
        meshCode: '53393599',
        windSpeed: 3.5,
        windDirection: 180,
        precipitationProbability: 20,
        temperature: 22,
        timestamp: '2023-01-01T00:00:00.000Z'
      }
      expect(isMockData(data)).toBe(false)
    })
  })

  describe('formatWeatherData', () => {
    it('should format weather data correctly', async () => {
      const data = await fetchMeshWeather('53393599')
      const formatted = formatWeatherData(data)

      expect(formatted).toContain('風速')
      expect(formatted).toContain('m/s')
      expect(formatted).toContain('気温')
      expect(formatted).toContain('°C')
      expect(formatted).toContain('降水確率')
      expect(formatted).toContain('%')
    })

    it('should include mock marker for mock data', async () => {
      const data = await fetchMeshWeather('53393599')
      const formatted = formatWeatherData(data)

      expect(formatted).toContain('見本')
    })

    it('should format weather data without prefix for real data', () => {
      const data = {
        meshCode: '53393599',
        windSpeed: 3.5,
        windDirection: 180,
        precipitationProbability: 20,
        temperature: 22,
        timestamp: '2023-01-01T00:00:00.000Z'
      }
      const formatted = formatWeatherData(data)

      expect(formatted).not.toContain('(見本)')
      expect(formatted).toContain('風速: 3.5m/s')
      expect(formatted).toContain('気温: 22.0°C')
      expect(formatted).toContain('降水確率: 20%')
    })
  })

  describe('JmaMeshService', () => {
    it('should export all functions', () => {
      expect(JmaMeshService.fetchWeather).toBeDefined()
      expect(JmaMeshService.fetchTimeSeries).toBeDefined()
      expect(JmaMeshService.latLngToMeshCode).toBeDefined()
      expect(JmaMeshService.isMockData).toBeDefined()
      expect(JmaMeshService.formatWeatherData).toBeDefined()
    })
  })
})
