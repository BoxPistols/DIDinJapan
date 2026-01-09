/**
 * Pre-computed search indexes for all prefectures
 * Maps prefecture to list of cities/municipalities in that prefecture
 */

import { SearchIndexItem } from '../types'
import { LAYER_GROUPS } from './layers'

// Build mapping of layerId to prefecture information
const layerIdToPrefecture = new Map<string, { name: string; groupName: string }>()

LAYER_GROUPS.forEach(group => {
  group.layers.forEach(layer => {
    layerIdToPrefecture.set(layer.id, { name: layer.name, groupName: group.name })
  })
})

/**
 * Get prefecture info for a layer ID
 */
export function getPrefectureInfo(layerId: string) {
  return layerIdToPrefecture.get(layerId)
}

/**
 * Get all prefecture layer IDs
 */
export function getAllPrefectureLayerIds() {
  return Array.from(layerIdToPrefecture.keys())
}

/**
 * Get layer IDs for a specific prefecture name (kanji or partial match)
 */
export function findLayersByPrefecture(prefName: string): string[] {
  const matching: string[] = []
  layerIdToPrefecture.forEach((info, layerId) => {
    if (info.name.includes(prefName)) {
      matching.push(layerId)
    }
  })
  return matching
}
