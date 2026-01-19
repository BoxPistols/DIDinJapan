import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import type { Feature, Polygon } from 'geojson'
import {
  checkWaypointCollision,
  checkPathCollision,
  checkPolygonCollision,
  createSpatialIndex,
  checkWaypointCollisionOptimized
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
