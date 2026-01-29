import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import styles from './App.module.css'
import {
  BASE_MAPS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LAYER_GROUPS,
  GEO_OVERLAYS,
  FACILITY_LAYERS,
  CRITICAL_FACILITY_LAYERS,
  REFERENCE_FACILITY_LAYERS,
  RESTRICTION_COLORS,
  getAllRestrictionZones,
  getFacilityLayerById,
  AirportService,
  KOKUAREA_STYLE,
  fillKokuareaTileUrl,
  getVisibleTileXYZs,
  classifyKokuareaSurface,
  createLayerIdToNameMap,
  fetchRainRadarTimestamp,
  buildRainTileUrl,
  generateAirportGeoJSON,
  generateHeliportGeoJSON,
  generateRedZoneGeoJSON,
  generateYellowZoneGeoJSON,
  generateBuildingsGeoJSON,
  generateWindFieldGeoJSON,
  generateLTECoverageGeoJSON,
  calculateBBox,
  mergeBBoxes,
  bboxesIntersect,
  getCustomLayers,
  getAllLayers,
  getAllPrefectureLayerIds,
  searchAddress,
  getZoomBounds,
  quickSearch,
  ISHIKAWA_NOTO_COMPARISON_LAYERS
} from './lib'
import type { GeocodingResult } from './lib'
import type {
  BaseMapKey,
  LayerConfig,
  LayerGroup,
  SearchIndexItem,
  LayerState,
  CustomLayer,
  KokuareaFeatureProperties,
  RestrictionZone
} from './lib'
import { AppHeader, CustomLayerManager, ContextMenu, type MenuItem } from './components'
import {
  DrawingTools,
  type DrawnFeature,
  type UndoRedoHandlers,
  type UndoRedoState
} from './components/DrawingTools'
import { FocusCrosshair, type CrosshairDesign } from './components/FocusCrosshair'
import { Modal } from './components/Modal'
// NOTE: 右下の比較パネル（重複ボタン）は廃止し、隆起表示は右上UIに統一
import { ToastContainer } from './components/Toast'
import { DialogContainer } from './components/Dialog'
import { fetchGeoJSONWithCache, clearOldCaches } from './lib/cache'
import { toast } from './utils/toast'
import { getAppTheme } from './styles/theme'
import {
  useTheme,
  useSidebarResize,
  useLayerState,
  useRestrictionState,
  useCoordinateTools,
  saveMapViewState,
  loadMapViewState,
  saveRestrictionVisibility,
  loadRestrictionVisibility
} from './lib/hooks'
import {
  findNearestPrefecture,
  getPrefectureForecast,
  getWeatherDescription,
  formatDailyDate
} from './lib/services/weatherApi'
import { WeatherForecastPanel } from './components/weather/WeatherForecastPanel'
import { NationwideWeatherMap } from './components/weather/NationwideWeatherMap'
import { convertDecimalToDMS } from './lib/utils/geo'

// ============================================
// Zone ID Constants
// ============================================
const ZONE_IDS = {
  DID_ALL_JAPAN: 'ZONE_IDS.DID_ALL_JAPAN',
  AIRPORT: 'airport',
  NO_FLY_RED: 'ZONE_IDS.NO_FLY_RED',
  NO_FLY_YELLOW: 'ZONE_IDS.NO_FLY_YELLOW'
} as const

// ============================================
// Helper Functions
// ============================================
/**
 * Check if a layer ID represents a DID layer (regional 'did-XX' or batch-loaded)
 */
const isDIDLayer = (layerId: string): boolean =>
  layerId.startsWith('did-') || layerId.startsWith(ZONE_IDS.DID_ALL_JAPAN)

/**
 * Get layers that intersect with the current viewport
 * @param map MapLibre GL map instance
 * @param layers Array of layer configurations
 * @returns Array of layers that intersect with viewport
 */
const getLayersInViewport = (
  map: maplibregl.Map,
  layers: LayerConfig[]
): LayerConfig[] => {
  const bounds = map.getBounds()
  const viewportBBox: [[number, number], [number, number]] = [
    [bounds.getWest(), bounds.getSouth()],
    [bounds.getEast(), bounds.getNorth()]
  ]

  return layers.filter((layer) => {
    if (!layer.bounds) {
      // If bounds not available, include it (fallback to load all)
      return true
    }
    return bboxesIntersect(viewportBBox, layer.bounds)
  })
}

// ============================================
// UI Settings Constants
// ============================================
const DID_BATCH_LOAD_SIZE = 7
const SETTINGS_EXPIRATION_DAYS = 30
const SETTINGS_EXPIRATION_MS = SETTINGS_EXPIRATION_DAYS * 24 * 60 * 60 * 1000

// ============================================
// Comparison (Ishikawa 2020 vs Noto 2024) Constants
// ============================================
const COMPARISON_ALLOWED_IDS = new Set(ISHIKAWA_NOTO_COMPARISON_LAYERS.map((l) => l.id))
const COMPARISON_VIS_URL_PARAM = 'cmpv'

// DID UI state persistence
const DID_EXPANDED_GROUPS_KEY = 'did-expanded-groups'

