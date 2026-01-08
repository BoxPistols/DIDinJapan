import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  BASE_MAPS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LAYER_GROUPS,
  GEO_OVERLAYS,
  RESTRICTION_COLORS,
  createLayerIdToNameMap,
  fetchRainRadarTimestamp,
  buildRainTileUrl,
  generateAirportGeoJSON,
  generateRedZoneGeoJSON,
  generateYellowZoneGeoJSON,
  generateEmergencyAirspaceGeoJSON,
  generateMannedAircraftLandingGeoJSON,
  generateRemoteIDZoneGeoJSON,
  generateBuildingsGeoJSON,
  generateWindFieldGeoJSON,
  generateLTECoverageGeoJSON,
  calculateBBox,
  getCustomLayers,
  getAllLayers
} from './lib'
import type { BaseMapKey, LayerConfig, LayerGroup, SearchIndexItem, LayerState, CustomLayer } from './lib'
import { CustomLayerManager } from './components/CustomLayerManager'
import { ToastContainer } from './components/Toast'
import { DialogContainer } from './components/Dialog'

// ============================================
// Zone ID Constants
// ============================================
const ZONE_IDS = {
  DID_ALL_JAPAN: 'ZONE_IDS.DID_ALL_JAPAN',
  AIRPORT: 'airport',
  NO_FLY_RED: 'ZONE_IDS.NO_FLY_RED',
  NO_FLY_YELLOW: 'ZONE_IDS.NO_FLY_YELLOW',
  EMERGENCY_AIRSPACE: 'ZONE_IDS.EMERGENCY_AIRSPACE',
  MANNED_AIRCRAFT_LANDING: 'ZONE_IDS.MANNED_AIRCRAFT_LANDING',
  REMOTE_ID_ZONE: 'ZONE_IDS.REMOTE_ID_ZONE'
} as const

