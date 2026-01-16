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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const randomHex = (len: number): string => {
  const chars = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

const generateLayerId = (prefix: string): string => {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return `${prefix}-${c.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${randomHex(8)}`
}

const ensureUniqueId = (requested: string, used: Set<string>): string => {
  const base = requested.trim() ? requested.trim() : generateLayerId('custom')
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let i = 1
  while (used.has(`${base}-${i}`)) {
    i += 1
  }
  const next = `${base}-${i}`
  used.add(next)
  return next
}

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
    const parsed = JSON.parse(data) as unknown
    if (!Array.isArray(parsed)) return []

    const used = new Set<string>()
    let changed = false

    const layers: CustomLayer[] = parsed
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .map((raw): CustomLayer | null => {
        const idRaw = typeof raw.id === 'string' ? raw.id : ''
        const id = ensureUniqueId(idRaw || generateLayerId('custom'), used)
        if (id !== idRaw) changed = true

        const name = typeof raw.name === 'string' ? raw.name : 'Untitled'
        const typeRaw = raw.type
        const type: CustomLayer['type'] =
          typeRaw === 'custom' || typeRaw === 'restriction' || typeRaw === 'poi' ? typeRaw : 'custom'
        const category = typeof raw.category === 'string' ? raw.category : 'custom'
        const color = typeof raw.color === 'string' ? raw.color : '#888888'
        const opacity = typeof raw.opacity === 'number' ? raw.opacity : 0.5
        const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
        const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt
        const description = typeof raw.description === 'string' ? raw.description : undefined

        const dataValue = raw.data
        if (!isRecord(dataValue)) return null
        if (dataValue.type !== 'FeatureCollection') return null
        if (!Array.isArray(dataValue.features)) return null

        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: dataValue.features as GeoJSON.Feature[]
        }

        return {
          id,
          name,
          type,
          category,
          color,
          opacity,
          data: fc,
          createdAt,
          updatedAt,
          description
        }
      })
      .filter((layer): layer is CustomLayer => layer !== null)

    if (changed) {
      // 重複ID救済：読み込み時に自動修正して保存しておく
      saveCustomLayers(layers)
    }

    return layers
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
  const used = new Set(layers.map((l) => l.id))
  const id = ensureUniqueId(config.id || `custom-${now}`, used)

  const newLayer: CustomLayer = {
    id,
    name: config.name,
    type: 'custom',
    category: config.category,
    color: config.color,
    opacity: config.opacity,
    // 独立性担保：参照共有を避ける（GeoJSONなのでJSON経由でclone）
    data: JSON.parse(JSON.stringify(data)) as GeoJSON.FeatureCollection,
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
    const imported = JSON.parse(jsonString) as unknown

    if (!imported || typeof imported !== 'object') {
      return { success: false, count: 0, error: 'Invalid JSON: must be an object or array' }
    }

    if (Array.isArray(imported)) {
      // Import multiple layers
      const layers = getCustomLayers()
      const now = Date.now()
      let validCount = 0
      const used = new Set(layers.map((l) => l.id))

      imported.forEach((item, index) => {
        // Validate required properties
        if (!isRecord(item) || !item.data || typeof item.name !== 'string') {
          return
        }

        // Validate data is a FeatureCollection
        if (!isRecord(item.data)) {
          return
        }
        const dataType = item.data.type
        if (dataType !== 'FeatureCollection' && dataType !== 'Feature') {
          return
        }

        const requestedId =
          typeof item.id === 'string' ? item.id : `imported-${now}-${index}`
        const id = ensureUniqueId(requestedId, used)

        const newLayer: CustomLayer = {
          id,
          name: item.name,
          type: 'custom',
          category: typeof item.category === 'string' ? item.category : 'custom',
          color: typeof item.color === 'string' ? item.color : '#888888',
          opacity: typeof item.opacity === 'number' ? item.opacity : 0.5,
          data: JSON.parse(
            JSON.stringify(
              dataType === 'Feature'
                ? { type: 'FeatureCollection', features: [item.data] }
                : item.data
            )
          ) as GeoJSON.FeatureCollection,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
          updatedAt: now,
          description: typeof item.description === 'string' ? item.description : undefined
        }
        layers.push(newLayer)
        validCount++
      })

      saveCustomLayers(layers)
      return { success: validCount > 0, count: validCount }
    } else if (isRecord(imported) && imported.type === 'FeatureCollection') {
      // Validate FeatureCollection structure
      const features = imported.features
      if (!Array.isArray(features)) {
        return { success: false, count: 0, error: 'Invalid FeatureCollection: features must be an array' }
      }

      // Import single GeoJSON file
      const layers = getCustomLayers()
      const now = Date.now()
      const used = new Set(layers.map((l) => l.id))

      const metadata = isRecord(imported.metadata) ? imported.metadata : {}
      const requestedId = typeof metadata.id === 'string' ? metadata.id : `imported-${now}`
      const newLayer: CustomLayer = {
        id: ensureUniqueId(requestedId, used),
        name: typeof metadata.name === 'string' ? metadata.name : 'Imported Layer',
        type: 'custom',
        category: typeof metadata.category === 'string' ? metadata.category : 'custom',
        color: typeof metadata.color === 'string' ? metadata.color : '#888888',
        opacity: typeof metadata.opacity === 'number' ? metadata.opacity : 0.5,
        data: {
          type: 'FeatureCollection',
          features: JSON.parse(JSON.stringify(features)) as GeoJSON.Feature[]
        },
        createdAt: now,
        updatedAt: now,
        description: typeof metadata.description === 'string' ? metadata.description : undefined
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
