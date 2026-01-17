import { describe, it, expect } from 'vitest'
import {
  calculateDistance,
  createCirclePolygon,
  formatCoordinates,
  formatCoordinatesDMS
} from './geo'

describe('Geo Utilities', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between Tokyo and Osaka correctly', () => {
      // 東京駅 (35.681236, 139.767125)
      // 新大阪駅 (34.732490, 135.500616)
      // 直線距離は約 396km
      const dist = calculateDistance(35.681236, 139.767125, 34.73249, 135.500616)
      expect(dist).toBeGreaterThan(390)
      expect(dist).toBeLessThan(405)
    })

    it('should return 0 for same coordinates', () => {
      const dist = calculateDistance(35.0, 135.0, 35.0, 135.0)
      expect(dist).toBe(0)
    })
  })

  describe('createCirclePolygon', () => {
    it('should create a polygon with correct coordinates structure', () => {
      const center: [number, number] = [139.767, 35.681]
      const radiusKm = 5
      const polygon = createCirclePolygon(center, radiusKm)

      expect(polygon.type).toBe('Polygon')
      expect(polygon.coordinates).toHaveLength(1) // Outer ring
      // デフォルト32分割 + 閉じるための1点 = 33点
      expect(polygon.coordinates[0].length).toBeGreaterThan(30)

      // 最初の点と最後の点が同じか（閉じているか）
      const first = polygon.coordinates[0][0]
      const last = polygon.coordinates[0][polygon.coordinates[0].length - 1]
      expect(first).toEqual(last)
    })
  })

  describe('formatCoordinates', () => {
    it('should format coordinates to specified precision', () => {
      const formatted = formatCoordinates(139.12345678, 35.98765432)
      expect(formatted).toBe('35.987654°N, 139.123457°E')
    })
  })

  describe('formatCoordinatesDMS', () => {
    it('should format coordinates to DMS string', () => {
      // 北緯35度40分00秒, 東経139度45分00秒
      // 35 + 40/60 = 35.666666...
      // 139 + 45/60 = 139.75
      const formatted = formatCoordinatesDMS(139.75, 35.666666)
      // 実装に合わせてシングルクォート(')とダブルクォート(")を使用
      expect(formatted).toContain('35°40\'0.00"N')
      expect(formatted).toContain('139°45\'0.00"E')
    })
  })
})
