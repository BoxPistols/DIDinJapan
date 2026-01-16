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
  getAllRestrictionZones,
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
  generateEmergencyAirspaceGeoJSON,
  generateMannedAircraftLandingGeoJSON,
  generateRemoteIDZoneGeoJSON,
  generateBuildingsGeoJSON,
  generateWindFieldGeoJSON,
  generateLTECoverageGeoJSON,
  generateRadioInterferenceGeoJSON,
  generateMannedAircraftZonesGeoJSON,
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
  KokuareaFeatureProperties
} from './lib'
import { CustomLayerManager } from './components/CustomLayerManager'
import { DrawingTools, type DrawnFeature } from './components/DrawingTools'
import { CoordinateDisplay } from './components/CoordinateDisplay'
// NOTE: 右下の比較パネル（重複ボタン）は廃止し、隆起表示は右上UIに統一
import { ToastContainer } from './components/Toast'
import { DialogContainer } from './components/Dialog'
import { fetchGeoJSONWithCache, clearOldCaches } from './lib/cache'

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

// ============================================
// Main App Component
// ============================================
function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
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
  const comparisonLayerBoundsRef = useRef<Map<string, [[number, number], [number, number]]>>(
    new Map()
  )
  const debugRunIdRef = useRef<string>('')
  const comparisonIdleDebugKeysRef = useRef<Set<string>>(new Set())
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
      return new Set<string>(filtered.length > 0 ? filtered : ['関東'])
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

  // Coordinate Info Panel
  // Sidebar Resizing
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(280)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(250) // 初期値を少し広く
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)

  // Tooltip visibility
  const [showTooltip, setShowTooltip] = useState(false)

  // Custom layers
  const [customLayerVisibility, setCustomLayerVisibility] = useState<Set<string>>(new Set())

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
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:readComparisonVisibilityFromUrl',
          message: 'read',
          data: { hasParam: true, count: set.size, values: Array.from(set.values()) },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'K'
        })
      }).catch(() => {})
      // #endregion agent log (debug)
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
      window.history.replaceState({}, '', url.toString())
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:clearCmpvParam',
          message: 'cleared',
          data: {},
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'K'
        })
      }).catch(() => {})
      // #endregion agent log (debug)
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

  // 3D mode
  const [is3DMode, setIs3DMode] = useState(false)

  // Help modal
  const [showHelp, setShowHelp] = useState(false)

  // Coordinate display
  const [displayCoordinates, setDisplayCoordinates] = useState<{ lng: number; lat: number } | null>(
    null
  )

  // Enable coordinate display on map click
  const [enableCoordinateDisplay, setEnableCoordinateDisplay] = useState(() => {
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

      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:handleBaseMapChange',
          message: 'before-reload',
          data: {
            from: baseMap,
            to: newBaseMap,
            comparisonVisible: Array.from(comparisonLayerVisibilityRef.current.values())
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'I'
        })
      }).catch(() => {})
      // #endregion agent log (debug)

      const currentVisible = Array.from(comparisonLayerVisibilityRef.current.values())
      const url = new URL(window.location.href)
      if (currentVisible.length > 0) {
        url.searchParams.set(COMPARISON_VIS_URL_PARAM, encodeURIComponent(currentVisible.join(',')))
      } else {
        url.searchParams.delete(COMPARISON_VIS_URL_PARAM)
      }
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:handleBaseMapChange',
          message: 'set-cmpv-param',
          data: {
            to: newBaseMap,
            currentVisibleCount: currentVisible.length,
            hasParam: url.searchParams.has(COMPARISON_VIS_URL_PARAM)
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'I'
        })
      }).catch(() => {})
      // #endregion agent log (debug)

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
        timestamp: Date.now()
      }
      localStorage.setItem('ui-settings', JSON.stringify(settings))
    } catch (e) {
      console.error('Failed to save UI settings:', e)
    }
  }, [darkMode, baseMap, enableCoordinateDisplay])

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
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:saveComparisonSettings',
          message: 'saved',
          data: {
            visibleCount: comparisonLayerVisibility.size,
            opacityKeys: Object.keys(payload.opacity),
            visibleStorage: 'none',
            opacityStorage: 'local'
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'post-fix',
          hypothesisId: 'G'
        })
      }).catch(() => {})
      // #endregion agent log (debug)
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

  // ============================================
  // Enable coordinate display ref sync
  // ============================================
  useEffect(() => {
    enableCoordinateDisplayRef.current = enableCoordinateDisplay
  }, [enableCoordinateDisplay])

  // 座標表示をOFFにしたら、表示中の座標パネルも連動して閉じる（UX改善）
  useEffect(() => {
    if (enableCoordinateDisplay) return
    if (displayCoordinates) setDisplayCoordinates(null)
  }, [enableCoordinateDisplay, displayCoordinates])

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
        case 'i':
          toggleRestriction('ZONE_IDS.REMOTE_ID_ZONE')
          break
        case 'v':
          toggleRestriction('ZONE_IDS.MANNED_AIRCRAFT_LANDING')
          break
        case 'u':
          toggleRestriction('manned-aircraft-zones')
          break
        case 'f':
          toggleRestriction('radio-interference')
          break
        case 't':
          setShowTooltip((prev) => !prev)
          break
        case 's':
          // サイドバートグル（左）
          setShowLeftLegend((prev) => !prev)
          break
        case 'p':
          // サイドバートグル（右）
          setShowRightLegend((prev) => !prev)
          break
        case 'w':
          toggleOverlay({ id: 'wind-field', name: '(見本)風向・風量' })
          break
        case 'c':
          toggleOverlay({ id: 'lte-coverage', name: '(見本)LTE' })
          break
        case 'm':
          // マップスタイル切替（循環）
          {
            const keys = Object.keys(BASE_MAPS) as BaseMapKey[]
            const currentIndex = keys.indexOf(baseMap)
            const nextIndex = (currentIndex + 1) % keys.length
            handleBaseMapChange(keys[nextIndex])
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
    // #region agent log (debug)
    if (!debugRunIdRef.current) {
      debugRunIdRef.current = `run-${Date.now()}`
      try {
        sessionStorage.setItem('debug-run-id', debugRunIdRef.current)
      } catch {
        // ignore
      }
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:boot',
          message: 'run-start',
          data: { runId: debugRunIdRef.current, baseMap },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: debugRunIdRef.current,
          hypothesisId: 'Z'
        })
      }).catch(() => {})
    }
    // #endregion agent log (debug)

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

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '300px'
    })

    map.on('load', () => {
      // #region agent log (debug)
      try {
        const style = map.getStyle()
        fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'src/App.tsx:map.on(load)',
            message: 'style-loaded',
            data: {
              baseMap,
              hasGlyphs: !!style.glyphs,
              layerCount: Array.isArray(style.layers) ? style.layers.length : 0,
              sourceCount: style.sources ? Object.keys(style.sources).length : 0
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'pre-fix',
            hypothesisId: 'H'
          })
        }).catch(() => {})
      } catch {
        // ignore
      }
      // #endregion agent log (debug)
      // スタイルにglyphsプロパティが存在しない場合は追加
      const style = map.getStyle()
      if (!style.glyphs) {
        style.glyphs = 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'
        map.setStyle(style)
      }
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

    // Handle map click to display coordinates
    map.on('click', (e) => {
      if (enableCoordinateDisplayRef.current) {
        setDisplayCoordinates({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat
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

      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:applyComparisonLayerState',
          message: 'applied',
          data: {
            baseMap,
            layerId,
            isVisible,
            visibility,
            opacity,
            hasLayer: !!map.getLayer(layerId),
            hasHeat: !!map.getLayer(`${layerId}-heat`)
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'J'
        })
      }).catch(() => {})
      // #endregion agent log (debug)

      // #region agent log (debug)
      // 反映直後はまだ描画フレームが回っていない可能性があるため、idle後に「本当に描画できているか」を検証する
      if (isVisible) {
        const runKey = debugRunIdRef.current || 'unknown'
        const key = `${runKey}:${baseMap}:${layerId}`
        if (!comparisonIdleDebugKeysRef.current.has(key)) {
          comparisonIdleDebugKeysRef.current.add(key)
          map.once('idle', () => {
            const safeRendered = (layers: string[]): number => {
              try {
                return map.queryRenderedFeatures(undefined, { layers }).length
              } catch {
                return -1
              }
            }
            const safeSource = (sourceId: string): number => {
              try {
                // GeoJSON sourceの場合も0以上が返ることがある。失敗時は -1 にする
                return map.querySourceFeatures(sourceId).length
              } catch {
                return -1
              }
            }
            const layerIds = [layerId, `${layerId}-heat`, `${layerId}-label`, `${layerId}-outline`]
            const styleLayers = map.getStyle().layers ?? []
            const idx = (id: string): number => styleLayers.findIndex((l) => l.id === id)
            const rasterMaxIndex = styleLayers.reduce((acc, l, i) => {
              if ((l.type as string) === 'raster') return Math.max(acc, i)
              return acc
            }, -1)

            fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'src/App.tsx:applyComparisonLayerState',
                message: 'idle-render-check',
                data: {
                  baseMap,
                  layerId,
                  sourceFeatureCount: safeSource(layerId),
                  renderedMain: safeRendered([layerId]),
                  renderedHeat: safeRendered([`${layerId}-heat`]),
                  renderedLabel: safeRendered([`${layerId}-label`]),
                  layerOrder: {
                    rasterMaxIndex,
                    indices: Object.fromEntries(layerIds.map((id) => [id, idx(id)]))
                  }
                },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: runKey,
                hypothesisId: 'M'
              })
            }).catch(() => {})
          })
        }
      }
      // #endregion agent log (debug)
    }

    async function initComparisonLayers() {
      if (!map) return
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:initComparisonLayers',
          message: 'enter',
          data: { mapLoaded, layerCount: ISHIKAWA_NOTO_COMPARISON_LAYERS.length },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'A'
        })
      }).catch(() => {})
      // #endregion agent log (debug)
      for (const layerConfig of ISHIKAWA_NOTO_COMPARISON_LAYERS) {
        const hasSource = !!map.getSource(layerConfig.id)

        try {
          if (!hasSource) {
            const geojson = await fetchGeoJSONWithCache(layerConfig.path)
            // #region agent log (debug)
            {
              const sampleTypes = geojson.features
                .slice(0, 50)
                .map((f) => f.geometry?.type ?? 'null')
              const typeCounts = sampleTypes.reduce<Record<string, number>>((acc, t) => {
                acc[t] = (acc[t] ?? 0) + 1
                return acc
              }, {})
              fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  location: 'src/App.tsx:initComparisonLayers',
                  message: 'geojson-loaded',
                  data: {
                    layerId: layerConfig.id,
                    path: layerConfig.path,
                    features: geojson.features.length,
                    sampleTypeCounts: typeCounts
                  },
                  timestamp: Date.now(),
                  sessionId: 'debug-session',
                  runId: 'pre-fix',
                  hypothesisId: 'A'
                })
              }).catch(() => {})
            }
            // #endregion agent log (debug)

            map.addSource(layerConfig.id, {
              type: 'geojson',
              data: geojson
            })

            const bounds = computeCollectionBounds(geojson)
            if (bounds) {
              comparisonLayerBoundsRef.current.set(layerConfig.id, bounds)
              // #region agent log (debug)
              fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  location: 'src/App.tsx:initComparisonLayers',
                  message: 'bounds-computed',
                  data: { layerId: layerConfig.id, bounds },
                  timestamp: Date.now(),
                  sessionId: 'debug-session',
                  runId: 'post-fix',
                  hypothesisId: 'F'
                })
              }).catch(() => {})
              // #endregion agent log (debug)
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
              // #region agent log (debug)
              fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  location: 'src/App.tsx:initComparisonLayers',
                  message: 'heatmap-added',
                  data: { layerId: layerConfig.id, heatId, elevationRange: elevRange },
                  timestamp: Date.now(),
                  sessionId: 'debug-session',
                  runId: 'pre-fix',
                  hypothesisId: 'E'
                })
              }).catch(() => {})
              // #endregion agent log (debug)

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
            // #region agent log (debug)
            fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'src/App.tsx:initComparisonLayers',
                message: 'layer-added',
                data: {
                  layerId: layerConfig.id,
                  primaryType,
                  renderAsCircle,
                  addedType: renderAsCircle ? 'circle' : 'fill',
                  hasLayer: !!map.getLayer(layerConfig.id),
                  hasOutline: !!map.getLayer(`${layerConfig.id}-outline`),
                  hasLabel: !!map.getLayer(`${layerConfig.id}-label`)
                },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'pre-fix',
                hypothesisId: 'A'
              })
            }).catch(() => {})
            // #endregion agent log (debug)

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

    // #region agent log (debug)
    {
      const hasTiles = 'tiles' in overlay
      const hasGeojson = 'geojson' in overlay
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:toggleOverlay',
          message: 'toggle-click',
          data: {
            id: overlay.id,
            name: overlay.name,
            isVisibleBefore: isVisible,
            hasTiles,
            tilesLen: hasTiles
              ? ((overlay as (typeof GEO_OVERLAYS)[0]).tiles?.length ?? null)
              : null,
            hasGeojson,
            geojsonPath: hasGeojson
              ? ((overlay as (typeof GEO_OVERLAYS)[0]).geojson ?? null)
              : null,
            mapLoaded
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: debugRunIdRef.current || 'unknown',
          hypothesisId: 'N'
        })
      }).catch(() => {})
    }
    // #endregion agent log (debug)

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
          // #region agent log (debug)
          fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'src/App.tsx:toggleOverlay',
              message: 'raster-added',
              data: {
                id: overlay.id,
                tilesLen: overlay.tiles.length,
                opacity: overlay.opacity,
                hasLayer: !!map.getLayer(overlay.id),
                hasSource: !!map.getSource(overlay.id)
              },
              timestamp: Date.now(),
              sessionId: 'debug-session',
              runId: debugRunIdRef.current || 'unknown',
              hypothesisId: 'N'
            })
          }).catch(() => {})
          // #endregion agent log (debug)
        }
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
  const KOKUAREA_MAX_TILES = 96
  const KOKUAREA_MIN_ZOOM = 9
  const KOKUAREA_FETCH_CONCURRENCY = 6

  const kokuareaRef = useRef<{
    enabled: boolean
    tileTemplate: string | null
    tiles: Map<string, KokuareaFC>
    inflight: Map<string, Promise<KokuareaFC>>
    updateSeq: number
    detach: (() => void) | null
    lastKeysSig: string | null
  }>({
    enabled: false,
    tileTemplate: null,
    tiles: new Map(),
    inflight: new Map(),
    updateSeq: 0,
    detach: null,
    lastKeysSig: null
  })

  const emptyKokuareaFC = (): KokuareaFC => ({ type: 'FeatureCollection', features: [] })

  const computeKokuareaZoomAndTiles = (
    map: maplibregl.Map
  ): { z: number; keys: string[]; xyzs: Array<{ z: number; x: number; y: number }>; tooMany: boolean } => {
    const bounds = map.getBounds()
    let z = Math.max(KOKUAREA_MIN_ZOOM, Math.min(14, Math.floor(map.getZoom())))
    let xyzs = getVisibleTileXYZs(bounds, z)

    while (xyzs.length > KOKUAREA_MAX_TILES && z > KOKUAREA_MIN_ZOOM) {
      z -= 1
      xyzs = getVisibleTileXYZs(bounds, z)
    }

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

    // NOTE: タイル毎にpropertiesを加工すると重いので、MapLibreの式でnameから分類する
    const nameExpr: any = ['coalesce', ['get', 'name'], '']
    const has = (s: string): any => ['>=', ['index-of', s, nameExpr], 0]
    const filterForKind = (kind: keyof typeof KOKUAREA_STYLE): any => {
      switch (kind) {
        case 'approach':
          return ['any', has('進入表面'), has('延長進入表面')]
        case 'transitional':
          return has('転移表面')
        case 'horizontal':
          // 外側水平表面も水平表面扱い
          return ['any', has('外側水平表面'), has('水平表面')]
        case 'conical':
          return has('円錐表面')
        default:
          return ['all', ['!', filterForKind('approach')], ['!', filterForKind('transitional')], ['!', filterForKind('horizontal')], ['!', filterForKind('conical')]]
      }
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
          filter: filterForKind(kind),
          paint: { 'fill-color': style.fillColor, 'fill-opacity': style.fillOpacity }
        })
      }

      if (!map.getLayer(lineId)) {
        map.addLayer({
          id: lineId,
          type: 'line',
          source: KOKUAREA_SOURCE_ID,
          filter: filterForKind(kind),
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

  const fetchKokuareaTile = async (
    tileTemplate: string,
    z: number,
    x: number,
    y: number
  ): Promise<KokuareaFC> => {
    const url = fillKokuareaTileUrl(tileTemplate, z, x, y)
    try {
      return await fetchGeoJSONWithCache<KokuareaFC>(url)
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

    if (tooMany) {
      state.tiles.clear()
      state.inflight.clear()
      state.lastKeysSig = 'tooMany'
      const src = map.getSource(KOKUAREA_SOURCE_ID)
      if (src && 'setData' in src) {
        ;(src as maplibregl.GeoJSONSource).setData(
          emptyKokuareaFC() as GeoJSON.FeatureCollection<GeoJSON.Geometry, KokuareaFeatureProperties>
        )
      }
      return
    }

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
  }

  const toggleRestriction = async (restrictionId: string) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // refから最新の状態を取得（キーボードショートカット対応）
    const isVisible = restrictionStatesRef.current.get(restrictionId) ?? false

    if (!isVisible) {
      let geojson: GeoJSON.FeatureCollection | null = null
      let color = ''

      if (restrictionId === 'airport-airspace') {
        const zone = getAllRestrictionZones().find((z) => z.id === restrictionId)
        if (zone?.geojsonTileTemplate) {
          try {
            enableKokuarea(map, zone.geojsonTileTemplate)
            setRestrictionStates((prev) => new Map(prev).set(restrictionId, true))
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
        setRestrictionStates((prev) => new Map(prev).set(restrictionId, true))
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
      setRestrictionStates((prev) => new Map(prev).set(restrictionId, true))
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
      setRestrictionStates((prev) => new Map(prev).set(restrictionId, false))
    }
  }

  const isRestrictionVisible = (id: string) => restrictionStates.get(id) ?? false

  // ============================================
  // Custom layer management
  // ============================================
  const handleCustomLayerAdded = useCallback(
    (layer: CustomLayer) => {
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
      setCustomLayerVisibility((prev) => new Set(prev).add(layer.id))
    },
    [mapLoaded]
  )

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
    setCustomLayerVisibility((prev) => {
      const next = new Set(prev)
      next.delete(layerId)
      return next
    })
  }, [])

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
    // #region agent log (debug)
    {
      const states = ISHIKAWA_NOTO_COMPARISON_LAYERS.map((cfg) => {
        const l = map.getLayer(cfg.id)
        const heat = map.getLayer(`${cfg.id}-heat`)
        const outline = map.getLayer(`${cfg.id}-outline`)
        const label = map.getLayer(`${cfg.id}-label`)
        const safeVis = (id: string): string | null => {
          try {
            return map.getLayoutProperty(id, 'visibility') as string
          } catch {
            return null
          }
        }
        return {
          id: cfg.id,
          targetVisible: comparisonLayerVisibility.has(cfg.id),
          layerType: l?.type ?? null,
          layerVis: l ? safeVis(cfg.id) : null,
          heatType: heat?.type ?? null,
          heatVis: heat ? safeVis(`${cfg.id}-heat`) : null,
          outlineType: outline?.type ?? null,
          outlineVis: outline ? safeVis(`${cfg.id}-outline`) : null,
          labelType: label?.type ?? null,
          labelVis: label ? safeVis(`${cfg.id}-label`) : null
        }
      })
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:comparison-visibility-effect',
          message: 'applied',
          data: { baseMap, visible: Array.from(comparisonLayerVisibility.values()), states },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'H'
        })
      }).catch(() => {})
    }
    // #endregion agent log (debug)

    // #region agent log (debug)
    {
      const safeRenderedCount = (layers: string[]): number => {
        try {
          const existingLayers = layers.filter((layerId) => map.getLayer(layerId))
          if (existingLayers.length === 0) return 0
          return map.queryRenderedFeatures(undefined, { layers: existingLayers }).length
        } catch {
          return -1
        }
      }
      const center = map.getCenter()
      const b = map.getBounds()
      const bounds: [[number, number], [number, number]] = [
        [b.getWest(), b.getSouth()],
        [b.getEast(), b.getNorth()]
      ]
      const rendered = ISHIKAWA_NOTO_COMPARISON_LAYERS.map((cfg) => ({
        id: cfg.id,
        targetVisible: comparisonLayerVisibility.has(cfg.id),
        renderedMain: safeRenderedCount([cfg.id]),
        renderedHeat: safeRenderedCount([`${cfg.id}-heat`]),
        renderedLabel: safeRenderedCount([`${cfg.id}-label`])
      }))
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:comparison-visibility-effect',
          message: 'render-check',
          data: {
            baseMap,
            zoom: map.getZoom(),
            center: [center.lng, center.lat],
            bounds,
            rendered
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: debugRunIdRef.current || 'unknown',
          hypothesisId: 'L'
        })
      }).catch(() => {})
    }
    // #endregion agent log (debug)
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

      if (map.getLayer(layerId)) {
        const visibility = visible ? 'visible' : 'none'
        map.setLayoutProperty(layerId, 'visibility', visibility)
        map.setLayoutProperty(`${layerId}-outline`, 'visibility', visibility)
      }

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

      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'src/App.tsx:handleComparisonLayerToggle',
          message: 'toggle',
          data: { layerId, visible, mapLoaded, hasLayer: !!map.getLayer(layerId) },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'C'
        })
      }).catch(() => {})
      // #endregion agent log (debug)

      if (visible) {
        const bounds = comparisonLayerBoundsRef.current.get(layerId)
        if (bounds) {
          try {
            map.fitBounds(bounds, { padding: 50, maxZoom: 14 })
            // #region agent log (debug)
            fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'src/App.tsx:handleComparisonLayerToggle',
                message: 'fitBounds',
                data: { layerId, bounds },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'post-fix',
                hypothesisId: 'F'
              })
            }).catch(() => {})
            // #endregion agent log (debug)
          } catch {
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
    <div style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      {/* Left Toggle Button */}
      <button
        onClick={() => setShowLeftLegend(!showLeftLegend)}
        style={{
          position: 'fixed',
          left: showLeftLegend ? leftSidebarWidth : 0,
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
          backgroundColor: darkMode ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)',
          color: darkMode ? '#fff' : '#333',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 10,
          transition: isResizingLeft ? 'none' : 'left 0.3s ease',
          boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
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

        {/* App Title */}
        <h1
          style={{
            margin: '0 0 16px',
            fontSize: '16px',
            fontWeight: 700,
            color: darkMode ? '#fff' : '#333'
          }}
        >
          DID Map
        </h1>

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
        <div style={{ marginBottom: '12px' }} title="マップの背景地図スタイルを変更します">
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {(Object.keys(BASE_MAPS) as BaseMapKey[]).map((key) => (
              <button
                key={key}
                onClick={() => handleBaseMapChange(key)}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  backgroundColor: baseMap === key ? '#4a90d9' : darkMode ? '#444' : '#f0f0f0',
                  color: baseMap === key ? '#fff' : darkMode ? '#fff' : '#333',
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

        {/* Tooltip toggle */}
        <div
          style={{ marginBottom: '12px' }}
          title="マップ上にマウスをホバーした時に、DID情報や制限区域の詳細をポップアップ表示します"
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showTooltip}
              onChange={(e) => setShowTooltip(e.target.checked)}
            />
            <span style={{ fontSize: '14px' }}>ツールチップ表示 [T]</span>
          </label>
        </div>

        {/* Coordinate Display toggle */}
        <div
          style={{ marginBottom: '12px' }}
          title="マップをクリックした時に、クリック位置の緯度経度を10進数と度分秒形式で表示します"
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enableCoordinateDisplay}
              onChange={(e) => {
                const next = e.target.checked
                setEnableCoordinateDisplay(next)
                if (!next) setDisplayCoordinates(null)
              }}
            />
            <span style={{ fontSize: '14px' }}>座標表示</span>
          </label>
        </div>

        {/* Drawing Tools - サイドバー内に埋め込み */}
        <DrawingTools
          map={mapRef.current}
          mapLoaded={mapLoaded}
          darkMode={darkMode}
          embedded={true}
          onOpenHelp={() => setShowHelp(true)}
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
              paddingBottom: '4px'
            }}
          >
            禁止エリア
          </h3>

          {/* Airport airspace */}
          <label
            title="空港周辺の一定範囲内：無人機飛行は許可が必要 [A]"
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
              checked={isRestrictionVisible('ZONE_IDS.DID_ALL_JAPAN')}
              onChange={() => toggleRestriction('ZONE_IDS.DID_ALL_JAPAN')}
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

          {/*仮設置データセクション */}
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
                fontSize: '11px',
                color: darkMode ? '#888' : '#999',
                marginBottom: '6px',
                fontWeight: 500
              }}
            >
              仮設置データ *
            </div>

            {/* Emergency airspace */}
            <label
              title="緊急用務空域 * [E]：警察・消防などの緊急活動が必要な区域（参考データ）"
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
                checked={isRestrictionVisible('ZONE_IDS.EMERGENCY_AIRSPACE')}
                onChange={() => toggleRestriction('ZONE_IDS.EMERGENCY_AIRSPACE')}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: RESTRICTION_COLORS.emergency,
                  borderRadius: '2px'
                }}
              />
              <span>緊急用務空域 * [E]</span>
            </label>

            {/* Manned aircraft */}
            <label
              title="有人機発着エリア * [V]：有人航空機の離着陸場所（参考データ）"
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
                checked={isRestrictionVisible('ZONE_IDS.MANNED_AIRCRAFT_LANDING')}
                onChange={() => toggleRestriction('ZONE_IDS.MANNED_AIRCRAFT_LANDING')}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: RESTRICTION_COLORS.manned,
                  borderRadius: '2px'
                }}
              />
              <span>有人機発着エリア * [V]</span>
            </label>

            {/* Remote ID */}
            <label
              title="リモートID特定区域 * [I]：リモートID機能搭載が必要（参考データ）"
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
                checked={isRestrictionVisible('ZONE_IDS.REMOTE_ID_ZONE')}
                onChange={() => toggleRestriction('ZONE_IDS.REMOTE_ID_ZONE')}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: RESTRICTION_COLORS.remote_id,
                  borderRadius: '2px'
                }}
              />
              <span>リモートID特定区域 * [I]</span>
            </label>

            {/* Heliports */}
            <label
              title="ヘリポート * [H]：ビル屋上・病院等（参考データ）"
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
                checked={isRestrictionVisible('heliports')}
                onChange={() => toggleRestriction('heliports')}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#FF6B6B',
                  borderRadius: '2px'
                }}
              />
              <span>ヘリポート * [H]</span>
            </label>

            {/* Radio Interference */}
            <label
              title="電波干渉区域 * [F]：電波塔・放送局周辺（参考データ）"
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
                checked={isRestrictionVisible('radio-interference')}
                onChange={() => toggleRestriction('radio-interference')}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#9B59B6',
                  borderRadius: '2px'
                }}
              />
              <span>電波干渉区域 * [F]</span>
            </label>

            {/* Manned Aircraft Zones */}
            <label
              title="有人機発着区域 * [U]：農薬散布ヘリなど（参考データ）"
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
                checked={isRestrictionVisible('manned-aircraft-zones')}
                onChange={() => toggleRestriction('manned-aircraft-zones')}
              />
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#3498DB',
                  borderRadius: '2px'
                }}
              />
              <span>有人機発着区域 * [U]</span>
            </label>
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
              style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', marginBottom: '6px' }}
            >
              小型無人機等飛行禁止法
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
          <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>
            人口集中地区（DID）
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

          <div
            style={{
              fontSize: '10px',
              color: darkMode ? '#666' : '#aaa',
              marginBottom: '12px',
              paddingLeft: '20px'
            }}
          >
            （仮設置）
          </div>
        </div>

        {/* Signal Info */}
        <div>
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
          backgroundColor: darkMode ? '#333' : '#fff',
          color: darkMode ? '#fff' : '#333',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
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
          backgroundColor: is3DMode ? '#3388ff' : darkMode ? '#333' : '#fff',
          color: is3DMode ? '#fff' : darkMode ? '#fff' : '#333',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
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
          backgroundColor: darkMode ? '#333' : '#fff',
          color: darkMode ? '#fff' : '#333',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          zIndex: 1000,
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
              maxWidth: '900px',
              width: '90%',
              maxHeight: '85vh',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px',
                borderBottom: `1px solid ${darkMode ? '#3a3a3a' : '#e5e7eb'}`
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px' }}>使い方ガイド</h2>
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

            {/* コンテンツ：スクロール領域（ヘッダー固定のため本文のみスクロール） */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {/* コンテンツ：2カラムグリッド */}
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
                    <span>ヘリポート</span>
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
                      I
                    </kbd>
                    <span>リモートID特定区域 *</span>
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
                      V
                    </kbd>
                    <span>有人機発着エリア *</span>
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
                      U
                    </kbd>
                    <span>有人機発着区域 *</span>
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
                    <span>電波干渉区域 *</span>
                  </div>
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
                    <span>マップスタイル切替</span>
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
                      T
                    </kbd>
                    <span>ツールチップ表示</span>
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
                      R
                    </kbd>
                    <span>レッドゾーン * 未実装</span>
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
                    <span>イエローゾーン * 未実装</span>
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
                      W
                    </kbd>
                    <span>風向・風量 *</span>
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
                      C
                    </kbd>
                    <span>LTE *</span>
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
                      地図をクリックすると10進数形式と度分秒（DMS）形式の両方が5秒間表示されます。
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
            </div>

            {/* フッター */}
            <div
              style={{
                marginTop: '20px',
                paddingTop: '12px',
                borderTop: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                fontSize: '12px',
                color: darkMode ? '#888' : '#666'
              }}
            >
              <p style={{ margin: '0 0 6px' }}>
                <strong>データソース：</strong>
                DIDデータは政府統計の総合窓口(e-Stat)より。禁止区域は参考データです。飛行前は必ずDIPSで最新情報を確認してください。
              </p>
              <p style={{ margin: '0 0 4px' }}>
                <strong>* 仮設置データ：</strong>
                ヘリポート、有人機発着エリア/区域、電波干渉区域、緊急用務空域、リモートID特定区域、風向・風量、LTEは参考データまたは試験的表示です。
              </p>
              <p style={{ margin: '0' }}>
                <strong>* 未実装：</strong>
                レッドゾーン、イエローゾーンは国土交通省DIPSシステムからの実装が予定されており、現在は利用できません。飛行前は必ずDIPSで公式情報を確認してください。
              </p>
            </div>
          </div>
        </div>
      )}

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
        />
      )}
    </div>
  )
}

export default App
