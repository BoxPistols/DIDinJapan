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

describe('エッジケース: checkPolygonCollision', () => {
  it('座標が不十分な場合はSAFEを返す', () => {
    const result = checkPolygonCollision([[]], prohibited)
    expect(result.isColliding).toBe(false)
    expect(result.message).toBe('座標が不十分です')
  })

  it('3点未満のポリゴンはSAFEを返す', () => {
    const result = checkPolygonCollision([[[0, 0], [1, 1]]], prohibited)
    expect(result.isColliding).toBe(false)
    expect(result.message).toBe('座標が不十分です')
  })

  it('空の配列はSAFEを返す', () => {
    const result = checkPolygonCollision([], prohibited)
    expect(result.isColliding).toBe(false)
  })

  it('禁止エリアと重複しないポリゴンはSAFE', () => {
    const outsidePolygon = [
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
        [10, 10]
      ]
    ]
    const result = checkPolygonCollision(outsidePolygon, prohibited)
    expect(result.isColliding).toBe(false)
    expect(result.overlapArea).toBe(0)
    expect(result.overlapRatio).toBe(0)
  })

  it('重複割合が20%超えるとDANGERを返す', () => {
    // 禁止エリアの80%を覆うポリゴン
    const largeOverlapPolygon = [
      [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.9],
        [0.1, 0.9],
        [0.1, 0.1]
      ]
    ]
    const result = checkPolygonCollision(largeOverlapPolygon, prohibited)
    expect(result.isColliding).toBe(true)
    expect(result.overlapRatio).toBeGreaterThan(0.2)
    expect(result.severity).toBe('DANGER')
  })
})

describe('エッジケース: checkPathCollision', () => {
  it('禁止エリアと交差しない経路はSAFE', () => {
    const result = checkPathCollision(
      [
        [10, 10],
        [11, 11]
      ],
      prohibited
    )
    expect(result.isColliding).toBe(false)
    expect(result.intersectionPoints.length).toBe(0)
    expect(result.severity).toBe('SAFE')
  })

  it('経路が禁止エリアを完全に通過する場合は2つの交差点を検出', () => {
    const result = checkPathCollision(
      [
        [-1, 0.5],
        [2, 0.5]
      ],
      prohibited
    )
    expect(result.isColliding).toBe(true)
    expect(result.intersectionPoints.length).toBe(2) // 入る点と出る点
  })

  it('経路が禁止エリアの角をかする場合は1つの交差点を検出', () => {
    const result = checkPathCollision(
      [
        [-1, 0],
        [2, 0]
      ],
      prohibited
    )
    expect(result.isColliding).toBe(true)
    expect(result.intersectionPoints.length).toBeGreaterThanOrEqual(1)
  })
})

describe('エッジケース: checkWaypointCollision', () => {
  it('禁止エリアが空の場合はSAFE', () => {
    const emptyProhibited = turf.featureCollection([])
    const result = checkWaypointCollision([0.5, 0.5], emptyProhibited)
    expect(result.isColliding).toBe(false)
    expect(result.severity).toBe('SAFE')
  })

  it('zoneTypeプロパティがない場合はDIDとして扱う', () => {
    const noZoneType = turf.featureCollection([
      {
        ...square,
        properties: { name: 'NoType' }
      }
    ])
    const result = checkWaypointCollision([0.5, 0.5], noZoneType)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('DID') // デフォルト
  })

  it('typeプロパティがzoneTypeの代わりに使用される', () => {
    const withType = turf.featureCollection([
      {
        ...square,
        properties: { name: 'WithType', type: 'AIRPORT' }
      }
    ])
    const result = checkWaypointCollision([0.5, 0.5], withType)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('AIRPORT')
  })

  it('未知のゾーンタイプはデフォルト色を使用', () => {
    const unknownZone = turf.featureCollection([
      {
        ...square,
        properties: { name: 'Unknown', zoneType: 'CUSTOM_ZONE' }
      }
    ])
    const result = checkWaypointCollision([0.5, 0.5], unknownZone)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('CUSTOM_ZONE')
    expect(result.uiColor).toBe(ZONE_COLORS.DEFAULT)
  })
})

describe('再現性テスト: 実際の座標を使用', () => {
  // 東京駅周辺のDIDエリア（簡略化）
  const tokyoStationArea = turf.featureCollection([
    {
      ...turf.polygon([
        [
          [139.76, 35.67],
          [139.78, 35.67],
          [139.78, 35.69],
          [139.76, 35.69],
          [139.76, 35.67]
        ]
      ]),
      properties: { name: '東京駅周辺DID', zoneType: 'DID' }
    }
  ])

  it('東京駅付近のWaypointはDID内と判定', () => {
    // 東京駅の座標（概算）
    const tokyoStation: [number, number] = [139.7671, 35.6812]
    const result = checkWaypointCollision(tokyoStation, tokyoStationArea)
    expect(result.isColliding).toBe(true)
    expect(result.collisionType).toBe('DID')
    expect(result.areaName).toBe('東京駅周辺DID')
  })

  it('皇居付近のWaypointはDID外と判定', () => {
    // 皇居の座標（概算）- テストエリア外
    const imperialPalace: [number, number] = [139.7528, 35.6852]
    const result = checkWaypointCollision(imperialPalace, tokyoStationArea)
    expect(result.isColliding).toBe(false)
    expect(result.severity).toBe('SAFE')
  })

  it('飛行経路がDIDを横断する場合を検出', () => {
    const flightPath = [
      [139.75, 35.68], // DID外
      [139.77, 35.68], // DID内を通過
      [139.79, 35.68] // DID外
    ]
    const result = checkPathCollision(flightPath, tokyoStationArea)
    expect(result.isColliding).toBe(true)
    expect(result.intersectionPoints.length).toBeGreaterThanOrEqual(2)
  })
})
