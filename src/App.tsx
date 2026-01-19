import { useEffect, useRef, useState, useCallback } from 'react'
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
  generateWeatherIconsGeoJSON,
  calculateBBox,
  mergeBBoxes,
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
import { AppHeader, CustomLayerManager } from './components'
import { DroneOperationDashboard } from './components/drone'
import {
  DrawingTools,
  type DrawnFeature,
  type UndoRedoHandlers,
  type UndoRedoState
} from './components/DrawingTools'
import { CoordinateDisplay } from './components/CoordinateDisplay'
import { FocusCrosshair, type CrosshairDesign } from './components/FocusCrosshair'
import { Modal } from './components/Modal'
// NOTE: 右下の比較パネル（重複ボタン）は廃止し、隆起表示は右上UIに統一
import { ToastContainer } from './components/Toast'
import { DialogContainer } from './components/Dialog'
import { fetchGeoJSONWithCache, clearOldCaches } from './lib/cache'
import { toast } from './utils/toast'
import { getAppTheme } from './styles/theme'
import { generateRealWeatherGeoJSON } from './lib/services/weatherApi'

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
// UI Settings Constants
// ============================================
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
  const showDroneDashboardRef = useRef(false)
  const setDroneSelectedPointRef = useRef<(point: { lat: number; lng: number } | undefined) => void>(() => {})
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
  const comparisonLayerBoundsRef = useRef<Map<string, [[number, number], [number, number]]>>(
    new Map()
  )
  const comparisonLayerVisibilityRef = useRef<Set<string>>(new Set())

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
  const [opacity, setOpacity] = useState(0.5)
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
  const [showLeftLegend, setShowLeftLegend] = useState(true)
  const [showRightLegend, setShowRightLegend] = useState(true)

  // Coordinate Info Panel
  // Sidebar Resizing
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(280)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(220) // 初期幅は少し狭め（右余白の無駄を削減）
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)

  // Tooltip visibility
  const [showTooltip, setShowTooltip] = useState(true)
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

  // Drone Operation Dashboard
  const [showDroneDashboard, setShowDroneDashboard] = useState(false)
  const [droneSelectedPoint, setDroneSelectedPoint] = useState<{ lat: number; lng: number } | undefined>()

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
      window.history.replaceState({}, '', url.toString())    } catch {
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

  // Coordinate display (with optional screen coordinates for tooltip positioning)
  const [displayCoordinates, setDisplayCoordinates] = useState<{
    lng: number
    lat: number
    screenX?: number
    screenY?: number
  } | null>(null)

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
    return '#00bcd4' // デフォルト: シアン
  })

  // Flexible coordinate settings
  type CoordClickType = 'right' | 'left' | 'both'
  type CoordDisplayPosition = 'click' | 'fixed'

  const [coordClickType, setCoordClickType] = useState<CoordClickType>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { coordClickType: saved } = JSON.parse(stored)
        if (saved === 'right' || saved === 'left' || saved === 'both') return saved
      }
    } catch {
      // ignore
    }
    return 'right' // デフォルト: 右クリックのみ
  })

  const [coordDisplayPosition, setCoordDisplayPosition] = useState<CoordDisplayPosition>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { coordDisplayPosition: saved } = JSON.parse(stored)
        if (saved === 'click' || saved === 'fixed') return saved
      }
    } catch {
      // ignore
    }
    return 'fixed' // デフォルト: 右下固定
  })

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

  const [coordAutoFade, setCoordAutoFade] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ui-settings')
      if (stored) {
        const { coordAutoFade: saved } = JSON.parse(stored)
        return saved ?? true
      }
    } catch {
      // ignore
    }
    return true // デフォルト: 自動で消える
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
        coordClickType,
        coordDisplayPosition,
        crosshairClickCapture,
        coordAutoFade,
        tooltipAutoFade,
        crosshairColor,
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
    coordClickType,
    coordDisplayPosition,
    crosshairClickCapture,
    coordAutoFade,
    tooltipAutoFade,
    crosshairColor
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
      localStorage.setItem(COMPARISON_SETTINGS_KEY, JSON.stringify(payload))    } catch {
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

  useEffect(() => {
    coordClickTypeRef.current = coordClickType
  }, [coordClickType])

  useEffect(() => {
    coordDisplayPositionRef.current = coordDisplayPosition
  }, [coordDisplayPosition])

  // Drone dashboard ref sync
  useEffect(() => {
    showDroneDashboardRef.current = showDroneDashboard
  }, [showDroneDashboard])

  useEffect(() => {
    setDroneSelectedPointRef.current = setDroneSelectedPoint
  }, [setDroneSelectedPoint])

  useEffect(() => {
    tooltipAutoFadeRef.current = tooltipAutoFade
  }, [tooltipAutoFade])

  // Note: enableCoordinateDisplay logic removed - now controlled by coordClickType setting

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
          setShowLeftLegend((prev) => !prev)
          break

        // [P] Right Panel (sidebar) toggle
        case 'p':
          setShowRightLegend((prev) => !prev)
          break

        // [W] Wind Field (Mock)
        case 'w':
          toggleOverlay({ id: 'wind-field', name: '(見本)風向・風量' })
          break
        case 'c':
          toggleOverlay({ id: 'lte-coverage', name: '(見本)LTE' })
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
        case '?':
        case '/':
          e.preventDefault()
          setShowHelp((prev) => !prev)
          break
        case 'escape':
          setShowHelp(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mapLoaded, baseMap, handleBaseMapChange])

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
      setLayerStates((prev) => {
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
      bearing: mapStateRef.current.bearing
    }

    const map = new maplibregl.Map(mapConfig)

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

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

    map.on('load', () => {      // スタイルにglyphsプロパティが存在しない場合は追加
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

    map.on('mousemove', (e) => {
      if (!showTooltipRef.current) {
        if (popupRef.current) {
          popupRef.current.remove()
        }
        return
      }

      const features = map.queryRenderedFeatures(e.point)
      const didFeature = features.find(
        (f) => f.layer.id.startsWith('did-') && f.layer.type === 'fill'
      )
      const restrictionFeature = features.find(
        (f) =>
          f.layer.id.startsWith('airport-') ||
          f.layer.id.startsWith('no-fly-') ||
          f.layer.id.startsWith(ZONE_IDS.DID_ALL_JAPAN) ||
          f.layer.id.startsWith('emergency-') ||
          f.layer.id.startsWith('manned-') ||
          f.layer.id.startsWith('remote-') ||
          f.layer.id.startsWith('facility-')
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
        } else if (layerId.startsWith('facility-')) {
          const facilityId = getFacilityLayerBaseId(layerId) ?? layerId
          const facilityLayer = getFacilityLayerById(facilityId)
          areaType = facilityLayer?.name ?? props.category ?? '施設'
          description = facilityLayer?.description ?? '参考データ'
          category = '参考'
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
          category =
            restrictionZone.type === 'no_fly_red' || restrictionZone.type === 'no_fly_yellow'
              ? '小型無人機等飛行禁止法'
              : '航空法'
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

    // Helper to set coordinates based on display position setting
    const showCoordinatesAtPosition = (
      lngLat: { lng: number; lat: number },
      point: { x: number; y: number }
    ) => {
      const isFixed = coordDisplayPositionRef.current === 'fixed'
      setDisplayCoordinates({
        lng: lngLat.lng,
        lat: lngLat.lat,
        // fixed mode: no screenX/Y = CoordinateDisplay will use default bottom-right
        screenX: isFixed ? undefined : point.x,
        screenY: isFixed ? undefined : point.y
      })
    }

    // Handle map left-click to display coordinates
    map.on('click', (e) => {
      const clickType = coordClickTypeRef.current
      // Left-click only works if setting is 'left' or 'both'
      if (clickType === 'left' || clickType === 'both') {
        showCoordinatesAtPosition(e.lngLat, e.point)
      }
      // Update drone dashboard selected point
      if (showDroneDashboardRef.current) {
        setDroneSelectedPointRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      }
    })

    // Handle right-click (contextmenu) to display coordinates
    map.on('contextmenu', (e) => {
      const clickType = coordClickTypeRef.current
      // Right-click works if setting is 'right' or 'both'
      if (clickType === 'right' || clickType === 'both') {
        e.preventDefault()
        showCoordinatesAtPosition(e.lngLat, e.point)
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
        // 全国DIDの各レイヤー
        const allLayers = getAllLayers()
        allLayers.forEach((layer) => {
          const sourceId = `${restrictionId}-${layer.id}`
          if (map.getLayer(sourceId)) {
            map.setPaintProperty(sourceId, 'fill-opacity', opacity)
          }
        })
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

      try {
        type DidProperties = Record<string, unknown> & { CITYNAME?: string }
        type DidFC = GeoJSON.FeatureCollection<GeoJSON.Geometry | null, DidProperties>

        const data = await fetchGeoJSONWithCache<DidFC>(layer.path)

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
        setSearchIndex((prev) => [...prev, ...newItems])

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

        setLayerStates((prev) => {
          const next = new Map(prev)
          next.set(layer.id, { id: layer.id, visible: initialVisible })
          return next
        })
      } catch (e) {
        console.error(`Failed to add layer ${layer.id}:`, e)
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
              comparisonLayerBoundsRef.current.set(layerConfig.id, bounds)            }

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
      void addLayer(layer, true).then(() => {
        applyDidLayerColor(layer.id, groupMode === 'red' ? '#ff0000' : layer.color)
      })
      return
    }

    const newVisibility = !state.visible
    const visibility = newVisibility ? 'visible' : 'none'

    map.setLayoutProperty(layer.id, 'visibility', visibility)
    map.setLayoutProperty(`${layer.id}-outline`, 'visibility', visibility)
    if (newVisibility) {
      applyDidLayerColor(layer.id, groupMode === 'red' ? '#ff0000' : layer.color)
    }

    setLayerStates((prev) => {
      const next = new Map(prev)
      next.set(layer.id, { ...state, visible: newVisibility })
      return next
    })
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
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
    setDidGroupColorMode((prev) => new Map(prev).set(group.name, 'default'))

    group.layers.forEach((layer) => {
      const state = layerStates.get(layer.id)
      if (state) {
        // 既にロード済み: 表示に切り替え
        if (!state.visible) {
          map.setLayoutProperty(layer.id, 'visibility', 'visible')
          map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'visible')
          setLayerStates((prev) => {
            const next = new Map(prev)
            next.set(layer.id, { ...state, visible: true })
            return next
          })
        }
      } else {
        // 未ロード: ロードして表示
        addLayer(layer, true)
      }
    })
    applyDidGroupColors(group, 'default')
  }

  const enableAllInGroupRed = (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setDidGroupColorMode((prev) => new Map(prev).set(group.name, 'red'))

    group.layers.forEach((layer) => {
      const state = layerStates.get(layer.id)
      if (state) {
        if (!state.visible) {
          map.setLayoutProperty(layer.id, 'visibility', 'visible')
          map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'visible')
          setLayerStates((prev) => {
            const next = new Map(prev)
            next.set(layer.id, { ...state, visible: true })
            return next
          })
        }
        applyDidLayerColor(layer.id, '#ff0000')
      } else {
        void addLayer(layer, true).then(() => {
          applyDidLayerColor(layer.id, '#ff0000')
        })
      }
    })
  }

  const disableAllInGroup = (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setDidGroupColorMode((prev) => new Map(prev).set(group.name, 'default'))
    applyDidGroupColors(group, 'default')

    group.layers.forEach((layer) => {
      const state = layerStates.get(layer.id)
      if (state?.visible) {
        map.setLayoutProperty(layer.id, 'visibility', 'none')
        map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'none')
        setLayerStates((prev) => {
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
  const toggleOverlay = (overlay: (typeof GEO_OVERLAYS)[0] | { id: string; name: string }) => {
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
        } else if (overlay.id === 'weather-icons') {
          // First show loading state with mock data
          const initialGeojson = generateWeatherIconsGeoJSON()
          map.addSource(overlay.id, { type: 'geojson', data: initialGeojson })
          map.addLayer({
            id: overlay.id,
            type: 'symbol',
            source: overlay.id,
            layout: {
              'text-field': ['concat', ['get', 'icon'], '\n', ['get', 'label']],
              'text-size': 18,
              'text-anchor': 'center',
              'text-allow-overlap': true
            },
            paint: {
              'text-color': darkMode ? '#fff' : '#333',
              'text-halo-color': darkMode ? '#333' : '#fff',
              'text-halo-width': 2
            }
          })

          // Then fetch real weather data asynchronously
          generateRealWeatherGeoJSON()
            .then((realGeojson) => {
              const source = map.getSource(overlay.id) as maplibregl.GeoJSONSource
              if (source) {
                source.setData(realGeojson)
                toast.success('天気データを取得しました')
              }
            })
            .catch((err) => {
              console.error('Failed to fetch real weather data:', err)
              toast.error('天気データの取得に失敗しました')
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
          })        }
      } else {
        map.setLayoutProperty(overlay.id, 'visibility', 'visible')
        if (map.getLayer(`${overlay.id}-outline`)) {
          map.setLayoutProperty(`${overlay.id}-outline`, 'visibility', 'visible')
        }
      }
      setOverlayStates((prev) => new Map(prev).set(overlay.id, true))
    } else {
      if (map.getLayer(overlay.id)) {
        map.setLayoutProperty(overlay.id, 'visibility', 'none')
      }
      if (map.getLayer(`${overlay.id}-outline`)) {
        map.setLayoutProperty(`${overlay.id}-outline`, 'visibility', 'none')
      }
      setOverlayStates((prev) => new Map(prev).set(overlay.id, false))
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
      setWeatherStates((prev) => new Map(prev).set(overlayId, true))
    } else {
      if (map.getLayer(overlayId)) {
        map.setLayoutProperty(overlayId, 'visibility', 'none')
      }
      setWeatherStates((prev) => new Map(prev).set(overlayId, false))
    }
  }

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
  const KOKUAREA_TOAST_INTERVAL_MS = 8000

  type KokuareaToastKey = 'zoom' | 'tooMany'

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
  }>({
    enabled: false,
    tileTemplate: null,
    tiles: new Map(),
    inflight: new Map(),
    updateSeq: 0,
    detach: null,
    lastKeysSig: null,
    lastToastKey: null,
    lastToastAt: 0
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
    const bounds = map.getBounds()
    const zoom = map.getZoom()
    if (zoom < KOKUAREA_MIN_MAP_ZOOM) {
      return { z: KOKUAREA_TILE_ZOOM, keys: [], xyzs: [], tooMany: true }
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

    const src = map.getSource(KOKUAREA_SOURCE_ID)
    if (src && 'setData' in src) {
      // setDataは重いので、次フレームに回して入力/描画の詰まりを軽減
      requestAnimationFrame(() => {
        const s = kokuareaRef.current
        if (!s.enabled) return
        ;(src as maplibregl.GeoJSONSource).setData(
          merged as GeoJSON.FeatureCollection<GeoJSON.Geometry, KokuareaFeatureProperties>
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
    state.enabled = false
    state.tileTemplate = null
    state.tiles.clear()
    state.inflight.clear()
    state.detach?.()
    state.detach = null
    removeKokuareaLayers(map)
    removeAirportOverviewLayers(map)
  }

  type RestrictionSyncOptions = {
    syncState?: boolean
  }

  const showRestriction = useCallback(
    async (restrictionId: string, options?: RestrictionSyncOptions) => {
      const map = mapRef.current
      if (!map || !mapLoaded) return

      const { syncState = true } = options ?? {}

      const facilityLayer = getFacilityLayerById(restrictionId)
      if (facilityLayer) {
        if (!map.getSource(restrictionId)) {
          try {
            const data = await fetchGeoJSONWithCache(facilityLayer.path)
            map.addSource(restrictionId, { type: 'geojson', data })
          } catch (e) {
            console.error(`Failed to load facility data for ${restrictionId}:`, e)
            toast.error(`${facilityLayer.name}データの読み込みに失敗しました`)
            return
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
          setRestrictionStates((prev) => new Map(prev).set(restrictionId, true))
        }
        return
      }

      let geojson: GeoJSON.FeatureCollection | null = null
      let color = ''

      if (restrictionId === 'airport-airspace') {
        const zone = getAllRestrictionZones().find((z) => z.id === restrictionId)
        if (zone?.geojsonTileTemplate) {
          try {
            enableKokuarea(map, zone.geojsonTileTemplate)
            if (syncState) {
              setRestrictionStates((prev) => new Map(prev).set(restrictionId, true))
            }
            return
          } catch (e) {
            console.error('Failed to enable kokuarea tiles, fallback to local/circle:', e)
          }
        }
        if (zone?.path) {
          try {
            geojson = await fetchGeoJSONWithCache(zone.path)
          } catch (e) {
            console.error('Failed to load airport GeoJSON:', e)
            geojson = generateAirportGeoJSON() // Fallback to circle if file fails
          }
        } else {
          geojson = generateAirportGeoJSON()
        }
        color = RESTRICTION_COLORS.airport
      } else if (restrictionId === 'ZONE_IDS.NO_FLY_RED') {
        geojson = generateRedZoneGeoJSON()
        color = RESTRICTION_COLORS.no_fly_red
      } else if (restrictionId === 'ZONE_IDS.NO_FLY_YELLOW') {
        geojson = generateYellowZoneGeoJSON()
        color = RESTRICTION_COLORS.no_fly_yellow
      } else if (restrictionId === ZONE_IDS.DID_ALL_JAPAN) {
        // DID全国一括表示モード - 全47都道府県を赤色で表示
        const allLayers = getAllLayers()
        color = '#FF0000'

        for (const layer of allLayers) {
          if (!map.getSource(`${restrictionId}-${layer.id}`)) {
            try {
              const data = await fetchGeoJSONWithCache(layer.path)
              const sourceId = `${restrictionId}-${layer.id}`

              map.addSource(sourceId, { type: 'geojson', data })

              // レイヤーが既に存在する場合は削除
              if (map.getLayer(sourceId)) {
                map.removeLayer(sourceId)
              }
              if (map.getLayer(`${sourceId}-outline`)) {
                map.removeLayer(`${sourceId}-outline`)
              }

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
        if (syncState) {
          setRestrictionStates((prev) => new Map(prev).set(restrictionId, true))
        }
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
        setRestrictionStates((prev) => new Map(prev).set(restrictionId, true))
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
        const allLayers = getAllLayers()
        for (const layer of allLayers) {
          const sourceId = `${restrictionId}-${layer.id}`
          if (map.getLayer(sourceId)) {
            map.setLayoutProperty(sourceId, 'visibility', 'none')
            map.setLayoutProperty(`${sourceId}-outline`, 'visibility', 'none')
          }
        }
      } else if (restrictionId === 'airport-airspace') {
        // kokuarea（タイルGeoJSON）表示の場合
        disableKokuarea(map)
      } else {
        if (map.getLayer(restrictionId)) {
          map.setLayoutProperty(restrictionId, 'visibility', 'none')
          map.setLayoutProperty(`${restrictionId}-outline`, 'visibility', 'none')
        }
        if (map.getLayer(`${restrictionId}-labels`)) {
          map.setLayoutProperty(`${restrictionId}-labels`, 'visibility', 'none')
        }
      }
      if (syncState) {
        setRestrictionStates((prev) => new Map(prev).set(restrictionId, false))
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
    setRestrictionStates((prev) => {
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
      title: '禁止エリアについて',
      lead: '航空法・小型無人機等飛行禁止法に関わるエリアの可視化です。',
      bullets: [
        '空港周辺空域は国土地理院の空域タイルと国土数値情報の空港敷地を併用しています。',
        '空港周辺空域はズーム8未満では位置の簡易表示（点）に切り替わります。',
        'DID（人口集中地区）は国勢調査（e-Stat）に基づく統計データです。',
        'レッド/イエローは現状サンプルで、最終判断は必ずDIPS/NOTAMで確認してください。'
      ]
    },

    facilities: {
      title: '施設データについて',
      lead: 'OSMや自治体オープンデータを加工した参考情報です。',
      bullets: [
        '空港・ヘリポート、駐屯地/基地、消防署、医療機関などを表示します。',
        '公式の規制区分ではなく、位置情報の目安として活用してください。'
      ]
    },
    noFlyLaw: {
      title: '小型無人機等飛行禁止法について',
      lead: '重要施設周辺の飛行禁止/注意区域です。',
      bullets: [
        'レッドゾーン: 原則飛行禁止、イエローゾーン: 事前通報が必要です。',
        '現在はサンプルデータのため、必ずDIPSの最新情報で確認してください。'
      ]
    },
    did: {
      title: '人口集中地区（DID）について',
      lead: '国勢調査に基づく統計データ（人口集中地区）です。',
      bullets: [
        '更新周期が長く、最新の市街地変化や施設増減とずれる場合があります。',
        '地域別に読み込むことで高速化しています。全国一括表示は重くなるため必要な地域だけ表示してください。',
        'DID内の飛行は許可が必要な場合があるため、事前確認が必須です。'
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
        fontSize: '11px',
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
    if (layerId.includes('DID_ALL_JAPAN')) {
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
      setCustomLayerVisibility((prev) => new Set(prev).add(layer.id))

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
    setCustomLayerVisibility((prev) => {
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
    })  }, [comparisonLayerVisibility, mapLoaded])

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

      setCustomLayerVisibility((prev) => {
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
            map.fitBounds(bounds, { padding: 50, maxZoom: 14 })          } catch {
            // ignore
          }
        }
      }

      setComparisonLayerVisibility((prev) => {
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
    setComparisonLayerOpacity((prev) => new Map(prev).set(layerId, opacity))
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
          width: 20,
          height: 40,
          background: theme.colors.panelBg,
          color: theme.colors.textMuted,
          border: 'none',
          borderRadius: '0 4px 4px 0',
          cursor: 'pointer',
          boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: isResizingLeft ? 'none' : 'left 0.3s ease',
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
            title="DID（人口集中地区）と地名・建物名を検索します。市区町村名や地名を入力してください"
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
                      fontSize: '10px',
                      color: darkMode ? '#888' : '#666',
                      backgroundColor: darkMode ? '#2a2a2a' : '#f5f5f5'
                    }}
                  >
                    人口集中地区
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
                      fontSize: '10px',
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
                          fontSize: '10px',
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
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                    fontSize: '12px',
                    backgroundColor: baseMap === key ? '#4a90d9' : theme.colors.buttonBg,
                    color: baseMap === key ? '#fff' : theme.colors.text,
                    border: `1px solid ${baseMap === key ? '#4a90d9' : theme.colors.borderStrong}`,
                    borderRadius: '3px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {BASE_MAPS[key].name}
                </button>
              ))}
            </div>
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
                  fontSize: '11px',
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

          {/* Coordinate capture settings */}
          <div
            style={{
              padding: '8px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              borderRadius: '6px'
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              📍 座標取得
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <label
                style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                取得:
                <select
                  value={coordClickType}
                  onChange={(e) => setCoordClickType(e.target.value as 'right' | 'left' | 'both')}
                  style={{
                    fontSize: '11px',
                    padding: '2px 4px',
                    backgroundColor: darkMode ? '#333' : '#fff',
                    color: darkMode ? '#e0e0e0' : '#333',
                    border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
                    borderRadius: '4px'
                  }}
                >
                  <option value="right">右クリック</option>
                  <option value="left">左クリック</option>
                  <option value="both">両方</option>
                </select>
              </label>
              <label
                style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                表示:
                <select
                  value={coordDisplayPosition}
                  onChange={(e) => setCoordDisplayPosition(e.target.value as 'click' | 'fixed')}
                  style={{
                    fontSize: '11px',
                    padding: '2px 4px',
                    backgroundColor: darkMode ? '#333' : '#fff',
                    color: darkMode ? '#e0e0e0' : '#333',
                    border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
                    borderRadius: '4px'
                  }}
                >
                  <option value="click">クリック位置</option>
                  <option value="fixed">右下固定</option>
                </select>
              </label>
              <label
                style={{
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
                title="オフにすると手動で閉じるまで表示し続けます"
              >
                <input
                  type="checkbox"
                  checked={coordAutoFade}
                  onChange={(e) => setCoordAutoFade(e.target.checked)}
                />
                3秒で消える
              </label>
            </div>
          </div>

          {/* Crosshair settings */}
          <div
            style={{
              padding: '8px',
              backgroundColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              borderRadius: '6px'
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>⊕ 中心十字</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <label
                style={{
                  fontSize: '11px',
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
                      fontSize: '11px',
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
                      fontSize: '11px',
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
                      fontSize: '11px',
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* Drawing Tools - サイドバー内に埋め込み */}
        <DrawingTools
          map={mapRef.current}
          mapLoaded={mapLoaded}
          darkMode={darkMode}
          embedded={true}
          onOpenHelp={() => setShowHelp(true)}
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

              if (center && enableCoordinateDisplay) {
                setDisplayCoordinates({
                  lng: center[0],
                  lat: center[1]
                })
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
            禁止エリア
            <InfoBadge
              ariaLabel="禁止エリアの説明"
              onClick={() => setInfoModalKey('restrictions')}
            />
          </h3>

          {/* Airport airspace */}
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
                fontSize: '10px',
                color: darkMode ? '#888' : '#777'
              }}
            >
              ズーム8未満は空港位置を点で簡易表示（現在 Z{' '}
              {mapZoom !== null ? mapZoom.toFixed(1) : '--'}）
              <div style={{ marginTop: '2px' }}>
                点の色：緑=民間空港（国際/国内） / 赤=軍用基地 / 橙=ヘリポート
              </div>
            </div>
          )}

          {/* DID */}
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

          {/* Facility data section */}
          <div
            style={{
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              marginBottom: '8px'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: darkMode ? '#888' : '#999',
                marginBottom: '6px',
                fontWeight: 500,
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
                  checked={getGroupCheckState(FACILITY_DATA_IDS) === true}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = getGroupCheckState(FACILITY_DATA_IDS) === 'mixed'
                    }
                  }}
                  onChange={() => toggleRestrictionGroup(FACILITY_DATA_IDS)}
                />
                施設データ *
              </label>
              <InfoBadge
                ariaLabel="施設データの説明"
                onClick={() => setInfoModalKey('facilities')}
              />
            </div>
            {FACILITY_LAYERS.map((facility) => (
              <label
                key={facility.id}
                title={`${facility.name}：${facility.description ?? '参考データ'}`}
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
                    : facility.id === 'facility-military'
                      ? 'J'
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
                fontSize: '10px',
                color: darkMode ? '#777' : '#999',
                paddingLeft: '20px'
              }}
            >
              OSMや自治体オープンデータなどの参考情報です
            </div>
          </div>

          {/* No-fly law section */}
          <div
            style={{
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              marginBottom: '8px'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: darkMode ? '#aaa' : '#666',
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
                  checked={getGroupCheckState(NO_FLY_LAW_IDS) === true}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = getGroupCheckState(NO_FLY_LAW_IDS) === 'mixed'
                    }
                  }}
                  onChange={() => toggleRestrictionGroup(NO_FLY_LAW_IDS)}
                />
                小型無人機等飛行禁止法
              </label>
              <InfoBadge
                ariaLabel="小型無人機等飛行禁止法の説明"
                onClick={() => setInfoModalKey('noFlyLaw')}
              />
            </div>

            <label
              title="レッドゾーン * [R]：飛行禁止区域（サンプルデータ）"
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

            <label
              title="イエローゾーン * [Y]：要許可区域（サンプルデータ）"
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

            <div
              style={{ fontSize: '10px', color: darkMode ? '#666' : '#aaa', paddingLeft: '20px' }}
            >
              （仮設置・東京中心サンプル）
            </div>
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
            人口集中地区（DID）
            <InfoBadge ariaLabel="DIDの説明" onClick={() => setInfoModalKey('did')} />
          </h3>
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
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <button
                      onClick={() => enableAllInGroup(group)}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '12px',
                        backgroundColor: darkMode ? '#3a3a3a' : '#f2f2f2',
                        color: darkMode ? '#fff' : '#333',
                        border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      全表示
                    </button>
                    <button
                      onClick={() => enableAllInGroupRed(group)}
                      title="この地域のDIDを一律赤色で表示"
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
                        fontWeight: 600
                      }}
                    >
                      全赤色
                    </button>
                    <button
                      onClick={() => disableAllInGroup(group)}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '12px',
                        backgroundColor: darkMode ? '#3a3a3a' : '#f2f2f2',
                        color: darkMode ? '#fff' : '#333',
                        border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      全非表示
                    </button>
                  </div>
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
          top: 12,
          width: 20,
          height: 30,
          background: darkMode ? 'rgba(30,30,40,0.9)' : 'rgba(255,255,255,0.9)',
          color: darkMode ? '#aaa' : '#666',
          border: 'none',
          borderRadius: '4px 0 0 4px',
          cursor: 'pointer',
          boxShadow: '-2px 0 4px rgba(0,0,0,0.1)',
          zIndex: 11,
          transition: isResizingRight ? 'none' : 'right 0.3s ease',
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
                    <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.9 }}>
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
            title="雨雲レーダー：直近の雨雲の動きを表示します（5分ごとに更新）"
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
            <span>雨雲</span>
            {isWeatherVisible('rain-radar') && radarLastUpdate && (
              <span style={{ fontSize: '9px', color: '#888' }}>{radarLastUpdate}</span>
            )}
          </label>

          <label
            title="風向・風量 * [W]：風の方向と速度（仮設置データ）"
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
              checked={isOverlayVisible('wind-field')}
              onChange={() => toggleOverlay({ id: 'wind-field', name: '風向・風量' })}
            />
            <span>風向・風量 * [W]</span>
          </label>

          <label
            title="天気アイコン：各地域の天気予報をアイコンで表示（見本データ）"
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
              checked={isOverlayVisible('weather-icons')}
              onChange={() => toggleOverlay({ id: 'weather-icons', name: '天気アイコン' })}
            />
            <span>☀️ 天気予報 *</span>
          </label>

          <div
            style={{
              fontSize: '10px',
              color: darkMode ? '#666' : '#aaa',
              marginBottom: '12px',
              paddingLeft: '20px'
            }}
          >
            （見本データ）
          </div>
        </div>

        {/* Signal Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>
            電波種
          </div>
          <label
            title="LTE * [C]：携帯電話カバレッジ強度（仮設置データ）"
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
            <span>LTE * [C]</span>
          </label>
          <div style={{ fontSize: '10px', color: darkMode ? '#666' : '#aaa', paddingLeft: '20px' }}>
            （仮設置）
          </div>
        </div>

        {/* Drone Operation Safety */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}>
            飛行安全
          </div>
          <label
            title="ドローン運用安全ダッシュボード：地点をクリックして飛行可否を確認"
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
              checked={showDroneDashboard}
              onChange={() => setShowDroneDashboard(!showDroneDashboard)}
            />
            <span>🚁 安全評価パネル *</span>
          </label>
          <div style={{ fontSize: '10px', color: darkMode ? '#666' : '#aaa', paddingLeft: '20px' }}>
            （見本データ）
          </div>
        </div>

        <div
          style={{
            marginTop: '14px',
            paddingTop: '10px',
            borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}`,
            fontSize: '10px',
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
          top: 148,
          right: 10,
          padding: '6px',
          width: 29,
          height: 29,
          backgroundColor: theme.colors.buttonBg,
          color: theme.colors.text,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          boxShadow: theme.shadows.outline,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={`${darkMode ? 'ライトモード' : 'ダークモード'}に切替 [L]`}
      >
        {darkMode ? (
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
            width="16"
            height="16"
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
          top: 182,
          right: 10,
          padding: '6px',
          width: 29,
          height: 29,
          backgroundColor: is3DMode ? theme.colors.buttonBgActive : theme.colors.buttonBg,
          color: is3DMode ? '#fff' : theme.colors.text,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold',
          boxShadow: theme.shadows.outline,
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
          top: 216,
          right: 10,
          padding: '6px',
          width: 29,
          height: 29,
          backgroundColor: theme.colors.buttonBg,
          color: theme.colors.text,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: theme.shadows.outline,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="ヘルプ [?]"
      >
        ?
      </button>

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
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.buttonBg,
            color: theme.colors.text,
            border: 'none',
            borderRadius: '4px',
            boxShadow: theme.shadows.outline,
            cursor: undoRedoState.canUndo ? 'pointer' : 'not-allowed',
            opacity: undoRedoState.canUndo ? 1 : 0.45
          }}
        >
          <svg
            width="14"
            height="14"
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
            backgroundColor: theme.colors.buttonBg,
            color: theme.colors.text,
            borderRadius: '4px',
            boxShadow: theme.shadows.outline,
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
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.buttonBg,
            color: theme.colors.text,
            border: 'none',
            borderRadius: '4px',
            boxShadow: theme.shadows.outline,
            cursor: undoRedoState.canRedo ? 'pointer' : 'not-allowed',
            opacity: undoRedoState.canRedo ? 1 : 0.45
          }}
        >
          <svg
            width="14"
            height="14"
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
                <strong>サイドバーのリサイズ:</strong>{' '}
                左・右サイドバーの右端にマウスを置くと、カーソルが変わります。ドラッグしてサイドバーの幅を自由に調整できます。
              </li>
              <li>
                <strong>検索:</strong>{' '}
                画面左上の検索ボックスから、地名や住所で場所を検索・移動できます。
              </li>
            </ul>
          </div>

          {/* セクション2：禁止エリア表示 */}
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
              禁止エリア表示
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: '4px 8px',
                fontSize: '13px'
              }}
            >
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                D
              </kbd>
              <span>人口集中地区（DID）</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                A
              </kbd>
              <span>空港周辺空域</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                R
              </kbd>
              <span>レッドゾーン（飛行禁止） * 未実装</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                Y
              </kbd>
              <span>イエローゾーン（要許可） * 未実装</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                E
              </kbd>
              <span>緊急用務空域 *</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                H
              </kbd>
              <span>有人機発着地</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                J
              </kbd>
              <span>駐屯地・基地</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                F
              </kbd>
              <span>消防署</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                O
              </kbd>
              <span>医療機関</span>
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
                <strong>DIDの表示:</strong>{' '}
                地域別は必要な地域のみ読み込むため軽量です。全国一括は全都道府県を読み込むため
                重く、広域確認向きです。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>空港周辺空域:</strong>{' '}
                国土地理院の空域タイルと国土数値情報の空港敷地を併用しています。ズーム8未満は
                簡易表示、ズーム8以上で詳細表示に切り替わります。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>施設データ:</strong>{' '}
                OSM/自治体オープンデータを加工した参考情報です。公式の規制区分ではありません。
              </li>
              <li>
                <strong>* 仮設置データ:</strong>{' '}
                緊急用務空域・有人機発着エリアなどは試験的表示です。
              </li>
            </ul>
          </div>

          {/* セクション3：クイックアクセス */}
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
              クイックアクセス
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: '4px 8px',
                fontSize: '13px'
              }}
            >
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}
              >
                ⌘K
              </kbd>
              <span>検索にフォーカス</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}
              >
                ⌘Z
              </kbd>
              <span>Undo（描画の取り消し）</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}
              >
                ⇧⌘Z
              </kbd>
              <span>Redo（描画のやり直し）</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                S
              </kbd>
              <span>左サイドバー開閉</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                P
              </kbd>
              <span>右サイドバー開閉</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                M
              </kbd>
              <span>マップスタイル切替（M: 次 / Shift+M: 前）</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                L
              </kbd>
              <span>ダークモード/ライトモード</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                2 / 3
              </kbd>
              <span>2D / 3D表示切替</span>
              <kbd
                style={{
                  backgroundColor: darkMode ? '#444' : '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              >
                ?
              </kbd>
              <span>ヘルプ表示/非表示</span>
            </div>
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
                ポリゴン、円、ウェイポイント、経路（ライン）の4種類から選択できます。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>ウェイポイント名前付け:</strong>{' '}
                右サイドバーの「描画済み」リストで各フィーチャーを選択し、名前フィールドを編集できます。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>高度設定:</strong>{' '}
                標高（国土地理院APIから自動取得）と飛行高度を設定すると、上限海抜高度が計算されます。
              </li>
              <li>
                <strong>頂点ラベル:</strong>{' '}
                描画中は各頂点に座標ラベルが常時表示されます（ツールチップ機能 T キー）。
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
                <strong>座標表示切替（G）:</strong> 座標表示のON/OFFを切り替えます。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>ツールチップ表示（T）:</strong>{' '}
                描画中の頂点に座標ラベルを表示します（現在はON固定）。
              </li>
              <li style={{ marginBottom: '6px' }}>
                <strong>表示モード切替:</strong> L キー（ダークモード）、2/3
                キー（2D/3D表示）で切り替え可能です。
              </li>
              <li>
                <strong>表示設定:</strong>{' '}
                ツールチップの詳細、海抜高度、推奨飛行高度などが画面上部パネルに表示されます。
              </li>
            </ul>
          </div>
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
            <strong>* 未実装：</strong>
            レッドゾーン、イエローゾーンは国土交通省DIPSシステムからの実装が予定されており、現在は利用できません。飛行前は必ずDIPSで公式情報を確認してください。
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
          bottom: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '12px',
          color: '#666',
          backgroundColor: 'rgba(255,255,255,0.8)',
          padding: '2px 8px',
          borderRadius: '2px',
          zIndex: 5
        }}
      >
        出典: 政府統計の総合窓口(e-Stat) / 国土地理院
      </div>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Confirm Dialog */}
      <DialogContainer />

      {/* Coordinate Display */}
      {displayCoordinates && (
        <CoordinateDisplay
          lng={displayCoordinates.lng}
          lat={displayCoordinates.lat}
          darkMode={darkMode}
          onClose={() => setDisplayCoordinates(null)}
          screenX={displayCoordinates.screenX}
          screenY={displayCoordinates.screenY}
          autoFade={coordAutoFade}
        />
      )}

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
                // 画面中央の座標
                const screenX = window.innerWidth / 2
                const screenY = window.innerHeight / 2
                const isFixed = coordDisplayPosition === 'fixed'
                setDisplayCoordinates({
                  lng: center.lng,
                  lat: center.lat,
                  screenX: isFixed ? undefined : screenX,
                  screenY: isFixed ? undefined : screenY
                })
              }
            : undefined
        }
      />

      {/* Drone Operation Dashboard */}
      {showDroneDashboard && (
        <DroneOperationDashboard
          map={mapRef.current ?? undefined}
          selectedPoint={droneSelectedPoint}
          onClose={() => {
            setShowDroneDashboard(false)
            setDroneSelectedPoint(undefined)
          }}
        />
      )}
    </div>
  )
}

export default App
