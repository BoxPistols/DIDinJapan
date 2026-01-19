import * as turf from '@turf/turf'
import RBush from 'rbush'

export type CollisionType = 'DID' | 'AIRPORT' | 'MILITARY' | 'PARK' | string

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
  intersectionPoints: turf.Position[]
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
  feature: turf.Feature<turf.Polygon | turf.MultiPolygon>
}

export const createSpatialIndex = (prohibitedAreas: turf.FeatureCollection): RBush<RBushItem> => {
  const tree = new RBush<RBushItem>()
  const items = prohibitedAreas.features
    .filter((feature): feature is turf.Feature<turf.Polygon | turf.MultiPolygon> =>
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
  prohibitedAreas: turf.FeatureCollection
): WaypointCollisionResult => {
  const point = turf.point(waypointCoords)

  for (const feature of prohibitedAreas.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const isInside = turf.booleanPointInPolygon(point, feature)

      if (isInside) {
        return {
          isColliding: true,
          collisionType: (feature.properties?.type as CollisionType | undefined) ?? 'DID',
          areaName: (feature.properties?.name as string | undefined) ?? '不明なエリア',
          severity: 'DANGER',
          uiColor: '#FF0000',
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
      return {
        isColliding: true,
        collisionType: (candidate.feature.properties?.type as CollisionType | undefined) ?? 'DID',
        areaName: (candidate.feature.properties?.name as string | undefined) ?? '不明',
        severity: 'DANGER',
        uiColor: '#FF0000',
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
  pathCoords: turf.Position[],
  prohibitedAreas: turf.FeatureCollection
): PathCollisionResult => {
  const line = turf.lineString(pathCoords)
  const intersectionPoints: turf.Position[] = []

  for (const feature of prohibitedAreas.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const intersections = turf.lineIntersect(line, feature)

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
  polygonCoords: turf.Position[][][],
  prohibitedAreas: turf.FeatureCollection
): PolygonCollisionResult => {
  const polygon = turf.polygon(polygonCoords)

  let overlapArea = 0
  const polygonArea = turf.area(polygon)

  let intersects = false
  for (const feature of prohibitedAreas.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      try {
        const overlap = turf.intersect(
          polygon,
          feature as turf.Feature<turf.Polygon | turf.MultiPolygon>
        )
        if (overlap) {
          overlapArea += turf.area(overlap)
          intersects = true
          continue
        }

        // Fallback: if polygons overlap but intersect returns null (common with some edge cases),
        // treat as overlapping and approximate with small area.
        const overlaps = turf.booleanIntersects(polygon, feature)
        if (overlaps) {
          intersects = true
          const candidateArea = Math.min(polygonArea, turf.area(feature))
          overlapArea += candidateArea
          continue
        }

        const centroid = turf.centroid(polygon)
        if (turf.booleanPointInPolygon(centroid, feature)) {
          intersects = true
          overlapArea += Math.min(polygonArea, turf.area(feature))
          continue
        }

        if (
          turf.booleanWithin(polygon, feature) ||
          turf.booleanContains(feature as turf.Feature<turf.Polygon | turf.MultiPolygon>, polygon)
        ) {
          intersects = true
          overlapArea += Math.min(polygonArea, turf.area(feature))
        }
      } catch {
        // skip invalid geometries
      }
    }
  }

  if (!intersects) {
    intersects = prohibitedAreas.features.some((feature) =>
      feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
        ? turf.booleanIntersects(polygon, feature as turf.Feature<turf.Polygon | turf.MultiPolygon>)
        : false
    )
  }

  if (intersects && overlapArea === 0) {
    overlapArea = polygonArea
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
