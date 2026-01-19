import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import type { Feature, Polygon } from 'geojson'
import {
  checkWaypointCollision,
  checkPathCollision,
  checkPolygonCollision,
  createSpatialIndex,
  checkWaypointCollisionOptimized,
  ZONE_COLORS,
  ZONE_SEVERITY
} from './collision'

const square: Feature<Polygon> = turf.polygon([
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0]
  ]
])

const prohibited = turf.featureCollection([
  {
    ...square,
    properties: { name: 'Square', type: 'DID' }
  }
])

// ゾーンタイプ別のテスト用フィーチャー
const createZoneFeature = (zoneType: string, name: string, offsetX: number) => ({
  ...turf.polygon([
    [
      [offsetX, 0],
      [offsetX + 1, 0],
      [offsetX + 1, 1],
      [offsetX, 1],
      [offsetX, 0]
    ]
  ]),
  properties: { name, zoneType }
})

const multiZoneProhibited = turf.featureCollection([
  createZoneFeature('DID', '人口集中地区', 0),
  createZoneFeature('AIRPORT', '空港周辺', 2),
  createZoneFeature('RED_ZONE', 'レッドゾーン', 4),
  createZoneFeature('YELLOW_ZONE', 'イエローゾーン', 6)
])

describe('collision utils', () => {
  it('detects waypoint inside polygon', () => {
    const result = checkWaypointCollision([0.5, 0.5], prohibited)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('DID')
  })

  it('detects waypoint outside polygon', () => {
    const result = checkWaypointCollision([2, 2], prohibited)
    expect(result.isColliding).toBe(false)
  })

  it('detects path intersection', () => {
    const result = checkPathCollision(
      [
        [-1, 0.5],
        [2, 0.5]
      ],
      prohibited
    )
    expect(result.isColliding).toBe(true)
    expect(result.intersectionPoints.length).toBeGreaterThan(0)
  })

  it('detects polygon overlap ratio', () => {
    const polygon = turf.polygon([
      [
        [0.2, 0.2],
        [0.8, 0.2],
        [0.8, 0.8],
        [0.2, 0.8],
        [0.2, 0.2]
      ]
    ])

    const result = checkPolygonCollision(polygon.geometry.coordinates, prohibited)
    expect(result.isColliding).toBe(true)
    expect(result.overlapRatio).toBeGreaterThan(0)
  })

  it('uses spatial index for waypoint', () => {
    const index = createSpatialIndex(prohibited)
    const result = checkWaypointCollisionOptimized([0.5, 0.5], index)
    expect(result.isColliding).toBe(true)
  })
})

describe('ゾーンタイプ別衝突検出', () => {
  it('DIDエリアの衝突を検出し、正しい色を返す', () => {
    const result = checkWaypointCollision([0.5, 0.5], multiZoneProhibited)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('DID')
    expect(result.uiColor).toBe(ZONE_COLORS.DID)
    expect(result.severity).toBe(ZONE_SEVERITY.DID)
  })

  it('空港エリアの衝突を検出し、紫色を返す', () => {
    const result = checkWaypointCollision([2.5, 0.5], multiZoneProhibited)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('AIRPORT')
    expect(result.uiColor).toBe(ZONE_COLORS.AIRPORT)
    expect(result.uiColor).toBe('#9C27B0') // 紫
    expect(result.severity).toBe('DANGER')
  })

  it('レッドゾーンの衝突を検出し、暗い赤色を返す', () => {
    const result = checkWaypointCollision([4.5, 0.5], multiZoneProhibited)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('RED_ZONE')
    expect(result.uiColor).toBe(ZONE_COLORS.RED_ZONE)
    expect(result.uiColor).toBe('#b71c1c') // 暗い赤
    expect(result.severity).toBe('DANGER')
  })

  it('イエローゾーンの衝突を検出し、黄色を返す', () => {
    const result = checkWaypointCollision([6.5, 0.5], multiZoneProhibited)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('YELLOW_ZONE')
    expect(result.uiColor).toBe(ZONE_COLORS.YELLOW_ZONE)
    expect(result.uiColor).toBe('#ffc107') // 黄色
    expect(result.severity).toBe('WARNING')
  })

  it('禁止エリア外は安全と判定', () => {
    const result = checkWaypointCollision([10, 10], multiZoneProhibited)
    expect(result.isColliding).toBe(false)
    expect(result.collisionType).toBeNull()
    expect(result.severity).toBe('SAFE')
  })
})

describe('空間インデックスを使用したゾーンタイプ別衝突検出', () => {
  it('空間インデックスで空港エリアの衝突を検出', () => {
    const index = createSpatialIndex(multiZoneProhibited)
    const result = checkWaypointCollisionOptimized([2.5, 0.5], index)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('AIRPORT')
    expect(result.uiColor).toBe('#9C27B0')
  })

  it('空間インデックスでレッドゾーンの衝突を検出', () => {
    const index = createSpatialIndex(multiZoneProhibited)
    const result = checkWaypointCollisionOptimized([4.5, 0.5], index)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('RED_ZONE')
    expect(result.uiColor).toBe('#b71c1c')
  })

  it('空間インデックスでイエローゾーンの衝突を検出', () => {
    const index = createSpatialIndex(multiZoneProhibited)
    const result = checkWaypointCollisionOptimized([6.5, 0.5], index)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('YELLOW_ZONE')
    expect(result.uiColor).toBe('#ffc107')
  })
})

describe('ZONE_COLORS定数', () => {
  it('全てのゾーンタイプに色が定義されている', () => {
    expect(ZONE_COLORS.DID).toBeDefined()
    expect(ZONE_COLORS.AIRPORT).toBeDefined()
    expect(ZONE_COLORS.RED_ZONE).toBeDefined()
    expect(ZONE_COLORS.YELLOW_ZONE).toBeDefined()
    expect(ZONE_COLORS.DEFAULT).toBeDefined()
  })

  it('DIDとRED_ZONEは異なる色を持つ', () => {
    expect(ZONE_COLORS.DID).not.toBe(ZONE_COLORS.RED_ZONE)
  })
})
