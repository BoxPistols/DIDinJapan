/**
 * WeatherMapOverlay Component
 * Renders weather data as a heatmap overlay on the map
 */

import React, { useEffect, useRef, useCallback } from 'react'
import type maplibregl from 'maplibre-gl'
import { latLngToMeshCode, meshCodeToBBox } from '../../lib/utils/meshCodeConverter'
import { fetchMeshTimeSeries, isMockData } from '../../lib/services/jmaMesh'

export type WeatherDataType = 'wind' | 'precipitation' | 'temperature'

export interface WeatherMapOverlayProps {
  /** MapLibre GL map instance */
  map: maplibregl.Map
  /** Type of weather data to display */
  dataType: WeatherDataType
  /** Whether the overlay is visible */
  visible: boolean
  /** Forecast time offset in hours (0-72) */
  forecastHours?: number
  /** Opacity of the overlay (0-1) */
  opacity?: number
  /** Callback when mesh is clicked */
  onMeshClick?: (meshCode: string, data: MeshWeatherData) => void
}

export interface MeshWeatherData {
  meshCode: string
  windSpeed: number
  windDirection: number
  precipitationProbability: number
  temperature: number
  timestamp: string
}

interface MeshGridCell {
  meshCode: string
  bbox: [number, number, number, number]
  data?: MeshWeatherData
}

const SOURCE_ID = 'weather-mesh-source'
const LAYER_ID_FILL = 'weather-mesh-fill'
const LAYER_ID_OUTLINE = 'weather-mesh-outline'

// Wind speed thresholds and colors (based on MLIT regulations)
const WIND_SPEED_COLORS = {
  SAFE: '#22c55e', // green - safe (<2 m/s)
  CAUTION: '#eab308', // yellow - caution (2-5 m/s)
  WARNING: '#f97316', // orange - warning (5-10 m/s)
  PROHIBITED: '#991b1b' // dark red - prohibited (>=10 m/s)
} as const

// Precipitation probability colors (>=50% prohibits flight)
const PRECIPITATION_COLORS = {
  SAFE: '#22c55e', // green (<20%)
  LOW: '#a3e635', // lime (20-40%)
  MEDIUM: '#eab308', // yellow (40-50%)
  PROHIBITED: '#991b1b' // dark red - prohibited (>=50%)
} as const

// Temperature colors
const TEMPERATURE_COLORS = {
  COLD: '#3b82f6', // blue (<0°C)
  COOL: '#06b6d4', // cyan (0-10°C)
  COMFORTABLE: '#22c55e', // green (10-20°C)
  WARM: '#eab308', // yellow (20-30°C)
  HOT: '#ef4444' // red (>=30°C)
} as const

/**
 * Get color for wind speed
 * Based on MLIT regulations: >=10 m/s prohibits flight
 */
function getWindSpeedColor(speed: number): string {
  if (speed < 2) return WIND_SPEED_COLORS.SAFE
  if (speed < 5) return WIND_SPEED_COLORS.CAUTION
  if (speed < 10) return WIND_SPEED_COLORS.WARNING
  return WIND_SPEED_COLORS.PROHIBITED
}

/**
 * Get color for precipitation probability
 * Based on MLIT regulations: >=50% prohibits flight
 */
function getPrecipitationColor(probability: number): string {
  if (probability < 20) return PRECIPITATION_COLORS.SAFE
  if (probability < 40) return PRECIPITATION_COLORS.LOW
  if (probability < 50) return PRECIPITATION_COLORS.MEDIUM
  return PRECIPITATION_COLORS.PROHIBITED
}

/**
 * Get color for temperature
 */
function getTemperatureColor(temp: number): string {
  if (temp < 0) return TEMPERATURE_COLORS.COLD
  if (temp < 10) return TEMPERATURE_COLORS.COOL
  if (temp < 20) return TEMPERATURE_COLORS.COMFORTABLE
  if (temp < 30) return TEMPERATURE_COLORS.WARM
  return TEMPERATURE_COLORS.HOT
}

/**
 * Get color based on data type and value
 */
