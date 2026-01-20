import * as turf from '@turf/turf'
import RBush from 'rbush'
import type { Feature, Polygon, MultiPolygon, FeatureCollection, Position } from 'geojson'

export type CollisionType = 'DID' | 'AIRPORT' | 'RED_ZONE' | 'YELLOW_ZONE' | 'MILITARY' | 'PARK' | string

// ゾーンタイプに基づく色定義
export const ZONE_COLORS: Record<string, string> = {
  DID: '#f44336', // 赤
  AIRPORT: '#9C27B0', // 紫
  RED_ZONE: '#b71c1c', // 暗い赤（DIDと区別するため）
  YELLOW_ZONE: '#ffc107', // 黄色
  DEFAULT: '#f44336' // デフォルト赤
}

// ゾーンタイプに基づく深刻度
export const ZONE_SEVERITY: Record<string, 'DANGER' | 'WARNING'> = {
  DID: 'WARNING',
  AIRPORT: 'DANGER',
  RED_ZONE: 'DANGER',
  YELLOW_ZONE: 'WARNING'
}

export interface WaypointCollisionResult {
  isColliding: boolean
  collisionType: CollisionType | null
  areaName?: string
  severity: 'DANGER' | 'WARNING' | 'SAFE'
  uiColor: string
  message: string
}

export interface PathCollisionResult {
  isColliding: boolean
  intersectionPoints: Position[]
  severity: 'DANGER' | 'WARNING' | 'SAFE'
  message: string
}

export interface PolygonCollisionResult {
  isColliding: boolean
  overlapArea: number
  overlapRatio: number
  severity: 'DANGER' | 'WARNING' | 'SAFE'
  message: string
}

type RBushItem = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  feature: Feature<Polygon | MultiPolygon>
}

export const createSpatialIndex = (prohibitedAreas: FeatureCollection): RBush<RBushItem> => {
  const tree = new RBush<RBushItem>()
  const items = prohibitedAreas.features
    .filter((feature): feature is Feature<Polygon | MultiPolygon> =>
      ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type ?? '')
    )
    .map((feature) => {
      const bbox = turf.bbox(feature)
      return {
        minX: bbox[0],
        minY: bbox[1],
        maxX: bbox[2],
        maxY: bbox[3],
        feature
      }
    })

  tree.load(items)
  return tree
}

export const checkWaypointCollision = (
  waypointCoords: [number, number],
  prohibitedAreas: FeatureCollection
): WaypointCollisionResult => {
  const point = turf.point(waypointCoords)

  for (const feature of prohibitedAreas.features) {
    if (!feature.geometry) continue
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const isInside = turf.booleanPointInPolygon(point, feature as Feature<Polygon | MultiPolygon>)

      if (isInside) {
        const zoneType = (feature.properties?.zoneType as CollisionType | undefined) ??
          (feature.properties?.type as CollisionType | undefined) ?? 'DID'
        const uiColor = ZONE_COLORS[zoneType] ?? ZONE_COLORS.DEFAULT
        const severity = ZONE_SEVERITY[zoneType] ?? 'DANGER'

        return {
          isColliding: true,
          collisionType: zoneType,
          areaName: (feature.properties?.name as string | undefined) ?? '不明なエリア',
          severity,
          uiColor,
          message: `このWaypointは${feature.properties?.name ?? '禁止エリア'}内にあります`
        }
      }
    }
  }

  return {
    isColliding: false,
    collisionType: null,
    severity: 'SAFE',
    uiColor: '#00FF00',
    message: '飛行可能エリアです'
  }
}

