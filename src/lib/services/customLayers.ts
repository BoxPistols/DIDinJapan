/**
 * Custom Layers Service
 * ユーザーがカスタムでアップロード・管理できるレイヤーのサービス
 * ローカルストレージを使用してデータを永続化
 */

import { createCirclePolygon } from '../utils/geo'

// ============================================
// Types
// ============================================

export interface CustomLayer {
  id: string
  name: string
  type: 'restriction' | 'poi' | 'custom'
  category: string  // 'airport' | 'emergency' | 'manned' | 'remote_id' | 'lte' | 'wind' | 'custom'
  color: string
  opacity: number
  data: GeoJSON.FeatureCollection
  createdAt: number
  updatedAt: number
  description?: string
}

export interface CustomLayerConfig {
  id: string
  name: string
  category: string
  color: string
  opacity: number
  description?: string
}

const STORAGE_KEY = 'japan-drone-map-custom-layers'

// ============================================
// Local Storage Operations
// ============================================

/**
 * Get all custom layers from local storage
 */
export function getCustomLayers(): CustomLayer[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data)
  } catch (error) {
    console.error('Failed to load custom layers:', error)
    return []
  }
}

/**
 * Save custom layers to local storage
 */
export function saveCustomLayers(layers: CustomLayer[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layers))
    return true
  } catch (error) {
    console.error('Failed to save custom layers:', error)
    return false
  }
}

/**
 * Add a new custom layer
 */
export function addCustomLayer(
  config: CustomLayerConfig,
  data: GeoJSON.FeatureCollection
): CustomLayer {
  const layers = getCustomLayers()
  const now = Date.now()

  const newLayer: CustomLayer = {
    id: config.id || `custom-${now}`,
    name: config.name,
    type: 'custom',
    category: config.category,
    color: config.color,
    opacity: config.opacity,
    data,
    createdAt: now,
    updatedAt: now,
    description: config.description
  }

  layers.push(newLayer)
  saveCustomLayers(layers)
  return newLayer
}

/**
 * Update an existing custom layer
 */
export function updateCustomLayer(
  id: string,
  updates: Partial<Omit<CustomLayer, 'id' | 'createdAt'>>
): CustomLayer | null {
  const layers = getCustomLayers()
  const index = layers.findIndex(l => l.id === id)

  if (index === -1) return null

  layers[index] = {
    ...layers[index],
    ...updates,
    updatedAt: Date.now()
  }

  saveCustomLayers(layers)
  return layers[index]
}

/**
 * Remove a custom layer
 */
export function removeCustomLayer(id: string): boolean {
  const layers = getCustomLayers()
  const filtered = layers.filter(l => l.id !== id)

  if (filtered.length === layers.length) return false

  saveCustomLayers(filtered)
  return true
}

/**
 * Get custom layer by ID
 */
export function getCustomLayerById(id: string): CustomLayer | null {
  const layers = getCustomLayers()
  return layers.find(l => l.id === id) || null
}

/**
 * Get custom layers by category
 */
export function getCustomLayersByCategory(category: string): CustomLayer[] {
  const layers = getCustomLayers()
  return layers.filter(l => l.category === category)
}

// ============================================
// Import/Export Operations
// ============================================

/**
 * Export all custom layers as JSON
 */
export function exportCustomLayers(): string {
  const layers = getCustomLayers()
  return JSON.stringify(layers, null, 2)
}

/**
 * Export a single layer as GeoJSON
 */