function getColorForDataType(dataType: WeatherDataType, data: MeshWeatherData): string {
  switch (dataType) {
    case 'wind':
      return getWindSpeedColor(data.windSpeed)
    case 'precipitation':
      return getPrecipitationColor(data.precipitationProbability)
    case 'temperature':
      return getTemperatureColor(data.temperature)
    default:
      return '#6b7280'
  }
}

/**
 * WeatherMapOverlay Component
 * Displays weather data as colored mesh cells on the map
 *
 * @example
 * ```tsx
 * <WeatherMapOverlay
 *   map={mapInstance}
 *   dataType="wind"
 *   visible={true}
 *   forecastHours={0}
 *   opacity={0.5}
 *   onMeshClick={(code, data) => console.log(code, data)}
 * />
 * ```
 */
export const WeatherMapOverlay: React.FC<WeatherMapOverlayProps> = ({
  map,
  dataType,
  visible,
  forecastHours = 0,
  opacity = 0.5,
  onMeshClick
}) => {
  const meshCacheRef = useRef<Map<string, MeshWeatherData>>(new Map())
  const isInitializedRef = useRef(false)
  const mapInstanceRef = useRef<maplibregl.Map | null>(null)

  // Clear mesh cache when forecastHours changes to avoid mixing data
  useEffect(() => {
    meshCacheRef.current.clear()
  }, [forecastHours])

  // Reset initialization flag when map instance changes
  useEffect(() => {
    if (map !== mapInstanceRef.current) {
      isInitializedRef.current = false
      mapInstanceRef.current = map
    }
  }, [map])

  /**
   * Generate mesh grid for visible bounds
   */
  const generateMeshGrid = useCallback((): MeshGridCell[] => {
    if (!map) return []

    const bounds = map.getBounds()
    const cells: MeshGridCell[] = []

    // Generate grid at approximately 1km intervals
    const latStep = 0.5 / 60 // ~1km
    const lngStep = 0.75 / 60 // ~1km

    const minLat = Math.floor(bounds.getSouth() / latStep) * latStep
    const maxLat = Math.ceil(bounds.getNorth() / latStep) * latStep
    const minLng = Math.floor(bounds.getWest() / lngStep) * lngStep
    const maxLng = Math.ceil(bounds.getEast() / lngStep) * lngStep

    // Limit grid size to prevent performance issues
    const maxCells = 500
    let cellCount = 0

    for (let lat = minLat; lat < maxLat && cellCount < maxCells; lat += latStep) {
      for (let lng = minLng; lng < maxLng && cellCount < maxCells; lng += lngStep) {
        try {
          const meshCode = latLngToMeshCode(lat + latStep / 2, lng + lngStep / 2)
          const bbox = meshCodeToBBox(meshCode)
          cells.push({ meshCode, bbox })
          cellCount++
        } catch {
          // Skip cells outside Japan bounds
        }
      }
    }

    return cells
  }, [map])

  /**
   * Fetch weather data for mesh cells
   */
  const fetchMeshWeatherData = useCallback(
    async (cells: MeshGridCell[]): Promise<MeshGridCell[]> => {
      const results = await Promise.all(
        cells.map(async cell => {
          // Check cache first
          const cached = meshCacheRef.current.get(cell.meshCode)
          if (cached) {
            return { ...cell, data: cached }
          }

          try {
            const timeSeries = await fetchMeshTimeSeries(cell.meshCode, Math.max(1, forecastHours))
            const forecastIndex = Math.min(
              Math.floor(forecastHours * 12),
              timeSeries.forecasts.length - 1
            ) // 5-min intervals
            const forecast = timeSeries.forecasts[Math.max(0, forecastIndex)]

            const data: MeshWeatherData = {
              meshCode: cell.meshCode,
              windSpeed: forecast.windSpeed,
              windDirection: forecast.windDirection,
              precipitationProbability: forecast.precipitationProbability,
              temperature: forecast.temperature,
              timestamp: forecast.timestamp
            }

            meshCacheRef.current.set(cell.meshCode, data)
            return { ...cell, data }
          } catch (error) {
            console.error(`Failed to fetch weather data for mesh ${cell.meshCode}:`, error)
            return cell
          }
        })
      )

      return results
    },
    [forecastHours]
  )

  /**
   * Update map source with weather data
   */
  const updateMapSource = useCallback(
    (cells: MeshGridCell[]) => {
      if (!map) return

      const features: GeoJSON.Feature[] = cells
        .filter(cell => cell.data)
        .map(cell => ({
          type: 'Feature',
          properties: {
            meshCode: cell.meshCode,
            color: getColorForDataType(dataType, cell.data!),
            windSpeed: cell.data!.windSpeed,
            precipitationProbability: cell.data!.precipitationProbability,
            temperature: cell.data!.temperature,
            isMock: isMockData(cell.data!)
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [cell.bbox[0], cell.bbox[1]],
                [cell.bbox[2], cell.bbox[1]],
                [cell.bbox[2], cell.bbox[3]],
                [cell.bbox[0], cell.bbox[3]],
                [cell.bbox[0], cell.bbox[1]]
              ]
            ]
          }
        }))

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features
      }

      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(geojson)
      }
    },
    [map, dataType]
  )

  /**
   * Initialize map layers
   */
  const initializeLayers = useCallback(() => {
    if (!map || isInitializedRef.current) return

    // Add source if not exists
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      })
    }

    // Add fill layer (initial opacity 0.5, updated separately via useEffect)
    if (!map.getLayer(LAYER_ID_FILL)) {
      map.addLayer({
        id: LAYER_ID_FILL,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.5
        }
      })
    }

    // Add outline layer
    if (!map.getLayer(LAYER_ID_OUTLINE)) {
      map.addLayer({
        id: LAYER_ID_OUTLINE,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.5,
          'line-opacity': 0.3
        }
      })
    }

    isInitializedRef.current = true
  }, [map])

  /**
   * Handle map click on mesh
   */
  useEffect(() => {
    if (!map || !onMeshClick) return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_ID_FILL]
      })

      if (features.length > 0) {
        const feature = features[0]
        const meshCode = feature.properties?.meshCode
        const cached = meshCacheRef.current.get(meshCode)
        if (cached) {
          onMeshClick(meshCode, cached)
        }
      }
    }

    map.on('click', LAYER_ID_FILL, handleClick)

    return () => {
      map.off('click', LAYER_ID_FILL, handleClick)
    }
  }, [map, onMeshClick])

  /**
   * Update overlay when visibility or data type changes
   */
  useEffect(() => {
    if (!map) return

    initializeLayers()

    // Set visibility
    if (map.getLayer(LAYER_ID_FILL)) {
      map.setLayoutProperty(LAYER_ID_FILL, 'visibility', visible ? 'visible' : 'none')
    }
    if (map.getLayer(LAYER_ID_OUTLINE)) {
      map.setLayoutProperty(LAYER_ID_OUTLINE, 'visibility', visible ? 'visible' : 'none')
    }

    if (!visible) return

    // Fetch and display weather data
    const updateWeatherData = async () => {
      const cells = generateMeshGrid()
      const cellsWithData = await fetchMeshWeatherData(cells)
      updateMapSource(cellsWithData)
    }

    updateWeatherData()

    // Update on map move
    const handleMoveEnd = () => {
      updateWeatherData()
    }

    map.on('moveend', handleMoveEnd)

    return () => {
      map.off('moveend', handleMoveEnd)
    }
  }, [
    map,
    visible,
    dataType,
    forecastHours,
    initializeLayers,
    generateMeshGrid,
    fetchMeshWeatherData,
    updateMapSource
  ])

  /**
   * Update opacity
   */
  useEffect(() => {
    if (!map || !map.getLayer(LAYER_ID_FILL)) return

    map.setPaintProperty(LAYER_ID_FILL, 'fill-opacity', opacity)
  }, [map, opacity])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (!map) return

      if (map.getLayer(LAYER_ID_OUTLINE)) {
        map.removeLayer(LAYER_ID_OUTLINE)
      }
      if (map.getLayer(LAYER_ID_FILL)) {
        map.removeLayer(LAYER_ID_FILL)
      }
      if (map.getSource(SOURCE_ID)) {
        map.removeSource(SOURCE_ID)
      }

      isInitializedRef.current = false
    }
  }, [map])

  return null // This component doesn't render any DOM elements
}

export default WeatherMapOverlay