export const checkWaypointCollisionOptimized = (
  waypointCoords: [number, number],
  spatialIndex: RBush<RBushItem>
): WaypointCollisionResult => {
  const [lon, lat] = waypointCoords
  const point = turf.point(waypointCoords)

  const candidates = spatialIndex.search({ minX: lon, minY: lat, maxX: lon, maxY: lat })

  for (const candidate of candidates) {
    const isInside = turf.booleanPointInPolygon(point, candidate.feature)
    if (isInside) {
      const zoneType = (candidate.feature.properties?.zoneType as CollisionType | undefined) ??
        (candidate.feature.properties?.type as CollisionType | undefined) ?? 'DID'
      const uiColor = ZONE_COLORS[zoneType] ?? ZONE_COLORS.DEFAULT
      const severity = ZONE_SEVERITY[zoneType] ?? 'DANGER'

      return {
        isColliding: true,
        collisionType: zoneType,
        areaName: (candidate.feature.properties?.name as string | undefined) ?? '不明',
        severity,
        uiColor,
        message: '禁止エリア内です'
      }
    }
  }

  return {
    isColliding: false,
    collisionType: null,
    severity: 'SAFE',
    uiColor: '#00FF00',
    message: '飛行可能'
  }
}

export const checkPathCollision = (
  pathCoords: Position[],
  prohibitedAreas: FeatureCollection
): PathCollisionResult => {
  const line = turf.lineString(pathCoords)
  const intersectionPoints: Position[] = []

  for (const feature of prohibitedAreas.features) {
    if (!feature.geometry) continue
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const intersections = turf.lineIntersect(line, feature as Feature<Polygon | MultiPolygon>)

      if (intersections.features.length > 0) {
        intersections.features.forEach((point) => {
          intersectionPoints.push(point.geometry.coordinates)
        })
      }
    }
  }

  if (intersectionPoints.length > 0) {
    return {
      isColliding: true,
      intersectionPoints,
      severity: 'DANGER',
      message: `飛行経路が禁止エリアを${intersectionPoints.length}箇所で通過`
    }
  }

  return {
    isColliding: false,
    intersectionPoints: [],
    severity: 'SAFE',
    message: '飛行経路は禁止エリアを通過していません'
  }
}

export const checkPolygonCollision = (
  polygonCoords: Position[][],
  prohibitedAreas: FeatureCollection
): PolygonCollisionResult => {
  // 座標の検証: ポリゴンには最低4点必要（最初と最後が同じ点で閉じる）
  if (
    !polygonCoords ||
    !Array.isArray(polygonCoords) ||
    polygonCoords.length === 0 ||
    !polygonCoords[0] ||
    polygonCoords[0].length < 4
  ) {
    return {
      isColliding: false,
      overlapArea: 0,
      overlapRatio: 0,
      severity: 'SAFE',
      message: '座標が不十分です'
    }
  }

  let polygon
  try {
    polygon = turf.polygon(polygonCoords)
  } catch {
    return {
      isColliding: false,
      overlapArea: 0,
      overlapRatio: 0,
      severity: 'SAFE',
      message: '無効なポリゴン形状'
    }
  }

  let overlapArea = 0
  const polygonArea = turf.area(polygon)

  let intersects = false
  for (const feature of prohibitedAreas.features) {
    if (!feature.geometry) continue
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      try {
        const polyFeature = feature as Feature<Polygon | MultiPolygon>
        if (turf.booleanIntersects(polygon, polyFeature)) {
          intersects = true
          const intersection = turf.intersect(
            turf.featureCollection([polygon, polyFeature])
          )
          const areaEstimate =
            intersection
              ? turf.area(intersection)
              : Math.min(polygonArea, turf.area(polyFeature)) * 0.01
          overlapArea += areaEstimate
        }
      } catch {
        // skip invalid geometries
      }
    }
  }

  const overlapRatio = polygonArea === 0 ? 0 : overlapArea / polygonArea

  if (intersects) {
    return {
      isColliding: true,
      overlapArea,
      overlapRatio,
      severity: overlapRatio > 0.2 ? 'DANGER' : 'WARNING',
      message: `ポリゴンが禁止エリアと${Math.round(overlapRatio * 100)}%重複しています`
    }
  }

  return {
    isColliding: false,
    overlapArea: 0,
    overlapRatio: 0,
    severity: 'SAFE',
    message: '禁止エリアとの重複はありません'
  }
}