// ============================================
// Main App Component
// ============================================
function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const showTooltipRef = useRef(false)

  // State
  const [layerStates, setLayerStates] = useState<Map<string, LayerState>>(new Map())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['関東']))
  const [mapLoaded, setMapLoaded] = useState(false)
  const [opacity, setOpacity] = useState(0.5)
  const [baseMap, setBaseMap] = useState<BaseMapKey>('osm')
  const [overlayStates, setOverlayStates] = useState<Map<string, boolean>>(new Map())
  const [weatherStates, setWeatherStates] = useState<Map<string, boolean>>(new Map())
  const [restrictionStates, setRestrictionStates] = useState<Map<string, boolean>>(new Map())
  const [rainRadarPath, setRainRadarPath] = useState<string | null>(null)
  const [radarLastUpdate, setRadarLastUpdate] = useState<string>('')

  // Search
  const [searchIndex, setSearchIndex] = useState<SearchIndexItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchIndexItem[]>([])

  // Legend visibility
  const [showLeftLegend, setShowLeftLegend] = useState(true)
  const [showRightLegend, setShowRightLegend] = useState(true)

  // Tooltip visibility
  const [showTooltip, setShowTooltip] = useState(false)

  // Custom layers
  const [customLayerVisibility, setCustomLayerVisibility] = useState<Set<string>>(new Set())

  const layerIdToName = createLayerIdToNameMap()

  // ============================================
  // Tooltip ref sync
  // ============================================
  useEffect(() => {
    showTooltipRef.current = showTooltip
  }, [showTooltip])

  // ============================================
  // Search functionality
  // ============================================
  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([])
      return
    }
    const results = searchIndex.filter(item =>
      item.cityName.includes(searchTerm) || item.prefName.includes(searchTerm)
    )
    const uniqueResults = Array.from(
      new Map(results.map(item => [item.prefName + item.cityName, item])).values()
    )
    setSearchResults(uniqueResults.slice(0, 10))
  }, [searchTerm, searchIndex])

  const flyToFeature = (item: SearchIndexItem) => {
    const map = mapRef.current
    if (!map) return

    map.fitBounds(item.bbox, { padding: 50, maxZoom: 14 })

    const state = layerStates.get(item.layerId)
    if (!state || !state.visible) {
      if (map.getLayer(item.layerId)) {
        map.setLayoutProperty(item.layerId, 'visibility', 'visible')
        map.setLayoutProperty(`${item.layerId}-outline`, 'visibility', 'visible')
      }
      setLayerStates(prev => {
        const next = new Map(prev)
        next.set(item.layerId, { id: item.layerId, visible: true, loaded: true })
        return next
      })
    }
  }

  // ============================================
  // Map initialization
  // ============================================
  useEffect(() => {
    if (!mapContainer.current) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
      setMapLoaded(false)
    }

    const styleConfig = BASE_MAPS[baseMap].style
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleConfig as maplibregl.StyleSpecification | string,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '300px'
    })

    map.on('load', () => {
      setMapLoaded(true)
    })

    map.on('mousemove', (e) => {
      if (!showTooltipRef.current) {
        if (popupRef.current) {
          popupRef.current.remove()
        }
        return
      }

      const features = map.queryRenderedFeatures(e.point)
      const didFeature = features.find(f => f.layer.id.startsWith('did-') && f.layer.type === 'fill')
      const restrictionFeature = features.find(f =>
        f.layer.id.startsWith('airport-') ||
        f.layer.id.startsWith('no-fly-') ||
        f.layer.id.startsWith('ZONE_IDS.DID_ALL_JAPAN-')
      )

      if (didFeature && popupRef.current) {
        map.getCanvas().style.cursor = 'pointer'
        const props = didFeature.properties
        if (!props) return

        const layerId = didFeature.layer.id
        const prefName = layerIdToName.get(layerId) || ''
        const cityName = props.CITYNAME || ''
        const population = props.JINKO || 0
        const area = props.MENSEKI || 0
        const density = area > 0 ? (population / area) : 0

        const content = `
          <div class="did-popup">
            <div class="popup-header">
              <span class="pref-name">${prefName}</span>
              <span class="city-name">${cityName}</span>
            </div>
            <div class="popup-stats">
              <div class="stat-row">
                <span class="stat-label">人口</span>
                <span class="stat-value">${population.toLocaleString()}人</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">面積</span>
                <span class="stat-value">${area.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}km²</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">人口密度</span>
                <span class="stat-value">${density.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}人/km²</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">コード</span>
                <span class="stat-value">${props.KEN || '-'}-${props.CITY || '-'}</span>
              </div>
            </div>
          </div>
        `
        popupRef.current.setLngLat(e.lngLat).setHTML(content).addTo(map)
      } else if (restrictionFeature && popupRef.current) {
        map.getCanvas().style.cursor = 'pointer'
        const props = restrictionFeature.properties
        if (!props) return

        const content = `
          <div class="did-popup">
            <div class="popup-header">
              <span class="pref-name">${props.name || ''}</span>
              <span class="city-name">${props.type || ''}</span>
            </div>
            <div class="popup-stats">
              <div class="stat-row">
                <span class="stat-label">制限半径</span>
                <span class="stat-value">${props.radiusKm || '-'}km</span>
              </div>
            </div>
          </div>
        `
        popupRef.current.setLngLat(e.lngLat).setHTML(content).addTo(map)
      } else if (popupRef.current) {
        map.getCanvas().style.cursor = ''
        popupRef.current.remove()
      }
    })

    map.on('mouseleave', () => {
      map.getCanvas().style.cursor = ''
      if (popupRef.current) {
        popupRef.current.remove()
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [baseMap])

  // ============================================
  // Opacity effect
  // ============================================
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    layerStates.forEach((state) => {
      if (state.visible && map.getLayer(state.id)) {
        map.setPaintProperty(state.id, 'fill-opacity', opacity)
      }
    })
  }, [opacity, layerStates, mapLoaded])

  // ============================================
  // Layer management
  // ============================================
  const addLayer = useCallback(async (layer: LayerConfig) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    if (map.getSource(layer.id)) return

    try {
      const response = await fetch(layer.path)
      const data = await response.json()

      const newItems: SearchIndexItem[] = []
      data.features.forEach((feature: any) => {
        if (feature.properties?.CITYNAME) {
          newItems.push({
            prefName: layer.name,
            cityName: feature.properties.CITYNAME,
            bbox: calculateBBox(feature.geometry),
            layerId: layer.id
          })
        }
      })
      setSearchIndex(prev => [...prev, ...newItems])

      map.addSource(layer.id, { type: 'geojson', data })

      map.addLayer({
        id: layer.id,
        type: 'fill',
        source: layer.id,
        paint: { 'fill-color': layer.color, 'fill-opacity': opacity }
      })

      map.addLayer({
        id: `${layer.id}-outline`,
        type: 'line',
        source: layer.id,
        paint: { 'line-color': layer.color, 'line-width': 1 }
      })

      setLayerStates(prev => {
        const next = new Map(prev)
        next.set(layer.id, { id: layer.id, visible: true, loaded: true })
        return next
      })
    } catch (e) {
      console.error(`Failed to add layer ${layer.id}:`, e)
    }
  }, [mapLoaded, opacity])

  const toggleLayer = (layer: LayerConfig) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const state = layerStates.get(layer.id)

    if (!state) {
      addLayer(layer)
      return
    }

    const newVisibility = !state.visible
    const visibility = newVisibility ? 'visible' : 'none'

    map.setLayoutProperty(layer.id, 'visibility', visibility)
    map.setLayoutProperty(`${layer.id}-outline`, 'visibility', visibility)

    setLayerStates(prev => {
      const next = new Map(prev)
      next.set(layer.id, { ...state, visible: newVisibility })
      return next
    })
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }

  const isLayerVisible = (layerId: string) => layerStates.get(layerId)?.visible ?? false

  const enableAllInGroup = (group: LayerGroup) => {
    group.layers.forEach(layer => {
      if (!isLayerVisible(layer.id)) {
        addLayer(layer)
      }
    })
  }

  const disableAllInGroup = (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    group.layers.forEach(layer => {
      const state = layerStates.get(layer.id)
      if (state?.visible) {
        map.setLayoutProperty(layer.id, 'visibility', 'none')
        map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'none')
        setLayerStates(prev => {
          const next = new Map(prev)
          next.set(layer.id, { ...state, visible: false })
          return next
        })
      }
    })
  }

  // ============================================
  // Overlay management
  // ============================================
  const toggleOverlay = (overlay: typeof GEO_OVERLAYS[0] | { id: string; name: string }) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const isVisible = overlayStates.get(overlay.id) ?? false

    if (!isVisible) {
      if (!map.getSource(overlay.id)) {
        // Handle mock GeoJSON overlays
        if (overlay.id === 'buildings') {
          const geojson = generateBuildingsGeoJSON()
          map.addSource(overlay.id, { type: 'geojson', data: geojson })
          map.addLayer({
            id: overlay.id,
            type: 'fill',
            source: overlay.id,
            paint: { 'fill-color': '#FFA500', 'fill-opacity': 0.5 }
          })
          map.addLayer({
            id: `${overlay.id}-outline`,
            type: 'line',
            source: overlay.id,
            paint: { 'line-color': '#FFA500', 'line-width': 2 }
          })
        } else if (overlay.id === 'wind-field') {
          const geojson = generateWindFieldGeoJSON()
          map.addSource(overlay.id, { type: 'geojson', data: geojson })
          map.addLayer({
            id: overlay.id,
            type: 'symbol',
            source: overlay.id,
            layout: {
              'icon-image': 'marker-15',
              'text-field': ['get', 'name'],
              'text-size': 10,
              'text-offset': [0, 1.5]
            }
          })
        } else if (overlay.id === 'lte-coverage') {
          const geojson = generateLTECoverageGeoJSON()
          map.addSource(overlay.id, { type: 'geojson', data: geojson })
          map.addLayer({
            id: overlay.id,
            type: 'fill',
            source: overlay.id,
            paint: { 'fill-color': '#00CED1', 'fill-opacity': 0.3 }
          })
          map.addLayer({
            id: `${overlay.id}-outline`,
            type: 'line',
            source: overlay.id,
            paint: { 'line-color': '#00CED1', 'line-width': 1.5 }
          })
        } else if ('tiles' in overlay) {
          // Handle raster tile overlays
          map.addSource(overlay.id, {
            type: 'raster',
            tiles: overlay.tiles,
            tileSize: 256
          })
          map.addLayer({
            id: overlay.id,
            type: 'raster',
            source: overlay.id,
            paint: { 'raster-opacity': overlay.opacity }
          })
        }
      } else {
        map.setLayoutProperty(overlay.id, 'visibility', 'visible')
        if (map.getLayer(`${overlay.id}-outline`)) {
          map.setLayoutProperty(`${overlay.id}-outline`, 'visibility', 'visible')
        }
      }
      setOverlayStates(prev => new Map(prev).set(overlay.id, true))
    } else {
      if (map.getLayer(overlay.id)) {
        map.setLayoutProperty(overlay.id, 'visibility', 'none')
      }
      if (map.getLayer(`${overlay.id}-outline`)) {
        map.setLayoutProperty(`${overlay.id}-outline`, 'visibility', 'none')
      }
      setOverlayStates(prev => new Map(prev).set(overlay.id, false))
    }
  }

  const isOverlayVisible = (overlayId: string) => overlayStates.get(overlayId) ?? false

  // ============================================
  // Weather overlay management
  // ============================================
  const updateRainRadar = async () => {
    const path = await fetchRainRadarTimestamp()
    if (path) {
      setRainRadarPath(path)
      const timestamp = path.split('/').pop()
      if (timestamp) {
        const date = new Date(parseInt(timestamp) * 1000)
        setRadarLastUpdate(date.toLocaleTimeString('ja-JP'))
      }
    }
    return path
  }

  const toggleWeatherOverlay = async (overlayId: string) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const isVisible = weatherStates.get(overlayId) ?? false

    if (!isVisible) {
      if (overlayId === 'rain-radar') {
        let path = rainRadarPath
        if (!path) {
          path = await updateRainRadar()
        }
        if (!path) return

        const tileUrl = buildRainTileUrl(path)

        if (map.getSource('rain-radar')) {
          map.removeLayer('rain-radar')
          map.removeSource('rain-radar')
        }

        map.addSource('rain-radar', {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256
        })
        map.addLayer({
          id: 'rain-radar',
          type: 'raster',
          source: 'rain-radar',
          paint: { 'raster-opacity': 0.6 }
        })
      }
      setWeatherStates(prev => new Map(prev).set(overlayId, true))
    } else {
      if (map.getLayer(overlayId)) {
        map.setLayoutProperty(overlayId, 'visibility', 'none')
      }
      setWeatherStates(prev => new Map(prev).set(overlayId, false))
    }
  }

  const isWeatherVisible = (overlayId: string) => weatherStates.get(overlayId) ?? false

  // Rain radar auto-update
  useEffect(() => {
    if (!weatherStates.get('rain-radar')) return

    const interval = setInterval(async () => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      const path = await updateRainRadar()
      if (path && map.getSource('rain-radar')) {
        const tileUrl = buildRainTileUrl(path)
        map.removeLayer('rain-radar')
        map.removeSource('rain-radar')
        map.addSource('rain-radar', {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256
        })
        map.addLayer({
          id: 'rain-radar',
          type: 'raster',
          source: 'rain-radar',
          paint: { 'raster-opacity': 0.6 }
        })
      }
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [weatherStates, mapLoaded])

  // ============================================
  // Restriction zone management
  // ============================================
  const toggleRestriction = async (restrictionId: string) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const isVisible = restrictionStates.get(restrictionId) ?? false

    if (!isVisible) {
      let geojson: GeoJSON.FeatureCollection | null = null
      let color = ''

      if (restrictionId === 'airport-airspace') {
        geojson = generateAirportGeoJSON()
        color = RESTRICTION_COLORS.airport
      } else if (restrictionId === 'ZONE_IDS.NO_FLY_RED') {
        geojson = generateRedZoneGeoJSON()
        color = RESTRICTION_COLORS.no_fly_red
      } else if (restrictionId === 'ZONE_IDS.NO_FLY_YELLOW') {
        geojson = generateYellowZoneGeoJSON()
        color = RESTRICTION_COLORS.no_fly_yellow
      } else if (restrictionId === 'ZONE_IDS.EMERGENCY_AIRSPACE') {
        geojson = generateEmergencyAirspaceGeoJSON()
        color = RESTRICTION_COLORS.emergency
      } else if (restrictionId === 'ZONE_IDS.MANNED_AIRCRAFT_LANDING') {
        geojson = generateMannedAircraftLandingGeoJSON()
        color = RESTRICTION_COLORS.manned
      } else if (restrictionId === 'ZONE_IDS.REMOTE_ID_ZONE') {
        geojson = generateRemoteIDZoneGeoJSON()
        color = RESTRICTION_COLORS.remote_id
      } else if (restrictionId === 'ZONE_IDS.DID_ALL_JAPAN') {
        // DID全国一括表示モード - 全47都道府県を赤色で表示
        const allLayers = getAllLayers()
        color = '#FF0000'

        for (const layer of allLayers) {
          if (!map.getSource(`${restrictionId}-${layer.id}`)) {
            try {
              const response = await fetch(layer.path)
              const data = await response.json()
              const sourceId = `${restrictionId}-${layer.id}`

              map.addSource(sourceId, { type: 'geojson', data })
              map.addLayer({
                id: sourceId,
                type: 'fill',
                source: sourceId,
                paint: { 'fill-color': color, 'fill-opacity': 0.4 }
              })
              map.addLayer({
                id: `${sourceId}-outline`,
                type: 'line',
                source: sourceId,
                paint: { 'line-color': color, 'line-width': 1 }
              })
            } catch (e) {
              console.error(`Failed to load DID for ${layer.id}:`, e)
            }
          } else {
            map.setLayoutProperty(`${restrictionId}-${layer.id}`, 'visibility', 'visible')
            map.setLayoutProperty(`${restrictionId}-${layer.id}-outline`, 'visibility', 'visible')
          }
        }
        setRestrictionStates(prev => new Map(prev).set(restrictionId, true))
        return
      }

      if (geojson && !map.getSource(restrictionId)) {
        map.addSource(restrictionId, { type: 'geojson', data: geojson })
        map.addLayer({
          id: restrictionId,
          type: 'fill',
          source: restrictionId,
          paint: { 'fill-color': color, 'fill-opacity': 0.4 }
        })
        map.addLayer({
          id: `${restrictionId}-outline`,
          type: 'line',
          source: restrictionId,
          paint: { 'line-color': color, 'line-width': 2 }
        })
      } else if (map.getLayer(restrictionId)) {
        map.setLayoutProperty(restrictionId, 'visibility', 'visible')
        map.setLayoutProperty(`${restrictionId}-outline`, 'visibility', 'visible')
      }
      setRestrictionStates(prev => new Map(prev).set(restrictionId, true))
    } else {
      // Hide
      if (restrictionId === 'ZONE_IDS.DID_ALL_JAPAN') {
        const allLayers = getAllLayers()
        for (const layer of allLayers) {
          const sourceId = `${restrictionId}-${layer.id}`
          if (map.getLayer(sourceId)) {
            map.setLayoutProperty(sourceId, 'visibility', 'none')
            map.setLayoutProperty(`${sourceId}-outline`, 'visibility', 'none')
          }
        }
      } else {
        if (map.getLayer(restrictionId)) {
          map.setLayoutProperty(restrictionId, 'visibility', 'none')
          map.setLayoutProperty(`${restrictionId}-outline`, 'visibility', 'none')
        }
      }
      setRestrictionStates(prev => new Map(prev).set(restrictionId, false))
    }
  }

  const isRestrictionVisible = (id: string) => restrictionStates.get(id) ?? false

  // ============================================
  // Custom layer management
  // ============================================
  const handleCustomLayerAdded = useCallback((layer: CustomLayer) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    if (!map.getSource(layer.id)) {
      map.addSource(layer.id, { type: 'geojson', data: layer.data })
      map.addLayer({
        id: layer.id,
        type: 'fill',
        source: layer.id,
        paint: { 'fill-color': layer.color, 'fill-opacity': layer.opacity }
      })
      map.addLayer({
        id: `${layer.id}-outline`,
        type: 'line',
        source: layer.id,
        paint: { 'line-color': layer.color, 'line-width': 2 }
      })
    }
    setCustomLayerVisibility(prev => new Set(prev).add(layer.id))
  }, [mapLoaded])

  const handleCustomLayerRemoved = useCallback((layerId: string) => {
    const map = mapRef.current
    if (!map) return

    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
      map.removeLayer(`${layerId}-outline`)
    }
    if (map.getSource(layerId)) {
      map.removeSource(layerId)
    }
    setCustomLayerVisibility(prev => {
      const next = new Set(prev)
      next.delete(layerId)
      return next
    })
  }, [])

  const handleCustomLayerToggle = useCallback((layerId: string, visible: boolean) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // レイヤーがまだ追加されていない場合は追加
    if (visible && !map.getSource(layerId)) {
      const customLayers = getCustomLayers()
      const layer = customLayers.find(l => l.id === layerId)
      if (layer) {
        handleCustomLayerAdded(layer)
        return
      }
    }

    if (map.getLayer(layerId)) {
      const visibility = visible ? 'visible' : 'none'
      map.setLayoutProperty(layerId, 'visibility', visibility)
      map.setLayoutProperty(`${layerId}-outline`, 'visibility', visibility)
    }

    setCustomLayerVisibility(prev => {
      const next = new Set(prev)
      if (visible) {
        next.add(layerId)
      } else {
        next.delete(layerId)
      }
      return next
    })
  }, [mapLoaded, handleCustomLayerAdded])

  // ============================================
  // Render
  // ============================================
  return (
    <div style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      {/* Left Toggle Button */}
      <button
        onClick={() => setShowLeftLegend(!showLeftLegend)}
        style={{
          position: 'fixed',
          left: showLeftLegend ? 280 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 24,
          height: 48,
          background: 'rgba(255,255,255,0.95)',
          border: 'none',
          borderRadius: '0 4px 4px 0',
          cursor: 'pointer',
          boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: 'left 0.3s ease'
        }}
      >
        {showLeftLegend ? '<' : '>'}
      </button>

      {/* Left Legend Panel */}
      <aside style={{
        position: 'absolute',
        left: showLeftLegend ? 0 : -280,
        top: 0,
        bottom: 0,
        width: '280px',
        padding: '12px',
        backgroundColor: 'rgba(255,255,255,0.95)',
        color: '#333',
        overflowY: 'auto',
        zIndex: 10,
        transition: 'left 0.3s ease',
        boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
        fontSize: '14px'
      }}>

        {/* App Title */}
        <h1 style={{
          margin: '0 0 16px',
          fontSize: '16px',
          fontWeight: 700,
          color: '#333'
        }}>
          DID Map
        </h1>

        {/* Search */}
        <div style={{ marginBottom: '12px', position: 'relative' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="市区町村検索..."
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '0 0 4px 4px',
              maxHeight: '150px',
              overflowY: 'auto',
              zIndex: 100
            }}>
              {searchResults.map((item, index) => (
                <div
                  key={`${item.prefName}-${item.cityName}-${index}`}
                  onClick={() => { flyToFeature(item); setSearchTerm(''); }}
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    fontSize: '12px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span style={{ color: '#888', marginRight: '4px' }}>{item.prefName}</span>
                  {item.cityName}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Base map selector */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {(Object.keys(BASE_MAPS) as BaseMapKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setBaseMap(key)}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  backgroundColor: baseMap === key ? '#4a90d9' : '#f0f0f0',
                  color: baseMap === key ? '#fff' : '#333',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                {BASE_MAPS[key].name}
              </button>
            ))}
          </div>
        </div>

        {/* Opacity slider */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: '#666' }}>
            透明度: {Math.round(opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Tooltip toggle */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showTooltip}
              onChange={(e) => setShowTooltip(e.target.checked)}
            />
            <span style={{ fontSize: '14px' }}>詳細情報表示</span>
          </label>
        </div>

        {/* Restriction Areas Section */}
        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#f8f8f8', borderRadius: '4px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
            禁止エリア
          </h3>

          {/* Airport airspace */}
          <label title="空港周辺の一定範囲内：無人機飛行は許可が必要" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('airport-airspace')}
              onChange={() => toggleRestriction('airport-airspace')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.airport, borderRadius: '2px' }} />
            <span>空港など周辺空域</span>
          </label>

          {/* DID */}
          <label title="人口が密集している地区：航空法により飛行に許可が必要な区域" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.DID_ALL_JAPAN')}
              onChange={() => toggleRestriction('ZONE_IDS.DID_ALL_JAPAN')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: '#FF0000', borderRadius: '2px' }} />
            <span>人口集中地区（全国）</span>
          </label>

          {/* Emergency airspace */}
          <label title="緊急用務空域（見本データ）：警察・消防などの緊急活動が必要な区域" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.EMERGENCY_AIRSPACE')}
              onChange={() => toggleRestriction('ZONE_IDS.EMERGENCY_AIRSPACE')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.emergency, borderRadius: '2px' }} />
            <span>(見本)緊急用務空域</span>
          </label>

          {/* Manned aircraft */}
          <label title="有人機発着エリア（見本データ）：有人航空機の離着陸場所となっている区域" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.MANNED_AIRCRAFT_LANDING')}
              onChange={() => toggleRestriction('ZONE_IDS.MANNED_AIRCRAFT_LANDING')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.manned, borderRadius: '2px' }} />
            <span>(見本)有人機発着エリア</span>
          </label>

          {/* Remote ID */}
          <label title="リモートID特定区域（見本データ）：リモートID機能の搭載が必要な区域" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.REMOTE_ID_ZONE')}
              onChange={() => toggleRestriction('ZONE_IDS.REMOTE_ID_ZONE')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.remote_id, borderRadius: '2px' }} />
            <span>(見本)リモートID特定区域</span>
          </label>

          {/* No-fly law section */}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #ddd' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>小型無人機等飛行禁止法</div>

            <label title="飛行禁止区域：許可を得ずに飛行できません" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isRestrictionVisible('ZONE_IDS.NO_FLY_RED')}
                onChange={() => toggleRestriction('ZONE_IDS.NO_FLY_RED')}
              />
              <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.no_fly_red, borderRadius: '2px' }} />
              <span>レッドゾーン</span>
            </label>

            <label title="要許可区域：許可申請を得て条件を満たすことで飛行できます" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isRestrictionVisible('ZONE_IDS.NO_FLY_YELLOW')}
                onChange={() => toggleRestriction('ZONE_IDS.NO_FLY_YELLOW')}
              />
              <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.no_fly_yellow, borderRadius: '2px' }} />
              <span>イエローゾーン</span>
            </label>
          </div>
        </div>

        {/* DID Section */}
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>人口集中地区（DID）</h3>
          {LAYER_GROUPS.map(group => (
            <div key={group.name} style={{ marginBottom: '4px' }}>
              <button
                onClick={() => toggleGroup(group.name)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#f0f0f0',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '12px'
                }}
              >
                <span>{group.name}</span>
                <span>{expandedGroups.has(group.name) ? '▼' : '▶'}</span>
              </button>

              {expandedGroups.has(group.name) && (
                <div style={{ padding: '4px 0 4px 8px' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <button
                      onClick={() => enableAllInGroup(group)}
                      style={{ flex: 1, padding: '2px 4px', fontSize: '12px', backgroundColor: '#e8e8e8', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
                    >
                      全て表示
                    </button>
                    <button
                      onClick={() => disableAllInGroup(group)}
                      style={{ flex: 1, padding: '2px 4px', fontSize: '12px', backgroundColor: '#e8e8e8', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
                    >
                      全て非表示
                    </button>
                  </div>
                  {group.layers.map(layer => (
                    <label
                      key={layer.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', cursor: 'pointer', fontSize: '12px' }}
                    >
                      <input
                        type="checkbox"
                        checked={isLayerVisible(layer.id)}
                        onChange={() => toggleLayer(layer)}
                      />
                      <span style={{ width: '10px', height: '10px', backgroundColor: layer.color, borderRadius: '2px' }} />
                      <span>{layer.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Right Toggle Button */}
      <button
        onClick={() => setShowRightLegend(!showRightLegend)}
        style={{
          position: 'fixed',
          right: showRightLegend ? 200 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 24,
          height: 48,
          background: 'rgba(255,255,255,0.95)',
          border: 'none',
          borderRadius: '4px 0 0 4px',
          cursor: 'pointer',
          boxShadow: '-2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: 'right 0.3s ease'
        }}
      >
        {showRightLegend ? '>' : '<'}
      </button>

      {/* Right Legend Panel */}
      <aside style={{
        position: 'absolute',
        right: showRightLegend ? 0 : -200,
        top: 0,
        bottom: 0,
        width: '200px',
        padding: '12px',
        backgroundColor: 'rgba(255,255,255,0.95)',
        color: '#333',
        overflowY: 'auto',
        zIndex: 10,
        transition: 'right 0.3s ease',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
        fontSize: '14px'
      }}>

        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
          環境情報
        </h3>

        {/* Geographic Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>地理情報</div>
          {GEO_OVERLAYS.filter(o => o.id !== 'buildings').map(overlay => (
            <label key={overlay.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={isOverlayVisible(overlay.id)}
                onChange={() => toggleOverlay(overlay)}
              />
              <span>{overlay.name}</span>
            </label>
          ))}

          {/* 地物 */}
          <label title="地物（見本データ）：建物・駅舎などの建造物" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={isOverlayVisible('buildings')}
              onChange={() => toggleOverlay({ id: 'buildings', name: '(見本)地物' })}
            />
            <span>(見本)地物</span>
          </label>
        </div>

        {/* Weather Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>天候情報</div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={isWeatherVisible('rain-radar')}
              onChange={() => toggleWeatherOverlay('rain-radar')}
            />
            <span>雨雲</span>
            {isWeatherVisible('rain-radar') && radarLastUpdate && (
              <span style={{ fontSize: '9px', color: '#888' }}>{radarLastUpdate}</span>
            )}
          </label>

          <label title="風向・風量（見本データ）：風の方向と速度" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={isOverlayVisible('wind-field')}
              onChange={() => toggleOverlay({ id: 'wind-field', name: '(見本)風向・風量' })}
            />
            <span>(見本)風向・風量</span>
          </label>
        </div>

        {/* Signal Info */}
        <div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>電波種</div>
          <label title="LTE（見本データ）：携帯電話の通信カバレッジ強度" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={isOverlayVisible('lte-coverage')}
              onChange={() => toggleOverlay({ id: 'lte-coverage', name: '(見本)LTE' })}
            />
            <span>(見本)LTE</span>
          </label>
        </div>
      </aside>

      {/* Map Container */}
      <div ref={mapContainer} style={{ flex: 1 }} />

      {/* Custom Layer Manager */}
      <CustomLayerManager
        onLayerAdded={handleCustomLayerAdded}
        onLayerRemoved={handleCustomLayerRemoved}
        onLayerToggle={handleCustomLayerToggle}
        visibleLayers={customLayerVisibility}
      />

      {/* Attribution */}
      <div style={{
        position: 'absolute',
        bottom: 4,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '12px',
        color: '#666',
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: '2px 8px',
        borderRadius: '2px',
        zIndex: 5
      }}>
        出典: 政府統計の総合窓口(e-Stat) / 国土地理院
      </div>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Confirm Dialog */}
      <DialogContainer />
    </div>
  )
}

export default App
