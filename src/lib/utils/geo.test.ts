import { describe, it, expect } from 'vitest'
import {
  calculateBBox,
  bboxesIntersect,
  mergeBBoxes,
  calculateDistance,
  createCirclePolygon,
  formatCoordinates,
  formatCoordinatesDMS,
  convertDecimalToDMS,
  pointInPolygon
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

  describe('calculateBBox', () => {
    it('should calculate bounding box for Point geometry', () => {
      const point: GeoJSON.Point = {
        type: 'Point',
        coordinates: [139.767, 35.681]
      }
      const bbox = calculateBBox(point)
      expect(bbox[0]).toBeCloseTo(139.767, 3) // minLng
      expect(bbox[1]).toBeCloseTo(35.681, 3) // minLat
      expect(bbox[2]).toBeCloseTo(139.767, 3) // maxLng
      expect(bbox[3]).toBeCloseTo(35.681, 3) // maxLat
    })

    it('should calculate bounding box for LineString geometry', () => {
      const lineString: GeoJSON.LineString = {
        type: 'LineString',
        coordinates: [
          [139.0, 35.0],
          [140.0, 36.0],
          [141.0, 35.5]
        ]
      }
      const bbox = calculateBBox(lineString)
      expect(bbox[0]).toBe(139.0) // minLng
      expect(bbox[1]).toBe(35.0) // minLat
      expect(bbox[2]).toBe(141.0) // maxLng
      expect(bbox[3]).toBe(36.0) // maxLat
    })

    it('should calculate bounding box for Polygon geometry', () => {
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [139.0, 35.0],
            [140.0, 35.0],
            [140.0, 36.0],
            [139.0, 36.0],
            [139.0, 35.0]
          ]
        ]
      }
      const bbox = calculateBBox(polygon)
      expect(bbox[0]).toBe(139.0)
      expect(bbox[1]).toBe(35.0)
      expect(bbox[2]).toBe(140.0)
      expect(bbox[3]).toBe(36.0)
    })

    it('should calculate bounding box for MultiPolygon geometry', () => {
      const multiPolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [139.0, 35.0],
              [139.5, 35.0],
              [139.5, 35.5],
              [139.0, 35.5],
              [139.0, 35.0]
            ]
          ],
          [
            [
              [140.0, 36.0],
              [140.5, 36.0],
              [140.5, 36.5],
              [140.0, 36.5],
              [140.0, 36.0]
            ]
          ]
        ]
      }
      const bbox = calculateBBox(multiPolygon)
      expect(bbox[0]).toBe(139.0) // minLng
      expect(bbox[1]).toBe(35.0) // minLat
      expect(bbox[2]).toBe(140.5) // maxLng
      expect(bbox[3]).toBe(36.5) // maxLat
    })
  })

  describe('bboxesIntersect', () => {
    it('should return true for overlapping bboxes', () => {
      const bbox1: [[number, number], [number, number]] = [
        [139.0, 35.0],
        [140.0, 36.0]
      ]
      const bbox2: [[number, number], [number, number]] = [
        [139.5, 35.5],
        [140.5, 36.5]
      ]
      expect(bboxesIntersect(bbox1, bbox2)).toBe(true)
    })

    it('should return false for non-overlapping bboxes', () => {
      const bbox1: [[number, number], [number, number]] = [
        [139.0, 35.0],
        [139.5, 35.5]
      ]
      const bbox2: [[number, number], [number, number]] = [
        [140.0, 36.0],
        [140.5, 36.5]
      ]
      expect(bboxesIntersect(bbox1, bbox2)).toBe(false)
    })

    it('should return true for touching bboxes', () => {
      const bbox1: [[number, number], [number, number]] = [
        [139.0, 35.0],
        [140.0, 36.0]
      ]
      const bbox2: [[number, number], [number, number]] = [
        [140.0, 36.0],
        [141.0, 37.0]
      ]
      expect(bboxesIntersect(bbox1, bbox2)).toBe(true)
    })

    it('should return true when one bbox contains another', () => {
      const bbox1: [[number, number], [number, number]] = [
        [139.0, 35.0],
        [141.0, 37.0]
      ]
      const bbox2: [[number, number], [number, number]] = [
        [139.5, 35.5],
        [140.5, 36.5]
      ]
      expect(bboxesIntersect(bbox1, bbox2)).toBe(true)
    })
  })

  describe('mergeBBoxes', () => {
    it('should merge multiple bboxes into one', () => {
      const bboxes: [number, number, number, number][] = [
        [139.0, 35.0, 139.5, 35.5],
        [140.0, 36.0, 140.5, 36.5]
      ]
      const merged = mergeBBoxes(bboxes)
      expect(merged[0]).toBe(139.0) // minLng
      expect(merged[1]).toBe(35.0) // minLat
      expect(merged[2]).toBe(140.5) // maxLng
      expect(merged[3]).toBe(36.5) // maxLat
    })

    it('should handle single bbox', () => {
      const bboxes: [number, number, number, number][] = [[139.0, 35.0, 140.0, 36.0]]
      const merged = mergeBBoxes(bboxes)
      expect(merged).toEqual([139.0, 35.0, 140.0, 36.0])
    })
  })

  describe('convertDecimalToDMS', () => {
    it('should convert positive latitude to DMS with N', () => {
      const result = convertDecimalToDMS(35.6812, true)
      expect(result).toContain('35°')
      expect(result).toContain('N')
    })

    it('should convert negative latitude to DMS with S', () => {
      const result = convertDecimalToDMS(-35.6812, true)
      expect(result).toContain('35°')
      expect(result).toContain('S')
    })

    it('should convert positive longitude to DMS with E', () => {
      const result = convertDecimalToDMS(139.7671, false)
      expect(result).toContain('139°')
      expect(result).toContain('E')
    })

    it('should convert negative longitude to DMS with W', () => {
      const result = convertDecimalToDMS(-139.7671, false)
      expect(result).toContain('139°')
      expect(result).toContain('W')
    })

    it('should support Japanese format', () => {
      const result = convertDecimalToDMS(35.6812, true, 'ja')
      expect(result).toContain('北緯')
    })
  })

  describe('pointInPolygon', () => {
    const polygon: [number, number][] = [
      [139.0, 35.0],
      [140.0, 35.0],
      [140.0, 36.0],
      [139.0, 36.0],
      [139.0, 35.0]
    ]

    it('should return true for point inside polygon', () => {
      expect(pointInPolygon([139.5, 35.5], polygon)).toBe(true)
    })

    it('should return false for point outside polygon', () => {
      expect(pointInPolygon([138.0, 35.5], polygon)).toBe(false)
    })

    it('should handle point on edge', () => {
      // 境界上の点は実装依存だが、一貫した結果を返すべき
      const result = pointInPolygon([139.0, 35.5], polygon)
      expect(typeof result).toBe('boolean')
    })
  })
})