// 一時的なマップビュー保持（ベースマップ切替のリロード対策）
type MapViewState = {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

const MAP_VIEW_STATE_KEY = 'map-view-state-once'
const RESTRICTION_VIS_KEY = 'restriction-visible-ids'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseMapViewState = (value: unknown): MapViewState | null => {
  if (!isRecord(value)) return null

  const center = value.center
  const zoom = value.zoom
  const pitch = value.pitch
  const bearing = value.bearing

  if (!Array.isArray(center) || center.length !== 2) return null
  const [lng, lat] = center
  if (typeof lng !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return null
  if (typeof pitch !== 'number' || !Number.isFinite(pitch)) return null
  if (typeof bearing !== 'number' || !Number.isFinite(bearing)) return null

  return { center: [lng, lat], zoom, pitch, bearing }
}

const readMapViewStateFromSessionStorage = (): MapViewState | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(MAP_VIEW_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    const state = parseMapViewState(parsed)
    sessionStorage.removeItem(MAP_VIEW_STATE_KEY)
    return state
  } catch {
    try {
      sessionStorage.removeItem(MAP_VIEW_STATE_KEY)
    } catch {
      // ignore
    }
    return null
  }
}

const saveMapViewStateToSessionStorage = (state: MapViewState): void => {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(MAP_VIEW_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

const parseRestrictionVisibility = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  const ids = value.filter((v): v is string => typeof v === 'string' && v.length > 0)
  return ids.length > 0 ? ids : null
}

const readRestrictionVisibilityFromSessionStorage = (): string[] | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(RESTRICTION_VIS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return parseRestrictionVisibility(parsed)
  } catch {
    return null
  }
}

const saveRestrictionVisibilityToSessionStorage = (ids: string[]): void => {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(RESTRICTION_VIS_KEY, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

// ============================================
// Main App Component
// ============================================
function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const popupAutoCloseTimerRef = useRef<number | null>(null)
  const tooltipAutoFadeRef = useRef(true)
  const showTooltipRef = useRef(false)
  const restrictionStatesRef = useRef<Map<string, boolean>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mapStateRef = useRef<{
    center: [number, number]
    zoom: number
    pitch: number
    bearing: number
  }>({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: 0,
    bearing: 0
  })
  const previousFeaturesRef = useRef<DrawnFeature[]>([])
  const enableCoordinateDisplayRef = useRef(true)
  // Initialize refs with localStorage values to match state
  const getStoredCoordClickType = (): 'right' | 'left' | 'both' => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { coordClickType: saved } = JSON.parse(stored)
        if (saved === 'right' || saved === 'left' || saved === 'both') return saved
      }
    } catch {
      /* ignore */
    }
    return 'right'
  }
  const getStoredCoordDisplayPosition = (): 'click' | 'fixed' => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { coordDisplayPosition: saved } = JSON.parse(stored)
        if (saved === 'click' || saved === 'fixed') return saved
      }
    } catch {
      /* ignore */
    }
    return 'click'
  }
  const coordClickTypeRef = useRef(getStoredCoordClickType())
  const coordDisplayPositionRef = useRef(getStoredCoordDisplayPosition())
  const coordFormatRef = useRef<'decimal' | 'dms'>('decimal')
  const comparisonLayerBoundsRef = useRef<Map<string, [[number, number], [number, number]]>>(
    new Map()
  )
  // DID GeoJSONキャッシュ（衝突検出用）
  // Removed: didGeoJSONCacheRef - Now retrieve directly from MapLibre GL sources to reduce memory duplication
  // 禁止エリアGeoJSONキャッシュ（空港、レッド/イエローゾーン用）
  const restrictionGeoJSONCacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map())
  const debugRunIdRef = useRef<string>('')
  const comparisonIdleDebugKeysRef = useRef<Set<string>>(new Set())
  const comparisonLayerVisibilityRef = useRef<Set<string>>(new Set())
  // Ref to keep layerStates current in event handlers (avoid stale closures)
  const layerStatesRef = useRef<Map<string, LayerState>>(new Map())
  const weatherStatesRef = useRef<Map<string, boolean>>(new Map())

  // State
  const [layerStates, setLayerStates] = useState<Map<string, LayerState>>(new Map())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DID_EXPANDED_GROUPS_KEY)
      if (!raw) return new Set<string>(['関東'])
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return new Set<string>(['関東'])
      const names = parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
      const allowed = new Set(LAYER_GROUPS.map((g) => g.name))
      const filtered = names.filter((n) => allowed.has(n))
      // 保存値が空（= 全部閉じた）場合も尊重する
      return new Set<string>(filtered)
    } catch {
      return new Set<string>(['関東'])
    }
  })
  const [didGroupColorMode, setDidGroupColorMode] = useState<Map<string, 'default' | 'red'>>(
    () => new Map()
  )
  const [mapLoaded, setMapLoaded] = useState(false)
  const [opacity, setOpacity] = useState(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { opacity: saved } = JSON.parse(stored)
        if (typeof saved === 'number' && Number.isFinite(saved)) return saved
      }
    } catch {
      // ignore
    }
    return 0.5
  })
  const [baseMap] = useState<BaseMapKey>(() => {
    // localStorageから保存されたベースマップを読み込み
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { baseMap: savedBaseMap, timestamp } = JSON.parse(stored)
        const now = Date.now()

        // 期限内なら保存された設定を使用
        if (timestamp && now - timestamp < SETTINGS_EXPIRATION_MS && savedBaseMap) {
          return savedBaseMap as BaseMapKey
        }
      }
    } catch (e) {
      console.error('Failed to load baseMap from localStorage:', e)
    }
    return 'osm'
  })
  const [overlayStates, setOverlayStates] = useState<Map<string, boolean>>(new Map())
  const [weatherStates, setWeatherStates] = useState<Map<string, boolean>>(new Map())
  const [restrictionStates, setRestrictionStates] = useState<Map<string, boolean>>(() => {
    const stored = readRestrictionVisibilityFromSessionStorage()
    if (!stored) return new Map()
    return new Map(stored.map((id) => [id, true]))
  })
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
  const [showLeftLegend, setShowLeftLegend] = useState(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { showLeftLegend: saved } = JSON.parse(stored)
        return saved ?? true
      }
    } catch {
      // ignore
    }
    return true
  })
  const [showRightLegend, setShowRightLegend] = useState(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { showRightLegend: saved } = JSON.parse(stored)
        return saved ?? true
      }
    } catch {
      // ignore
    }
    return true
  })

  // Coordinate Info Panel
  // Sidebar Resizing
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { leftSidebarWidth: saved } = JSON.parse(stored)
        if (typeof saved === 'number' && Number.isFinite(saved)) return saved
      }
    } catch {
      // ignore
    }
    return 280
  })
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { rightSidebarWidth: saved } = JSON.parse(stored)
        if (typeof saved === 'number' && Number.isFinite(saved)) return saved
      }
    } catch {
      // ignore
    }
    return 220
  }) // 初期幅は少し狭め（右余白の無駄を削減）
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)

  // Tooltip visibility
  const [showTooltip, setShowTooltip] = useState(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { showTooltip: saved } = JSON.parse(stored)
        return saved ?? false
      }
    } catch {
      // ignore
    }
    return false
  })
  const [tooltipAutoFade, setTooltipAutoFade] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { tooltipAutoFade: saved } = JSON.parse(stored)
        return saved ?? true
      }
    } catch {
      // ignore
    }
    return true // デフォルト: 自動で消える
  })

  // Custom layers
  const [customLayerVisibility, setCustomLayerVisibility] = useState<Set<string>>(new Set())

  // 衝突検出用: 表示中のDIDレイヤーおよび禁止ゾーンのGeoJSONを結合
  const prohibitedAreas = useMemo<GeoJSON.FeatureCollection | undefined>(() => {
    // 個別の都道府県DIDレイヤー
    const visibleLayerIds = Array.from(layerStates.entries())
      .filter(([, state]) => state.visible)
      .map(([id]) => id)
      .filter((id) => id.startsWith('did-'))

    // 「飛行注意区域（全国DID）」が有効な場合、ビューポート内のDIDを使用（パフォーマンス向上のため、表示範囲内の都道府県のみを動的に読み込む）
    const isDIDAllJapanVisible = restrictionStates.get(ZONE_IDS.DID_ALL_JAPAN) ?? false

    const features: GeoJSON.Feature[] = []
    const map = mapRef.current
    if (!map) return undefined

    // Helper function to extract DID features from MapLibre GL source
    // Accepts both 'did-XX' (individual) and ZONE_IDS.DID_ALL_JAPAN (aggregated)
    const addDidFeaturesFromSource = (sourceId: string) => {
      const isDIDSource = sourceId.startsWith('did-') || sourceId === ZONE_IDS.DID_ALL_JAPAN
      if (!isDIDSource) return
      try {
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource
        if (source) {
          const sourceData = source.serialize().data as GeoJSON.FeatureCollection
          if (sourceData?.features) {
            const taggedFeatures = sourceData.features.map((f) => ({
              ...f,
              properties: { ...f.properties, zoneType: 'DID' }
            }))
            features.push(...taggedFeatures)
          }
        }
      } catch {
        // Source not yet loaded, skip
      }
    }

    // DIDレイヤー（zoneType: 'DID'を付与）
    // Retrieve directly from MapLibre GL sources instead of cache to reduce memory duplication
    if (isDIDAllJapanVisible) {
      // 全国DIDが有効な場合、統合ソースから取得
      addDidFeaturesFromSource(ZONE_IDS.DID_ALL_JAPAN)
    } else {
      // 個別レイヤーのみ
      for (const layerId of visibleLayerIds) {
        addDidFeaturesFromSource(layerId)
      }
    }

    // 禁止ゾーン（空港、レッドゾーン、イエローゾーン）
    // キャッシュ済みの禁止ゾーンを追加（すでにzoneTypeが設定済み）
    for (const [, cached] of restrictionGeoJSONCacheRef.current.entries()) {
      features.push(...cached.features)
    }

    if (features.length === 0) return undefined

    return {
      type: 'FeatureCollection',
      features
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerStates, restrictionStates])

  // Weather Forecast Panel
  const [showWeatherForecast, setShowWeatherForecast] = useState(false)
  const [selectedPrefectureId, setSelectedPrefectureId] = useState<string | undefined>()
  const [enableWeatherClick, setEnableWeatherClick] = useState(false)
  const [showNationwideWeather, setShowNationwideWeather] = useState(false)
  // ローディング状態管理（レイヤーID -> 表示名）
  const [loadingLayers, setLoadingLayers] = useState<Map<string, string>>(new Map())
  // プログレスバーの表示状態（フェードアウト用）
  const [showProgressBar, setShowProgressBar] = useState(false)
  const enableWeatherClickRef = useRef(false)
  const weatherPopupRef = useRef<maplibregl.Popup | null>(null)

  const getGeoJSONBounds = (
    geojson: GeoJSON.FeatureCollection
  ): [[number, number], [number, number]] | null => {
    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity
    let hasPoint = false

    const extend = (coord: GeoJSON.Position) => {
      const lng = coord[0]
      const lat = coord[1]
      hasPoint = true
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }

    const visitGeometry = (geometry: GeoJSON.Geometry) => {
      switch (geometry.type) {
        case 'Point':
          extend(geometry.coordinates)
          break
        case 'MultiPoint':
        case 'LineString':
          geometry.coordinates.forEach(extend)
          break
        case 'MultiLineString':
        case 'Polygon':
          geometry.coordinates.forEach((coords) => {
            coords.forEach(extend)
          })
          break
        case 'MultiPolygon':
          geometry.coordinates.forEach((poly) => {
            poly.forEach((ring) => {
              ring.forEach(extend)
            })
          })
          break
        case 'GeometryCollection':
          geometry.geometries.forEach((geom) => visitGeometry(geom))
          break
        default:
          break
      }
    }

    geojson.features.forEach((feature) => {
      if (feature.geometry) visitGeometry(feature.geometry)
    })

    if (!hasPoint) return null
    return [
      [minLng, minLat],
      [maxLng, maxLat]
    ]
  }

  // Ishikawa Noto Comparison layers
  type ComparisonSettings = {
    opacity: Record<string, number>
    timestamp: number
  }

  const COMPARISON_SETTINGS_KEY = 'comparison-settings'

  const loadComparisonSettings = (): { visible: Set<string>; opacity: Map<string, number> } => {
    // 初期は必ずOFF（ユーザー要望）。地図切替時の保持は URL パラメータで実現する。
    const visible = new Set<string>()

    try {
      const raw = localStorage.getItem(COMPARISON_SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ComparisonSettings>
        const opacityObj =
          parsed.opacity && typeof parsed.opacity === 'object' ? parsed.opacity : {}
        const opacityMap = new Map<string, number>()
        for (const [k, v] of Object.entries(opacityObj as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v)) {
            opacityMap.set(k, Math.min(1, Math.max(0, v)))
          }
        }
        return { visible, opacity: opacityMap }
      }
    } catch {
      // ignore
    }

    // デフォルト: いきなり地図が変わるのを避けるためOFF
    return {
      visible: new Set<string>(),
      opacity: new Map<string, number>([['terrain-2024-noto', 0.5]])
    }
  }

  const initialComparison = loadComparisonSettings()
  const readComparisonVisibilityFromUrl = (): Set<string> => {
    try {
      const url = new URL(window.location.href)
      const raw = url.searchParams.get(COMPARISON_VIS_URL_PARAM)
      if (!raw) return new Set<string>()
      const decoded = decodeURIComponent(raw)
      const parts = decoded
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const filtered = parts.filter((id) => COMPARISON_ALLOWED_IDS.has(id))
      const set = new Set<string>(filtered)
      return set
    } catch {
      return new Set<string>()
    }
  }

  const [comparisonLayerVisibility, setComparisonLayerVisibility] = useState<Set<string>>(() => {
    const fromUrl = readComparisonVisibilityFromUrl()
    return fromUrl.size > 0 ? fromUrl : initialComparison.visible
  })
  const [comparisonLayerOpacity, setComparisonLayerOpacity] = useState<Map<string, number>>(() => {
    // 欠けているキーがあっても最低限のデフォルトを補完
    const base = new Map<string, number>([['terrain-2024-noto', 0.5]])
    initialComparison.opacity.forEach((v, k) => base.set(k, v))
    return base
  })

  // Sync state values to refs to avoid stale closures in event handlers
  useEffect(() => {
    layerStatesRef.current = layerStates
  }, [layerStates])

  useEffect(() => {
    weatherStatesRef.current = weatherStates
  }, [weatherStates])

  useEffect(() => {
    restrictionStatesRef.current = restrictionStates
  }, [restrictionStates])

  // 最新の比較可視状態をrefに同期（地図切替の直前退避でクロージャが古くならないように）
  useEffect(() => {
    comparisonLayerVisibilityRef.current = comparisonLayerVisibility
  }, [comparisonLayerVisibility])

  // 簡易モード：比較は「標準(osm)」ベースマップのみ対応
  const isComparisonSupported = baseMap === 'osm'

  // 非対応ベースマップでは比較レイヤーを強制OFF（挙動を最低限にする）
  useEffect(() => {
    if (isComparisonSupported) return
    if (comparisonLayerVisibility.size === 0) return
    const next = new Set<string>()
    comparisonLayerVisibilityRef.current = next
    setComparisonLayerVisibility(next)
  }, [isComparisonSupported, comparisonLayerVisibility])

  // URLに載った比較状態はロード後に消す（手動リロードで初期OFFに戻す）
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (!url.searchParams.has(COMPARISON_VIS_URL_PARAM)) return
      url.searchParams.delete(COMPARISON_VIS_URL_PARAM)
      window.history.replaceState({}, '', url.toString())
    } catch {
      // ignore
    }
  }, [])

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => {
    // localStorageから設定を読み込み（1ヶ月期限）
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { darkMode: savedDarkMode, timestamp } = JSON.parse(stored)
        const now = Date.now()

        // 期限内なら保存された設定を使用
        if (timestamp && now - timestamp < SETTINGS_EXPIRATION_MS) {
          return savedDarkMode ?? false
        }

        // 期限切れなら削除
        localStorage.removeItem('ui-settings')
      }
    } catch (e) {
      console.error('Failed to load UI settings:', e)
    }
    return false
  })

  const theme = getAppTheme(darkMode)

  // Sync theme to document for CSS Modules
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  // 3D mode
  const [is3DMode, setIs3DMode] = useState(false)

  // Help modal
  const [showHelp, setShowHelp] = useState(false)

  // Context menu state for right-click menu
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    lngLat: { lng: number; lat: number }
    restrictionInfo?: string
  } | null>(null)

  // Track active drawing mode to prevent context menu while drawing
  const [activeDrawMode, setActiveDrawMode] = useState<
    'none' | 'polygon' | 'circle' | 'point' | 'line'
  >('none')

  // Helper to get stored coordinate format
  const getStoredCoordFormat = (): 'decimal' | 'dms' => {
    try {
      const stored = localStorage.getItem('coord-format')
      if (stored === 'dms' || stored === 'decimal') return stored
    } catch {
      /* ignore */
    }
    return 'decimal'
  }

  // Coordinate format selection (decimal or DMS)
  const [coordFormat, setCoordFormat] = useState<'decimal' | 'dms'>(() => getStoredCoordFormat())

  // Zoom level (always-visible UI)
  const [mapZoom, setMapZoom] = useState<number | null>(null)

  const undoRedoHandlersRef = useRef<UndoRedoHandlers | null>(null)
  const [undoRedoState, setUndoRedoState] = useState<UndoRedoState>({
    canUndo: false,
    canRedo: false
  })

  // Enable coordinate display on map click
  const [enableCoordinateDisplay, setEnableCoordinateDisplay] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { enableCoordinateDisplay: savedSetting, timestamp } = JSON.parse(stored)
        const now = Date.now()

        // 期限内なら保存された設定を使用
        if (timestamp && now - timestamp < SETTINGS_EXPIRATION_MS) {
          return savedSetting ?? true
        }
      }
    } catch (e) {
      console.error('Failed to load coordinate display setting:', e)
    }
    return false // デフォルトはオフ
  })

  // Focus crosshair settings (default: visible with 'square' design)
  const [showFocusCrosshair, setShowFocusCrosshair] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { showFocusCrosshair: savedSetting } = JSON.parse(stored)
        return savedSetting ?? true
      }
    } catch {
      // ignore
    }
    return true // デフォルトはオン
  })
  const [crosshairDesign, setCrosshairDesign] = useState<CrosshairDesign>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { crosshairDesign: savedDesign } = JSON.parse(stored)
        if (savedDesign === 'square' || savedDesign === 'circle' || savedDesign === 'minimal') {
          return savedDesign
        }
      }
    } catch {
      // ignore
    }
    return 'square' // デフォルト
  })

  const [crosshairColor, setCrosshairColor] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { crosshairColor: saved } = JSON.parse(stored)
        if (saved) return saved
      }
    } catch {
      // ignore
    }
    return '#e53935' // デフォルト: 赤
  })

  // Flexible coordinate settings
  type CoordClickType = 'right' | 'left' | 'both'
  type CoordDisplayPosition = 'click' | 'fixed'

  const [crosshairClickCapture, setCrosshairClickCapture] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { crosshairClickCapture: saved } = JSON.parse(stored)
        return saved ?? false
      }
    } catch {
      // ignore
    }
    return true // デフォルト: クリック有効
  })

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
  // ベースマップ変更ハンドラ（リロード方式）
  // ============================================
  const handleBaseMapChange = useCallback(
    (newBaseMap: BaseMapKey) => {
      if (newBaseMap === baseMap) return
      const currentVisible = Array.from(comparisonLayerVisibilityRef.current.values())
      const url = new URL(window.location.href)
      if (currentVisible.length > 0) {
        url.searchParams.set(COMPARISON_VIS_URL_PARAM, encodeURIComponent(currentVisible.join(',')))
      } else {
        url.searchParams.delete(COMPARISON_VIS_URL_PARAM)
      }
      // 設定を保存
      try {
        const settings = {
          darkMode,
          baseMap: newBaseMap,
          enableCoordinateDisplay,
          showFocusCrosshair,
          crosshairDesign,
          crosshairClickCapture,
          tooltipAutoFade,
          crosshairColor,
          opacity,
          showTooltip,
          showLeftLegend,
          showRightLegend,
          leftSidebarWidth,
          rightSidebarWidth,
          timestamp: Date.now()
        }
        localStorage.setItem('ui-settings', JSON.stringify(settings))
      } catch (e) {
        console.error('Failed to save settings:', e)
      }

      // 現在のビューを一時保存（リロード後に復元）
      const map = mapRef.current
      if (map) {
        const center = map.getCenter()
        saveMapViewStateToSessionStorage({
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing()
        })
      }

      const restrictionVisibleIds = Array.from(restrictionStatesRef.current.entries())
        .filter(([, isVisible]) => isVisible)
        .map(([id]) => id)
      saveRestrictionVisibilityToSessionStorage(restrictionVisibleIds)

      // URLパラメータに比較状態を載せてリロード
      window.location.assign(url.toString())
    },
    [baseMap, darkMode]
  )

  // ============================================
  // Save UI settings to localStorage
  // ============================================
  useEffect(() => {
    try {
      const settings = {
        darkMode,
        baseMap,
        enableCoordinateDisplay,
        showFocusCrosshair,
        crosshairDesign,
        crosshairClickCapture,
        tooltipAutoFade,
        crosshairColor,
        opacity,
        showTooltip,
        showLeftLegend,
        showRightLegend,
        leftSidebarWidth,
        rightSidebarWidth,
        timestamp: Date.now()
      }
      localStorage.setItem('ui-settings', JSON.stringify(settings))
    } catch (e) {
      console.error('Failed to save UI settings:', e)
    }
  }, [
    darkMode,
    baseMap,
    enableCoordinateDisplay,
    showFocusCrosshair,
    crosshairDesign,
    crosshairClickCapture,
    tooltipAutoFade,
    crosshairColor,
    opacity,
    showTooltip,
    showLeftLegend,
    showRightLegend,
    leftSidebarWidth,
    rightSidebarWidth
  ])

  // ============================================
  // Save comparison settings (persist across baseMap reload)
  // ============================================
  useEffect(() => {
    try {
      const payload: ComparisonSettings = {
        opacity: Object.fromEntries(Array.from(comparisonLayerOpacity.entries())),
        timestamp: Date.now()
      }
      localStorage.setItem(COMPARISON_SETTINGS_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }, [comparisonLayerVisibility, comparisonLayerOpacity])

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

  useEffect(() => {
    const visibleIds = Array.from(restrictionStates.entries())
      .filter(([, isVisible]) => isVisible)
      .map(([id]) => id)
    saveRestrictionVisibilityToSessionStorage(visibleIds)
  }, [restrictionStates])

  // ============================================
  // Enable coordinate display ref sync
  // ============================================
  useEffect(() => {
    enableCoordinateDisplayRef.current = enableCoordinateDisplay
  }, [enableCoordinateDisplay])

  // Ref syncs
  useEffect(() => {
    tooltipAutoFadeRef.current = tooltipAutoFade
  }, [tooltipAutoFade])

  useEffect(() => {
    enableWeatherClickRef.current = enableWeatherClick
  }, [enableWeatherClick])

  // Note: enableCoordinateDisplay logic removed - now controlled by coordClickType setting

  // Listen for weather panel open event from popup
  useEffect(() => {
    const handleOpenWeatherPanel = (e: CustomEvent<string>) => {
      setSelectedPrefectureId(e.detail)
      setShowWeatherForecast(true)
    }
    window.addEventListener('openWeatherPanel', handleOpenWeatherPanel as EventListener)
    return () =>
      window.removeEventListener('openWeatherPanel', handleOpenWeatherPanel as EventListener)
  }, [])

  // Listen for weather popup close event from popup close button
  useEffect(() => {
    const handleCloseWeatherPopup = () => {
      if (weatherPopupRef.current) {
        weatherPopupRef.current.remove()
        weatherPopupRef.current = null
      }
    }
    window.addEventListener('closeWeatherPopup', handleCloseWeatherPopup)
    return () => window.removeEventListener('closeWeatherPopup', handleCloseWeatherPopup)
  }, [])

  // ============================================
  // Keyboard shortcuts
  // ============================================
  // Helpモーダルは、入力フォーカス中でも Escape で確実に閉じる
  useEffect(() => {
    if (!showHelp) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowHelp(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [showHelp])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      const key = e.key.toLowerCase()
      const isMod = e.metaKey || e.ctrlKey

      // Modifier key combinations (work even in input fields)
      if (isMod && key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      // 入力中は他のショートカット無視
      if (isInputFocused) {
        // Escapeで検索入力からフォーカスを外す
        if (key === 'escape') {
          ;(e.target as HTMLElement).blur()
          setSearchTerm('')
          setSearchResults([])
          setGeoSearchResults([])
        }
        return
      }

      switch (key) {
        case 'd':
          toggleRestriction(ZONE_IDS.DID_ALL_JAPAN)
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

        // [H] Heliport / Airport
        case 'h':
          toggleRestriction('facility-landing')
          break

        // [J] Jieitai (Self Defense Force / Military)
        case 'j':
          toggleRestriction('facility-military')
          break

        // [F] Fire Station
        case 'f':
          toggleRestriction('facility-fire')
          break

        // [O] Outpatient / Medical facilities
        case 'o':
          toggleRestriction('facility-medical')
          break

        // [S] Left Sidebar toggle
        case 's':
          setShowLeftLegend((prev: boolean) => !prev)
          break

        // [P] Right Panel (sidebar) toggle
        case 'p':
          setShowRightLegend((prev: boolean) => !prev)
          break

        // [W] Weather click mode toggle
        case 'w':
          setEnableWeatherClick((prev) => !prev)
          break
        // [C] Rain radar toggle
        case 'c':
          toggleWeatherOverlay('rain-radar')
          break

        // [M] Map style toggle (restored)
        case 'm':
          {
            const keys = Object.keys(BASE_MAPS) as BaseMapKey[]
            const currentIndex = keys.indexOf(baseMap)
            const nextIndex = (currentIndex + 1) % keys.length
            const prevIndex = (currentIndex - 1 + keys.length) % keys.length
            handleBaseMapChange(keys[e.shiftKey ? prevIndex : nextIndex])
          }
          break
        case '2':
          // 2Dモードに切り替え
          if (mapRef.current) {
            setIs3DMode(false)
            mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 500 })
          }
          break
        case '3':
          // 3Dモードに切り替え
          if (mapRef.current) {
            setIs3DMode(true)
            mapRef.current.easeTo({ pitch: 60, duration: 500 })
          }
          break
        case 'l':
          // ダーク/ライトモード切り替え
          setDarkMode((prev: boolean) => !prev)
          break
        case 'x':
          // 中心十字表示切り替え
          setShowFocusCrosshair((prev: boolean) => !prev)
          break
        case 't':
          // ツールチップ表示切り替え
          setShowTooltip((prev: boolean) => !prev)
          break
        case '?':
        case '/':
          e.preventDefault()
          setShowHelp((prev: boolean) => !prev)
          break
        case 'escape':
          // Close weather popup first, then panel, then help
          if (weatherPopupRef.current) {
            weatherPopupRef.current.remove()
            weatherPopupRef.current = null
          } else if (showWeatherForecast) {
            setShowWeatherForecast(false)
            setSelectedPrefectureId(undefined)
          } else {
            setShowHelp(false)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mapLoaded, baseMap, handleBaseMapChange, showWeatherForecast])

  // ============================================
  // Search functionality (DID + Geocoding)
  // ============================================
  // DID検索
  const performDIDSearch = useCallback(
    (term: string) => {
      if (!term) {
        setSearchResults([])
        return []
      }
      const results = searchIndex.filter(
        (item) => item.cityName.includes(term) || item.prefName.includes(term)
      )
      const uniqueResults = Array.from(
        new Map(results.map((item) => [item.prefName + item.cityName, item])).values()
      )
      const sliced = uniqueResults.slice(0, 5)
      setSearchResults(sliced)
      return sliced
    },
    [searchIndex]
  )

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

  // Build context menu items
  const buildContextMenuItems = useCallback((): MenuItem[] => {
    if (!contextMenu) return []

    const { lngLat } = contextMenu

    // Format coordinates based on selected format
    let coordStr: string
    if (coordFormat === 'dms') {
      const latDMS = convertDecimalToDMS(lngLat.lat, true, 'ja')
      const lngDMS = convertDecimalToDMS(lngLat.lng, false, 'ja')
      coordStr = `${latDMS} ${lngDMS}`
    } else {
      coordStr = `${lngLat.lng.toFixed(4)}, ${lngLat.lat.toFixed(4)}`
    }

    return [
      {
        id: 'coordinates-display',
        type: 'header',
        label: `📍 ${coordStr}`
      },
      {
        id: 'copy-coordinates',
        label: '📋 コピー',
        action: 'copy-coordinates'
      },
      {
        id: 'coord-format-menu',
        label: '座標形式',
        submenu: [
          {
            id: 'format-decimal',
            label: '10進数 (例: 35.6812)',
            checked: coordFormat === 'decimal',
            action: 'set-coord-format-decimal'
          },
          {
            id: 'format-dms',
            label: '60進数 (例: 35°40\'53")',
            checked: coordFormat === 'dms',
            action: 'set-coord-format-dms'
          }
        ]
      },
      { id: 'divider-1', divider: true },
      {
        id: 'weather',
        label: 'この場所の天気予報',
        icon: '☁️',
        action: 'show-weather'
      },
      { id: 'divider-2', divider: true },
      {
        id: 'restriction-areas',
        label: '規制エリア',
        icon: '⚠️',
        submenu: [
          {
            id: 'nfz-header',
            type: 'header',
            label: 'NFZ（航空法：空港周辺空域）'
          },
          {
            id: 'toggle-airport',
            label: '空港など周辺空域',
            shortcut: 'A',
            checked: restrictionStates.get('airport-airspace') ?? false,
            action: 'toggle-restriction',
            data: 'airport-airspace'
          },
          { id: 'divider-did', divider: true },
          {
            id: 'did-header',
            type: 'header',
            label: 'DID（航空法：人口集中地区）'
          },
          {
            id: 'toggle-did',
            label: '人口集中地区（全国）',
            shortcut: 'D',
            checked: restrictionStates.get(ZONE_IDS.DID_ALL_JAPAN) ?? false,
            action: 'toggle-restriction',
            data: ZONE_IDS.DID_ALL_JAPAN
          },
          { id: 'divider-critical', divider: true },
          {
            id: 'critical-header',
            type: 'header',
            label: '重要施設周辺空域（小型無人機等飛行禁止法）'
          },
          {
            id: 'toggle-military',
            label: '駐屯地・基地',
            shortcut: 'J',
            checked: restrictionStates.get('facility-military') ?? false,
            action: 'toggle-restriction',
            data: 'facility-military'
          },
          {
            id: 'toggle-red-zone',
            label: 'レッドゾーン',
            shortcut: 'R',
            checked: restrictionStates.get(ZONE_IDS.NO_FLY_RED) ?? false,
            action: 'toggle-restriction',
            data: ZONE_IDS.NO_FLY_RED
          },
          {
            id: 'toggle-yellow-zone',
            label: 'イエローゾーン',
            shortcut: 'Y',
            checked: restrictionStates.get(ZONE_IDS.NO_FLY_YELLOW) ?? false,
            action: 'toggle-restriction',
            data: ZONE_IDS.NO_FLY_YELLOW
          },
          { id: 'divider-reference', divider: true },
          {
            id: 'reference-header',
            type: 'header',
            label: '参考情報（※実際の飛行前はDIPS/NOTAM確認必須）'
          },
          {
            id: 'toggle-landing',
            label: '有人機発着地',
            shortcut: 'H',
            checked: restrictionStates.get('facility-landing') ?? false,
            action: 'toggle-restriction',
            data: 'facility-landing'
          },
          {
            id: 'toggle-fire',
            label: '消防署',
            shortcut: 'F',
            checked: restrictionStates.get('facility-fire') ?? false,
            action: 'toggle-restriction',
            data: 'facility-fire'
          },
          {
            id: 'toggle-medical',
            label: '医療機関',
            shortcut: 'O',
            checked: restrictionStates.get('facility-medical') ?? false,
            action: 'toggle-restriction',
            data: 'facility-medical'
          }
        ]
      },
      { id: 'divider-3', divider: true },
      {
        id: 'ui-controls',
        label: 'UI設定',
        icon: '⚙️',
        submenu: [
          {
            id: 'left-sidebar',
            label: '左サイドバー',
            shortcut: 'S',
            checked: showLeftLegend,
            action: 'toggle-left-sidebar'
          },
          {
            id: 'right-sidebar',
            label: '右サイドバー',
            shortcut: 'P',
            checked: showRightLegend,
            action: 'toggle-right-sidebar'
          },
          {
            id: 'dark-mode',
            label: 'ダークモード',
            shortcut: 'L',
            checked: darkMode,
            action: 'toggle-dark-mode'
          },
          { id: 'divider-ui-1', divider: true },
          {
            id: 'tooltip',
            label: 'ツールチップ',
            shortcut: 'T',
            checked: showTooltip,
            action: 'toggle-tooltip'
          },
          { id: 'divider-ui-2', divider: true },
          {
            id: 'crosshair-visible',
            label: '⊕ 中心十字',
            shortcut: 'X',
            checked: showFocusCrosshair,
            action: 'toggle-crosshair'
          }
        ]
      }
    ]
  }, [
    contextMenu,
    showLeftLegend,
    showRightLegend,
    darkMode,
    coordFormat,
    restrictionStates,
    showTooltip,
    showFocusCrosshair
  ])

  // Handle context menu actions
  const handleContextMenuAction = useCallback(
    (action: string, data?: any) => {
      switch (action) {
        case 'copy-coordinates': {
          if (contextMenu) {
            let coordStr: string
            if (coordFormat === 'dms') {
              const latDMS = convertDecimalToDMS(contextMenu.lngLat.lat, true, 'ja')
              const lngDMS = convertDecimalToDMS(contextMenu.lngLat.lng, false, 'ja')
              coordStr = `${latDMS} ${lngDMS}`
            } else {
              coordStr = `${contextMenu.lngLat.lng.toFixed(4)}, ${contextMenu.lngLat.lat.toFixed(4)}`
            }
            navigator.clipboard.writeText(coordStr).then(() => {
              toast.success('座標をコピーしました')
            })
          }
          break
        }

        case 'set-coord-format-decimal': {
          setCoordFormat('decimal')
          break
        }

        case 'set-coord-format-dms': {
          setCoordFormat('dms')
          break
        }

        case 'show-weather': {
          if (contextMenu) {
            const prefecture = findNearestPrefecture(contextMenu.lngLat.lat, contextMenu.lngLat.lng)
            if (prefecture) {
              setSelectedPrefectureId(prefecture.id)
              setShowWeatherForecast(true)
            }
          }
          break
        }

        case 'toggle-left-sidebar': {
          setShowLeftLegend((prev: boolean) => !prev)
          break
        }

        case 'toggle-right-sidebar': {
          setShowRightLegend((prev: boolean) => !prev)
          break
        }

        case 'toggle-dark-mode': {
          setDarkMode((prev: boolean) => !prev)
          break
        }

        case 'toggle-restriction': {
          if (data) {
            toggleRestriction(data)
          }
          break
        }

        case 'toggle-tooltip': {
          setShowTooltip((prev: boolean) => !prev)
          break
        }

        case 'toggle-crosshair': {
          setShowFocusCrosshair((prev: boolean) => !prev)
          break
        }

        default:
          break
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [contextMenu, coordFormat]
  )

  // Persist coordFormat to localStorage
  useEffect(() => {
    coordFormatRef.current = coordFormat
    // Persist to localStorage
    try {
      localStorage.setItem('coord-format', coordFormat)
    } catch {
      /* ignore */
    }
  }, [coordFormat])

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
      setLayerStates((prev: Map<string, LayerState>) => {
        const next = new Map(prev)
        next.set(item.layerId, { id: item.layerId, visible: true })
        return next
      })
    }
  }

  // ============================================
  // Cache cleanup on app initialization
  // ============================================
  useEffect(() => {
    clearOldCaches().catch((err) => {
      console.warn('Failed to clear old caches:', err)
    })
  }, [])

  // ============================================
  // Map initialization
  // ============================================
  useEffect(() => {
    if (!mapContainer.current) return

    // 既存のマップがある場合、現在の状態を保存してから破棄
    if (mapRef.current) {
      mapStateRef.current = {
        center: [mapRef.current.getCenter().lng, mapRef.current.getCenter().lat],
        zoom: mapRef.current.getZoom(),
        pitch: mapRef.current.getPitch(),
        bearing: mapRef.current.getBearing()
      }
      mapRef.current.remove()
      mapRef.current = null
      setMapLoaded(false)
    }

    // ベースマップ切替時に保存されたビュー状態があれば復元
    const restoredViewState = readMapViewStateFromSessionStorage()
    if (restoredViewState) {
      mapStateRef.current = restoredViewState
      setIs3DMode(restoredViewState.pitch > 0)
    }

    const styleConfig = BASE_MAPS[baseMap].style
    const mapConfig: maplibregl.MapOptions = {
      container: mapContainer.current,
      style: styleConfig as maplibregl.StyleSpecification | string,
      center: mapStateRef.current.center,
      zoom: mapStateRef.current.zoom,
      pitch: mapStateRef.current.pitch,
      bearing: mapStateRef.current.bearing,
      attributionControl: false
    }

    const map = new maplibregl.Map(mapConfig)

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    // Keep current zoom in React state (for always-visible Zoom UI)
    setMapZoom(map.getZoom())
    let zoomRafId: number | null = null
    const handleZoomForUi = () => {
      if (zoomRafId !== null) return
      zoomRafId = window.requestAnimationFrame(() => {
        zoomRafId = null
        setMapZoom(map.getZoom())
      })
    }
    map.on('zoom', handleZoomForUi)

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '300px'
    })

    map.on('load', () => {
      // スタイルにglyphsプロパティが存在しない場合は追加
      const style = map.getStyle()
      if (!style.glyphs) {
        style.glyphs = 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'
        map.setStyle(style)
      }
      setMapLoaded(true)
    })

    // Helper: start auto-close timer for popup
    const startPopupAutoCloseTimer = () => {
      // Clear existing timer
      if (popupAutoCloseTimerRef.current !== null) {
        window.clearTimeout(popupAutoCloseTimerRef.current)
        popupAutoCloseTimerRef.current = null
      }
      // Only set timer if auto-fade is enabled
      if (tooltipAutoFadeRef.current) {
        popupAutoCloseTimerRef.current = window.setTimeout(() => {
          if (popupRef.current) {
            popupRef.current.remove()
          }
          popupAutoCloseTimerRef.current = null
        }, 2000) // 2秒後に自動消去
      }
    }

    // Handle mousemove with requestAnimationFrame throttling for performance
    let mouseMoveRafId: number | null = null
    let lastCursorState: string = ''

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!showTooltipRef.current) {
        if (popupRef.current) {
          popupRef.current.remove()
        }
        if (lastCursorState !== '') {
          map.getCanvas().style.cursor = ''
          lastCursorState = ''
        }
        return
      }

      // Build list of visible layers to optimize queryRenderedFeatures
      // Use refs to ensure we have current state values (avoid stale closures)
      // IMPORTANT: Only include layers that actually exist in the map
      const visibleQueryLayers: string[] = []
      for (const [layerId, state] of layerStatesRef.current.entries()) {
        if (state.visible && map.getLayer(layerId)) {
          visibleQueryLayers.push(layerId)
        }
      }
      for (const [restrictionId, isVisible] of restrictionStatesRef.current.entries()) {
        if (isVisible) {
          // Check if the layer exists before adding to query list
          if (map.getLayer(restrictionId)) {
            visibleQueryLayers.push(restrictionId)
          }
          // For DID_ALL_JAPAN
          if (restrictionId === ZONE_IDS.DID_ALL_JAPAN) {
            if (map.getLayer(restrictionId)) {
              visibleQueryLayers.push(restrictionId)
            }
          }
        }
      }

      // Query only visible layers (huge performance gain with 94 total layers)
      const features =
        visibleQueryLayers.length > 0
          ? map.queryRenderedFeatures(e.point, { layers: visibleQueryLayers })
          : []

      const didFeature = features.find((f) => isDIDLayer(f.layer.id) && f.layer.type === 'fill')
      const restrictionFeature = features.find(
        (f) =>
          f.layer.id.startsWith('airport-') ||
          f.layer.id.startsWith('no-fly-') ||
          isDIDLayer(f.layer.id) ||
          f.layer.id.startsWith('emergency-') ||
          f.layer.id.startsWith('manned-') ||
          f.layer.id.startsWith('remote-') ||
          f.layer.id.startsWith('facility-')
      )

      if (didFeature && popupRef.current) {
        if (lastCursorState !== 'pointer') {
          map.getCanvas().style.cursor = 'pointer'
          lastCursorState = 'pointer'
        }
        const props = didFeature.properties
        if (!props) return

        const layerId = didFeature.layer.id
        const prefName = layerIdToName.get(layerId) || ''
        const cityName = props.CITYNAME || ''
        const population = props.JINKO || 0
        const area = props.MENSEKI || 0
        const density = area > 0 ? population / area : 0

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
        startPopupAutoCloseTimer()
      } else if (restrictionFeature && popupRef.current) {
        if (lastCursorState !== 'pointer') {
          map.getCanvas().style.cursor = 'pointer'
          lastCursorState = 'pointer'
        }
        const props = restrictionFeature.properties
        if (!props) return

        // Determine the type of restriction area and description
        let areaType = ''
        let description = ''
        let category = ''
        const layerId = restrictionFeature.layer.id

        if (layerId.startsWith('airport-')) {
          areaType = `${props.type || '空港'}周辺空域`
          description = '航空法：航空機の安全確保のための空域（制限表面）'
          category = 'NFZ（航空法：空港周辺空域）'
        } else if (layerId.includes('NO_FLY_RED') || layerId.includes('no-fly-red')) {
          areaType = 'レッドゾーン（飛行禁止）'
          description = '重要施設敷地：原則飛行禁止'
          category = '重要施設周辺空域（小型無人機等飛行禁止法）'
        } else if (layerId.includes('NO_FLY_YELLOW') || layerId.includes('no-fly-yellow')) {
          areaType = 'イエローゾーン（要許可）'
          description = '周辺300m：事前通報必要'
          category = '重要施設周辺空域（小型無人機等飛行禁止法）'
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
        } else if (layerId.startsWith('did-') || layerId.includes('DID_ALL_JAPAN')) {
          areaType = '人口集中地区（全国）'
          description =
            '航空法：地上の人・物件の安全確保のための区域。地方ごとに分類されているのは、パフォーマンス向上のため（47都道府県すべてを一度に読み込むと画面が重くなります）'
          category = 'DID（航空法：人口集中地区）'
        } else if (layerId.startsWith('facility-')) {
          const facilityId = getFacilityLayerBaseId(layerId) ?? layerId
          const facilityLayer = getFacilityLayerById(facilityId)
          areaType = facilityLayer?.name ?? props.category ?? '施設'
          description = facilityLayer?.description ?? '参考データ'
          // 駐屯地・基地は重要施設周辺空域、その他は参考情報
          if (facilityId === 'facility-military') {
            category = '重要施設周辺空域（小型無人機等飛行禁止法）'
          } else {
            category = '参考情報（※実際の飛行前はDIPS/NOTAM確認必須）'
          }
        }

        const restrictionZone = getRestrictionZoneByLayerId(layerId)
        if (!areaType && restrictionZone?.name) {
          areaType = restrictionZone.name
        }
        if (!description) {
          const propsDescription = typeof props.description === 'string' ? props.description : ''
          description = propsDescription || restrictionZone?.description || ''
        }
        if (!category && restrictionZone) {
          if (restrictionZone.type === 'no_fly_red' || restrictionZone.type === 'no_fly_yellow') {
            category = '重要施設周辺空域（小型無人機等飛行禁止法）'
          } else if (restrictionZone.type === 'airport') {
            category = 'NFZ（航空法：空港周辺空域）'
          } else if (restrictionZone.type === 'did') {
            category = 'DID（航空法：人口集中地区）'
          } else {
            category = '航空法'
          }
        }

        const descriptionRow = description
          ? `<div class="stat-row" style="margin-top:4px;padding-top:4px;border-top:1px solid #eee;">
                <span class="stat-value" style="font-size:10px;color:#666;">${description}</span>
              </div>`
          : ''

        const content = `
          <div class="did-popup">
            <div class="popup-header">
              <span class="pref-name">${props.name || areaType}</span>
              <span class="city-name">${areaType}</span>
            </div>
            <div class="popup-stats">
              <div class="stat-row">
                <span class="stat-label">規制法令</span>
                <span class="stat-value">${category || '-'}</span>
              </div>
              ${
                props.radiusKm
                  ? `<div class="stat-row">
                <span class="stat-label">制限半径</span>
                <span class="stat-value">${props.radiusKm}km</span>
              </div>`
                  : ''
              }
              ${
                props.category
                  ? `<div class="stat-row">
                <span class="stat-label">カテゴリ</span>
                <span class="stat-value">${props.category}</span>
              </div>`
                  : ''
              }
              ${
                props.source
                  ? `<div class="stat-row">
                <span class="stat-label">情報源</span>
                <span class="stat-value">${props.source}</span>
              </div>`
                  : ''
              }
              ${descriptionRow}
            </div>
          </div>
        `
        popupRef.current.setLngLat(e.lngLat).setHTML(content).addTo(map)
        startPopupAutoCloseTimer()
      } else if (popupRef.current) {
        if (lastCursorState !== '') {
          map.getCanvas().style.cursor = ''
          lastCursorState = ''
        }
        popupRef.current.remove()
      }
    }

    // Store latest mouse event to ensure we always process the most recent position
    let latestMouseEvent: maplibregl.MapMouseEvent | null = null

    const throttledMouseMove = (e: maplibregl.MapMouseEvent) => {
      latestMouseEvent = e
      if (mouseMoveRafId !== null) return
      mouseMoveRafId = window.requestAnimationFrame(() => {
        mouseMoveRafId = null
        if (latestMouseEvent) {
          handleMouseMove(latestMouseEvent)
        }
      })
    }

    map.on('mousemove', throttledMouseMove)

    map.on('mouseleave', () => {
      // Cancel pending mousemove RAF to prevent memory leaks
      if (mouseMoveRafId !== null) {
        window.cancelAnimationFrame(mouseMoveRafId)
        mouseMoveRafId = null
      }
      map.getCanvas().style.cursor = ''
      if (popupRef.current) {
        popupRef.current.remove()
      }
    })

    // Handle map left-click
    map.on('click', (e) => {
      // Weather click mode - show weather popup for clicked location
      if (enableWeatherClickRef.current) {
        const { lat, lng } = e.lngLat
        const prefecture = findNearestPrefecture(lat, lng)

        if (prefecture) {
          // Close existing popup if any
          if (weatherPopupRef.current) {
            weatherPopupRef.current.remove()
          }

          // Show loading popup
          const loadingPopup = new maplibregl.Popup({ closeOnClick: true, closeButton: false })
            .setLngLat([lng, lat])
            .setHTML(
              `
              <div style="padding: 12px; font-family: system-ui, sans-serif; min-width: 200px;">
                <div style="font-weight: bold; margin-bottom: 8px;">${prefecture.name}</div>
                <div style="color: #666;">天気データを取得中...</div>
              </div>
            `
            )
            .addTo(map)

          // Store popup reference for ESC key handling
          weatherPopupRef.current = loadingPopup
          loadingPopup.on('close', () => {
            weatherPopupRef.current = null
          })

          // Fetch weather data
          getPrefectureForecast(prefecture.id)
            .then((result) => {
              if (result && result.weather) {
                const currentWeather = getWeatherDescription(result.weather.current.weatherCode)
                const daily = result.weather.daily.slice(0, 3) // Next 3 days

                loadingPopup.setHTML(`
                <div style="padding: 16px; font-family: system-ui, sans-serif; min-width: auto; background: rgba(20, 20, 30, 0.75); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); color: #e5e5e5;">
                  <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 10px;">
                    <span>${prefecture.name} (${prefecture.capital})</span>
                    <button onclick="window.dispatchEvent(new CustomEvent('closeWeatherPopup'));"
                            onmouseenter="this.querySelector('.esc-tooltip').style.opacity='1'; this.querySelector('.esc-tooltip').style.visibility='visible';"
                            onmouseleave="this.querySelector('.esc-tooltip').style.opacity='0'; this.querySelector('.esc-tooltip').style.visibility='hidden';"
                            style="position: relative; background: none; border: none; color: rgba(255, 255, 255, 0.7); cursor: pointer; font-size: 20px; padding: 0; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s ease;"
                            aria-label="閉じる (Escキーでも閉じられます)">
                      ×
                      <span class="esc-tooltip" style="position: absolute; bottom: -28px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.8); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap; opacity: 0; visibility: hidden; transition: opacity 0.2s ease 0.5s, visibility 0.2s ease 0.5s; pointer-events: none; z-index: 10;">Esc</span>
                    </button>
                  </div>
                  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <span style="font-size: 36px;">${currentWeather.icon}</span>
                    <div>
                      <div style="font-size: 24px; font-weight: bold;">${result.weather.current.temperature}°C</div>
                      <div style="color: #9ca3af;">${currentWeather.label}</div>
                    </div>
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 12px; margin-bottom: 12px;">
                    <div style="text-align: center; padding: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05);">
                      <div style="color: #9ca3af; font-size: 11px;">湿度</div>
                      <div style="font-weight: bold; color: #e5e5e5;">${result.weather.current.humidity}%</div>
                    </div>
                    <div style="text-align: center; padding: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05);">
                      <div style="color: #9ca3af; font-size: 11px;">風速</div>
                      <div style="font-weight: bold; color: #e5e5e5;">${result.weather.current.windSpeed}km/h</div>
                    </div>
                    <div style="text-align: center; padding: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05);">
                      <div style="color: #9ca3af; font-size: 11px;">降水</div>
                      <div style="font-weight: bold; color: #e5e5e5;">${result.weather.current.precipitation}mm</div>
                    </div>
                  </div>
                  <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 10px;">
                    <div style="font-size: 12px; color: #9ca3af; margin-bottom: 8px;">週間予報</div>
                    ${daily
                      .map((day, i) => {
                        const dayWeather = getWeatherDescription(day.weatherCode)
                        return `
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 5px 8px; margin-bottom: 4px; background: ${i === 0 ? 'rgba(30, 58, 95, 0.5)' : 'rgba(255, 255, 255, 0.05)'}; border-radius: 8px;">
                          <span style="width: 60px; font-weight: ${i === 0 ? 'bold' : 'normal'};">${i === 0 ? '今日' : formatDailyDate(day.date)}</span>
                          <span style="font-size: 18px;">${dayWeather.icon}</span>
                          <span style="color: #ef4444; font-weight: bold;">${day.temperatureMax}°</span>
                          <span style="color: #6b7280;">/</span>
                          <span style="color: #3b82f6;">${day.temperatureMin}°</span>
                        </div>
                      `
                      })
                      .join('')}
                  </div>
                  <div style="margin-top: 12px; text-align: center;">
                    <button onclick="window.dispatchEvent(new CustomEvent('openWeatherPanel', {detail: '${prefecture.id}'}))"
                            style="padding: 8px 16px; font-size: 12px; background: rgba(59, 130, 246, 0.9); color: white; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; cursor: pointer; backdrop-filter: blur(4px);">
                      詳細予報を見る
                    </button>
                  </div>
                </div>
              `)
              } else {
                loadingPopup.setHTML(`
                <div style="padding: 12px; font-family: system-ui, sans-serif;">
                  <div style="font-weight: bold; margin-bottom: 8px;">${prefecture.name}</div>
                  <div style="color: #e53935;">天気データの取得に失敗しました</div>
                </div>
              `)
              }
            })
            .catch(() => {
              loadingPopup.setHTML(`
              <div style="padding: 12px; font-family: system-ui, sans-serif;">
                <div style="font-weight: bold; margin-bottom: 8px;">${prefecture.name}</div>
                <div style="color: #e53935;">天気データの取得に失敗しました</div>
              </div>
            `)
            })
        }
      }
    })

    // Handle right-click (contextmenu) to display context menu
    map.on('contextmenu', (e) => {
      // Don't show menu while drawing
      if (activeDrawMode !== 'none') {
        return
      }

      const clickType = coordClickTypeRef.current
      // Right-click works if setting is 'right' or 'both'
      if (clickType === 'right' || clickType === 'both') {
        e.preventDefault()

        // Detect restriction zones at click location
        let restrictionInfo: string | undefined
        try {
          // Query all rendered features at click point
          const allFeatures = map.queryRenderedFeatures(e.point)

          // Check if feature is a DID fill layer (not outline) to have CITYNAME property
          const isDIDFillLayer = (f: maplibregl.MapGeoJSONFeature) =>
            isDIDLayer(f.layer.id) && f.layer.type === 'fill' && !f.layer.id.includes('-outline')

          // Find restriction features by layer ID pattern
          const restrictionFeature = allFeatures.find(
            (f) =>
              f.layer.id.startsWith('airport-') ||
              f.layer.id.startsWith('no-fly-') ||
              isDIDFillLayer(f) ||
              f.layer.id.startsWith('emergency-') ||
              f.layer.id.startsWith('manned-') ||
              f.layer.id.startsWith('remote-') ||
              f.layer.id.startsWith('facility-')
          )

          if (restrictionFeature) {
            const props = restrictionFeature.properties
            const layerId = restrictionFeature.layer.id

            // Determine area name based on layer type
            if (isDIDFillLayer(restrictionFeature)) {
              const cityName = props?.CITYNAME || ''
              restrictionInfo = `⚠️ DID: ${cityName}`
            } else if (layerId.startsWith('airport-')) {
              const name = props?.name || props?.空港名 || '空港周辺'
              restrictionInfo = `⚠️ ${name}`
            } else if (layerId.startsWith('no-fly-')) {
              const zone = layerId.includes('red') ? 'レッドゾーン' : 'イエローゾーン'
              restrictionInfo = `⚠️ ${zone}`
            } else if (layerId.startsWith('facility-')) {
              const name = props?.name || props?.施設名 || '施設'
              restrictionInfo = `⚠️ ${name}`
            } else {
              const areaName = (props?.name as string) || (props?.title as string) || '禁止エリア'
              restrictionInfo = `⚠️ ${areaName}`
            }
          }
        } catch (err) {
          // Silently fail if zone detection fails
        }

        setContextMenu({
          isOpen: true,
          position: { x: e.point.x, y: e.point.y },
          lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
          restrictionInfo
        })
      }
    })

    // Comparison layers click and hover handlers
    ISHIKAWA_NOTO_COMPARISON_LAYERS.forEach((layerConfig) => {
      map.on('click', layerConfig.id, (e) => {
        if (!e.features || e.features.length === 0) return

        const feature = e.features[0]
        const props = feature.properties || {}

        const content = `
          <div class="did-popup">
            <div class="popup-header">
              <span class="pref-name">${layerConfig.name}</span>
              <span class="city-name">${layerConfig.year}年データ</span>
            </div>
            <div class="popup-stats">
              <div class="stat-row">
                <span class="stat-label">海抜高度</span>
                <span class="stat-value">${props.elevation ?? 'N/A'} m</span>
              </div>
              ${
                props.change_meters
                  ? `
                <div class="stat-row">
                  <span class="stat-label">地形変化</span>
                  <span class="stat-value">${props.change_meters > 0 ? '+' : ''}${props.change_meters} m</span>
                </div>
              `
                  : ''
              }
              <div class="stat-row">
                <span class="stat-label">説明</span>
                <span class="stat-value" style="font-size:10px;">${props.description || layerConfig.description}</span>
              </div>
            </div>
          </div>
        `

        popupRef.current?.setLngLat(e.lngLat).setHTML(content).addTo(map)
        startPopupAutoCloseTimer()
      })

      map.on('mouseenter', layerConfig.id, () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', layerConfig.id, () => {
        map.getCanvas().style.cursor = ''
      })
    })

    mapRef.current = map

    return () => {
      map.off('zoom', handleZoomForUi)
      if (zoomRafId !== null) window.cancelAnimationFrame(zoomRafId)
      map.remove()
      mapRef.current = null
    }
  }, [baseMap])

  // ============================================
  // Progress bar fade in/out effect
  // ============================================
  useEffect(() => {
    if (loadingLayers.size > 0) {
      // ローディング開始時：即座に表示
      setShowProgressBar(true)
    } else {
      // ローディング終了時：フェードアウト後に非表示
      const timer = setTimeout(() => {
        setShowProgressBar(false)
      }, 300) // フェードアウトアニメーション時間に合わせる
      return () => clearTimeout(timer)
    }
  }, [loadingLayers.size])

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

      if (restrictionId === ZONE_IDS.DID_ALL_JAPAN) {
        // 全国DIDレイヤー（単一）
        if (map.getLayer(restrictionId)) {
          map.setPaintProperty(restrictionId, 'fill-opacity', opacity)
        }
      } else if (restrictionId === 'airport-airspace') {
        // kokuarea（空港周辺空域）: 種別ごとにベース不透明度が異なるため、UIのopacityは倍率として扱う
        ;(Object.keys(KOKUAREA_STYLE) as Array<keyof typeof KOKUAREA_STYLE>).forEach((kind) => {
          const id = `${KOKUAREA_LAYER_PREFIX}-${kind}`
          if (!map.getLayer(id)) return
          const base = KOKUAREA_STYLE[kind].fillOpacity
          const scaled = Math.max(0, Math.min(1, opacity * base * 2))
          map.setPaintProperty(id, 'fill-opacity', scaled)
        })
      } else {
        const facilityLayer = getFacilityLayerById(restrictionId)
        if (facilityLayer) {
          const fillId = `${restrictionId}-fill`
          const pointId = `${restrictionId}-point`
          if (map.getLayer(fillId)) {
            map.setPaintProperty(fillId, 'fill-opacity', opacity)
          }
          if (map.getLayer(pointId)) {
            map.setPaintProperty(pointId, 'circle-opacity', opacity)
          }
          return
        }
        if (map.getLayer(restrictionId)) {
          map.setPaintProperty(restrictionId, 'fill-opacity', opacity)
        }
      }
    })
  }, [opacity, layerStates, restrictionStates, mapLoaded])

  // ============================================
  // Layer management
  // ============================================
  const addLayer = useCallback(
    async (layer: LayerConfig, initialVisible = false) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      // ソースまたはレイヤーが既に存在する場合は早期リターン
      if (map.getSource(layer.id) || map.getLayer(layer.id)) {
        return
      }

      // ローディング開始
      setLoadingLayers((prev) => {
        const next = new Map(prev)
        next.set(layer.id, layer.name)
        return next
      })

      try {
        type DidProperties = Record<string, unknown> & { CITYNAME?: string }
        type DidFC = GeoJSON.FeatureCollection<GeoJSON.Geometry | null, DidProperties>

        const data = await fetchGeoJSONWithCache<DidFC>(layer.path)

        // Store GeoJSON only in the MapLibre GL source instead of keeping a separate
        // in-memory cache. This avoids duplicating large feature collections in memory
        // and lets MapLibre manage lifecycle/eviction for the underlying data.
        // See docs/stories/17_PerformanceOptimization.mdx for details.

        const newItems: SearchIndexItem[] = []
        data.features.forEach((feature) => {
          const cityName = feature.properties?.CITYNAME
          if (typeof cityName === 'string' && cityName.length > 0 && feature.geometry) {
            newItems.push({
              prefName: layer.name,
              cityName,
              bbox: calculateBBox(feature.geometry),
              layerId: layer.id
            })
          }
        })
        setSearchIndex((prev: SearchIndexItem[]) => [...prev, ...newItems])

        // ソースの存在を再確認（非同期処理中に追加された可能性がある）
        if (map.getSource(layer.id)) {
          return
        }

        map.addSource(layer.id, {
          type: 'geojson',
          data: data as GeoJSON.FeatureCollection<GeoJSON.Geometry, DidProperties>
        })

        // レイヤーの存在を再確認
        if (map.getLayer(layer.id) || map.getLayer(`${layer.id}-outline`)) {
          return
        }

        map.addLayer({
          id: layer.id,
          type: 'fill',
          source: layer.id,
          paint: { 'fill-color': layer.color, 'fill-opacity': opacity },
          layout: { visibility: initialVisible ? 'visible' : 'none' }
        })

        map.addLayer({
          id: `${layer.id}-outline`,
          type: 'line',
          source: layer.id,
          paint: { 'line-color': layer.color, 'line-width': 1 },
          layout: { visibility: initialVisible ? 'visible' : 'none' }
        })

        setLayerStates((prev: Map<string, LayerState>) => {
          const next = new Map(prev)
          next.set(layer.id, { id: layer.id, visible: initialVisible })
          return next
        })
      } catch (e) {
        console.error(`Failed to add layer ${layer.id}:`, e)
      } finally {
        // ローディング終了
        setLoadingLayers((prev) => {
          const next = new Map(prev)
          next.delete(layer.id)
          return next
        })
      }
    },
    [mapLoaded, opacity]
  )

  // ============================================

  // ============================================
  // Comparison Layers initialization
  // ============================================
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    type GeoJSONGeometryType =
      | 'Point'
      | 'MultiPoint'
      | 'LineString'
      | 'MultiLineString'
      | 'Polygon'
      | 'MultiPolygon'
      | 'GeometryCollection'

    const getPrimaryGeometryType = (
      geojson: GeoJSON.FeatureCollection
    ): GeoJSONGeometryType | null => {
      for (const f of geojson.features) {
        const t = f.geometry?.type
        if (typeof t === 'string' && t.length > 0) {
          return t as GeoJSONGeometryType
        }
      }
      return null
    }

    const shouldRenderAsCircle = (t: GeoJSONGeometryType | null): boolean => {
      return t === 'Point' || t === 'MultiPoint'
    }

    const getNumericRange = (
      geojson: GeoJSON.FeatureCollection,
      key: string
    ): { min: number; max: number } | null => {
      let min = Infinity
      let max = -Infinity
      for (const f of geojson.features) {
        const v = (f.properties as Record<string, unknown> | null | undefined)?.[key]
        if (typeof v === 'number' && Number.isFinite(v)) {
          min = Math.min(min, v)
          max = Math.max(max, v)
        }
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null
      if (min === max) return { min, max: min + 1 } // 範囲0回避
      return { min, max }
    }

    const computeCollectionBounds = (
      geojson: GeoJSON.FeatureCollection
    ): [[number, number], [number, number]] | null => {
      let bbox: [number, number, number, number] | null = null
      for (const f of geojson.features) {
        try {
          const b = calculateBBox(f.geometry)
          bbox = bbox ? mergeBBoxes([bbox, b]) : b
        } catch {
          // ignore invalid geometry
        }
      }
      if (!bbox) return null
      return [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]]
      ]
    }

    const applyComparisonLayerState = (layerId: string) => {
      const isVisible = comparisonLayerVisibility.has(layerId)
      const visibility = isVisible ? 'visible' : 'none'
      const opacity = comparisonLayerOpacity.get(layerId) ?? 0.5

      // layout visibility
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility)
      }
      if (map.getLayer(`${layerId}-heat`)) {
        map.setLayoutProperty(`${layerId}-heat`, 'visibility', visibility)
      }
      if (map.getLayer(`${layerId}-outline`)) {
        map.setLayoutProperty(`${layerId}-outline`, 'visibility', visibility)
      }
      if (map.getLayer(`${layerId}-label`)) {
        map.setLayoutProperty(`${layerId}-label`, 'visibility', visibility)
      }

      // paint opacity
      const heat = map.getLayer(`${layerId}-heat`)
      if (heat && heat.type === 'heatmap') {
        map.setPaintProperty(`${layerId}-heat`, 'heatmap-opacity', opacity)
      }
      const layer = map.getLayer(layerId)
      if (layer?.type === 'circle') {
        map.setPaintProperty(layerId, 'circle-opacity', opacity)
        map.setPaintProperty(layerId, 'circle-stroke-opacity', Math.min(1, opacity * 0.95))
      } else if (layer?.type === 'fill') {
        map.setPaintProperty(layerId, 'fill-opacity', opacity)
        if (map.getLayer(`${layerId}-outline`)) {
          map.setPaintProperty(`${layerId}-outline`, 'line-opacity', Math.min(1, opacity * 0.9))
        }
      }
    }

    async function initComparisonLayers() {
      if (!map) return
      for (const layerConfig of ISHIKAWA_NOTO_COMPARISON_LAYERS) {
        const hasSource = !!map.getSource(layerConfig.id)

        try {
          if (!hasSource) {
            const geojson = await fetchGeoJSONWithCache(layerConfig.path)
            map.addSource(layerConfig.id, {
              type: 'geojson',
              data: geojson
            })

            const bounds = computeCollectionBounds(geojson)
            if (bounds) {
              comparisonLayerBoundsRef.current.set(layerConfig.id, bounds)
            }

            const primaryType = getPrimaryGeometryType(geojson)
            const layerOpacity = comparisonLayerOpacity.get(layerConfig.id) ?? 0.5
            const renderAsCircle = shouldRenderAsCircle(primaryType)

            if (renderAsCircle) {
              // Heatmap（面として見せる）+ circle（クリック用）
              const elevRange = getNumericRange(geojson, 'elevation') ?? { min: 0, max: 100 }
              const heatId = `${layerConfig.id}-heat`

              map.addLayer({
                id: heatId,
                type: 'heatmap',
                source: layerConfig.id,
                paint: {
                  'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['coalesce', ['get', 'elevation'], elevRange.min],
                    elevRange.min,
                    0,
                    elevRange.max,
                    1
                  ],
                  'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 14, 1.8],
                  'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 18, 14, 55],
                  'heatmap-opacity': layerOpacity,
                  'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0,
                    'rgba(0,0,0,0)',
                    0.2,
                    'rgba(255, 245, 157, 0.55)',
                    0.4,
                    'rgba(255, 183, 77, 0.75)',
                    0.6,
                    'rgba(239, 108, 0, 0.80)',
                    0.8,
                    'rgba(229, 57, 53, 0.85)',
                    1,
                    'rgba(183, 28, 28, 0.90)'
                  ]
                },
                layout: {
                  visibility: 'none'
                }
              })
              // Circle レイヤー（ポイントデータ用）
              map.addLayer({
                id: layerConfig.id,
                type: 'circle',
                source: layerConfig.id,
                paint: {
                  'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 7, 14, 14],
                  'circle-color': layerConfig.color,
                  // 航空写真でも視認できるよう最小不透明度を上げる
                  'circle-opacity': Math.min(1, Math.max(0.75, layerOpacity)),
                  'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4],
                  'circle-stroke-color': '#ffffff',
                  'circle-stroke-opacity': 0.95,
                  'circle-blur': 0.15
                },
                layout: {
                  visibility: 'none'
                }
              })
            } else {
              // Fill + outline（ポリゴンDID等）
              map.addLayer({
                id: layerConfig.id,
                type: 'fill',
                source: layerConfig.id,
                paint: {
                  'fill-color': layerConfig.color,
                  'fill-opacity': layerOpacity
                },
                layout: {
                  visibility: 'none'
                }
              })
              map.addLayer({
                id: `${layerConfig.id}-outline`,
                type: 'line',
                source: layerConfig.id,
                paint: {
                  'line-color': layerConfig.color,
                  'line-width': 1.5,
                  'line-opacity': Math.min(1, layerOpacity * 0.9)
                },
                layout: {
                  visibility: 'none'
                }
              })
            }

            // ラベルレイヤー（年度表示）
            map.addLayer({
              id: `${layerConfig.id}-label`,
              type: 'symbol',
              source: layerConfig.id,
              layout: {
                'text-field': `${layerConfig.year}`,
                'text-size': 10,
                'text-offset': [0, 1.5],
                visibility: 'none'
              },
              paint: {
                'text-color': layerConfig.color,
                'text-halo-color': '#fff',
                'text-halo-width': 1
              }
            })
            // 非同期ロード後に、現在のON/OFFを即反映（初期表示の空振り防止）
            applyComparisonLayerState(layerConfig.id)
          } else {
            // 既にソースがある場合でも、現在の状態を再適用
            applyComparisonLayerState(layerConfig.id)
          }
        } catch (error) {
          console.error(`Failed to load comparison layer ${layerConfig.id}:`, error)
        }
      }
    }

    initComparisonLayers()
  }, [mapLoaded, comparisonLayerOpacity, comparisonLayerVisibility])
  // Load default layers on map load
  // ============================================
  useEffect(() => {
    if (!mapLoaded) return

    // Check if we've already loaded the initial regions
    const loadedRegions = new Set<string>()
    layerStates.forEach((_, layerId) => {
      LAYER_GROUPS.forEach((group) => {
        group.layers.forEach((layer) => {
          if (layer.id === layerId) {
            loadedRegions.add(group.name)
          }
        })
      })
    })

    // Load multiple regions for better search coverage
    const regionsToLoad = ['関東', '近畿', '中部']
    const needsLoading = regionsToLoad.some((region) => !loadedRegions.has(region))

    if (!needsLoading) return

    LAYER_GROUPS.forEach((group) => {
      if (regionsToLoad.includes(group.name)) {
        group.layers.forEach((layer) => {
          addLayer(layer)
        })
      }
    })
  }, [mapLoaded, layerStates, addLayer])

  // ============================================
  // Auto-load unloaded layers when search returns no results
  // ============================================
  useEffect(() => {
    if (!searchTerm || searchResults.length > 0 || isLoadingForSearch) return

    setIsLoadingForSearch(true)

    // Find layers that haven't been loaded yet
    const allLayerIds = getAllPrefectureLayerIds()
    const loadedLayerIds = new Set(layerStates.keys())
    const unloadedLayerIds = allLayerIds.filter((id) => !loadedLayerIds.has(id))

    if (unloadedLayerIds.length === 0) {
      setIsLoadingForSearch(false)
      return
    }

    // Find and load all unloaded layers
    LAYER_GROUPS.forEach((group) => {
      group.layers.forEach((layer) => {
        if (unloadedLayerIds.includes(layer.id)) {
          addLayer(layer)
        }
      })
    })

    setIsLoadingForSearch(false)
  }, [searchTerm, searchResults.length, isLoadingForSearch, layerStates, addLayer])

  // DID: グループ単位の色モード（default / red）
  const getDidGroupMode = (groupName: string): 'default' | 'red' => {
    return didGroupColorMode.get(groupName) ?? 'default'
  }

  const applyDidLayerColor = (layerId: string, color: string) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'fill-color', color)
    }
    const outlineId = `${layerId}-outline`
    if (map.getLayer(outlineId)) {
      map.setPaintProperty(outlineId, 'line-color', color)
    }
  }

  const applyDidGroupColors = (group: LayerGroup, mode: 'default' | 'red') => {
    const red = '#ff0000'
    group.layers.forEach((layer) => {
      applyDidLayerColor(layer.id, mode === 'red' ? red : layer.color)
    })
  }

  const toggleLayer = (layer: LayerConfig) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const state = layerStates.get(layer.id)
    const group = LAYER_GROUPS.find((g) => g.layers.some((l) => l.id === layer.id))
    const groupMode: 'default' | 'red' = group ? getDidGroupMode(group.name) : 'default'

    if (!state) {
      // 未ロード: ロードして表示
      // Set optimistic state immediately for UI responsiveness
      setLayerStates((prev: Map<string, LayerState>) => {
        const next = new Map(prev)
        next.set(layer.id, { id: layer.id, visible: true })
        return next
      })
      void (async () => {
        try {
          await addLayer(layer, true)
          applyDidLayerColor(layer.id, groupMode === 'red' ? '#ff0000' : layer.color)
        } catch (error) {
          // Revert optimistic state if adding the layer fails
          setLayerStates((prev: Map<string, LayerState>) => {
            const next = new Map(prev)
            next.delete(layer.id)
            return next
          })
          console.error('Failed to add layer', layer.id, error)
        }
      })()
      return
    }

    const newVisibility = !state.visible
    const visibility = newVisibility ? 'visible' : 'none'

    // レイヤーが地図に存在するか確認してからスタイルを設定
    if (map.getLayer(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', visibility)
    }
    if (map.getLayer(`${layer.id}-outline`)) {
      map.setLayoutProperty(`${layer.id}-outline`, 'visibility', visibility)
    }
    if (newVisibility) {
      applyDidLayerColor(layer.id, groupMode === 'red' ? '#ff0000' : layer.color)
    }

    setLayerStates((prev: Map<string, LayerState>) => {
      const next = new Map(prev)
      next.set(layer.id, { ...state, visible: newVisibility })
      return next
    })
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }

  // DID: 地域ごとのopen/close状態をlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem(
        DID_EXPANDED_GROUPS_KEY,
        JSON.stringify(Array.from(expandedGroups.values()))
      )
    } catch {
      // ignore
    }
  }, [expandedGroups])

  const isLayerVisible = (layerId: string) => layerStates.get(layerId)?.visible ?? false

  const enableAllInGroup = (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setDidGroupColorMode((prev: Map<string, 'default' | 'red'>) =>
      new Map(prev).set(group.name, 'default')
    )

    group.layers.forEach((layer) => {
      const state = layerStates.get(layer.id)
      if (state) {
        // 既にロード済み: 表示に切り替え
        if (!state.visible) {
          // レイヤーが地図に存在するか確認してからスタイルを設定
          if (map.getLayer(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'visible')
          }
          if (map.getLayer(`${layer.id}-outline`)) {
            map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'visible')
          }
          setLayerStates((prev: Map<string, LayerState>) => {
            const next = new Map(prev)
            next.set(layer.id, { ...state, visible: true })
            return next
          })
        }
      } else {
        // 未ロード: ロードして表示
        // Set optimistic state immediately for UI responsiveness
        setLayerStates((prev: Map<string, LayerState>) => {
          const next = new Map(prev)
          next.set(layer.id, { id: layer.id, visible: true })
          return next
        })
        addLayer(layer, true)
      }
    })
    applyDidGroupColors(group, 'default')
  }

  const enableAllInGroupRed = (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setDidGroupColorMode((prev: Map<string, 'default' | 'red'>) =>
      new Map(prev).set(group.name, 'red')
    )

    group.layers.forEach((layer) => {
      const state = layerStates.get(layer.id)
      if (state) {
        if (!state.visible) {
          // レイヤーが地図に存在するか確認してからスタイルを設定
          if (map.getLayer(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'visible')
          }
          if (map.getLayer(`${layer.id}-outline`)) {
            map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'visible')
          }
          setLayerStates((prev: Map<string, LayerState>) => {
            const next = new Map(prev)
            next.set(layer.id, { ...state, visible: true })
            return next
          })
        }
        applyDidLayerColor(layer.id, '#ff0000')
      } else {
        // Set optimistic state immediately for UI responsiveness
        setLayerStates((prev: Map<string, LayerState>) => {
          const next = new Map(prev)
          next.set(layer.id, { id: layer.id, visible: true })
          return next
        })
        void addLayer(layer, true).then(() => {
          applyDidLayerColor(layer.id, '#ff0000')
        })
      }
    })
  }

  const disableAllInGroup = (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setDidGroupColorMode((prev: Map<string, 'default' | 'red'>) =>
      new Map(prev).set(group.name, 'default')
    )
    applyDidGroupColors(group, 'default')

    group.layers.forEach((layer) => {
      const state = layerStates.get(layer.id)
      if (state?.visible) {
        // レイヤーが地図に存在するか確認してからスタイルを設定
        if (map.getLayer(layer.id)) {
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
        if (map.getLayer(`${layer.id}-outline`)) {
          map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'none')
        }
        setLayerStates((prev: Map<string, LayerState>) => {
          const next = new Map(prev)
          next.set(layer.id, { ...state, visible: false })
          return next
        })
      }
    })
  }

  // 地方ごとのDID+NFZセット表示モード
  const enableDIDNFZForGroup = async (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // 地域のバウンディングボックスを計算
    const groupBounds: [[number, number], [number, number]] | null = (() => {
      let minLng = Infinity
      let minLat = Infinity
      let maxLng = -Infinity
      let maxLat = -Infinity
      let hasBounds = false

      for (const layer of group.layers) {
        if (layer.bounds) {
          const [[lng1, lat1], [lng2, lat2]] = layer.bounds
          minLng = Math.min(minLng, lng1, lng2)
          minLat = Math.min(minLat, lat1, lat2)
          maxLng = Math.max(maxLng, lng1, lng2)
          maxLat = Math.max(maxLat, lat1, lat2)
          hasBounds = true
        }
      }

      if (!hasBounds) return null
      return [
        [minLng, minLat],
        [maxLng, maxLat]
      ]
    })()

    // 未ロードのレイヤーをロードして完了を待つ
    const layersToLoad = group.layers.filter((layer) => {
      const state = layerStates.get(layer.id)
      return !state || !state.visible
    })

    if (layersToLoad.length > 0) {
      // グループ全体のローディング表示
      setLoadingLayers((prev) => {
        const next = new Map(prev)
        layersToLoad.forEach((layer) => {
          next.set(layer.id, layer.name)
        })
        return next
      })

      try {
        await Promise.all(layersToLoad.map((layer) => addLayer(layer, true)))
      } finally {
        // グループ全体のローディング終了
        setLoadingLayers((prev) => {
          const next = new Map(prev)
          layersToLoad.forEach((layer) => {
            next.delete(layer.id)
          })
          return next
        })
      }
    }

    // DIDを表示（レイヤーのロード完了後）
    enableAllInGroup(group)

    // NFZ（空港空域）を表示（地域のバウンディングボックスでフィルタリング）
    // 注意: 地域別NFZは全国一括の空港空域チェックボックスとは独立して管理
    const zone = getAllRestrictionZones().find((z) => z.id === 'airport-airspace')
    if (zone?.geojsonTileTemplate) {
      try {
        // 地域のバウンディングボックスを保存（NFZフィルタリング用）
        if (groupBounds) {
          kokuareaRef.current.regionalBounds = groupBounds
        }
        enableKokuarea(map, zone.geojsonTileTemplate)
        // 地域別NFZはrestrictionStatesを更新しない（全国一括のチェックボックスとは独立）
        // これにより、DID+NFZ表示ボタンをクリックしても全国一括の空港空域チェックボックスはONにならない
      } catch (e) {
        console.error('Failed to enable kokuarea for regional mode:', e)
      }
    }
  }

  // ============================================
  // Overlay management
  // ============================================
  const toggleOverlay = (overlay: (typeof GEO_OVERLAYS)[0] | { id: string; name: string }) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // Wait for style to be fully loaded before adding layers
    if (!map.isStyleLoaded()) {
      map.once('style.load', () => toggleOverlay(overlay))
      return
    }

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
        if (map.getLayer(`${overlay.id}-bg`)) {
          map.setLayoutProperty(`${overlay.id}-bg`, 'visibility', 'visible')
        }
      }
      setOverlayStates((prev: Map<string, boolean>) => new Map(prev).set(overlay.id, true))
    } else {
      if (map.getLayer(overlay.id)) {
        map.setLayoutProperty(overlay.id, 'visibility', 'none')
      }
      if (map.getLayer(`${overlay.id}-outline`)) {
        map.setLayoutProperty(`${overlay.id}-outline`, 'visibility', 'none')
      }
      if (map.getLayer(`${overlay.id}-bg`)) {
        map.setLayoutProperty(`${overlay.id}-bg`, 'visibility', 'none')
      }
      setOverlayStates((prev: Map<string, boolean>) => new Map(prev).set(overlay.id, false))
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

  const toggleWeatherOverlay = useCallback(
    async (overlayId: string) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      const isVisible = weatherStatesRef.current.get(overlayId) ?? false

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
        setWeatherStates((prev: Map<string, boolean>) => new Map(prev).set(overlayId, true))
      } else {
        if (map.getLayer(overlayId)) {
          map.setLayoutProperty(overlayId, 'visibility', 'none')
        }
        setWeatherStates((prev: Map<string, boolean>) => new Map(prev).set(overlayId, false))
      }
    },
    [mapLoaded, rainRadarPath]
  )

  const isWeatherVisible = (overlayId: string) => weatherStates.get(overlayId) ?? false

  // Rain radar auto-update
  useEffect(() => {
    if (!weatherStates.get('rain-radar')) return

    const interval = setInterval(
      async () => {
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
      },
      5 * 60 * 1000
    )

    return () => clearInterval(interval)
  }, [weatherStates, mapLoaded])

  // ============================================
  // Restriction zone management
  // ============================================
  type KokuareaFC = GeoJSON.FeatureCollection<GeoJSON.Geometry | null, KokuareaFeatureProperties>

  const KOKUAREA_SOURCE_ID = 'airport-airspace-kokuarea'
  const KOKUAREA_LAYER_PREFIX = 'airport-airspace-kokuarea'
  const AIRPORT_OVERVIEW_SOURCE_ID = 'airport-airspace-overview'
  const AIRPORT_OVERVIEW_LAYER_ID = 'airport-airspace-overview'
  const AIRPORT_OVERVIEW_LABELS_ID = 'airport-airspace-overview-labels'
  const KOKUAREA_MAX_TILES = 96
  // NOTE: GSI kokuarea は現状 z=8 のみ実在（z<8 / z>8 は404になるケースが多い）
  const KOKUAREA_TILE_ZOOM = 8
  const KOKUAREA_MIN_MAP_ZOOM = 8
  const KOKUAREA_FETCH_CONCURRENCY = 6
  const KOKUAREA_TOAST_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24時間（1日1回）

  type KokuareaToastKey = 'zoom' | 'tooMany'

  // 空港トーストの最終表示時刻をlocalStorageから読み込み
  const getKokuareaLastToastAt = (): number => {
    try {
      const stored = localStorage.getItem('kokuarea-toast-at')
      return stored ? parseInt(stored, 10) : 0
    } catch {
      return 0
    }
  }

  const kokuareaRef = useRef<{
    enabled: boolean
    tileTemplate: string | null
    tiles: Map<string, KokuareaFC>
    inflight: Map<string, Promise<KokuareaFC>>
    updateSeq: number
    detach: (() => void) | null
    lastKeysSig: string | null
    lastToastKey: KokuareaToastKey | null
    lastToastAt: number
    regionalBounds: [[number, number], [number, number]] | null
  }>({
    enabled: false,
    tileTemplate: null,
    tiles: new Map(),
    inflight: new Map(),
    updateSeq: 0,
    detach: null,
    lastKeysSig: null,
    lastToastKey: null,
    lastToastAt: getKokuareaLastToastAt(),
    regionalBounds: null
  })

  // DIDビューポートベース動的読み込み用のref
  const didViewportRef = useRef<{
    enabled: boolean
    restrictionId: string | null
    color: string
    detach: (() => void) | null
    updateTimeout: number | null
  }>({
    enabled: false,
    restrictionId: null,
    color: '#FF0000',
    detach: null,
    updateTimeout: null
  })

  const emptyKokuareaFC = (): KokuareaFC => ({ type: 'FeatureCollection', features: [] })

  const safeKokuProps = (v: unknown): Record<string, unknown> => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    return {}
  }

  const normalizeKokuareaFCInPlace = (fc: KokuareaFC): KokuareaFC => {
    for (const f of fc.features ?? []) {
      const props = safeKokuProps(f.properties)
      const { kind, label } = classifyKokuareaSurface(props)
      ;(f as GeoJSON.Feature).properties = {
        ...props,
        __koku_kind: kind,
        __koku_label: label
      } satisfies KokuareaFeatureProperties
    }
    return fc
  }

  const computeKokuareaZoomAndTiles = (
    map: maplibregl.Map
  ): {
    z: number
    keys: string[]
    xyzs: Array<{ z: number; x: number; y: number }>
    tooMany: boolean
  } => {
    const zoom = map.getZoom()
    if (zoom < KOKUAREA_MIN_MAP_ZOOM) {
      return { z: KOKUAREA_TILE_ZOOM, keys: [], xyzs: [], tooMany: true }
    }

    // 地域別フィルタリングが有効な場合は、regionalBoundsを使用
    let bounds: maplibregl.LngLatBounds
    if (kokuareaRef.current.regionalBounds) {
      const [[minLng, minLat], [maxLng, maxLat]] = kokuareaRef.current.regionalBounds
      bounds = new maplibregl.LngLatBounds([minLng, minLat], [maxLng, maxLat])
    } else {
      bounds = map.getBounds()
    }

    const z = KOKUAREA_TILE_ZOOM
    const xyzs = getVisibleTileXYZs(bounds, z)

    if (xyzs.length > KOKUAREA_MAX_TILES) {
      // 広域表示すぎるとタイル数が爆発して重くなるため、一定以上は描画しない
      return { z, keys: [], xyzs: [], tooMany: true }
    }

    const keys = xyzs.map((t) => `${t.z}/${t.x}/${t.y}`)
    return { z, keys, xyzs, tooMany: false }
  }

  const ensureKokuareaLayers = (map: maplibregl.Map): void => {
    if (!map.getSource(KOKUAREA_SOURCE_ID)) {
      map.addSource(KOKUAREA_SOURCE_ID, {
        type: 'geojson',
        data: emptyKokuareaFC() as GeoJSON.FeatureCollection<
          GeoJSON.Geometry,
          KokuareaFeatureProperties
        >
      })
    }

    ;(Object.keys(KOKUAREA_STYLE) as Array<keyof typeof KOKUAREA_STYLE>).forEach((kind) => {
      const style = KOKUAREA_STYLE[kind]
      const fillId = `${KOKUAREA_LAYER_PREFIX}-${kind}`
      const lineId = `${KOKUAREA_LAYER_PREFIX}-${kind}-outline`

      if (!map.getLayer(fillId)) {
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: KOKUAREA_SOURCE_ID,
          filter: ['==', ['get', '__koku_kind'], kind],
          paint: { 'fill-color': style.fillColor, 'fill-opacity': style.fillOpacity }
        })
      }

      if (!map.getLayer(lineId)) {
        map.addLayer({
          id: lineId,
          type: 'line',
          source: KOKUAREA_SOURCE_ID,
          filter: ['==', ['get', '__koku_kind'], kind],
          paint: { 'line-color': style.lineColor, 'line-width': style.lineWidth }
        })
      }
    })
  }

  const removeKokuareaLayers = (map: maplibregl.Map): void => {
    ;(Object.keys(KOKUAREA_STYLE) as Array<keyof typeof KOKUAREA_STYLE>).forEach((kind) => {
      const fillId = `${KOKUAREA_LAYER_PREFIX}-${kind}`
      const lineId = `${KOKUAREA_LAYER_PREFIX}-${kind}-outline`
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getLayer(fillId)) map.removeLayer(fillId)
    })
    if (map.getSource(KOKUAREA_SOURCE_ID)) map.removeSource(KOKUAREA_SOURCE_ID)
  }

  const ensureAirportOverviewLayers = (map: maplibregl.Map): void => {
    if (!map.getSource(AIRPORT_OVERVIEW_SOURCE_ID)) {
      const markers = AirportService.generateMarkers()
      map.addSource(AIRPORT_OVERVIEW_SOURCE_ID, {
        type: 'geojson',
        data: markers
      })
    }

    if (!map.getLayer(AIRPORT_OVERVIEW_LAYER_ID)) {
      map.addLayer({
        id: AIRPORT_OVERVIEW_LAYER_ID,
        type: 'circle',
        source: AIRPORT_OVERVIEW_SOURCE_ID,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2, 6, 4, 8, 6],
          'circle-color': [
            'match',
            ['get', 'type'],
            'international',
            '#2ECC71',
            'domestic',
            '#27AE60',
            'military',
            '#E74C3C',
            'heliport',
            '#F39C12',
            /* default */ '#2ECC71'
          ],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#1f1f1f',
          'circle-stroke-width': 1
        },
        layout: { visibility: 'none' }
      })
    }

    if (!map.getLayer(AIRPORT_OVERVIEW_LABELS_ID)) {
      map.addLayer({
        id: AIRPORT_OVERVIEW_LABELS_ID,
        type: 'symbol',
        source: AIRPORT_OVERVIEW_SOURCE_ID,
        layout: {
          // ズームがある程度まで近づくまではラベルを出さない（全国俯瞰での可読性確保）
          'text-field': ['step', ['zoom'], '', 6, ['get', 'name']],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 8, 12],
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          visibility: 'none'
        },
        paint: {
          'text-color': '#222',
          'text-halo-color': '#fff',
          'text-halo-width': 1.25
        }
      })
    }
  }

  const setAirportOverviewVisibility = (map: maplibregl.Map, visible: boolean): void => {
    const v = visible ? 'visible' : 'none'
    if (map.getLayer(AIRPORT_OVERVIEW_LAYER_ID)) {
      map.setLayoutProperty(AIRPORT_OVERVIEW_LAYER_ID, 'visibility', v)
    }
    if (map.getLayer(AIRPORT_OVERVIEW_LABELS_ID)) {
      map.setLayoutProperty(AIRPORT_OVERVIEW_LABELS_ID, 'visibility', v)
    }
  }

  const removeAirportOverviewLayers = (map: maplibregl.Map): void => {
    if (map.getLayer(AIRPORT_OVERVIEW_LABELS_ID)) map.removeLayer(AIRPORT_OVERVIEW_LABELS_ID)
    if (map.getLayer(AIRPORT_OVERVIEW_LAYER_ID)) map.removeLayer(AIRPORT_OVERVIEW_LAYER_ID)
    if (map.getSource(AIRPORT_OVERVIEW_SOURCE_ID)) map.removeSource(AIRPORT_OVERVIEW_SOURCE_ID)
  }

  const fetchKokuareaTile = async (
    tileTemplate: string,
    z: number,
    x: number,
    y: number
  ): Promise<KokuareaFC> => {
    const url = fillKokuareaTileUrl(tileTemplate, z, x, y)
    try {
      const raw = await fetchGeoJSONWithCache<KokuareaFC>(url)
      return normalizeKokuareaFCInPlace(raw)
    } catch (e) {
      // NOTE: GSIタイルは空タイルで404を返すケースがあるため、404は「空」として扱う
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('404')) return emptyKokuareaFC()
      throw e
    }
  }

  const asyncPool = async <T, R>(
    concurrency: number,
    items: T[],
    worker: (item: T) => Promise<R>
  ): Promise<R[]> => {
    const ret: R[] = []
    const executing = new Set<Promise<void>>()
    for (const item of items) {
      const p = (async () => {
        const r = await worker(item)
        ret.push(r)
      })()
      executing.add(p)
      p.finally(() => executing.delete(p))
      if (executing.size >= concurrency) {
        await Promise.race(executing)
      }
    }
    await Promise.all(executing)
    return ret
  }

  const updateKokuareaData = async (map: maplibregl.Map): Promise<void> => {
    const state = kokuareaRef.current
    if (!state.enabled || !state.tileTemplate) return

    const seq = ++state.updateSeq
    const { keys, xyzs, tooMany } = computeKokuareaZoomAndTiles(map)

    const maybeToast = (key: KokuareaToastKey, message: string): void => {
      const now = Date.now()
      if (state.lastToastKey === key) return
      if (now - state.lastToastAt < KOKUAREA_TOAST_INTERVAL_MS) return
      state.lastToastKey = key
      state.lastToastAt = now
      // 24時間間隔をlocalStorageに保存（セッション跨ぎ対応）
      try {
        localStorage.setItem('kokuarea-toast-at', String(now))
      } catch {
        // ignore
      }
      toast.info(message)
    }

    if (tooMany) {
      // タイル表示できない（ズーム不足 or 広域すぎ）場合は、全国俯瞰用の点表示を出す
      ensureAirportOverviewLayers(map)
      setAirportOverviewVisibility(map, true)

      const zoom = map.getZoom()
      if (zoom < KOKUAREA_MIN_MAP_ZOOM) {
        maybeToast(
          'zoom',
          `空港など周辺空域はズーム${KOKUAREA_MIN_MAP_ZOOM}+で詳細表示します（現在は簡易表示: Z ${zoom.toFixed(1)}）`
        )
      } else {
        maybeToast(
          'tooMany',
          '表示範囲が広すぎます。現在は空港位置を簡易表示します。ズームインすると空域が表示されます'
        )
      }
      state.tiles.clear()
      state.inflight.clear()
      state.lastKeysSig = 'tooMany'
      const src = map.getSource(KOKUAREA_SOURCE_ID)
      if (src && 'setData' in src) {
        ;(src as maplibregl.GeoJSONSource).setData(
          emptyKokuareaFC() as GeoJSON.FeatureCollection<
            GeoJSON.Geometry,
            KokuareaFeatureProperties
          >
        )
      }
      return
    }

    // タイル表示可能なら、全国俯瞰用の点表示は消す（重複・ノイズ防止）
    setAirportOverviewVisibility(map, false)
    state.lastToastKey = null

    // 使わなくなったタイルを捨てる（メモリ・feature数を抑制）
    const keep = new Set(keys)
    for (const k of Array.from(state.tiles.keys())) {
      if (!keep.has(k)) state.tiles.delete(k)
    }

    const keysSig = `${keys.length}:${keys.join('|')}`
    const toFetch = xyzs.filter((t) => !state.tiles.has(`${t.z}/${t.x}/${t.y}`))
    if (toFetch.length === 0 && state.lastKeysSig === keysSig) {
      // タイル構成が変わっていない & 追加取得も無い場合、setDataを省略（メインスレッド負荷削減）
      return
    }

    await asyncPool(KOKUAREA_FETCH_CONCURRENCY, toFetch, async (t) => {
      const key = `${t.z}/${t.x}/${t.y}`
      const inflight = state.inflight.get(key)
      if (inflight) {
        const fc = await inflight
        state.tiles.set(key, fc)
        return
      }
      const tileTemplate = state.tileTemplate
      if (!tileTemplate) return
      const p = fetchKokuareaTile(tileTemplate, t.z, t.x, t.y)
      state.inflight.set(key, p)
      try {
        const fc = await p
        state.tiles.set(key, fc)
      } finally {
        state.inflight.delete(key)
      }
    })

    // 途中でOFFになった場合など、古い更新を破棄
    if (kokuareaRef.current.updateSeq !== seq) return

    const merged: KokuareaFC = {
      type: 'FeatureCollection',
      features: keys.flatMap((k) => kokuareaRef.current.tiles.get(k)?.features ?? [])
    }

    // 地域別フィルタリング: 地域のバウンディングボックス内のフィーチャーのみを保持
    let filteredFeatures = merged.features
    if (kokuareaRef.current.regionalBounds) {
      const [[minLng, minLat], [maxLng, maxLat]] = kokuareaRef.current.regionalBounds
      filteredFeatures = merged.features.filter((f) => {
        if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
          return false
        }
        // 簡易的なバウンディングボックスチェック（正確にはポリゴンの交差判定が必要だが、パフォーマンス優先）
        const coords =
          f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]
        return coords.some((coord: number[]) => {
          const [lng, lat] = coord
          return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
        })
      })
    }

    // 衝突検出用: kokuareaのフィーチャーをAIRPORTゾーンとしてキャッシュに追加
    const validFeatures = filteredFeatures.filter(
      (f): f is typeof f & { geometry: GeoJSON.Geometry } => f.geometry !== null
    )
    if (validFeatures.length > 0) {
      const taggedFeatures: GeoJSON.Feature[] = validFeatures.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          ...(f.properties ?? {}),
          zoneType: 'AIRPORT',
          name: (f.properties as Record<string, unknown> | null)?.__koku_label ?? '空港周辺空域'
        }
      }))
      const taggedGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: taggedFeatures
      }
      restrictionGeoJSONCacheRef.current.set('airport-airspace', taggedGeoJSON)
    }

    // フィルタリング後のデータをマージ
    const filteredMerged: KokuareaFC = {
      type: 'FeatureCollection',
      features: filteredFeatures
    }

    const src = map.getSource(KOKUAREA_SOURCE_ID)
    if (src && 'setData' in src) {
      // setDataは重いので、次フレームに回して入力/描画の詰まりを軽減
      requestAnimationFrame(() => {
        const s = kokuareaRef.current
        if (!s.enabled) return
        ;(src as maplibregl.GeoJSONSource).setData(
          filteredMerged as GeoJSON.FeatureCollection<GeoJSON.Geometry, KokuareaFeatureProperties>
        )
      })
    }
    state.lastKeysSig = keysSig
  }

  const enableKokuarea = (map: maplibregl.Map, tileTemplate: string): void => {
    const state = kokuareaRef.current
    state.enabled = true
    state.tileTemplate = tileTemplate

    ensureKokuareaLayers(map)
    ensureAirportOverviewLayers(map)
    setAirportOverviewVisibility(map, map.getZoom() < KOKUAREA_MIN_MAP_ZOOM)

    // 既存listenerがあれば張り直し
    state.detach?.()
    const handler = () => {
      void updateKokuareaData(map).catch((err) => console.error('kokuarea update failed:', err))
    }
    map.on('moveend', handler)
    map.on('zoomend', handler)
    state.detach = () => {
      map.off('moveend', handler)
      map.off('zoomend', handler)
    }

    void updateKokuareaData(map).catch((err) =>
      console.error('kokuarea initial update failed:', err)
    )
  }

  const disableKokuarea = (map: maplibregl.Map): void => {
    const state = kokuareaRef.current
    const wasEnabled = state.enabled
    state.enabled = false
    state.tileTemplate = null
    // 地域別モードが無効化された場合のみregionalBoundsをクリア
    // （他の地域グループが有効な場合は保持）
    if (wasEnabled) {
      state.regionalBounds = null
    }
    state.tiles.clear()
    state.inflight.clear()
    state.detach?.()
    state.detach = null
    removeKokuareaLayers(map)
    removeAirportOverviewLayers(map)
    // 衝突検出用キャッシュをクリア
    restrictionGeoJSONCacheRef.current.delete('airport-airspace')
  }

  type RestrictionSyncOptions = {
    syncState?: boolean
  }

  // ビューポートベースのDIDレイヤー更新関数
  const updateDIDViewportLayers = async (
    map: maplibregl.Map,
    restrictionId: string,
    color: string,
    opacity: number
  ): Promise<void> => {
    const allLayers = getAllLayers()
    const visibleLayers = getLayersInViewport(map, allLayers)

    // ビューポート内のレイヤーを読み込む
    const features: GeoJSON.Feature[] = []

    await Promise.all(
      visibleLayers.map(async (layer) => {
        try {
          const data = await fetchGeoJSONWithCache<GeoJSON.FeatureCollection>(layer.path)
          if (data && data.features) {
            const tagged = data.features.map((f) => ({
              ...f,
              properties: {
                ...f.properties,
                zoneType: 'DID',
                prefecture: layer.name,
                id: f.id ?? undefined
              }
            }))
            features.push(...(tagged as GeoJSON.Feature[]))
          }
        } catch (e) {
          console.error(`Failed to load DID for ${layer.id}:`, e)
        }
      })
    )

    // ソースにデータをセット（requestAnimationFrameで遅延してメインスレッド負荷を軽減）
    requestAnimationFrame(() => {
      const source = map.getSource(restrictionId) as maplibregl.GeoJSONSource
      if (source && didViewportRef.current.enabled) {
        source.setData({
          type: 'FeatureCollection',
          features: features
        })
      }
    })
  }

  // DIDビューポートベース動的読み込みの有効化
  const enableDIDViewport = (
    map: maplibregl.Map,
    restrictionId: string,
    color: string,
    opacity: number
  ): void => {
    const state = didViewportRef.current
    state.enabled = true
    state.restrictionId = restrictionId
    state.color = color

    // 既存のイベントリスナーを削除
    state.detach?.()

    // デバウンス用のタイムアウトID
    let timeoutId: number | null = null

    const handler = () => {
      // デバウンス: 連続するイベントを抑制（300ms）
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(() => {
        if (state.enabled && state.restrictionId) {
          void updateDIDViewportLayers(map, state.restrictionId, state.color, opacity).catch(
            (err) => console.error('DID viewport update failed:', err)
          )
        }
        timeoutId = null
      }, 300)
    }

    map.on('moveend', handler)
    map.on('zoomend', handler)
    state.detach = () => {
      map.off('moveend', handler)
      map.off('zoomend', handler)
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    // 初期読み込み
    void updateDIDViewportLayers(map, restrictionId, color, opacity).catch((err) =>
      console.error('DID viewport initial update failed:', err)
    )
  }

  // DIDビューポートベース動的読み込みの無効化
  const disableDIDViewport = (): void => {
    const state = didViewportRef.current
    state.enabled = false
    state.restrictionId = null
    state.detach?.()
    state.detach = null
    if (state.updateTimeout !== null) {
      clearTimeout(state.updateTimeout)
      state.updateTimeout = null
    }
  }

  const showRestriction = useCallback(
    async (restrictionId: string, options?: RestrictionSyncOptions) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      const { syncState = true } = options ?? {}

      const facilityLayer = getFacilityLayerById(restrictionId)
      if (facilityLayer) {
        if (!map.getSource(restrictionId)) {
          // ローディング開始
          setLoadingLayers((prev) => {
            const next = new Map(prev)
            next.set(restrictionId, facilityLayer.name)
            return next
          })

          try {
            const data = await fetchGeoJSONWithCache(facilityLayer.path)
            map.addSource(restrictionId, { type: 'geojson', data })
          } catch (e) {
            console.error(`Failed to load facility data for ${restrictionId}:`, e)
            toast.error(`${facilityLayer.name}データの読み込みに失敗しました`)
            return
          } finally {
            // ローディング終了（成功・失敗どちらの場合も実行）
            setLoadingLayers((prev) => {
              const next = new Map(prev)
              next.delete(restrictionId)
              return next
            })
          }

          const pointRadius = facilityLayer.pointRadius ?? 10
          const pointRadiusByZoom: maplibregl.ExpressionSpecification = [
            'interpolate',
            ['linear'],
            ['zoom'],
            7,
            pointRadius * 0.7,
            10,
            pointRadius,
            13,
            pointRadius * 1.6,
            16,
            pointRadius * 2.4
          ]
          map.addLayer({
            id: `${restrictionId}-fill`,
            type: 'fill',
            source: restrictionId,
            filter: ['==', '$type', 'Polygon'],
            paint: { 'fill-color': facilityLayer.color, 'fill-opacity': opacity }
          })
          map.addLayer({
            id: `${restrictionId}-line`,
            type: 'line',
            source: restrictionId,
            filter: ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'LineString']],
            paint: { 'line-color': facilityLayer.color, 'line-width': 1.5 }
          })
          map.addLayer({
            id: `${restrictionId}-point`,
            type: 'circle',
            source: restrictionId,
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': pointRadiusByZoom,
              'circle-color': facilityLayer.color,
              'circle-opacity': opacity,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.2
            }
          })
          map.addLayer({
            id: `${restrictionId}-label`,
            type: 'symbol',
            source: restrictionId,
            filter: ['==', '$type', 'Point'],
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-anchor': 'top',
              'text-offset': [0, 1.1],
              'text-allow-overlap': false,
              'text-ignore-placement': false
            },
            paint: {
              'text-color': '#333',
              'text-halo-color': '#fff',
              'text-halo-width': 1.2
            }
          })
        } else {
          setFacilityLayerVisibility(map, restrictionId, 'visible')
        }

        if (syncState) {
          setRestrictionStates((prev: Map<string, boolean>) =>
            new Map(prev).set(restrictionId, true)
          )
        }
        return
      }

      let geojson: GeoJSON.FeatureCollection | null = null
      let color = ''

      if (restrictionId === 'airport-airspace') {
        const zone = getAllRestrictionZones().find((z) => z.id === restrictionId)

        // kokuareaタイルで表示を試みる
        // kokuareaタイルはベクタータイルで正確な制限区域を表示する
        // 衝突検出用のキャッシュはupdateKokuareaData()内で動的に更新される
        if (zone?.geojsonTileTemplate) {
          try {
            enableKokuarea(map, zone.geojsonTileTemplate)
            if (syncState) {
              setRestrictionStates((prev: Map<string, boolean>) =>
                new Map(prev).set(restrictionId, true)
              )
            }
            // 衝突検出用キャッシュはupdateKokuareaData()で設定される
            return
          } catch (e) {
            console.error('Failed to enable kokuarea tiles, fallback to local/circle:', e)
          }
        }

        // kokuareaタイルが使えない場合はGeoJSONで表示（この場合は衝突検出も有効）
        const airportGeoJSON: GeoJSON.FeatureCollection = generateAirportGeoJSON()
        if (airportGeoJSON) {
          const taggedFeatures = airportGeoJSON.features.map((f) => ({
            ...f,
            properties: { ...f.properties, zoneType: 'AIRPORT' }
          }))
          const taggedGeoJSON: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: taggedFeatures
          }
          restrictionGeoJSONCacheRef.current.set(restrictionId, taggedGeoJSON)
        }
        geojson = airportGeoJSON
        color = RESTRICTION_COLORS.airport
      } else if (restrictionId === 'ZONE_IDS.NO_FLY_RED') {
        geojson = generateRedZoneGeoJSON()
        // 衝突検出用にゾーンタイプを追加してキャッシュに保存
        if (geojson) {
          const taggedFeatures = geojson.features.map((f) => ({
            ...f,
            properties: { ...f.properties, zoneType: 'RED_ZONE' }
          }))
          const taggedGeoJSON: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: taggedFeatures
          }
          restrictionGeoJSONCacheRef.current.set(restrictionId, taggedGeoJSON)
        }
        color = RESTRICTION_COLORS.no_fly_red
      } else if (restrictionId === 'ZONE_IDS.NO_FLY_YELLOW') {
        geojson = generateYellowZoneGeoJSON()
        // 衝突検出用にゾーンタイプを追加してキャッシュに保存
        if (geojson) {
          const taggedFeatures = geojson.features.map((f) => ({
            ...f,
            properties: { ...f.properties, zoneType: 'YELLOW_ZONE' }
          }))
          const taggedGeoJSON: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: taggedFeatures
          }
          restrictionGeoJSONCacheRef.current.set(restrictionId, taggedGeoJSON)
        }
        color = RESTRICTION_COLORS.no_fly_yellow
      } else if (restrictionId === ZONE_IDS.DID_ALL_JAPAN) {
        // DID全国一括表示モード - ビューポートベースの動的読み込み（パフォーマンス改善）
        color = '#FF0000'

        // 楽観的UI更新
        if (syncState) {
          setRestrictionStates((prev: Map<string, boolean>) =>
            new Map(prev).set(restrictionId, true)
          )
        }

        // 既にソースがある場合は表示のみ切り替え
        if (map.getSource(restrictionId)) {
          if (map.getLayer(restrictionId)) {
            map.setLayoutProperty(restrictionId, 'visibility', 'visible')
          }
          if (map.getLayer(`${restrictionId}-outline`)) {
            map.setLayoutProperty(`${restrictionId}-outline`, 'visibility', 'visible')
          }
          // ビューポートが変わった可能性があるので、動的読み込みを更新
          void updateDIDViewportLayers(map, restrictionId, color, opacity)
          return
        }

        // 空のソースとレイヤーを先に作成（UIレスポンス向上）
        map.addSource(restrictionId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        })

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
          paint: { 'line-color': color, 'line-width': 1 }
        })

        // ビューポートベースの動的読み込みを有効化
        enableDIDViewport(map, restrictionId, color, opacity)
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
      if (syncState) {
        setRestrictionStates((prev: Map<string, boolean>) => new Map(prev).set(restrictionId, true))
      }
    },
    [mapLoaded, opacity]
  )

  const hideRestriction = useCallback(
    (restrictionId: string, options?: RestrictionSyncOptions) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      const { syncState = true } = options ?? {}

      // Hide
      if (getFacilityLayerById(restrictionId)) {
        setFacilityLayerVisibility(map, restrictionId, 'none')
      } else if (restrictionId === ZONE_IDS.DID_ALL_JAPAN) {
        // ビューポートベース動的読み込みを無効化
        disableDIDViewport()
        // 単一レイヤーを非表示
        if (map.getLayer(restrictionId)) {
          map.setLayoutProperty(restrictionId, 'visibility', 'none')
        }
        if (map.getLayer(`${restrictionId}-outline`)) {
          map.setLayoutProperty(`${restrictionId}-outline`, 'visibility', 'none')
        }
      } else if (restrictionId === 'airport-airspace') {
        // kokuarea（タイルGeoJSON）表示の場合
        disableKokuarea(map)
        // 衝突検出用キャッシュからも削除
        if (restrictionGeoJSONCacheRef.current.has(restrictionId)) {
          restrictionGeoJSONCacheRef.current.delete(restrictionId)
        }
      } else {
        if (map.getLayer(restrictionId)) {
          map.setLayoutProperty(restrictionId, 'visibility', 'none')
          map.setLayoutProperty(`${restrictionId}-outline`, 'visibility', 'none')
        }
        if (map.getLayer(`${restrictionId}-labels`)) {
          map.setLayoutProperty(`${restrictionId}-labels`, 'visibility', 'none')
        }
        // 衝突検出用キャッシュからも削除（レッド/イエローゾーン）
        if (restrictionGeoJSONCacheRef.current.has(restrictionId)) {
          restrictionGeoJSONCacheRef.current.delete(restrictionId)
        }
      }
      if (syncState) {
        setRestrictionStates((prev: Map<string, boolean>) =>
          new Map(prev).set(restrictionId, false)
        )
      }
    },
    [mapLoaded]
  )

  const toggleRestriction = async (restrictionId: string) => {
    // refから最新の状態を取得（キーボードショートカット対応）
    const isVisible = restrictionStatesRef.current.get(restrictionId) ?? false

    if (!isVisible) {
      await showRestriction(restrictionId)
    } else {
      hideRestriction(restrictionId)
    }
  }

  // ============================================
  // Bulk Toggle Logic
  // ============================================

  // 重要施設周辺空域（小型無人機等飛行禁止法）
  const CRITICAL_FACILITY_IDS = [
    ...CRITICAL_FACILITY_LAYERS.map((f) => f.id),
    ZONE_IDS.NO_FLY_RED,
    ZONE_IDS.NO_FLY_YELLOW
  ]

  // 参考情報
  const REFERENCE_FACILITY_IDS = REFERENCE_FACILITY_LAYERS.map((f) => f.id)

  // 後方互換性のため
  const FACILITY_DATA_IDS = FACILITY_LAYERS.map((f) => f.id)
  const NO_FLY_LAW_IDS = [ZONE_IDS.NO_FLY_RED, ZONE_IDS.NO_FLY_YELLOW]

  const getGroupCheckState = (ids: string[]) => {
    const visibleCount = ids.filter((id) => restrictionStates.get(id)).length
    if (visibleCount === 0) return false
    if (visibleCount === ids.length) return true
    return 'mixed' // Indeterminate
  }

  const toggleRestrictionGroup = async (ids: string[]) => {
    const currentState = getGroupCheckState(ids)
    // If mixed or false -> turn all ON. If true -> turn all OFF.
    const shouldShow = currentState !== true

    if (shouldShow) {
      for (const id of ids) {
        if (!restrictionStatesRef.current.get(id)) {
          // Use syncState: false to prevent individual state updates
          await showRestriction(id, { syncState: false })
        }
      }
    } else {
      for (const id of ids) {
        if (restrictionStatesRef.current.get(id)) {
          hideRestriction(id, { syncState: false })
        }
      }
    }

    // Batch update state
    setRestrictionStates((prev: Map<string, boolean>) => {
      const next = new Map(prev)
      ids.forEach((id) => next.set(id, shouldShow))
      return next
    })
  }

  const isRestrictionVisible = (id: string) => restrictionStates.get(id) ?? false

  type InfoModalKey = 'restrictions' | 'facilities' | 'noFlyLaw' | 'did'

  const INFO_MODAL_CONTENT: Record<
    InfoModalKey,
    { title: string; lead: string; bullets: string[] }
  > = {
    restrictions: {
      title: 'NFZ（航空法：空港周辺空域）について',
      lead: '航空法に基づく空港周辺の制限空域です。',
      bullets: [
        '空港周辺空域は国土地理院の空域タイルと国土数値情報の空港敷地を併用しています。',
        '空港周辺空域はズーム8未満では位置の簡易表示（点）に切り替わります。',
        '航空法により航空機の安全確保のための空域（制限表面）として設定されています。'
      ]
    },

    facilities: {
      title: '参考情報について',
      lead: 'OSMや自治体オープンデータを加工した参考情報です。',
      bullets: [
        '有人機発着地（ヘリポート等）、消防署、医療機関などを表示します。',
        '通常は規制なしですが、災害時は「緊急用務空域」指定の可能性があります。',
        '公式の規制区分ではなく、位置情報の目安として活用してください。',
        '実際の飛行前はDIPS/NOTAM確認が必須です。'
      ]
    },
    noFlyLaw: {
      title: '重要施設周辺空域（小型無人機等飛行禁止法）について',
      lead: '小型無人機等飛行禁止法に基づく重要施設周辺の飛行禁止/注意区域です。',
      bullets: [
        '駐屯地・基地: 防衛関係施設',
        'レッドゾーン: 重要施設敷地で原則飛行禁止',
        'イエローゾーン: 周辺300mで事前通報必要',
        '現在はサンプルデータのため、必ずDIPSの最新情報で確認してください。'
      ]
    },
    did: {
      title: '飛行注意区域（DID）について',
      lead: '国勢調査に基づく統計データ（人口集中地区）です。',
      bullets: [
        '更新周期が長く、最新の市街地変化や施設増減とずれる場合があります。',
        'DID内の飛行は許可が必要な場合があるため、事前確認が必須です。',
        '【表示方法について】地方ごとに分類されているのは、パフォーマンス向上のためです。47都道府県すべてを一度に読み込むと、大量のデータ（数万〜数十万のポリゴン）がメモリに読み込まれ、GPU/CPU/メモリを急激に消費して画面が重くなります。',
        '【推奨使用方法】必要な地域だけを選択して表示することで、快適に動作します。「全国一括表示」はビューポートベースの動的読み込みにより、表示範囲内の都道府県のみを自動的に読み込むため、パフォーマンスが改善されていますが、広域表示時は重くなる可能性があります。',
        '【地方別表示の利点】各地域グループから必要な都道府県を個別に選択することで、必要なデータだけを読み込み、メモリ使用量とレンダリング負荷を最小限に抑えられます。',
        '【トラブルシューティング】地域のDIDレイヤーがうまく表示されない時は、ページをリロード（F5 または Ctrl+R）してください。それでも解決しない場合は、スーパーリロード（Ctrl+Shift+R または Cmd+Shift+R）を試してください。'
      ]
    }
  }

  const [infoModalKey, setInfoModalKey] = useState<InfoModalKey | null>(null)

  const InfoBadge = ({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '14px',
        height: '14px',
        borderRadius: '999px',
        border: '1px solid #799',
        fontSize: '12px',
        lineHeight: 1,
        color: '#799',
        background: 'transparent',
        cursor: 'pointer'
      }}
    >
      ?
    </button>
  )

  const FACILITY_LAYER_SUFFIXES = ['fill', 'line', 'point', 'label'] as const

  const getFacilityLayerBaseId = (layerId: string): string | null => {
    if (!layerId.startsWith('facility-')) return null
    return layerId.replace(/-(fill|line|point|label)$/, '')
  }

  const setFacilityLayerVisibility = (
    map: maplibregl.Map,
    facilityId: string,
    visibility: 'visible' | 'none'
  ): void => {
    FACILITY_LAYER_SUFFIXES.forEach((suffix) => {
      const layerId = `${facilityId}-${suffix}`
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility)
      }
    })
  }

  const getRestrictionZoneByLayerId = (layerId: string): RestrictionZone | undefined => {
    const zones = getAllRestrictionZones()
    if (layerId.startsWith('airport-airspace')) {
      return zones.find((zone) => zone.id === 'airport-airspace')
    }
    if (layerId.startsWith('did-') || layerId.includes('DID_ALL_JAPAN')) {
      return zones.find((zone) => zone.id === 'did-area')
    }
    if (layerId.includes('NO_FLY_RED') || layerId.includes('no-fly-red')) {
      return zones.find((zone) => zone.id === 'no-fly-red')
    }
    if (layerId.includes('NO_FLY_YELLOW') || layerId.includes('no-fly-yellow')) {
      return zones.find((zone) => zone.id === 'no-fly-yellow')
    }
    if (layerId.includes('EMERGENCY')) {
      return zones.find((zone) => zone.id === 'emergency-airspace')
    }
    if (layerId.includes('MANNED')) {
      return zones.find((zone) => zone.id === 'manned-aircraft')
    }
    if (layerId.includes('REMOTE')) {
      return zones.find((zone) => zone.id === 'remote-id-zone')
    }
    return undefined
  }

  useEffect(() => {
    if (!mapLoaded) return
    restrictionStates.forEach((isVisible, restrictionId) => {
      if (isVisible) {
        void showRestriction(restrictionId, { syncState: false })
      }
    })
  }, [mapLoaded, restrictionStates, showRestriction])

  // ============================================
  // Custom layer management
  // ============================================
  const handleCustomLayerAdded = useCallback(
    (layer: CustomLayer, options?: { focus?: boolean }) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      // NOTE: 既存ソースがあっても、欠けているサブレイヤー（Point/Line等）があれば追加する
      if (!map.getSource(layer.id)) {
        map.addSource(layer.id, { type: 'geojson', data: layer.data })
      }

      // Polygon fill
      if (!map.getLayer(layer.id)) {
        map.addLayer({
          id: layer.id,
          type: 'fill',
          source: layer.id,
          filter: ['==', '$type', 'Polygon'],
          paint: { 'fill-color': layer.color, 'fill-opacity': layer.opacity }
        })
      }

      // Polygon outline
      if (!map.getLayer(`${layer.id}-outline`)) {
        map.addLayer({
          id: `${layer.id}-outline`,
          type: 'line',
          source: layer.id,
          filter: ['==', '$type', 'Polygon'],
          paint: { 'line-color': layer.color, 'line-width': 2 }
        })
      }

      // LineString (routes)
      if (!map.getLayer(`${layer.id}-line`)) {
        map.addLayer({
          id: `${layer.id}-line`,
          type: 'line',
          source: layer.id,
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': layer.color,
            'line-width': 2,
            'line-opacity': Math.min(1, layer.opacity + 0.2)
          }
        })
      }

      // Point (WP)
      if (!map.getLayer(`${layer.id}-point`)) {
        map.addLayer({
          id: `${layer.id}-point`,
          type: 'circle',
          source: layer.id,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-color': layer.color,
            'circle-radius': 5,
            'circle-opacity': 0.95,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1
          }
        })
      }
      setCustomLayerVisibility((prev: Set<string>) => new Set(prev).add(layer.id))

      if (options?.focus) {
        const bounds = getGeoJSONBounds(layer.data)
        if (bounds) {
          map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
        }
      }
    },
    [mapLoaded]
  )

  const handleCustomLayerRemoved = useCallback((layerId: string) => {
    const map = mapRef.current
    if (!map) return

    const ids = [layerId, `${layerId}-outline`, `${layerId}-line`, `${layerId}-point`]
    ids.forEach((id) => {
      if (map.getLayer(id)) {
        map.removeLayer(id)
      }
    })
    if (map.getSource(layerId)) {
      map.removeSource(layerId)
    }
    setCustomLayerVisibility((prev: Set<string>) => {
      const next = new Set(prev)
      next.delete(layerId)
      return next
    })
  }, [])

  const handleCustomLayerFocus = useCallback(
    (layerId: string) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      const layers = getCustomLayers()
      const layer = layers.find((l) => l.id === layerId)
      if (!layer) return

      const bounds = getGeoJSONBounds(layer.data)
      if (!bounds) return

      map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
    },
    [mapLoaded]
  )

  // ============================================
  // Comparison Layer Visibility Control
  // ============================================
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    ISHIKAWA_NOTO_COMPARISON_LAYERS.forEach((layerConfig) => {
      const isVisible = comparisonLayerVisibility.has(layerConfig.id)
      const visibility = isVisible ? 'visible' : 'none'

      if (map.getLayer(layerConfig.id)) {
        map.setLayoutProperty(layerConfig.id, 'visibility', visibility)
      }
      if (map.getLayer(`${layerConfig.id}-heat`)) {
        map.setLayoutProperty(`${layerConfig.id}-heat`, 'visibility', visibility)
      }
      if (map.getLayer(`${layerConfig.id}-outline`)) {
        map.setLayoutProperty(`${layerConfig.id}-outline`, 'visibility', visibility)
      }
      if (map.getLayer(`${layerConfig.id}-label`)) {
        map.setLayoutProperty(`${layerConfig.id}-label`, 'visibility', visibility)
      }
    })
  }, [comparisonLayerVisibility, mapLoaded])

  // ============================================
  // Comparison Layer Opacity Control
  // ============================================
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    comparisonLayerOpacity.forEach((opacity, layerId) => {
      const layer = map.getLayer(layerId)
      const heat = map.getLayer(`${layerId}-heat`)
      if (heat && heat.type === 'heatmap') {
        map.setPaintProperty(`${layerId}-heat`, 'heatmap-opacity', opacity)
      }
      if (!layer) return

      if (layer.type === 'circle') {
        map.setPaintProperty(layerId, 'circle-opacity', opacity)
        map.setPaintProperty(layerId, 'circle-stroke-opacity', opacity * 0.8)
        return
      }

      if (layer.type === 'fill') {
        map.setPaintProperty(layerId, 'fill-opacity', opacity)
        if (map.getLayer(`${layerId}-outline`)) {
          map.setPaintProperty(`${layerId}-outline`, 'line-opacity', Math.min(1, opacity * 0.9))
        }
      }
    })
  }, [comparisonLayerOpacity, mapLoaded])

  const handleCustomLayerToggle = useCallback(
    (layerId: string, visible: boolean) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      // レイヤーがまだ追加されていない場合は追加
      if (visible && !map.getSource(layerId)) {
        const customLayers = getCustomLayers()
        const layer = customLayers.find((l) => l.id === layerId)
        if (layer) {
          handleCustomLayerAdded(layer)
          return
        }
      }

      const visibility = visible ? 'visible' : 'none'
      ;[layerId, `${layerId}-outline`, `${layerId}-line`, `${layerId}-point`].forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visibility)
        }
      })

      setCustomLayerVisibility((prev: Set<string>) => {
        const next = new Set(prev)
        if (visible) {
          next.add(layerId)
        } else {
          next.delete(layerId)
        }
        return next
      })
    },
    [mapLoaded, handleCustomLayerAdded]
  )

  // ============================================
  // Ishikawa Noto Comparison Layer Handlers
  // ============================================
  const handleComparisonLayerToggle = useCallback(
    (layerId: string, visible: boolean) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return
      if (baseMap !== 'osm') return
      if (visible) {
        const bounds = comparisonLayerBoundsRef.current.get(layerId)
        if (bounds) {
          try {
            map.fitBounds(bounds, { padding: 50, maxZoom: 14 })
          } catch {
            // ignore
          }
        }
      }

      setComparisonLayerVisibility((prev: Set<string>) => {
        const next = new Set(prev)
        if (visible) next.add(layerId)
        else next.delete(layerId)
        comparisonLayerVisibilityRef.current = next
        return next
      })
    },
    [mapLoaded, baseMap]
  )

  const handleComparisonLayerOpacityChange = useCallback((layerId: string, opacity: number) => {
    setComparisonLayerOpacity((prev: Map<string, number>) => new Map(prev).set(layerId, opacity))
  }, [])

  // ============================================
  // Sidebar Resizing Logic
  // ============================================
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        // 左サイドバー: 最小200px, 最大600px
        const newWidth = Math.max(200, Math.min(e.clientX, 600))
        setLeftSidebarWidth(newWidth)
      } else if (isResizingRight) {
        // 右サイドバー: 最小200px, 最大600px
        const newWidth = Math.max(200, Math.min(window.innerWidth - e.clientX, 600))
        setRightSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizingLeft || isResizingRight) {
        setIsResizingLeft(false)
        setIsResizingRight(false)
        document.body.style.cursor = 'default'
        document.body.style.userSelect = 'auto'
      }
    }

    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingLeft, isResizingRight])

  // ============================================
  // Render
  // ============================================
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        position: 'relative',
        backgroundColor: theme.colors.pageBg,
        color: theme.colors.text,
        colorScheme: darkMode ? 'dark' : 'light'
      }}
    >
      {/* Left Toggle Button */}
      <button
        onClick={() => setShowLeftLegend(!showLeftLegend)}
        style={{
          position: 'fixed',
          left: showLeftLegend ? leftSidebarWidth : 0,
          top: 80,
          width: 24,
          height: 48,
          background: theme.colors.panelBg,
          color: theme.colors.textMuted,
          border: 'none',
          borderRadius: '0 8px 8px 0',
          cursor: 'pointer',
          boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: isResizingLeft ? 'none' : 'left 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px'
        }}
        title={showLeftLegend ? 'サイドバーを閉じる' : 'サイドバーを開く'}
      >
        {showLeftLegend ? '◀' : '▶'}
      </button>

      {/* Left Legend Panel */}
      <aside
        style={{
          position: 'absolute',
          left: showLeftLegend ? 0 : -leftSidebarWidth,
          top: 0,
          bottom: 0,
          width: `${leftSidebarWidth}px`,
          padding: '12px',
          backgroundColor: theme.colors.panelBg,
          color: theme.colors.text,
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 10,
          transition: isResizingLeft ? 'none' : 'left 0.3s ease',
          boxShadow: theme.shadows.panel,
          fontSize: '14px'
        }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizingLeft(true)
          }}
          title="ドラッグして幅を変更"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '8px',
            height: '100%',
            cursor: 'col-resize',
            zIndex: 100,
            transition: 'background-color 0.2s',
            backgroundColor: 'transparent'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(51, 136, 255, 0.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        />

        {/* App Header with Logo and Subtitle */}
        <AppHeader />

        {/* Search */}
        <div style={{ marginBottom: '12px', position: 'relative' }}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="検索... (⌘K)"
            title="飛行注意区域（DID）と地名・建物名を検索します。市区町村名や地名を入力してください。DIDは地方ごとに分類されており、必要な地域のみを読み込むことでパフォーマンスを向上させています。"
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
            <div
              style={{
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
              }}
            >
              {/* DID検索結果 */}
              {searchResults.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      color: darkMode ? '#888' : '#666',
                      backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5'
                    }}
                  >
                    飛行注意区域（DID）
                  </div>
                  {searchResults.map((item, index) => (
                    <div
                      key={`did-${item.prefName}-${item.cityName}-${index}`}
                      onClick={() => {
                        flyToFeature(item)
                        setSearchTerm('')
                      }}
                      style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        borderBottom: `1px solid ${darkMode ? '#444' : '#eee'}`,
                        fontSize: '12px',
                        color: darkMode ? '#fff' : '#333'
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#f0f0f0')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span style={{ color: darkMode ? '#aaa' : '#888', marginRight: '4px' }}>
                        {item.prefName}
                      </span>
                      {item.cityName}
                    </div>
                  ))}
                </>
              )}
              {/* ジオコーディング結果 */}
              {isGeoSearching && (
                <div
                  style={{
                    padding: '8px',
                    fontSize: '12px',
                    color: darkMode ? '#aaa' : '#666',
                    textAlign: 'center'
                  }}
                >
                  検索中...
                </div>
              )}
              {geoSearchResults.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      color: darkMode ? '#888' : '#666',
                      backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5'
                    }}
                  >
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
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#f0f0f0')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{result.displayName.split(',')[0]}</div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: darkMode ? '#888' : '#999',
                          marginTop: '2px'
                        }}
                      >
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
        <div
          style={{ marginBottom: '12px' }}
          title="マップの背景地図スタイルを変更します（Mで切替）"
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                gap: '6px',
                flexWrap: 'nowrap',
                alignItems: 'center',
                overflowX: 'auto',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: '2px',
                marginRight: '4px',
                flex: '1 1 auto'
              }}
            >
              {(Object.keys(BASE_MAPS) as BaseMapKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => handleBaseMapChange(key)}
                  style={{
                    flex: '0 0 auto',
                    padding: '4px 8px',
                    minWidth: '44px',
                    fontSize: '12px',
                    backgroundColor: baseMap === key ? '#4a90d9' : theme.colors.buttonBg,
                    color: baseMap === key ? '#fff' : theme.colors.text,
                    border: `1px solid ${baseMap === key ? '#4a90d9' : theme.colors.borderStrong}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {BASE_MAPS[key].name}
                </button>
              ))}
            </div>
            <span
              style={{
                fontSize: '12px',
                color: theme.colors.textMuted,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              [M]
            </span>
          </div>
        </div>

        {/* Opacity slider */}
        <div
          style={{ marginBottom: '12px' }}
          title="DIDレイヤーと制限エリアレイヤーの透明度を調整します"
        >
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

        {/* Coordinate & Crosshair Settings */}
        <div
          style={{
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          {/* Tooltip toggle */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label
              title="マップ上にマウスをホバーした時に、DID情報や制限区域の詳細をポップアップ表示します"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={showTooltip}
                onChange={(e) => setShowTooltip(e.target.checked)}
              />
              <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>ツールチップ [T]</span>
            </label>
            {showTooltip && (
              <label
                style={{
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
                title="オフにするとマウスを離すまで表示し続けます"
              >
                <input
                  type="checkbox"
                  checked={tooltipAutoFade}
                  onChange={(e) => setTooltipAutoFade(e.target.checked)}
                />
                自動で消える
              </label>
            )}
          </div>

          {/* Crosshair settings */}
          <div
            style={{
              padding: '8px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              borderRadius: '6px'
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              ⊕ 中心十字 [X]
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <label
                style={{
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={showFocusCrosshair}
                  onChange={(e) => setShowFocusCrosshair(e.target.checked)}
                />
                表示
              </label>
              {showFocusCrosshair && (
                <>
                  <select
                    value={crosshairDesign}
                    onChange={(e) => setCrosshairDesign(e.target.value as CrosshairDesign)}
                    style={{
                      fontSize: '12px',
                      padding: '2px 4px',
                      backgroundColor: darkMode ? '#333' : '#fff',
                      color: darkMode ? '#e0e0e0' : '#333',
                      border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
                      borderRadius: '4px'
                    }}
                  >
                    <option value="square">□ 四角</option>
                    <option value="circle">○ 円形</option>
                    <option value="minimal">＋ シンプル</option>
                  </select>
                  <select
                    value={crosshairColor}
                    onChange={(e) => setCrosshairColor(e.target.value)}
                    style={{
                      fontSize: '12px',
                      padding: '2px 4px',
                      backgroundColor: darkMode ? '#333' : '#fff',
                      color: darkMode ? '#e0e0e0' : '#333',
                      border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
                      borderRadius: '4px'
                    }}
                    title="十字の色"
                  >
                    <option value="#e53935">🔴 赤</option>
                    <option value="#1e88e5">🔵 青</option>
                    <option value="#00bcd4">🩵 シアン</option>
                    <option value="#ffffff">⚪ 白</option>
                    <option value="#4caf50">🟢 緑</option>
                  </select>
                  <label
                    style={{
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={crosshairClickCapture}
                      onChange={(e) => setCrosshairClickCapture(e.target.checked)}
                    />
                    クリックで座標
                  </label>
                  {crosshairClickCapture && (
                    <select
                      value={coordFormat}
                      onChange={(e) => setCoordFormat(e.target.value as 'decimal' | 'dms')}
                      style={{
                        fontSize: '12px',
                        padding: '2px 4px',
                        backgroundColor: darkMode ? '#333' : '#fff',
                        color: darkMode ? '#e0e0e0' : '#333',
                        border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
                        borderRadius: '4px'
                      }}
                      title="座標形式"
                    >
                      <option value="decimal">10進数</option>
                      <option value="dms">60進数</option>
                    </select>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Drawing Tools - サイドバー内に埋め込み */}
        <DrawingTools
          map={mapRef.current}
          mapLoaded={mapLoaded}
          prohibitedAreas={prohibitedAreas}
          darkMode={darkMode}
          embedded={true}
          onOpenHelp={() => setShowHelp(true)}
          onDrawModeChange={setActiveDrawMode}
          onUndoRedoReady={(handlers) => {
            undoRedoHandlersRef.current = handlers
          }}
          onUndoRedoStateChange={(state) => {
            setUndoRedoState(state)
          }}
          onFeaturesChange={(features) => {
            // Display coordinates when a new feature is added
            if (features.length > previousFeaturesRef.current.length) {
              const lastFeature = features[features.length - 1]
              // Use center for circles and point, or first coordinate for lines
              let center: [number, number] | null = null

              if (lastFeature.type === 'circle' && lastFeature.center) {
                center = lastFeature.center
              } else if (lastFeature.type === 'point' && Array.isArray(lastFeature.coordinates)) {
                center = lastFeature.coordinates as [number, number]
              } else if (
                lastFeature.type === 'polygon' &&
                Array.isArray(lastFeature.coordinates) &&
                lastFeature.coordinates.length > 0
              ) {
                const outerRing = lastFeature.coordinates[0] as [number, number][]
                if (outerRing.length > 0) {
                  let sumLng = 0,
                    sumLat = 0
                  outerRing.forEach((coord) => {
                    sumLng += coord[0]
                    sumLat += coord[1]
                  })
                  center = [sumLng / outerRing.length, sumLat / outerRing.length]
                }
              } else if (
                lastFeature.type === 'line' &&
                Array.isArray(lastFeature.coordinates) &&
                lastFeature.coordinates.length > 0
              ) {
                const lineCoords = lastFeature.coordinates as [number, number][]
                const midIndex = Math.floor(lineCoords.length / 2)
                center = lineCoords[midIndex]
              }
            }
            previousFeaturesRef.current = features
          }}
        />

        {/* Restriction Areas Section */}
        <div
          style={{
            marginBottom: '12px',
            padding: '8px',
            backgroundColor: darkMode ? '#222' : '#f8f8f8',
            borderRadius: '4px'
          }}
        >
          {/* NFZ（航空法：空港周辺空域） */}
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: '14px',
              fontWeight: 600,
              borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              paddingBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            NFZ（航空法：空港周辺空域）
            <InfoBadge
              ariaLabel="NFZ（航空法：空港周辺空域）の説明"
              onClick={() => setInfoModalKey('restrictions')}
            />
          </h3>
          <label
            title="空港周辺の一定範囲内：無人機飛行は許可が必要 [A]（ズーム8+で詳細、ズーム8未満は位置を簡易表示）"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={isRestrictionVisible('airport-airspace')}
              onChange={() => toggleRestriction('airport-airspace')}
            />
            <span
              style={{
                width: '14px',
                height: '14px',
                backgroundColor: RESTRICTION_COLORS.airport,
                borderRadius: '2px'
              }}
            />
            <span>空港など周辺空域 [A]</span>
          </label>
          {isRestrictionVisible('airport-airspace') && (mapZoom ?? 0) < 8 && (
            <div
              style={{
                marginTop: '-4px',
                marginBottom: '6px',
                paddingLeft: '22px',
                fontSize: '12px',
                color: darkMode ? '#888' : '#777'
              }}
            >
              ズーム8未満は空港位置を点で簡易表示（現在 Z{' '}
              {mapZoom !== null ? mapZoom.toFixed(1) : '--'}）
              <div style={{ marginTop: '2px' }}>
                点の色：紫=民間空港（国際/国内） / 赤=軍用基地 / 橙=ヘリポート
              </div>
            </div>
          )}

          {/* DID（航空法：人口集中地区） */}
          <h3
            style={{
              margin: '16px 0 8px',
              fontSize: '14px',
              fontWeight: 600,
              borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              paddingBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            DID（航空法：人口集中地区）
            <InfoBadge
              ariaLabel="DID（航空法：人口集中地区）の説明"
              onClick={() => setInfoModalKey('did')}
            />
          </h3>
          <label
            title="人口が密集している地区：航空法により飛行に許可が必要な区域 [D]"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={isRestrictionVisible(ZONE_IDS.DID_ALL_JAPAN)}
              onChange={() => toggleRestriction(ZONE_IDS.DID_ALL_JAPAN)}
            />
            <span
              style={{
                width: '14px',
                height: '14px',
                backgroundColor: '#FF0000',
                borderRadius: '2px'
              }}
            />
            <span>人口集中地区（全国） [D]</span>
          </label>

          {/* 重要施設周辺空域（小型無人機等飛行禁止法） */}
          <h3
            style={{
              margin: '16px 0 8px',
              fontSize: '14px',
              fontWeight: 600,
              borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              paddingBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            重要施設周辺空域（小型無人機等飛行禁止法）
            <InfoBadge
              ariaLabel="重要施設周辺空域（小型無人機等飛行禁止法）の説明"
              onClick={() => setInfoModalKey('noFlyLaw')}
            />
          </h3>
          <div
            style={{
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={getGroupCheckState(CRITICAL_FACILITY_IDS) === true}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = getGroupCheckState(CRITICAL_FACILITY_IDS) === 'mixed'
                  }
                }}
                onChange={() => toggleRestrictionGroup(CRITICAL_FACILITY_IDS)}
              />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>全て</span>
            </label>
          </div>
          {/* 駐屯地・基地 */}
          {CRITICAL_FACILITY_LAYERS.map((facility) => (
            <label
              key={facility.id}
              title={`${facility.name}：${facility.description ?? '参考データ'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
                marginLeft: '20px',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={isRestrictionVisible(facility.id)}
                onChange={() => toggleRestriction(facility.id)}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: facility.color,
                  borderRadius: '2px'
                }}
              />
              <span>{facility.name} [J]</span>
            </label>
          ))}
          {/* レッドゾーン */}
          <label
            title="レッドゾーン * [R]：飛行禁止区域（サンプルデータ）"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
              marginLeft: '20px',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.NO_FLY_RED')}
              onChange={() => toggleRestriction('ZONE_IDS.NO_FLY_RED')}
            />
            <span
              style={{
                width: '14px',
                height: '14px',
                backgroundColor: RESTRICTION_COLORS.no_fly_red,
                borderRadius: '2px'
              }}
            />
            <span>レッドゾーン * [R]</span>
          </label>
          {/* イエローゾーン */}
          <label
            title="イエローゾーン * [Y]：要許可区域（サンプルデータ）"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
              marginLeft: '20px',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={isRestrictionVisible('ZONE_IDS.NO_FLY_YELLOW')}
              onChange={() => toggleRestriction('ZONE_IDS.NO_FLY_YELLOW')}
            />
            <span
              style={{
                width: '14px',
                height: '14px',
                backgroundColor: RESTRICTION_COLORS.no_fly_yellow,
                borderRadius: '2px'
              }}
            />
            <span>イエローゾーン * [Y]</span>
          </label>

          {/* 参考情報 */}
          <h3
            style={{
              margin: '16px 0 8px',
              fontSize: '14px',
              fontWeight: 600,
              borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              paddingBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            参考情報（※実際の飛行前はDIPS/NOTAM確認必須）
            <InfoBadge ariaLabel="参考情報の説明" onClick={() => setInfoModalKey('facilities')} />
          </h3>
          <div
            style={{
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={getGroupCheckState(REFERENCE_FACILITY_IDS) === true}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = getGroupCheckState(REFERENCE_FACILITY_IDS) === 'mixed'
                  }
                }}
                onChange={() => toggleRestrictionGroup(REFERENCE_FACILITY_IDS)}
              />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>全て</span>
            </label>
          </div>
          {REFERENCE_FACILITY_LAYERS.map((facility) => (
            <label
              key={facility.id}
              title={`${facility.name}：${facility.description ?? '参考データ'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
                marginLeft: '20px',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={isRestrictionVisible(facility.id)}
                onChange={() => toggleRestriction(facility.id)}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: facility.color,
                  borderRadius: '2px'
                }}
              />
              <span>
                {facility.name} [
                {facility.id === 'facility-landing'
                  ? 'H'
                  : facility.id === 'facility-fire'
                    ? 'F'
                    : facility.id === 'facility-medical'
                      ? 'O'
                      : ''}
                ]
              </span>
            </label>
          ))}
          <div
            style={{
              fontSize: '12px',
              color: darkMode ? '#777' : '#999',
              paddingLeft: '20px',
              marginTop: '4px'
            }}
          >
            OSMや自治体オープンデータなどの参考情報です
          </div>
        </div>

        {/* DID Section */}
        <div>
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            飛行注意区域（DID）と空港空域（NFZ）
            <InfoBadge ariaLabel="DIDの説明" onClick={() => setInfoModalKey('did')} />
          </h3>
          <div
            style={{
              fontSize: '12px',
              color: darkMode ? '#999' : '#666',
              marginBottom: '8px',
              lineHeight: '1.4',
              padding: '4px 0'
            }}
          >
            地方ごとに分類されているのは、パフォーマンス向上のためです。47都道府県すべてを一度に読み込むと画面が重くなるため、必要な地域だけを選択して表示することを推奨します。
          </div>
          {LAYER_GROUPS.map((group) => (
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
                  <div
                    style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}
                  >
                    <button
                      onClick={() => enableAllInGroup(group)}
                      title="この地域の都道府県をすべて表示（地方ごとに分類されているのは、パフォーマンス向上のためです）"
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '12px',
                        backgroundColor: darkMode ? '#3a3a3a' : '#f2f2f2',
                        color: darkMode ? '#fff' : '#333',
                        border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        minWidth: '60px'
                      }}
                    >
                      全表示
                    </button>
                    <button
                      onClick={() => enableAllInGroupRed(group)}
                      title="この地域の飛行注意区域（DID）を一律赤色で表示（地方ごとに分類されているのは、パフォーマンス向上のためです）"
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '12px',
                        backgroundColor: darkMode
                          ? 'rgba(255, 82, 82, 0.18)'
                          : 'rgba(255, 82, 82, 0.12)',
                        color: darkMode ? '#ff8a80' : '#d32f2f',
                        border: `1px solid ${darkMode ? 'rgba(255, 138, 128, 0.65)' : 'rgba(211, 47, 47, 0.55)'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        minWidth: '60px'
                      }}
                    >
                      全赤色
                    </button>
                    <button
                      onClick={() => disableAllInGroup(group)}
                      title="この地域の都道府県をすべて非表示"
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '12px',
                        backgroundColor: darkMode ? '#3a3a3a' : '#f2f2f2',
                        color: darkMode ? '#fff' : '#333',
                        border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        minWidth: '60px'
                      }}
                    >
                      全非表示
                    </button>
                  </div>
                  <button
                    onClick={() => enableDIDNFZForGroup(group)}
                    title="この地域の飛行注意区域（DID）と空港空域（NFZ）を同時に表示。地方ごとに分類されているのは、パフォーマンス向上のためです（必要な地域のみを読み込むことで軽量に動作します）。"
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      backgroundColor: darkMode
                        ? 'rgba(156, 39, 176, 0.18)'
                        : 'rgba(156, 39, 176, 0.12)',
                      color: darkMode ? '#ce93d8' : '#7b1fa2',
                      border: `1px solid ${darkMode ? 'rgba(206, 147, 216, 0.65)' : 'rgba(123, 31, 162, 0.55)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      marginBottom: '4px'
                    }}
                  >
                    DID+NFZ表示
                  </button>
                  {group.layers.map((layer) => (
                    <label
                      key={layer.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 0',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isLayerVisible(layer.id)}
                        onChange={() => toggleLayer(layer)}
                      />
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          backgroundColor:
                            getDidGroupMode(group.name) === 'red' ? '#ff0000' : layer.color,
                          borderRadius: '2px'
                        }}
                      />
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
          right: showRightLegend ? rightSidebarWidth : 0,
          top: 80,
          width: 24,
          height: 48,
          background: darkMode ? 'rgba(30,30,40,0.9)' : 'rgba(255,255,255,0.9)',
          color: darkMode ? '#aaa' : '#666',
          border: 'none',
          borderRadius: '8px 0 0 8px',
          cursor: 'pointer',
          boxShadow: '-2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: isResizingRight ? 'none' : 'right 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px'
        }}
        title={showRightLegend ? 'サイドバーを閉じる' : 'サイドバーを開く'}
      >
        {showRightLegend ? '▶' : '◀'}
      </button>

      {/* Right Legend Panel */}
      <aside
        style={{
          position: 'absolute',
          right: showRightLegend ? 0 : -rightSidebarWidth,
          top: 0,
          bottom: 0,
          width: `${rightSidebarWidth}px`,
          padding: '12px',
          backgroundColor: darkMode ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)',
          color: darkMode ? '#fff' : '#333',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 10,
          transition: isResizingRight ? 'none' : 'right 0.3s ease',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
          fontSize: '14px'
        }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizingRight(true)
          }}
          title="ドラッグして幅を変更"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '8px',
            height: '100%',
            cursor: 'col-resize',
            zIndex: 100,
            transition: 'background-color 0.2s',
            backgroundColor: 'transparent'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(51, 136, 255, 0.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        />

        <h3
          style={{
            margin: '0 0 8px',
            fontSize: '14px',
            fontWeight: 600,
            borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`,
            paddingBottom: '4px'
          }}
        >
          環境情報
        </h3>

        {/* Geographic Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>
            地理情報
          </div>
          {GEO_OVERLAYS.map((overlay) => {
            const isNotoUplift = overlay.id === 'terrain-2024-noto'
            const checked = isNotoUplift
              ? comparisonLayerVisibility.has('terrain-2024-noto')
              : isOverlayVisible(overlay.id)
            const disabled = isNotoUplift ? baseMap !== 'osm' : false
            const tooltip = isNotoUplift
              ? disabled
                ? '標準マップ（osm）のみ利用できます。'
                : '2024年能登半島地震後の隆起を示す点サンプル（赤い点/ヒート）を表示します。'
              : 'description' in overlay &&
                  typeof overlay.description === 'string' &&
                  overlay.description.trim().length > 0
                ? overlay.description
                : overlay.name
            return (
              <label
                key={overlay.id}
                title={tooltip}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  opacity: disabled ? 0.45 : 1,
                  filter: disabled ? 'grayscale(60%)' : 'none'
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    if (isNotoUplift) {
                      handleComparisonLayerToggle(
                        'terrain-2024-noto',
                        !comparisonLayerVisibility.has('terrain-2024-noto')
                      )
                      return
                    }
                    toggleOverlay(overlay)
                  }}
                />
                <span style={{ color: disabled ? (darkMode ? '#777' : '#888') : 'inherit' }}>
                  {overlay.name}
                  {disabled && (
                    <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.9 }}>
                      （標準のみ）
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>

        {/* Weather Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>
            天候情報
          </div>

          <label
            title="雨雲レーダー：直近の雨雲の動きを表示します（5分ごとに更新）[C]キーでトグル"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            <input
              type="checkbox"
              checked={isWeatherVisible('rain-radar')}
              onChange={() => toggleWeatherOverlay('rain-radar')}
            />
            <span>雨雲 [C]</span>
            {isWeatherVisible('rain-radar') && radarLastUpdate && (
              <span style={{ fontSize: '12px', color: '#888' }}>{radarLastUpdate}</span>
            )}
          </label>

          <label
            title="地図をクリックすると、その地域の天気予報を表示 [W]キーでトグル"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            <input
              type="checkbox"
              checked={enableWeatherClick}
              onChange={() => setEnableWeatherClick(!enableWeatherClick)}
            />
            <span>クリックで天気予報 [W]</span>
          </label>

          {enableWeatherClick && (
            <div
              style={{
                fontSize: '12px',
                color: darkMode ? '#888' : '#666',
                marginBottom: '8px',
                marginLeft: '20px',
                padding: '6px 8px',
                backgroundColor: darkMode ? '#2a2a2a' : '#f0f9ff',
                // borderRadius: '4px',
                borderLeft: `3px solid ${darkMode ? '#3b82f6' : '#3b82f6'}`
              }}
            >
              地図上をクリックすると、その地域の天気予報がポップアップで表示されます
            </div>
          )}

          <label
            title="全国の主要都市の天気と気温を地図上にアイコンで表示"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            <input
              type="checkbox"
              checked={showNationwideWeather}
              onChange={() => setShowNationwideWeather(!showNationwideWeather)}
            />
            <span>全国天気マップ</span>
          </label>

          <button
            onClick={() => setShowWeatherForecast(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              backgroundColor: darkMode ? '#2563eb' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '100%',
              justifyContent: 'center'
            }}
          >
            都道府県別 詳細予報パネル
          </button>
        </div>

        {/* Signal Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>
            電波種
          </div>
          <label
            title="LTE：携帯電話カバレッジ強度（仮設置データ）"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            <input
              type="checkbox"
              checked={isOverlayVisible('lte-coverage')}
              onChange={() => toggleOverlay({ id: 'lte-coverage', name: 'LTE' })}
            />
            <span>LTE *</span>
          </label>
          <div style={{ fontSize: '12px', color: darkMode ? '#666' : '#aaa', paddingLeft: '20px' }}>
            （仮設置）
          </div>
        </div>

        <div
          style={{
            marginTop: '14px',
            paddingTop: '10px',
            borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}`,
            fontSize: '12px',
            color: darkMode ? '#888' : '#777',
            lineHeight: 1.4
          }}
        >
          ※「*」は仮設置データを示します。
        </div>
      </aside>

      {/* Map Container */}
      <div ref={mapContainer} style={{ flex: 1 }} />

      {/* Custom Layer Manager */}
      <CustomLayerManager
        darkMode={darkMode}
        onLayerAdded={handleCustomLayerAdded}
        onLayerRemoved={handleCustomLayerRemoved}
        onLayerToggle={handleCustomLayerToggle}
        onLayerFocus={handleCustomLayerFocus}
        visibleLayers={customLayerVisibility}
      />

      {/* NOTE: 右下の重複ボタンは廃止（隆起表示は右上チェックに統一） */}

      {/* Dark Mode Toggle - ナビコントロールの下に配置 [L] */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        style={{
          position: 'fixed',
          bottom: 78,
          right: 10,
          padding: '6px',
          width: 32,
          height: 32,
          backgroundColor: darkMode ? 'rgba(55, 75, 105, 0.9)' : 'rgba(160, 185, 215, 0.9)',
          color: theme.colors.text,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={`${darkMode ? 'ライトモード' : 'ダークモード'}に切替 [L]`}
      >
        {darkMode ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      {/* 2D/3D Toggle [2]/[3] */}
      <button
        onClick={toggle3DMode}
        style={{
          position: 'fixed',
          bottom: 44,
          right: 10,
          padding: '6px',
          width: 32,
          height: 32,
          backgroundColor: darkMode ? 'rgba(55, 75, 105, 0.9)' : 'rgba(160, 185, 215, 0.9)',
          color: theme.colors.text,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={`${is3DMode ? '2D' : '3D'}ビューに切替 [${is3DMode ? '2' : '3'}]`}
      >
        {is3DMode ? '3D' : '2D'}
      </button>

      {/* Help Button [?] */}
      <button
        onClick={() => setShowHelp(true)}
        style={{
          position: 'fixed',
          bottom: 10,
          right: 10,
          padding: '6px',
          width: 32,
          height: 32,
          backgroundColor: darkMode ? 'rgba(55, 75, 105, 0.9)' : 'rgba(160, 185, 215, 0.9)',
          color: theme.colors.text,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="ヘルプ [?]"
      >
        ?
      </button>

      {/* Loading Progress Bar - 画面最上部に配置 */}
      {showProgressBar && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            zIndex: 1300,
            overflow: 'hidden',
            animation:
              loadingLayers.size > 0
                ? 'fadeInProgressBar 0.3s ease-in forwards'
                : 'fadeOutProgressBar 0.3s ease-out forwards'
          }}
        >
          <div
            style={{
              height: '100%',
              width: '100%',
              background: `linear-gradient(90deg, 
                ${darkMode ? '#4a90d9' : '#2563eb'} 0%, 
                ${darkMode ? '#6ba3e8' : '#3b82f6'} 50%, 
                ${darkMode ? '#4a90d9' : '#2563eb'} 100%)`,
              backgroundSize: '200% 100%',
              animation: 'progressBar 1.5s ease-in-out infinite',
              opacity: 0.7
            }}
          />
        </div>
      )}

      {/* Progress bar animations */}
      <style>
        {`
          @keyframes fadeInProgressBar {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          @keyframes fadeOutProgressBar {
            from {
              opacity: 1;
            }
            to {
              opacity: 0;
            }
          }
          @keyframes progressBar {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>

      {/* Undo / Zoom / Redo (always visible) */}
      <div
        style={{
          position: 'fixed',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          zIndex: 1200,
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
      >
        <button
          onClick={() => undoRedoHandlersRef.current?.undo()}
          disabled={!undoRedoState.canUndo}
          aria-label="Undo"
          title="Undo (Cmd+Z)"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: darkMode ? 'rgba(55, 75, 105, 0.9)' : 'rgba(160, 185, 215, 0.9)',
            color: theme.colors.text,
            border: 'none',
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
            cursor: undoRedoState.canUndo ? 'pointer' : 'not-allowed',
            opacity: undoRedoState.canUndo ? 1 : 0.45
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7v6h6"></path>
            <path d="M21 17a9 9 0 0 0-15-6l-3 2"></path>
          </svg>
        </button>
        <div
          style={{
            padding: '6px 8px',
            minWidth: 52,
            textAlign: 'center',
            backgroundColor: darkMode ? 'rgba(55, 75, 105, 0.9)' : 'rgba(160, 185, 215, 0.9)',
            color: theme.colors.text,
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
            fontSize: '12px',
            fontWeight: 700,
            pointerEvents: 'none'
          }}
          title="現在のズームレベル"
        >
          Z {mapZoom !== null ? mapZoom.toFixed(1) : '--'}
        </div>
        <button
          onClick={() => undoRedoHandlersRef.current?.redo()}
          disabled={!undoRedoState.canRedo}
          aria-label="Redo"
          title="Redo (Cmd+Shift+Z)"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: darkMode ? 'rgba(55, 75, 105, 0.9)' : 'rgba(160, 185, 215, 0.9)',
            color: theme.colors.text,
            border: 'none',
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
            cursor: undoRedoState.canRedo ? 'pointer' : 'not-allowed',
            opacity: undoRedoState.canRedo ? 1 : 0.45
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 7v6h-6"></path>
            <path d="M3 17a9 9 0 0 1 15-6l3 2"></path>
          </svg>
        </button>
      </div>

      {/* Help Modal */}
      <Modal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="使い方ガイド"
        darkMode={darkMode}
        width="900px"
        maxHeight="85vh"
        overlayOpacity={0.25}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: window.innerWidth > 768 ? 'repeat(2, 1fr)' : '1fr',
            gap: window.innerWidth > 768 ? '24px' : '16px',
            columnGap: window.innerWidth > 768 ? '32px' : '0px',
            fontSize: '14px'
          }}
        >
          {/* ===== 左カラム ===== */}

          {/* セクション1：基本操作・ヒント */}
          <div
            style={{
              marginBottom: '8px',
              padding: '16px',
              backgroundColor: darkMode ? 'rgba(74, 144, 217, 0.1)' : '#f0f7ff',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: '12px',
                color: darkMode ? '#4a90d9' : '#2563eb',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
              基本操作・ヒント
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                lineHeight: '1.6',
                fontSize: '13px',
                color: darkMode ? '#ddd' : '#555'
              }}
            >
              <li style={{ marginBottom: '6px' }}>
                <strong>描画リストのズーム:</strong>{' '}
                右サイドバーの「描画済み」リストの項目をクリックすると、その場所へズームします。
                <span style={{ color: darkMode ? '#ffb74d' : '#f57c00', fontWeight: 'bold' }}>
                  連続してクリックすると、さらに段階的に拡大
                </span>
                します。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>地図操作:</strong>{' '}
                左クリックで移動、右クリック＋ドラッグで回転・チルト（傾き）ができます。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>右クリックメニュー:</strong>{' '}
                地図上で右クリックするとコンテキストメニューが表示されます。
                <ul style={{ margin: '4px 0 0', paddingLeft: '16px', fontSize: '12px' }}>
                  <li>📍 クリック位置の座標表示・コピー</li>
                  <li>座標形式の切替（10進数/60進数）</li>
                  <li>☁️ その場所の天気予報を表示</li>
                  <li>⚠️ 規制エリアの表示切替</li>
                  <li>⚙️ UI設定（サイドバー、ダークモード等）</li>
                </ul>
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>サイドバーのリサイズ:</strong>{' '}
                左・右サイドバーの右端にマウスを置くと、カーソルが変わります。ドラッグしてサイドバーの幅を自由に調整できます。
              </li>
              <li>
                <strong>検索:</strong>{' '}
                画面左上の検索ボックスから、地名や住所で場所を検索・移動できます。
              </li>
            </ul>
          </div>

          {/* セクション2：ショートカットキー（グループ化） */}
          <div
            style={{
              marginBottom: '8px',
              padding: '16px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: '12px',
                color: darkMode ? '#4a90d9' : '#2563eb',
                fontSize: '14px'
              }}
            >
              ショートカットキー
            </div>

            {/* UI・表示切替 */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                UI・表示
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 45px 1fr', gap: '4px 8px', fontSize: '12px' }}>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>S</kbd>
                <span>左サイドバー</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>P</kbd>
                <span>右サイドバー</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>L</kbd>
                <span>ダーク/ライト</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>M</kbd>
                <span>マップ切替</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>2/3</kbd>
                <span>2D / 3D</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>?</kbd>
                <span>ヘルプ</span>
              </div>
            </div>

            {/* 規制エリア */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                規制エリア表示
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 45px 1fr', gap: '4px 8px', fontSize: '12px' }}>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>D</kbd>
                <span>DID</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>A</kbd>
                <span>空港</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>R</kbd>
                <span>レッドゾーン*</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>Y</kbd>
                <span>イエロー*</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>J</kbd>
                <span>駐屯地*</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>H</kbd>
                <span>有人機発着*</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>F</kbd>
                <span>消防署*</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>O</kbd>
                <span>医療機関*</span>
              </div>
            </div>

            {/* 描画・気象・検索 */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                描画・気象・その他
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 45px 1fr', gap: '4px 8px', fontSize: '12px' }}>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>⌘Z</kbd>
                <span>Undo</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>⇧⌘Z</kbd>
                <span>Redo</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>T</kbd>
                <span>頂点ラベル</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>X</kbd>
                <span>中心十字</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>W</kbd>
                <span>天気予報</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>C</kbd>
                <span>雨雲レーダー</span>
                <kbd style={{ backgroundColor: darkMode ? '#444' : '#eee', padding: '2px 4px', borderRadius: '3px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>⌘K</kbd>
                <span>検索</span>
                <span></span>
                <span></span>
              </div>
            </div>

            <div style={{ fontSize: '10px', color: darkMode ? '#888' : '#777', marginTop: '10px', lineHeight: '1.5' }}>
              <div style={{ marginBottom: '2px' }}><strong>公的データ:</strong> DID（e-Stat国勢調査）、空港（国土地理院空域タイル）</div>
              <div>* OSM/参考データに基づく表示（公式DIPS規制情報ではありません）</div>
            </div>
          </div>

          {/* セクション2.5：データと注意事項 */}
          <div
            style={{
              marginBottom: '8px',
              padding: '16px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: '10px',
                color: darkMode ? '#4a90d9' : '#2563eb',
                fontSize: '14px'
              }}
            >
              データと注意事項
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                lineHeight: '1.6',
                fontSize: '13px',
                color: darkMode ? '#ddd' : '#555'
              }}
            >
              <li style={{ marginBottom: '6px' }}>
                <strong>最終確認:</strong>{' '}
                実際の飛行可否は必ずDIPS・NOTAM・自治体の最新情報で確認してください。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>DID:</strong>{' '}
                国勢調査の人口集中地区（e-Stat）に基づく統計データです。更新周期が長く、
                最新の市街地変化とずれる場合があります。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>DIDの表示方法:</strong>{' '}
                地方ごとに分類されているのは、パフォーマンス向上のためです。47都道府県すべてを一度に読み込むと、大量のデータ（数万〜数十万のポリゴン）がメモリに読み込まれ、GPU/CPU/メモリを急激に消費して画面が重くなります。地域別表示では必要な地域のみを読み込むため軽量です。全国一括表示はビューポートベースの動的読み込みにより、表示範囲内の都道府県のみを自動的に読み込むため、パフォーマンスが改善されていますが、広域表示時は重くなる可能性があります。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>空港周辺空域:</strong>{' '}
                国土地理院の空域タイルと国土数値情報の空港敷地を併用しています。ズーム8未満は
                簡易表示、ズーム8以上で詳細表示に切り替わります。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>重要施設（*）:</strong>{' '}
                レッドゾーン・イエローゾーン・駐屯地は警察庁公開リストに基づく参考データです。公式DIPS規制情報ではありません。
              </li>
              <li>
                <strong>参考施設（*）:</strong>{' '}
                有人機発着地・消防署・医療機関はOSM/自治体オープンデータに基づく参考情報です。
              </li>
            </ul>
          </div>


          {/* ===== 右カラム ===== */}

          {/* セクション4：描画ツールの使い方 */}
          <div
            style={{
              marginBottom: '8px',
              padding: '16px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: '10px',
                color: darkMode ? '#4a90d9' : '#2563eb',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              描画ツールの使い方
            </div>

            {/* タブ構造の説明 */}
            <div
              style={{
                marginBottom: '12px',
                padding: '10px',
                backgroundColor: darkMode ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)',
                borderRadius: '6px',
                border: `1px solid ${darkMode ? '#2563eb55' : '#2563eb33'}`
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: darkMode ? '#90caf9' : '#1565c0',
                  marginBottom: '6px'
                }}
              >
                3つのタブ
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '6px',
                  fontSize: '12px',
                  color: darkMode ? '#ddd' : '#555'
                }}
              >
                <div>
                  <strong style={{ color: darkMode ? '#4a90d9' : '#2563eb' }}>描画</strong>
                  <br />
                  新規作成
                </div>
                <div>
                  <strong style={{ color: darkMode ? '#4a90d9' : '#2563eb' }}>管理</strong>
                  <br />
                  編集・削除
                </div>
                <div>
                  <strong style={{ color: darkMode ? '#4a90d9' : '#2563eb' }}>入出力</strong>
                  <br />
                  読込/保存
                </div>
              </div>
            </div>

            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                lineHeight: '1.6',
                fontSize: '13px',
                color: darkMode ? '#ddd' : '#555'
              }}
            >
              <li style={{ marginBottom: '6px' }}>
                <strong>描画の種類:</strong>{' '}
                ポリゴン（飛行範囲）、円（半径指定）、WP（ウェイポイント）、経路（ライン）の4種類から選択。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>作成フロー:</strong>{' '}
                「描画」タブでツールを選択 → 地図上でクリック → 描画完了後「完了」ボタンで確定。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>編集フロー:</strong>{' '}
                「管理」タブでフィーチャーを選択 → 地図上でダブルクリックで頂点編集モードへ → 頂点をドラッグして移動 → 「完了」で確定。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>削除フロー:</strong>{' '}
                フィーチャーを選択して Delete/Backspace キー、または「管理」タブの削除ボタン（🗑️）をクリック。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>名前付け:</strong>{' '}
                「管理」タブで各フィーチャーの名前フィールドを編集。エクスポート前に全フィーチャーに名前が必要です。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>高度設定:</strong>{' '}
                「管理」タブで標高（国土地理院API自動取得）と飛行高度を設定 → 上限海抜高度が自動計算されます。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>円の半径変更:</strong>{' '}
                「管理」タブで円を選択 → 半径スライダーで調整可能。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>Undo/Redo:</strong>{' '}
                ⌘Z（Ctrl+Z）で取り消し、⇧⌘Z（Ctrl+Shift+Z）でやり直し。
              </li>
              <li>
                <strong>頂点ラベル:</strong>{' '}
                描画中は各頂点に番号付きラベルを表示。禁止エリア内の頂点は警告色で表示されます。
              </li>
            </ul>
          </div>

          {/* セクション5：データエクスポート */}
          <div
            style={{
              marginBottom: '8px',
              padding: '16px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: '10px',
                color: darkMode ? '#4a90d9' : '#2563eb',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              データエクスポート
            </div>
            <div
              style={{
                fontSize: '13px',
                lineHeight: '1.7',
                color: darkMode ? '#ddd' : '#555'
              }}
            >
              <div style={{ marginBottom: '8px' }}>
                <strong>GeoJSON</strong> - Web地図/開発ツール連携用
                <div
                  style={{
                    fontSize: '12px',
                    color: darkMode ? '#aaa' : '#666',
                    marginLeft: '8px'
                  }}
                >
                  プログラム処理、QGIS等のGISツール
                </div>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>KML</strong> - Google Earth/Maps用
                <div
                  style={{
                    fontSize: '12px',
                    color: darkMode ? '#aaa' : '#666',
                    marginLeft: '8px'
                  }}
                >
                  可視化、共有、プレゼンテーション
                </div>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>CSV</strong> - スプレッドシート用
                <div
                  style={{
                    fontSize: '12px',
                    color: darkMode ? '#aaa' : '#666',
                    marginLeft: '8px'
                  }}
                >
                  Excel、座標一覧の確認・編集
                </div>
              </div>
              <div>
                <strong>NOTAM/DMS</strong> - 飛行申請用（度分秒形式）
                <div
                  style={{
                    fontSize: '12px',
                    color: darkMode ? '#aaa' : '#666',
                    marginLeft: '8px'
                  }}
                >
                  DIPS申請、航空当局への提出資料
                </div>
              </div>
            </div>
          </div>

          {/* セクション6：座標・表示設定 */}
          <div
            style={{
              marginBottom: '8px',
              padding: '16px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: '10px',
                color: darkMode ? '#4a90d9' : '#2563eb',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
              座標・表示設定
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                lineHeight: '1.6',
                fontSize: '13px',
                color: darkMode ? '#ddd' : '#555'
              }}
            >
              <li style={{ marginBottom: '6px' }}>
                <strong>座標フォーマット:</strong>{' '}
                地図をクリックすると10進数形式と度分秒（DMS）形式の両方が5秒間表示されます（ドラッグすると固定）。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>中心十字表示（X）:</strong> 画面中央に十字マーカーを表示/非表示します。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>頂点ラベル表示（T）:</strong>{' '}
                描画中の頂点に座標ラベルを表示/非表示します。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>表示モード切替:</strong> L キー（ダークモード）、2/3 キー（2D/3D表示）、X
                キー（中心十字表示）で切り替え可能です。
              </li>
              <li>
                <strong>表示設定:</strong>{' '}
                ツールチップの詳細、海抜高度、推奨飛行高度などが画面上部パネルに表示されます。
              </li>
            </ul>
          </div>
        </div>

          {/* セクション2.6：トラブルシューティング */}
          <div
            style={{
              marginBottom: '8px',
              padding: '16px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: '10px',
                color: darkMode ? '#4a90d9' : '#2563eb',
                fontSize: '14px'
              }}
            >
              トラブルシューティング
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                lineHeight: '1.6',
                fontSize: '13px',
                color: darkMode ? '#ddd' : '#555'
              }}
            >
              <li style={{ marginBottom: '6px' }}>
                <strong>レイヤーが表示されない場合:</strong>{' '}
                地域のDIDレイヤーなどがうまく表示されない時は、ページをリロード（
                <kbd
                  style={{
                    backgroundColor: darkMode ? '#444' : '#eee',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                >
                  F5
                </kbd>{' '}
                または{' '}
                <kbd
                  style={{
                    backgroundColor: darkMode ? '#444' : '#eee',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                >
                  Ctrl+R
                </kbd>
                ）してください。それでも解決しない場合は、スーパーリロード（
                <kbd
                  style={{
                    backgroundColor: darkMode ? '#444' : '#eee',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                >
                  Ctrl+Shift+R
                </kbd>{' '}
                または{' '}
                <kbd
                  style={{
                    backgroundColor: darkMode ? '#444' : '#eee',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                >
                  Cmd+Shift+R
                </kbd>
                ）を試してください。スーパーリロードはキャッシュを無視して最新の状態でページを読み込みます。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>パフォーマンスが悪い場合:</strong>{' '}
                不要なレイヤーを非表示にし、必要な地域だけを表示することで改善できます。
              </li>
              <li>
                <strong>ブラウザの互換性:</strong>{' '}
                最新版のChrome、Firefox、Edge、Safariでの動作を推奨します。
              </li>
            </ul>
          </div>


          
        {/* フッター */}
        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}`,
            fontSize: '12px',
            color: darkMode ? '#888' : '#666'
          }}
        >
          <p>
            <strong>データソース：</strong>
            DIDデータは政府統計の総合窓口(e-Stat)より。禁止区域は参考データです。飛行前は必ずDIPSで最新情報を確認してください。
          </p>
          <p>
            <strong>* 仮設置データ：</strong>
            ヘリポート、有人機発着エリア/区域、電波干渉区域、緊急用務空域、リモートID特定区域、風向・風量、LTEは参考データまたは試験的表示です。
          </p>
          <p>
            <strong>* 参考実装：</strong>
            レッドゾーン、イエローゾーンは参考データです（公式DIPSデータではありません）。駐屯地・基地、有人機発着地、消防署、医療機関はOSM等の参考データです。飛行前は必ずDIPSで公式情報を確認してください。
          </p>
        </div>
      </Modal>

      {/* Info Modal */}
      <Modal
        isOpen={infoModalKey !== null}
        onClose={() => setInfoModalKey(null)}
        title={infoModalKey ? INFO_MODAL_CONTENT[infoModalKey].title : ''}
        darkMode={darkMode}
        width="640px"
        maxHeight="70vh"
        overlayOpacity={0.25}
        zIndex={2001}
      >
        {infoModalKey && (
          <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
            <div style={{ marginBottom: '10px', color: darkMode ? '#ddd' : '#555' }}>
              {INFO_MODAL_CONTENT[infoModalKey].lead}
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: darkMode ? '#ddd' : '#555' }}>
              {INFO_MODAL_CONTENT[infoModalKey].bullets.map((item) => (
                <li key={item} style={{ marginBottom: '6px' }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      {/* Attribution */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: '70%',
          transform: 'translateX(-50%)',
          fontSize: '12px',
          color: '#eeeeeec0',
          backgroundColor: 'rgba(0,0,0,0.2)',
          padding: '2px 8px',
          borderRadius: '4px',
          zIndex: 2
        }}
      >
        出典: 政府統計の総合窓口(e-Stat) / 国土地理院
      </div>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Confirm Dialog */}
      <DialogContainer />

      {/* Focus Crosshair - map center target */}
      <FocusCrosshair
        visible={showFocusCrosshair}
        design={crosshairDesign}
        color={crosshairColor}
        darkMode={darkMode}
        onClick={
          crosshairClickCapture
            ? () => {
                const map = mapRef.current
                if (!map) return
                const center = map.getCenter()
                // Copy center coordinates to clipboard in selected format
                let coordStr: string
                if (coordFormatRef.current === 'dms') {
                  const latDMS = convertDecimalToDMS(center.lat, true, 'ja')
                  const lngDMS = convertDecimalToDMS(center.lng, false, 'ja')
                  coordStr = `${latDMS} ${lngDMS}`
                } else {
                  coordStr = `${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}`
                }
                navigator.clipboard.writeText(coordStr).then(() => {
                  toast.success('中心座標をコピーしました')
                })
              }
            : undefined
        }
      />

      {/* Nationwide Weather Map */}
      {mapRef.current && (
        <NationwideWeatherMap
          map={mapRef.current}
          visible={showNationwideWeather}
          darkMode={darkMode}
        />
      )}

      {/* Weather Forecast Panel */}
      {showWeatherForecast && (
        <WeatherForecastPanel
          selectedPrefectureId={selectedPrefectureId}
          darkMode={darkMode}
          onClose={() => {
            setShowWeatherForecast(false)
            setSelectedPrefectureId(undefined)
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          lngLat={contextMenu.lngLat}
          darkMode={darkMode}
          menuItems={buildContextMenuItems()}
          onClose={() => setContextMenu(null)}
          onAction={handleContextMenuAction}
          showCrosshair={true}
          showTooltip={true}
          restrictionInfo={contextMenu.restrictionInfo}
        />
      )}
    </div>
  )
}

export default App
