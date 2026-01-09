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
  generateHeliportGeoJSON,
  generateRedZoneGeoJSON,
  generateYellowZoneGeoJSON,
  generateEmergencyAirspaceGeoJSON,
  generateMannedAircraftLandingGeoJSON,
  generateRemoteIDZoneGeoJSON,
  generateBuildingsGeoJSON,
  generateWindFieldGeoJSON,
  generateLTECoverageGeoJSON,
  generateRadioInterferenceGeoJSON,
  generateMannedAircraftZonesGeoJSON,
  calculateBBox,
  getCustomLayers,
  getAllLayers,
  getAllPrefectureLayerIds,
  searchAddress,
  getZoomBounds,
  quickSearch
} from './lib'
import type { GeocodingResult } from './lib'
import type { BaseMapKey, LayerConfig, LayerGroup, SearchIndexItem, LayerState, CustomLayer } from './lib'
import { CustomLayerManager } from './components/CustomLayerManager'
import { DrawingTools } from './components/DrawingTools'
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
  const restrictionStatesRef = useRef<Map<string, boolean>>(new Map())

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
  const [isLoadingForSearch, setIsLoadingForSearch] = useState(false)

  // Geocoding search (建物名・地名検索)
  const [geoSearchResults, setGeoSearchResults] = useState<GeocodingResult[]>([])
  const [isGeoSearching, setIsGeoSearching] = useState(false)

  // Legend visibility
  const [showLeftLegend, setShowLeftLegend] = useState(true)
  const [showRightLegend, setShowRightLegend] = useState(true)

  // Tooltip visibility
  const [showTooltip, setShowTooltip] = useState(false)

  // Custom layers
  const [customLayerVisibility, setCustomLayerVisibility] = useState<Set<string>>(new Set())

  // Dark mode
  const [darkMode, setDarkMode] = useState(false)

  // 3D mode
  const [is3DMode, setIs3DMode] = useState(false)

  // Help modal
  const [showHelp, setShowHelp] = useState(false)

  // 2D/3D切り替え
  const toggle3DMode = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const newIs3D = !is3DMode
    setIs3DMode(newIs3D)

    map.easeTo({
      pitch: newIs3D ? 60 : 0,
      bearing: newIs3D ? map.getBearing() : 0,
      duration: 500
    })
  }, [is3DMode])

  const layerIdToName = createLayerIdToNameMap()

  // ============================================
  // Tooltip ref sync
  // ============================================
  useEffect(() => {
    showTooltipRef.current = showTooltip
  }, [showTooltip])

  // ============================================
  // Restriction states ref sync
  // ============================================
  useEffect(() => {
    restrictionStatesRef.current = restrictionStates
  }, [restrictionStates])

  // ============================================
  // Keyboard shortcuts
  // ============================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力中は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const key = e.key.toLowerCase()

      switch (key) {
        case 'd':
          toggleRestriction('ZONE_IDS.DID_ALL_JAPAN')
          break
        case 'a':
          toggleRestriction('airport-airspace')
          break
        case 'r':
          toggleRestriction('ZONE_IDS.NO_FLY_RED')
          break
        case 'y':
          toggleRestriction('ZONE_IDS.NO_FLY_YELLOW')
          break
        case 'e':
          toggleRestriction('ZONE_IDS.EMERGENCY_AIRSPACE')
          break
        case 'h':
          toggleRestriction('heliports')
          break
        case 't':
          setShowTooltip(prev => !prev)
          break
        case '2':
          setIs3DMode(false)
          break
        case '3':
          setIs3DMode(true)
          break
        case '?':
        case '/':
          setShowHelp(prev => !prev)
          break
        case 'escape':
          setShowHelp(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mapLoaded])

  // ============================================
  // Search functionality (DID + Geocoding)
  // ============================================
  // DID検索
  const performDIDSearch = useCallback((term: string) => {
    if (!term) {
      setSearchResults([])
      return []
    }
    const results = searchIndex.filter(item =>
      item.cityName.includes(term) || item.prefName.includes(term)
    )
    const uniqueResults = Array.from(
      new Map(results.map(item => [item.prefName + item.cityName, item])).values()
    )
    const sliced = uniqueResults.slice(0, 5)
    setSearchResults(sliced)
    return sliced
  }, [searchIndex])

  // ジオコーディング検索（建物名・地名）
  const performGeoSearch = useCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setGeoSearchResults([])
      return
    }

    // まずクイック検索（主要都市）を試行
    const quick = quickSearch(term)
    if (quick) {
      const map = mapRef.current
      if (map) {
        map.flyTo({ center: [quick.lng, quick.lat], zoom: quick.zoom })
      }
      setSearchTerm('')
      setGeoSearchResults([])
      return
    }

    setIsGeoSearching(true)
    try {
      const results = await searchAddress(term, { limit: 5 })
      setGeoSearchResults(results)
    } catch (e) {
      console.error('Geocoding error:', e)
    } finally {
      setIsGeoSearching(false)
    }
  }, [])

  // Debounce search with 300ms delay
  useEffect(() => {
    const timer = setTimeout(async () => {
      const didResults = performDIDSearch(searchTerm)

      // DID検索結果がない場合、ジオコーディング検索を実行
      if (didResults.length === 0 && searchTerm.length >= 2) {
        await performGeoSearch(searchTerm)
      } else {
        setGeoSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm, performDIDSearch, performGeoSearch])

  // ジオコーディング結果からマップへ移動
  const flyToGeoResult = (result: GeocodingResult) => {
    const map = mapRef.current
    if (!map) return

    const { center, zoom, bounds } = getZoomBounds(result)

    if (bounds) {
      map.fitBounds(bounds as [[number, number], [number, number]], { padding: 50 })
    } else {
      map.flyTo({ center, zoom })
    }

    setSearchTerm('')
    setGeoSearchResults([])
    setSearchResults([])
  }

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
        next.set(item.layerId, { id: item.layerId, visible: true })
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
    const mapConfig: maplibregl.MapOptions = {
      container: mapContainer.current,
      style: styleConfig as maplibregl.StyleSpecification | string,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM
    }


    const map = new maplibregl.Map(mapConfig)

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
        f.layer.id.startsWith(ZONE_IDS.DID_ALL_JAPAN) ||
        f.layer.id.startsWith('emergency-') ||
        f.layer.id.startsWith('manned-') ||
        f.layer.id.startsWith('remote-')
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

        // Determine the type of restriction area and description
        let areaType = ''
        let description = ''
        let category = ''
        const layerId = restrictionFeature.layer.id

        if (layerId.startsWith('airport-')) {
          areaType = `${props.type || '空港'}周辺空域`
          description = '航空法により無人機飛行には許可が必要'
          category = '航空法'
        } else if (layerId.includes('NO_FLY_RED') || layerId.includes('no-fly-red')) {
          areaType = 'レッドゾーン（飛行禁止）'
          description = '小型無人機等飛行禁止法により原則飛行禁止'
          category = '小型無人機等飛行禁止法'
        } else if (layerId.includes('NO_FLY_YELLOW') || layerId.includes('no-fly-yellow')) {
          areaType = 'イエローゾーン（要許可）'
          description = '事前通報・許可を得て条件を満たせば飛行可能'
          category = '小型無人機等飛行禁止法'
        } else if (layerId.startsWith('emergency-') || layerId.includes('EMERGENCY')) {
          areaType = '緊急用務空域'
          description = '警察・消防などの緊急活動中は飛行禁止'
          category = '航空法'
        } else if (layerId.startsWith('manned-') || layerId.includes('MANNED')) {
          areaType = '有人機発着エリア'
          description = '有人航空機との衝突リスクに注意'
          category = '航空法'
        } else if (layerId.startsWith('remote-') || layerId.includes('REMOTE')) {
          areaType = 'リモートID特定区域'
          description = 'リモートID機能の搭載が必須'
          category = '航空法'
        } else if (layerId.includes('DID_ALL_JAPAN')) {
          areaType = '人口集中地区（DID）'
          description = '航空法により無人機飛行には許可が必要'
          category = '航空法'
        }

        const content = `
          <div class="did-popup">
            <div class="popup-header">
              <span class="pref-name">${props.name || areaType}</span>
              <span class="city-name">${areaType}</span>
            </div>
            <div class="popup-stats">
              <div class="stat-row">
                <span class="stat-label">規制法令</span>
                <span class="stat-value">${category}</span>
              </div>
              ${props.radiusKm ? `<div class="stat-row">
                <span class="stat-label">制限半径</span>
                <span class="stat-value">${props.radiusKm}km</span>
              </div>` : ''}
              ${props.category ? `<div class="stat-row">
                <span class="stat-label">カテゴリ</span>
                <span class="stat-value">${props.category}</span>
              </div>` : ''}
              ${props.source ? `<div class="stat-row">
                <span class="stat-label">情報源</span>
                <span class="stat-value">${props.source}</span>
              </div>` : ''}
              <div class="stat-row" style="margin-top:4px;padding-top:4px;border-top:1px solid #eee;">
                <span class="stat-value" style="font-size:10px;color:#666;">${description}</span>
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

    // DIDレイヤーに透明度を適用
    layerStates.forEach((state) => {
      if (state.visible && map.getLayer(state.id)) {
        map.setPaintProperty(state.id, 'fill-opacity', opacity)
      }
    })

    // 禁止エリアレイヤーにも透明度を適用
    restrictionStates.forEach((isVisible, restrictionId) => {
      if (!isVisible) return

      if (restrictionId === 'ZONE_IDS.DID_ALL_JAPAN') {
        // 全国DIDの各レイヤー
        const allLayers = getAllLayers()
        allLayers.forEach(layer => {
          const sourceId = `${restrictionId}-${layer.id}`
          if (map.getLayer(sourceId)) {
            map.setPaintProperty(sourceId, 'fill-opacity', opacity)
          }
        })
      } else {
        if (map.getLayer(restrictionId)) {
          map.setPaintProperty(restrictionId, 'fill-opacity', opacity)
        }
      }
    })
  }, [opacity, layerStates, restrictionStates, mapLoaded])

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
        next.set(layer.id, { id: layer.id, visible: true })
        return next
      })
    } catch (e) {
      console.error(`Failed to add layer ${layer.id}:`, e)
    }
  }, [mapLoaded, opacity])

  // ============================================
  // Load default layers on map load
  // ============================================
  useEffect(() => {
    if (!mapLoaded || searchIndex.length > 0) return

    // Load multiple regions for better search coverage
    const regionsToLoad = ['関東', '近畿', '中部']
    LAYER_GROUPS.forEach(group => {
      if (regionsToLoad.includes(group.name)) {
        group.layers.forEach(layer => {
          addLayer(layer)
        })
      }
    })
  }, [mapLoaded, addLayer])

  // ============================================
  // Auto-load unloaded layers when search returns no results
  // ============================================
  useEffect(() => {
    if (!searchTerm || searchResults.length > 0 || isLoadingForSearch) return

    setIsLoadingForSearch(true)

    // Find layers that haven't been loaded yet
    const allLayerIds = getAllPrefectureLayerIds()
    const loadedLayerIds = new Set(layerStates.keys())
    const unloadedLayerIds = allLayerIds.filter(id => !loadedLayerIds.has(id))

    if (unloadedLayerIds.length === 0) {
      setIsLoadingForSearch(false)
      return
    }

    // Find and load all unloaded layers
    LAYER_GROUPS.forEach(group => {
      group.layers.forEach(layer => {
        if (unloadedLayerIds.includes(layer.id)) {
          addLayer(layer)
        }
      })
    })

    setIsLoadingForSearch(false)
  }, [searchTerm, searchResults.length, isLoadingForSearch, layerStates, addLayer])

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

    // refから最新の状態を取得（キーボードショートカット対応）
    const isVisible = restrictionStatesRef.current.get(restrictionId) ?? false

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
      } else if (restrictionId === 'heliports') {
        geojson = generateHeliportGeoJSON()
        color = '#FF6B6B' // ヘリポート用カラー
      } else if (restrictionId === 'radio-interference') {
        geojson = generateRadioInterferenceGeoJSON()
        color = '#9B59B6' // 電波干渉区域用カラー
      } else if (restrictionId === 'manned-aircraft-zones') {
        geojson = generateMannedAircraftZonesGeoJSON()
        color = '#3498DB' // 有人機発着区域用カラー
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
                paint: { 'fill-color': color, 'fill-opacity': opacity }
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
          paint: { 'fill-color': color, 'fill-opacity': opacity }
        })
        map.addLayer({
          id: `${restrictionId}-outline`,
          type: 'line',
          source: restrictionId,
          paint: { 'line-color': color, 'line-width': 2 }
        })
        // テキストラベルを追加
        map.addLayer({
          id: `${restrictionId}-labels`,
          type: 'symbol',
          source: restrictionId,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#333',
            'text-halo-color': '#fff',
            'text-halo-width': 1.5
          }
        })
      } else if (map.getLayer(restrictionId)) {
        map.setLayoutProperty(restrictionId, 'visibility', 'visible')
        map.setLayoutProperty(`${restrictionId}-outline`, 'visibility', 'visible')
        if (map.getLayer(`${restrictionId}-labels`)) {
          map.setLayoutProperty(`${restrictionId}-labels`, 'visibility', 'visible')
        }
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
        if (map.getLayer(`${restrictionId}-labels`)) {
          map.setLayoutProperty(`${restrictionId}-labels`, 'visibility', 'none')
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
          top: 80,
          width: 20,
          height: 40,
          background: darkMode ? 'rgba(30,30,40,0.9)' : 'rgba(255,255,255,0.9)',
          color: darkMode ? '#aaa' : '#666',
          border: 'none',
          borderRadius: '0 4px 4px 0',
          cursor: 'pointer',
          boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: 'left 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px'
        }}
        title={showLeftLegend ? 'サイドバーを閉じる' : 'サイドバーを開く'}
      >
        {showLeftLegend ? '◀' : '▶'}
      </button>

      {/* Left Legend Panel */}
      <aside style={{
        position: 'absolute',
        left: showLeftLegend ? 0 : -280,
        top: 0,
        bottom: 0,
        width: '280px',
        padding: '12px',
        backgroundColor: darkMode ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)',
        color: darkMode ? '#fff' : '#333',
        overflowY: 'auto',
        zIndex: 10,
        transition: 'left 0.3s ease, background-color 0.3s ease',
        boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
        fontSize: '14px'
      }}>

        {/* App Title */}
        <h1 style={{
          margin: '0 0 16px',
          fontSize: '16px',
          fontWeight: 700,
          color: darkMode ? '#fff' : '#333'
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
              border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: darkMode ? '#333' : '#fff',
              color: darkMode ? '#fff' : '#333'
            }}
          />
          {(searchResults.length > 0 || geoSearchResults.length > 0 || isGeoSearching) && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: darkMode ? '#333' : '#fff',
              border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
              borderRadius: '0 0 4px 4px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 100
            }}>
              {/* DID検索結果 */}
              {searchResults.length > 0 && (
                <>
                  <div style={{ padding: '4px 8px', fontSize: '10px', color: darkMode ? '#888' : '#666', backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5' }}>
                    人口集中地区
                  </div>
                  {searchResults.map((item, index) => (
                    <div
                      key={`did-${item.prefName}-${item.cityName}-${index}`}
                      onClick={() => { flyToFeature(item); setSearchTerm(''); }}
                      style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        borderBottom: `1px solid ${darkMode ? '#444' : '#eee'}`,
                        fontSize: '12px',
                        color: darkMode ? '#fff' : '#333'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#f0f0f0'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <span style={{ color: darkMode ? '#aaa' : '#888', marginRight: '4px' }}>{item.prefName}</span>
                      {item.cityName}
                    </div>
                  ))}
                </>
              )}
              {/* ジオコーディング結果 */}
              {isGeoSearching && (
                <div style={{ padding: '8px', fontSize: '12px', color: darkMode ? '#aaa' : '#666', textAlign: 'center' }}>
                  検索中...
                </div>
              )}
              {geoSearchResults.length > 0 && (
                <>
                  <div style={{ padding: '4px 8px', fontSize: '10px', color: darkMode ? '#888' : '#666', backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5' }}>
                    地名・建物名
                  </div>
                  {geoSearchResults.map((result, index) => (
                    <div
                      key={`geo-${result.lat}-${result.lng}-${index}`}
                      onClick={() => flyToGeoResult(result)}
                      style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        borderBottom: `1px solid ${darkMode ? '#444' : '#eee'}`,
                        fontSize: '12px',
                        color: darkMode ? '#fff' : '#333'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#f0f0f0'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ fontWeight: 500 }}>{result.displayName.split(',')[0]}</div>
                      <div style={{ fontSize: '10px', color: darkMode ? '#888' : '#999', marginTop: '2px' }}>
                        {result.displayName.split(',').slice(1, 3).join(',')}
                      </div>
                    </div>
                  ))}
                </>
              )}
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
                  backgroundColor: baseMap === key ? '#4a90d9' : (darkMode ? '#444' : '#f0f0f0'),
                  color: baseMap === key ? '#fff' : (darkMode ? '#fff' : '#333'),
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
          <label style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666' }}>
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
            <span style={{ fontSize: '14px' }}>ツールチップ表示 [T]</span>
          </label>
        </div>

        {/* Drawing Tools - サイドバー内に埋め込み */}
        <DrawingTools
          map={mapRef.current}
          darkMode={darkMode}
          embedded={true}
        />

        {/* Restriction Areas Section */}
        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#222' : '#f8f8f8', borderRadius: '4px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`, paddingBottom: '4px' }}>
            禁止エリア
          </h3>

          {/* Airport airspace */}
          <label title="空港周辺の一定範囲内：無人機飛行は許可が必要 [A]" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('airport-airspace')}
              onChange={() => toggleRestriction('airport-airspace')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.airport, borderRadius: '2px' }} />
            <span>空港など周辺空域 [A]</span>
          </label>

          {/* DID */}
          <label title="人口が密集している地区：航空法により飛行に許可が必要な区域 [D]" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.DID_ALL_JAPAN')}
              onChange={() => toggleRestriction('ZONE_IDS.DID_ALL_JAPAN')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: '#FF0000', borderRadius: '2px' }} />
            <span>人口集中地区（全国） [D]</span>
          </label>

          {/* Emergency airspace */}
          <label title="緊急用務空域（見本データ）：警察・消防などの緊急活動が必要な区域 [E]" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.EMERGENCY_AIRSPACE')}
              onChange={() => toggleRestriction('ZONE_IDS.EMERGENCY_AIRSPACE')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.emergency, borderRadius: '2px' }} />
            <span>(見本)緊急用務空域 [E]</span>
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

          {/* Heliports */}
          <label title="ヘリポート [H]：ビル屋上・病院等のヘリポート周辺空域" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('heliports')}
              onChange={() => toggleRestriction('heliports')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: '#FF6B6B', borderRadius: '2px' }} />
            <span>ヘリポート [H]</span>
          </label>

          {/* Radio Interference */}
          <label title="電波干渉区域：電波塔・放送局周辺のドローン制御に影響を与える可能性がある区域" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('radio-interference')}
              onChange={() => toggleRestriction('radio-interference')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: '#9B59B6', borderRadius: '2px' }} />
            <span>電波干渉区域</span>
          </label>

          {/* Manned Aircraft Zones */}
          <label title="有人機発着区域：農薬散布ヘリ・グライダー・水上機等の発着場周辺" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRestrictionVisible('manned-aircraft-zones')}
              onChange={() => toggleRestriction('manned-aircraft-zones')}
            />
            <span style={{ width: '14px', height: '14px', backgroundColor: '#3498DB', borderRadius: '2px' }} />
            <span>有人機発着区域</span>
          </label>

          {/* No-fly law section */}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}` }}>
            <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>小型無人機等飛行禁止法</div>

            <label title="飛行禁止区域：許可を得ずに飛行できません [R]" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isRestrictionVisible('ZONE_IDS.NO_FLY_RED')}
                onChange={() => toggleRestriction('ZONE_IDS.NO_FLY_RED')}
              />
              <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.no_fly_red, borderRadius: '2px' }} />
              <span>レッドゾーン [R]</span>
            </label>

            <label title="要許可区域：許可申請を得て条件を満たすことで飛行できます [Y]" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isRestrictionVisible('ZONE_IDS.NO_FLY_YELLOW')}
                onChange={() => toggleRestriction('ZONE_IDS.NO_FLY_YELLOW')}
              />
              <span style={{ width: '14px', height: '14px', backgroundColor: RESTRICTION_COLORS.no_fly_yellow, borderRadius: '2px' }} />
              <span>イエローゾーン [Y]</span>
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
                  backgroundColor: darkMode ? '#333' : '#f0f0f0',
                  color: darkMode ? '#fff' : '#333',
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
                      style={{ flex: 1, padding: '2px 4px', fontSize: '12px', backgroundColor: darkMode ? '#444' : '#e8e8e8', color: darkMode ? '#fff' : '#333', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
                    >
                      全て表示
                    </button>
                    <button
                      onClick={() => disableAllInGroup(group)}
                      style={{ flex: 1, padding: '2px 4px', fontSize: '12px', backgroundColor: darkMode ? '#444' : '#e8e8e8', color: darkMode ? '#fff' : '#333', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
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
          top: 80,
          width: 20,
          height: 40,
          background: darkMode ? 'rgba(30,30,40,0.9)' : 'rgba(255,255,255,0.9)',
          color: darkMode ? '#aaa' : '#666',
          border: 'none',
          borderRadius: '4px 0 0 4px',
          cursor: 'pointer',
          boxShadow: '-2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: 'right 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px'
        }}
        title={showRightLegend ? 'サイドバーを閉じる' : 'サイドバーを開く'}
      >
        {showRightLegend ? '▶' : '◀'}
      </button>

      {/* Right Legend Panel */}
      <aside style={{
        position: 'absolute',
        right: showRightLegend ? 0 : -200,
        top: 0,
        bottom: 0,
        width: '200px',
        padding: '12px',
        backgroundColor: darkMode ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)',
        color: darkMode ? '#fff' : '#333',
        overflowY: 'auto',
        zIndex: 10,
        transition: 'right 0.3s ease, background-color 0.3s ease',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
        fontSize: '14px'
      }}>

        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`, paddingBottom: '4px' }}>
          環境情報
        </h3>

        {/* Geographic Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>地理情報</div>
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
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>天候情報</div>

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
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>電波種</div>
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

      {/* Dark Mode Toggle - ナビコントロールの下に配置 */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        style={{
          position: 'fixed',
          top: 120,
          right: showRightLegend ? 220 : 12,
          padding: '6px',
          width: 30,
          height: 30,
          backgroundColor: darkMode ? '#333' : '#fff',
          color: darkMode ? '#fff' : '#333',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          zIndex: 1000,
          transition: 'right 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={darkMode ? 'ライトモードに切替' : 'ダークモードに切替'}
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      {/* 2D/3D Toggle */}
      <button
        onClick={toggle3DMode}
        style={{
          position: 'fixed',
          top: 158,
          right: showRightLegend ? 220 : 12,
          padding: '6px',
          width: 30,
          height: 30,
          backgroundColor: is3DMode ? '#3388ff' : (darkMode ? '#333' : '#fff'),
          color: is3DMode ? '#fff' : (darkMode ? '#fff' : '#333'),
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          zIndex: 1000,
          transition: 'right 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={is3DMode ? '2Dビューに切替' : '3Dビューに切替'}
      >
        {is3DMode ? '3D' : '2D'}
      </button>

      {/* Help Button */}
      <button
        onClick={() => setShowHelp(true)}
        style={{
          position: 'fixed',
          top: 196,
          right: showRightLegend ? 220 : 12,
          padding: '6px',
          width: 30,
          height: 30,
          backgroundColor: darkMode ? '#333' : '#fff',
          color: darkMode ? '#fff' : '#333',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          zIndex: 1000,
          transition: 'right 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="ヘルプ [?]"
      >
        ?
      </button>

      {/* Help Modal */}
      {showHelp && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#2a2a2a' : '#fff',
              color: darkMode ? '#fff' : '#333',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '400px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>キーボードショートカット</h2>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: darkMode ? '#aaa' : '#666'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '14px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: darkMode ? '#4a90d9' : '#2563eb' }}>禁止エリア表示</div>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: '4px 8px' }}>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>D</kbd>
                  <span>人口集中地区（DID）</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>A</kbd>
                  <span>空港周辺空域</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>R</kbd>
                  <span>レッドゾーン（飛行禁止）</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>Y</kbd>
                  <span>イエローゾーン（要許可）</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>E</kbd>
                  <span>緊急用務空域</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>H</kbd>
                  <span>ヘリポート</span>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: darkMode ? '#4a90d9' : '#2563eb' }}>表示設定</div>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: '4px 8px' }}>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>T</kbd>
                  <span>ツールチップ表示の切替</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>2</kbd>
                  <span>2D表示</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>3</kbd>
                  <span>3D表示</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>?</kbd>
                  <span>ヘルプ表示</span>
                  <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 6px', borderRadius: '3px', textAlign: 'center' }}>Esc</kbd>
                  <span>ヘルプを閉じる</span>
                </div>
              </div>

              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}`, fontSize: '12px', color: darkMode ? '#888' : '#666' }}>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>検索機能：</strong>住所・建物名・地名で検索すると、該当地点にズームします。
                </p>
                <p style={{ margin: 0 }}>
                  <strong>データソース：</strong>DIDデータは政府統計の総合窓口(e-Stat)より。禁止区域は参考データです。飛行前は必ずDIPSで最新情報を確認してください。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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