export function exportLayerAsGeoJSON(id: string): string | null {
  const layer = getCustomLayerById(id)
  if (!layer) return null

  const exportData = {
    type: 'FeatureCollection' as const,
    metadata: {
      name: layer.name,
      category: layer.category,
      color: layer.color,
      opacity: layer.opacity,
      description: layer.description,
      exportedAt: new Date().toISOString()
    },
    features: layer.data.features
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Import custom layers from JSON
 */
export function importCustomLayers(jsonString: string): { success: boolean; count: number; error?: string } {
  try {
    const imported = JSON.parse(jsonString)

    if (!imported || typeof imported !== 'object') {
      return { success: false, count: 0, error: 'Invalid JSON: must be an object or array' }
    }

    if (Array.isArray(imported)) {
      // Import multiple layers
      const layers = getCustomLayers()
      const now = Date.now()
      let validCount = 0

      imported.forEach((item, index) => {
        // Validate required properties
        if (!item || typeof item !== 'object' || !item.data || !item.name) {
          return
        }

        // Validate data is a FeatureCollection
        if (
          !item.data.type ||
          (item.data.type !== 'FeatureCollection' && item.data.type !== 'Feature')
        ) {
          return
        }

        const newLayer: CustomLayer = {
          id: item.id || `imported-${now}-${index}`,
          name: item.name,
          type: 'custom',
          category: item.category || 'custom',
          color: item.color || '#888888',
          opacity: item.opacity ?? 0.5,
          data:
            item.data.type === 'Feature'
              ? { type: 'FeatureCollection', features: [item.data] }
              : item.data,
          createdAt: item.createdAt || now,
          updatedAt: now,
          description: item.description
        }
        layers.push(newLayer)
        validCount++
      })

      saveCustomLayers(layers)
      return { success: validCount > 0, count: validCount }
    } else if (imported.type === 'FeatureCollection') {
      // Validate FeatureCollection structure
      if (!Array.isArray(imported.features)) {
        return { success: false, count: 0, error: 'Invalid FeatureCollection: features must be an array' }
      }

      // Import single GeoJSON file
      const layers = getCustomLayers()
      const now = Date.now()

      const metadata = imported.metadata || {}
      const newLayer: CustomLayer = {
        id: metadata.id || `imported-${now}`,
        name: metadata.name || 'Imported Layer',
        type: 'custom',
        category: metadata.category || 'custom',
        color: metadata.color || '#888888',
        opacity: metadata.opacity ?? 0.5,
        data: {
          type: 'FeatureCollection',
          features: imported.features
        },
        createdAt: now,
        updatedAt: now,
        description: metadata.description
      }

      layers.push(newLayer)
      saveCustomLayers(layers)
      return { success: true, count: 1 }
    }

    return { success: false, count: 0, error: 'Invalid format: must be FeatureCollection or array of layers' }
  } catch (error) {
    return { success: false, count: 0, error: String(error) }
  }
}

/**
 * Import GeoJSON file with configuration
 */
export function importGeoJSONWithConfig(
  geojson: GeoJSON.FeatureCollection,
  config: CustomLayerConfig
): CustomLayer {
  return addCustomLayer(config, geojson)
}

// ============================================
// File Handling Utilities
// ============================================

/**
 * Read GeoJSON from File object
 */
export async function readGeoJSONFile(file: File): Promise<GeoJSON.FeatureCollection> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const json = JSON.parse(content)

        // Validate GeoJSON structure
        if (!json || typeof json !== 'object') {
          reject(new Error('Invalid GeoJSON: must be an object'))
          return
        }

        if (json.type === 'FeatureCollection') {
          // Validate FeatureCollection
          if (!Array.isArray(json.features)) {
            reject(new Error('Invalid FeatureCollection: features must be an array'))
            return
          }
          // Validate each feature
          for (const feature of json.features) {
            if (!feature.geometry || !feature.geometry.type) {
              reject(new Error('Invalid Feature: missing geometry or geometry.type'))
              return
            }
          }
          resolve(json)
        } else if (json.type === 'Feature') {
          // Validate Feature
          if (!json.geometry || !json.geometry.type) {
            reject(new Error('Invalid Feature: missing geometry or geometry.type'))
            return
          }
          resolve({
            type: 'FeatureCollection',
            features: [json]
          })
        } else {
          reject(new Error('Invalid GeoJSON format: must be FeatureCollection or Feature'))
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Unknown error parsing GeoJSON'))
      }
    }

    reader.onerror = () => {
      reader.abort()
      reject(new Error('Failed to read file'))
    }

    reader.onabort = () => {
      reject(new Error('File read was aborted'))
    }

    reader.readAsText(file)
  })
}

/**
 * Download data as file
 */
export function downloadAsFile(content: string, filename: string, mimeType: string = 'application/json') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke the URL after a delay to ensure download completes
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 100)
}

// ============================================
// Preset Templates
// ============================================

/**
 * Create an empty restriction zone template
 */
export function createRestrictionZoneTemplate(
  name: string,
  coordinates: [number, number],
  radiusKm: number
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        name,
        type: 'custom_restriction',
        radiusKm
      },
      geometry: createCirclePolygon(coordinates, radiusKm)
    }]
  }
}

/**
 * Create a point-based layer template
 */
export function createPointLayerTemplate(
  points: Array<{ name: string; coordinates: [number, number]; properties?: Record<string, unknown> }>
): GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> {
  return {
    type: 'FeatureCollection',
    features: points.map((p, i) => ({
      type: 'Feature',
      properties: {
        id: `point-${i}`,
        name: p.name,
        ...p.properties
      },
      geometry: {
        type: 'Point',
        coordinates: p.coordinates
      }
    }))
  }
}

// ============================================
// Export Service
// ============================================

export const CustomLayerService = {
  // CRUD
  getAll: getCustomLayers,
  getById: getCustomLayerById,
  getByCategory: getCustomLayersByCategory,
  add: addCustomLayer,
  update: updateCustomLayer,
  remove: removeCustomLayer,
  save: saveCustomLayers,

  // Import/Export
  exportAll: exportCustomLayers,
  exportAsGeoJSON: exportLayerAsGeoJSON,
  import: importCustomLayers,
  importGeoJSON: importGeoJSONWithConfig,

  // File utilities
  readFile: readGeoJSONFile,
  download: downloadAsFile,

  // Templates
  createRestrictionZone: createRestrictionZoneTemplate,
  createPointLayer: createPointLayerTemplate
}
