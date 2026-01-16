/**
 * Drawing Tools Component
 * DIPS風の描画ツール - ポリゴン、円、ウェイポイント、飛行経路
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type maplibregl from 'maplibre-gl'
import { createCirclePolygon } from '../lib/utils/geo'
import { Modal } from './Modal'
import { showToast } from '../utils/toast'

// デバウンスユーティリティ
function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Args) => {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

// 描画モードの型定義
type DrawMode = 'none' | 'polygon' | 'circle' | 'point' | 'line'

// エクスポート形式の型定義
type ExportFormat = 'geojson' | 'kml' | 'csv' | 'dms'

// モード名の日本語表示
const MODE_LABELS: Record<DrawMode, string> = {
  none: '',
  polygon: 'ポリゴン描画中',
  circle: '円を配置（クリック）',
  point: 'ウェイポイント配置中',
  line: '経路描画中'
}

// エクスポート形式の日本語表示
const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  geojson: 'GeoJSON',
  kml: 'KML',
  csv: 'CSV',
  dms: 'NOTAM'
}

// 描画されたフィーチャーの型
interface DrawnFeature {
  id: string
  type: 'polygon' | 'circle' | 'point' | 'line'
  name: string
  coordinates: GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][]
  radius?: number // 円の場合の半径(m)
  center?: [number, number] // 円の中心座標
  properties?: Record<string, unknown>
  elevation?: number // 標高（メートル）- 国土地理院から取得
  flightHeight?: number // 飛行高度（メートル）- 相対高度
  maxAltitude?: number // 上限海抜高度（メートル）= 標高 + 飛行高度
}

export interface DrawingToolsProps {
  map: maplibregl.Map | null
  onFeaturesChange?: (features: DrawnFeature[]) => void
  darkMode?: boolean
  embedded?: boolean // サイドバー内に埋め込む場合true
  mapLoaded?: boolean // マップロード状態
}

// localStorage用のキー
const STORAGE_KEY = 'did-map-drawn-features'

// localStorageへの保存
const saveToLocalStorage = (features: GeoJSON.FeatureCollection) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(features))
  } catch (error) {
    console.error('Failed to save to localStorage:', error)
  }
}

// localStorageからの読み込み
const loadFromLocalStorage = (): GeoJSON.FeatureCollection | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return null
    return JSON.parse(data) as GeoJSON.FeatureCollection
  } catch (error) {
    console.error('Failed to load from localStorage:', error)
    return null
  }
}

/**
 * DrawingTools Component
 * 飛行経路・飛行範囲の描画ツール
 */
export function DrawingTools({ map, onFeaturesChange, darkMode = false, embedded = false, mapLoaded = false }: DrawingToolsProps) {
  const [isOpen, setIsOpen] = useState(embedded) // 埋め込み時はデフォルトで開く
  const [activeTab, setActiveTab] = useState<'draw' | 'manage' | 'export'>('draw')
  const [showGuide, setShowGuide] = useState(false)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [drawnFeatures, setDrawnFeatures] = useState<DrawnFeature[]>([])
  const [circleRadius, setCircleRadius] = useState(100) // メートル
  const [circlePoints, setCirclePoints] = useState(24) // 円の頂点数
  const drawRef = useRef<MapboxDraw | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<string>('')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('geojson')
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const [selectedCount, setSelectedCount] = useState(0)
  const [continuousMode, setContinuousMode] = useState(true) // WP連続配置モード
  const [checkedFeatureIds, setCheckedFeatureIds] = useState<Set<string>>(new Set()) // 複数選択用
  const [searchQuery, setSearchQuery] = useState('') // 検索クエリ
  const [typeFilter, setTypeFilter] = useState<'all' | 'polygon' | 'circle' | 'point' | 'line'>('all') // タイプフィルタ
  const drawModeRef = useRef<DrawMode>('none') // 描画モードをrefでも保持
  const continuousModeRef = useRef(true) // 連続モードをrefでも保持
  const isRestoringRef = useRef(false) // データ復元中フラグ
  const isDisposedRef = useRef(false) // アンマウント/破棄フラグ（非同期の後処理を止める）

  // drawModeが変更されたらrefも更新
  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])

  // continuousModeが変更されたらrefも更新
  useEffect(() => {
    continuousModeRef.current = continuousMode
  }, [continuousMode])

  // drawnFeaturesが変更されたらlocalStorageに保存（バックアップ）
  useEffect(() => {
    // データ復元中はスキップ（復元処理自体が保存するため）
    if (isRestoringRef.current) return

    // 初回マウント時はスキップ（空の状態で上書きしないため）
    if (drawnFeatures.length === 0 && !drawRef.current) return

    // drawnFeaturesからGeoJSONを再構築
    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: drawnFeatures.map(f => {
        // プロパティに名前とその他の情報を含める
        const properties: Record<string, unknown> = {
          ...f.properties,
          name: f.name
        }

        // 円の場合は追加プロパティを含める
        if (f.type === 'circle' && f.radius && f.center) {
          properties.isCircle = true
          properties.radiusKm = f.radius / 1000
          properties.center = f.center
        }

        // 高度情報を含める
        if (f.elevation !== undefined) properties.elevation = f.elevation
        if (f.flightHeight !== undefined) properties.flightHeight = f.flightHeight
        if (f.maxAltitude !== undefined) properties.maxAltitude = f.maxAltitude

        return {
          type: 'Feature',
          id: f.id,
          properties,
          geometry: f.type === 'point'
            ? { type: 'Point', coordinates: f.coordinates as GeoJSON.Position }
            : f.type === 'line'
            ? { type: 'LineString', coordinates: f.coordinates as GeoJSON.Position[] }
            : { type: 'Polygon', coordinates: f.coordinates as GeoJSON.Position[][] }
        }
      })
    }

    saveToLocalStorage(featureCollection)
  }, [drawnFeatures])

  // Delete/Backspaceキーで選択オブジェクトを削除
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力中は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Delete または Backspace キー
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!drawRef.current) return

        // direct_selectモード（頂点編集中）の場合は、選択された頂点を削除
        const currentMode = drawRef.current.getMode()
        if (currentMode === 'direct_select') {
          e.preventDefault()
          // trash()メソッドはdirect_selectモードで選択中の頂点を削除する
          // 頂点が選択されていない場合はフィーチャー全体を削除
          drawRef.current.trash()
          return
        }

        // simple_selectモード（フィーチャー選択中）の場合は確認ダイアログを表示
        const selected = drawRef.current.getSelected()
        if (selected && selected.features && selected.features.length > 0) {
          e.preventDefault()
          const ids = selected.features.map(f => String(f.id))
          setPendingDeleteIds(ids)
          setSelectedCount(ids.length)
          setShowDeleteConfirm(true)
        }
      }

      // Escapeで確認ダイアログを閉じる
      if (e.key === 'Escape' && showDeleteConfirm) {
        setShowDeleteConfirm(false)
        setPendingDeleteIds([])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showDeleteConfirm])

  // Draw初期化
  useEffect(() => {
    if (drawnFeatures.length === 0 && activeTab !== 'draw') {
      setActiveTab('draw')
    }
  }, [drawnFeatures.length, activeTab])

  useEffect(() => {
    if (!map || !mapLoaded) return
    if (drawRef.current) return

    isDisposedRef.current = false
    const safeSetTimeout = (fn: () => void, ms: number) =>
      setTimeout(() => {
        if (isDisposedRef.current) return
        fn()
      }, ms)

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      // 基本設定
      defaultMode: 'simple_select',
      keybindings: true,
      touchEnabled: true,
      boxSelect: true,
      clickBuffer: 2,
      touchBuffer: 25,
      styles: [
        // ポリゴン塗りつぶし - 非アクティブ
        {
          id: 'gl-draw-polygon-fill-inactive',
          type: 'fill',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': '#3388ff',
            'fill-outline-color': '#3388ff',
            'fill-opacity': 0.25
          }
        },
        // ポリゴン塗りつぶし - アクティブ
        {
          id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#3388ff',
            'fill-outline-color': '#3388ff',
            'fill-opacity': 0.25
          }
        },
        // ポリゴンストローク - 非アクティブ
        {
          id: 'gl-draw-polygon-stroke-inactive',
          type: 'line',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#3388ff',
            'line-width': 3
          }
        },
        // ポリゴンストローク - アクティブ
        {
          id: 'gl-draw-polygon-stroke-active',
          type: 'line',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#3388ff',
            'line-dasharray': [0.2, 2],
            'line-width': 2
          }
        },
        // ライン - 非アクティブ
        {
          id: 'gl-draw-line-inactive',
          type: 'line',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#3388ff',
            'line-width': 3
          }
        },
        // ライン - アクティブ
        {
          id: 'gl-draw-line-active',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#3388ff',
            'line-dasharray': [0.2, 2],
            'line-width': 3
          }
        },
        // ポイント - 非アクティブ
        {
          id: 'gl-draw-point-inactive',
          type: 'circle',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#3388ff'
          }
        },
        // ポイント - アクティブ（描画中の点）
        {
          id: 'gl-draw-point-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['==', 'active', 'true']],
          paint: {
            'circle-radius': 8,
            'circle-color': '#3388ff'
          }
        },
        // 描画中のポイント
        {
          id: 'gl-draw-point-point-stroke-inactive',
          type: 'circle',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
          paint: {
            'circle-radius': 8,
            'circle-opacity': 1,
            'circle-color': '#ff9800'
          }
        },
        // 頂点 - アクティブ
        {
          id: 'gl-draw-polygon-and-line-vertex-stroke-inactive',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#ff9800'
          }
        },
        {
          id: 'gl-draw-polygon-and-line-vertex-inactive',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: {
            'circle-radius': 4,
            'circle-color': '#3388ff'
          }
        },
        // ミッドポイント（頂点追加用）
        {
          id: 'gl-draw-polygon-midpoint',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 4,
            'circle-color': '#3388ff'
          }
        }
      ]
    })

    // @ts-expect-error MapLibreとMapboxの互換性
    map.addControl(draw, 'top-left')
    drawRef.current = draw

    // 頂点ラベル用のソースとレイヤーを追加
    if (!map.getSource('vertex-labels')) {
      map.addSource('vertex-labels', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      })

      // 円形の背景（選択状態でオレンジに変化）
      map.addLayer({
        id: 'vertex-labels-background',
        type: 'circle',
        source: 'vertex-labels',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 14, 12],
          'circle-color': ['case', ['get', 'selected'], '#ff9800', '#3388ff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
          'circle-stroke-color': '#ffffff'
        }
      })

      // テキストラベル
      map.addLayer({
        id: 'vertex-labels',
        type: 'symbol',
        source: 'vertex-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Bold'],
          'text-size': ['case', ['get', 'selected'], 14, 13],
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': ['case', ['get', 'selected'], '#e65100', '#000000'],
          'text-halo-width': 1.5
        }
      })
    }

    // 頂点ラベルを最前面に維持する関数
    const bringLabelsToFront = () => {
      requestAnimationFrame(() => {
        try {
          if (map.getLayer('vertex-labels-background')) {
            map.moveLayer('vertex-labels-background')
          }
          if (map.getLayer('vertex-labels')) {
            map.moveLayer('vertex-labels')
          }
        } catch {
          // レイヤーが存在しない場合は無視
        }
      })
    }

    // イベントハンドラ
    const handleCreate = (e: { features: Array<{ id: string }> }) => {
      updateFeatures()
      bringLabelsToFront()

      // WP連続モードの場合は継続
      if (drawModeRef.current === 'point' && continuousModeRef.current) {
        // 連続モード: draw_pointモードを維持
        safeSetTimeout(() => {
          draw.changeMode('draw_point')
        }, 50)
        return
      }

      // 作成後、自動的に選択状態にして編集しやすく
      if (e.features.length > 0) {
        const newFeatureId = e.features[0].id
        setSelectedFeatureId(newFeatureId)
        // 作成後、選択モードに戻す
        safeSetTimeout(() => {
          draw.changeMode('simple_select', { featureIds: [newFeatureId] })
        }, 100)
      }
      setDrawMode('none')
    }

    const handleUpdate = () => {
      updateFeatures()
      bringLabelsToFront()
    }

    const handleDelete = () => {
      updateFeatures()
      setSelectedFeatureId(null)
      bringLabelsToFront()
    }

    const handleSelectionChange = (e: { features: Array<{ id: string }> }) => {
      if (e.features.length > 0) {
        setSelectedFeatureId(e.features[0].id)
      } else {
        setSelectedFeatureId(null)
      }
      // direct_selectモードの場合、頂点ラベルを更新して選択状態を反映
      if (draw.getMode() === 'direct_select') {
        safeSetTimeout(() => {
          debouncedUpdateVertexLabels.current?.()
        }, 50)
      }
      bringLabelsToFront()
    }

    // 描画モード変更時のUI更新
    const handleModeChange = (e: { mode: string }) => {
      if (e.mode === 'simple_select' || e.mode === 'direct_select') {
        // 編集モードではカーソルを変更
        map.getCanvas().style.cursor = e.mode === 'direct_select' ? 'move' : ''
        setIsEditing(e.mode === 'direct_select')
        // 選択/編集モードの場合のみ頂点ラベルを更新
        safeSetTimeout(() => {
          debouncedUpdateVertexLabels.current?.()
        }, 50)
      } else {
        setIsEditing(false)
      }
      bringLabelsToFront()
    }

    map.on('draw.create', handleCreate)
    map.on('draw.update', handleUpdate)
    map.on('draw.delete', handleDelete)
    map.on('draw.selectionchange', handleSelectionChange)
    map.on('draw.modechange', handleModeChange)

    // マップスタイル変更時にレイヤー順序を修正（デバウンス付き）
    let styleChangeTimeout: ReturnType<typeof setTimeout> | null = null
    const handleStyleData = () => {
      // 連続発火を防ぐ
      if (styleChangeTimeout) {
        clearTimeout(styleChangeTimeout)
      }
      styleChangeTimeout = safeSetTimeout(() => {
        bringLabelsToFront()
        styleChangeTimeout = null
      }, 300)
    }
    map.on('styledata', handleStyleData)

    // localStorageからデータを復元
    const restoreData = () => {
      const savedData = loadFromLocalStorage()

      if (savedData && savedData.features.length > 0) {
        try {
          isRestoringRef.current = true
          draw.set(savedData)
          updateFeatures()

          // 復元完了後、フラグをリセット
          safeSetTimeout(() => {
            isRestoringRef.current = false
          }, 500)
        } catch (error) {
          console.error('[Draw] Failed to restore:', error)
          isRestoringRef.current = false
        }
      }
    }

    // マップスタイルがロードされた後にデータを復元
    let styleLoaded = false
    try {
      styleLoaded = !!map.isStyleLoaded()
    } catch (e) {
      styleLoaded = false
    }

    if (styleLoaded) {
      safeSetTimeout(() => {
        restoreData()
        ensureDrawLayersOnTop()
      }, 200)
    } else {
      map.once('styledata', () => {
        safeSetTimeout(() => {
          restoreData()
          ensureDrawLayersOnTop()
        }, 200)
      })
    }

    return () => {
      isDisposedRef.current = true
      // イベントリスナーを削除
      if (map) {
        try {
          map.off('draw.create', handleCreate)
          map.off('draw.update', handleUpdate)
          map.off('draw.delete', handleDelete)
          map.off('draw.selectionchange', handleSelectionChange)
          map.off('draw.modechange', handleModeChange)
          map.off('styledata', handleStyleData)
        } catch (e) {
          console.warn('Failed to remove event listeners:', e)
        }

        if (styleChangeTimeout) {
          clearTimeout(styleChangeTimeout)
          styleChangeTimeout = null
        }

        // 頂点ラベルレイヤーとソースを削除
        try {
          if (map.getLayer('vertex-labels')) {
            try {
              map.removeLayer('vertex-labels')
            } catch (e) {
              console.warn('Failed to remove vertex labels layer:', e)
            }
          }
          if (map.getLayer('vertex-labels-background')) {
            try {
              map.removeLayer('vertex-labels-background')
            } catch (e) {
              console.warn('Failed to remove vertex labels background layer:', e)
            }
          }
          if (map.getSource('vertex-labels')) {
            try {
              map.removeSource('vertex-labels')
            } catch (e) {
              console.warn('Failed to remove vertex labels source:', e)
            }
          }
        } catch {
          // map/style が既に破棄されている場合は無視
        }

        // Drawコントロールを削除（マップが有効な場合のみ）
        if (map.getCanvas() && drawRef.current) {
          try {
            // @ts-expect-error MapLibreとMapboxの互換性
            map.removeControl(draw)
          } catch (e) {
            console.warn('Failed to remove draw control:', e)
          }
        }
        
        drawRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapLoaded])

  // 円描画モードのクリックハンドラ
  useEffect(() => {
    if (!map || drawMode !== 'circle') return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const center: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      // 円ポリゴンを作成（少ない座標点で）
      const radiusKm = circleRadius / 1000
      const circlePolygon = createCirclePolygon(center, radiusKm, circlePoints)

      if (drawRef.current) {
        drawRef.current.add({
          type: 'Feature',
          properties: {
            isCircle: true,
            radiusKm,
            center,
            circlePoints
          },
          geometry: circlePolygon
        })
        updateFeatures()
      }

      setDrawMode('none')
    }

    map.on('click', handleClick)
    map.getCanvas().style.cursor = 'crosshair'

    return () => {
      try {
        if (map && map.getCanvas()) {
          map.off('click', handleClick)
          map.getCanvas().style.cursor = ''
        }
      } catch {
        // マップが既に破棄されている場合は無視
      }
    }
  }, [map, drawMode, circleRadius])

  // 頂点ラベルを更新（選択状態も反映）
  const updateVertexLabels = useCallback(() => {
    if (!map || !drawRef.current || isDisposedRef.current) return

    let allFeatures: GeoJSON.FeatureCollection
    try {
      allFeatures = drawRef.current.getAll()
    } catch (error) {
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/DrawingTools.tsx:updateVertexLabels',message:'draw-getAll-failed',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log (debug)
      return
    }
    const labelFeatures: GeoJSON.Feature[] = []

    // 選択された頂点の座標を取得
    let selectedCoords: [number, number] | null = null
    try {
      const selectedPoints = drawRef.current.getSelectedPoints()
      if (selectedPoints && selectedPoints.features.length > 0) {
        const point = selectedPoints.features[0]
        if (point.geometry.type === 'Point') {
          selectedCoords = point.geometry.coordinates as [number, number]
        }
      }
    } catch {
      // getSelectedPointsがサポートされていない場合
    }

    allFeatures.features.forEach((feature) => {
      // ポイントは頂点ラベル不要
      if (feature.geometry.type === 'Point') return

      let coords: [number, number][] = []

      if (feature.geometry.type === 'LineString') {
        coords = feature.geometry.coordinates as [number, number][]
      } else if (feature.geometry.type === 'Polygon') {
        // ポリゴンの外周座標（最後の座標は最初と同じなので除外）
        const outerRing = feature.geometry.coordinates[0] as [number, number][]
        coords = outerRing.slice(0, -1)
      }

      // 各頂点にラベルを追加
      coords.forEach((coord, index) => {
        // 選択状態をチェック（座標が一致するか）
        const isSelected = selectedCoords !== null &&
          Math.abs(coord[0] - selectedCoords[0]) < 0.0000001 &&
          Math.abs(coord[1] - selectedCoords[1]) < 0.0000001

        labelFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coord
          },
          properties: {
            label: `${index + 1}`,
            selected: isSelected
          }
        })
      })
    })

    // ラベル用のソースを更新
    const source = map.getSource('vertex-labels') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: labelFeatures
      })
    }

    // 頂点ラベルを常に最前面に維持
    try {
      if (map.getLayer('vertex-labels-background')) {
        map.moveLayer('vertex-labels-background')
      }
      if (map.getLayer('vertex-labels')) {
        map.moveLayer('vertex-labels')
      }
    } catch {
      // レイヤーが存在しない場合は無視
    }
  }, [map])

  // デバウンスされた頂点ラベル更新
  const debouncedUpdateVertexLabels = useRef<(() => void) | null>(null)

  // updateVertexLabelsが変更されたらデバウンス関数を再生成
  useEffect(() => {
    debouncedUpdateVertexLabels.current = debounce(updateVertexLabels, 100)
  }, [updateVertexLabels])

  // 描画レイヤーを最前面に移動（初回のみ）
  const ensureDrawLayersOnTop = useCallback(() => {
    if (!map) return

    try {
      // MapboxDrawのレイヤーIDリスト
      const drawLayerIds = [
        'gl-draw-polygon-fill-inactive',
        'gl-draw-polygon-fill-active',
        'gl-draw-polygon-stroke-inactive',
        'gl-draw-polygon-stroke-active',
        'gl-draw-line-inactive',
        'gl-draw-line-active',
        'gl-draw-point-inactive',
        'gl-draw-point-active',
        'gl-draw-point-point-stroke-inactive',
        'gl-draw-polygon-and-line-vertex-stroke-inactive',
        'gl-draw-polygon-and-line-vertex-inactive',
        'gl-draw-polygon-midpoint'
      ]

      // 描画レイヤーを最前面に移動
      drawLayerIds.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.moveLayer(layerId)
        }
      })

      // 頂点ラベルレイヤーを最前面に移動
      if (map.getLayer('vertex-labels-background')) {
        map.moveLayer('vertex-labels-background')
      }
      if (map.getLayer('vertex-labels')) {
        map.moveLayer('vertex-labels')
      }
    } catch (e) {
      // レイヤーが存在しない場合は無視
    }
  }, [map])

  // フィーチャー更新
  const updateFeatures = useCallback(() => {
    if (!drawRef.current || isDisposedRef.current) return

    let allFeatures: GeoJSON.FeatureCollection
    try {
      allFeatures = drawRef.current.getAll()
    } catch (error) {
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/DrawingTools.tsx:updateFeatures',message:'draw-getAll-failed',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log (debug)
      return
    }
    const features: DrawnFeature[] = allFeatures.features.map((f) => {
      let type: DrawnFeature['type'] = 'polygon'
      if (f.geometry.type === 'Point') type = 'point'
      else if (f.geometry.type === 'LineString') type = 'line'
      else if (f.properties?.isCircle) type = 'circle'

      const id = typeof f.id === 'string' ? f.id : String(f.id)

      // 名前が明示的に設定されている場合はそれを使用（空文字列も許可）
      // 未設定（undefined/null）の場合のみデフォルト名を生成
      const hasExplicitName = f.properties && 'name' in f.properties
      const name = hasExplicitName
        ? (f.properties?.name as string)
        : `${type}-${id.slice(0, 6)}`

      // 高度情報を取得
      const elevation = f.properties?.elevation as number | undefined
      const flightHeight = f.properties?.flightHeight as number | undefined
      const maxAltitude = f.properties?.maxAltitude as number | undefined

      return {
        id,
        type,
        name,
        coordinates: f.geometry.type !== 'GeometryCollection' ? f.geometry.coordinates : [],
        radius: f.properties?.radiusKm ? (f.properties.radiusKm as number) * 1000 : undefined,
        center: f.properties?.center as [number, number] | undefined,
        properties: f.properties || {},
        elevation,
        flightHeight,
        maxAltitude,
      }
    })

    setDrawnFeatures(features)
    onFeaturesChange?.(features)

    // localStorageに保存
    saveToLocalStorage(allFeatures)

    // 頂点ラベルを更新（デバウンス）
    debouncedUpdateVertexLabels.current?.()
  }, [onFeaturesChange])

  // 座標配列からバウンディングボックスを計算
  const calculateBounds = useCallback((coordinates: GeoJSON.Position[]): [[number, number], [number, number]] | null => {
    if (!coordinates || coordinates.length === 0) return null

    let minLng = Infinity
    let maxLng = -Infinity
    let minLat = Infinity
    let maxLat = -Infinity

    coordinates.forEach(coord => {
      const [lng, lat] = coord
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    })

    // バウンディングボックスが有効かチェック
    if (!isFinite(minLng) || !isFinite(maxLng) || !isFinite(minLat) || !isFinite(maxLat)) {
      return null
    }

    // 最小サイズのチェック（点や線の場合に備えて）
    const lngDiff = maxLng - minLng
    const latDiff = maxLat - minLat
    const minDiff = 0.001 // 約100m

    if (lngDiff < minDiff && latDiff < minDiff) {
      // 点や非常に小さいポリゴンの場合、周囲にマージンを追加
      const margin = minDiff / 2
      return [
        [minLng - margin, minLat - margin],
        [maxLng + margin, maxLat + margin]
      ]
    }

    return [[minLng, minLat], [maxLng, maxLat]]
  }, [])

  // フィーチャーにズーム
  const zoomToFeature = useCallback((feature: DrawnFeature) => {
    if (!map) return

    let bounds: [[number, number], [number, number]] | null = null
    let center: [number, number] | null = null

    switch (feature.type) {
      case 'point':
        // ポイントの場合は中心座標にズーム
        if (Array.isArray(feature.coordinates) && feature.coordinates.length === 2) {
          center = [feature.coordinates[0] as number, feature.coordinates[1] as number]
        }
        break

      case 'circle':
        // 円の場合は中心座標にズーム
        if (feature.center) {
          center = feature.center
        }
        break

      case 'line':
        // ラインの場合は全座標からバウンディングボックスを計算
        if (Array.isArray(feature.coordinates)) {
          bounds = calculateBounds(feature.coordinates as GeoJSON.Position[])
        }
        break

      case 'polygon':
        // ポリゴンの場合は外周座標からバウンディングボックスを計算
        if (Array.isArray(feature.coordinates) && feature.coordinates.length > 0) {
          // ポリゴンの座標は [[外周], [穴1], [穴2], ...] の形式
          const outerRing = feature.coordinates[0] as GeoJSON.Position[]
          if (outerRing && outerRing.length > 0) {
            bounds = calculateBounds(outerRing)
          }
        }
        break
    }

    // ズーム実行
    const currentZoom = map.getZoom()
    if (bounds) {
      // boundsの妥当性をチェック
      const [[minLng, minLat], [maxLng, maxLat]] = bounds
      const isValidBounds =
        isFinite(minLng) && isFinite(minLat) && isFinite(maxLng) && isFinite(maxLat) &&
        minLng >= -180 && maxLng <= 180 && minLat >= -90 && maxLat <= 90 &&
        minLng < maxLng && minLat < maxLat

      if (isValidBounds) {
        try {
          map.fitBounds(bounds, {
            padding: 100,
            maxZoom: Math.min(15, currentZoom + 2),
            duration: 1000
          })
        } catch (error) {
          console.error('Failed to fit bounds:', error)
        }
      }
    } else if (center) {
      // centerの妥当性をチェック
      const [lng, lat] = center
      const isValidCenter =
        isFinite(lng) && isFinite(lat) &&
        lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90

      if (isValidCenter) {
        // ポイント/円の場合、ズームレベルを控えめに
        const targetZoom = Math.min(14, currentZoom + 1)
        try {
          map.flyTo({
            center,
            zoom: targetZoom,
            duration: 1000
          })
        } catch (error) {
          console.error('Failed to fly to center:', error)
        }
      }
    }
  }, [map, calculateBounds])

  // フィルタリングされたフィーチャーリスト
  const filteredFeatures = useMemo(() => {
    return drawnFeatures.filter(f => {
      // タイプフィルタ
      if (typeFilter !== 'all' && f.type !== typeFilter) return false
      // 検索フィルタ
      if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [drawnFeatures, typeFilter, searchQuery])

  // 全選択/解除
  const handleSelectAll = useCallback(() => {
    if (checkedFeatureIds.size === filteredFeatures.length) {
      // 全解除
      setCheckedFeatureIds(new Set())
    } else {
      // 全選択
      setCheckedFeatureIds(new Set(filteredFeatures.map(f => f.id)))
    }
  }, [checkedFeatureIds.size, filteredFeatures])

  // 選択中のフィーチャーを一括削除
  const handleBulkDelete = useCallback(() => {
    if (checkedFeatureIds.size === 0) return
    setPendingDeleteIds(Array.from(checkedFeatureIds))
    setSelectedCount(checkedFeatureIds.size)
    setShowDeleteConfirm(true)
  }, [checkedFeatureIds])

  // チェックボックスのトグル
  const toggleFeatureCheck = useCallback((featureId: string) => {
    setCheckedFeatureIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(featureId)) {
        newSet.delete(featureId)
      } else {
        newSet.add(featureId)
      }
      return newSet
    })
  }, [])

  // 削除後にチェック状態をクリア
  const handleConfirmDeleteWithClear = useCallback(() => {
    if (!drawRef.current || pendingDeleteIds.length === 0) return
    pendingDeleteIds.forEach(id => {
      drawRef.current?.delete(id)
    })
    setShowDeleteConfirm(false)
    setPendingDeleteIds([])
    setSelectedCount(0)
    setSelectedFeatureId(null)
    setCheckedFeatureIds(new Set()) // チェックをクリア
    updateFeatures()
  }, [pendingDeleteIds, updateFeatures])

  // 描画モード変更
  const handleModeChange = (mode: DrawMode) => {
    if (!drawRef.current || !map) {
      console.error('Draw instance or map not available')
      return
    }

    setDrawMode(mode)
    setIsEditing(false)

    // カーソルを描画モードに合わせて変更
    const canvas = map.getCanvas()

    switch (mode) {
      case 'polygon':
        try {
          drawRef.current.changeMode('draw_polygon')
        } catch (e) {
          console.error('Failed to change mode to draw_polygon:', e)
        }
        canvas.style.cursor = 'crosshair'
        break
      case 'circle':
        // 円はカスタムモードで処理
        drawRef.current.changeMode('simple_select')
        canvas.style.cursor = 'crosshair'
        break
      case 'point':
        drawRef.current.changeMode('draw_point')
        canvas.style.cursor = 'crosshair'
        break
      case 'line':
        drawRef.current.changeMode('draw_line_string')
        canvas.style.cursor = 'crosshair'
        break
      default:
        drawRef.current.changeMode('simple_select')
        canvas.style.cursor = ''
    }
  }

  // 選択フィーチャー削除
  const handleDelete = () => {
    if (!drawRef.current || !selectedFeatureId) return
    drawRef.current.delete(selectedFeatureId)
    setSelectedFeatureId(null)
    updateFeatures()
  }

  // 全削除
  const handleDeleteAll = () => {
    if (!drawRef.current) return
    drawRef.current.deleteAll()
    setDrawnFeatures([])
    onFeaturesChange?.([])
  }

  // フィーチャー名変更
  const handleRenameFeature = (featureId: string, newName: string) => {
    if (!drawRef.current) return

    // setFeaturePropertyを使用して効率的にプロパティを更新
    drawRef.current.setFeatureProperty(featureId, 'name', newName)

    // UIの表示を更新
    updateFeatures()
  }

  // エリアの中心座標を取得
  const getFeatureCenter = (feature: DrawnFeature): [number, number] | null => {
    if (feature.type === 'circle' && feature.center) {
      return feature.center
    } else if (feature.type === 'point' && Array.isArray(feature.coordinates)) {
      return feature.coordinates as [number, number]
    } else if (feature.type === 'polygon' && Array.isArray(feature.coordinates) && feature.coordinates.length > 0) {
      const outerRing = feature.coordinates[0] as [number, number][]
      if (outerRing.length > 0) {
        // ポリゴンの重心を計算
        let sumLng = 0, sumLat = 0
        outerRing.forEach(coord => {
          sumLng += coord[0]
          sumLat += coord[1]
        })
        return [sumLng / outerRing.length, sumLat / outerRing.length]
      }
    } else if (feature.type === 'line' && Array.isArray(feature.coordinates) && feature.coordinates.length > 0) {
      const lineCoords = feature.coordinates as [number, number][]
      // ラインの中点
      const midIndex = Math.floor(lineCoords.length / 2)
      return lineCoords[midIndex]
    }
    return null
  }

  // 国土地理院APIから標高を取得
  const handleFetchElevation = async (featureId: string) => {
    if (!drawRef.current) return

    const drawnFeature = drawnFeatures.find(f => f.id === featureId)
    if (!drawnFeature) return

    const center = getFeatureCenter(drawnFeature)
    if (!center) {
      showToast('座標の取得に失敗しました', 'error')
      return
    }

    const [lng, lat] = center

    try {
      // 国土地理院の標高API
      const response = await fetch(
        `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`
      )
      const data = await response.json()

      if (data.elevation !== null && data.elevation !== undefined) {
        const elevation = Math.round(data.elevation)

        const feature = drawRef.current.get(featureId)
        if (!feature) return

        // setFeaturePropertyを使用して効率的にプロパティを更新
        drawRef.current.setFeatureProperty(featureId, 'elevation', elevation)

        // 飛行高度が設定されている場合は上限高度を再計算
        const flightHeight = feature.properties?.flightHeight as number | undefined
        if (flightHeight !== undefined) {
          drawRef.current.setFeatureProperty(featureId, 'maxAltitude', elevation + flightHeight)
        }

        updateFeatures()
        showToast('標高データを更新しました', 'success')
      } else {
        showToast('標高データの取得に失敗しました', 'error')
      }
    } catch (error) {
      console.error('標高取得エラー:', error)
      showToast('標高の取得中にエラーが発生しました', 'error')
    }
  }

  // 飛行高度を更新（上限高度を自動計算）
  const handleUpdateFlightHeight = (featureId: string, flightHeight: number | undefined) => {
    if (!drawRef.current) return

    const feature = drawRef.current.get(featureId)
    if (!feature) return

    const elevation = feature.properties?.elevation as number | undefined

    // setFeaturePropertyを使用して効率的にプロパティを更新
    drawRef.current.setFeatureProperty(featureId, 'flightHeight', flightHeight)

    // 上限高度を自動計算
    const maxAltitude = elevation !== undefined && flightHeight !== undefined
      ? elevation + flightHeight
      : undefined
    drawRef.current.setFeatureProperty(featureId, 'maxAltitude', maxAltitude)

    updateFeatures()
  }

  // 名前が空かチェック
  const isNameEmpty = (name: string | undefined): boolean => {
    return !name || name.trim().length === 0
  }

  // GeoJSONフォーマットに変換
  const convertToGeoJSON = (features: GeoJSON.Feature[]): string => {
    const exportData = {
      type: 'FeatureCollection',
      features: features.map(f => {
        const props = { ...f.properties }

        // 高度情報を取得
        const drawnFeature = drawnFeatures.find(df => String(df.id) === String(f.id))
        if (drawnFeature?.maxAltitude !== undefined) {
          props.maxAltitude = drawnFeature.maxAltitude
        }
        if (drawnFeature?.elevation !== undefined) {
          props.elevation = drawnFeature.elevation
        }
        if (drawnFeature?.flightHeight !== undefined) {
          props.flightHeight = drawnFeature.flightHeight
        }

        // 円の場合は中心点と半径のみを出力
        if (props.isCircle && props.center) {
          return {
            type: 'Feature',
            properties: {
              type: 'circle',
              radiusM: (props.radiusKm as number) * 1000,
              center: props.center,
              ...(props.maxAltitude !== undefined && { maxAltitude: props.maxAltitude }),
              ...(props.elevation !== undefined && { elevation: props.elevation }),
              ...(props.flightHeight !== undefined && { flightHeight: props.flightHeight })
            },
            geometry: {
              type: 'Point',
              coordinates: props.center
            }
          }
        }
        return { ...f, properties: props }
      }),
      metadata: {
        exportedAt: new Date().toISOString(),
        featureCount: features.length
      }
    }
    return JSON.stringify(exportData, null, 2)
  }

  // KMLフォーマットに変換
  const convertToKML = (features: GeoJSON.Feature[]): string => {
    const kmlFeatures = features.map(f => {
      const props = f.properties || {}
      const name = props.name || f.id || 'Unnamed'

      // 高度情報を取得
      const drawnFeature = drawnFeatures.find(df => String(df.id) === String(f.id))
      const maxAlt = drawnFeature?.maxAltitude ?? 0
      const elevation = drawnFeature?.elevation
      const flightHeight = drawnFeature?.flightHeight

      let coordinatesKML = ''
      let extendedData = ''

      // ExtendedDataで高度情報を含める
      if (elevation !== undefined || flightHeight !== undefined || drawnFeature?.maxAltitude !== undefined) {
        extendedData = `      <ExtendedData>
${elevation !== undefined ? `        <Data name="elevation"><value>${elevation}</value></Data>\n` : ''}${flightHeight !== undefined ? `        <Data name="flightHeight"><value>${flightHeight}</value></Data>\n` : ''}${drawnFeature?.maxAltitude !== undefined ? `        <Data name="maxAltitude"><value>${drawnFeature.maxAltitude}</value></Data>\n` : ''}      </ExtendedData>\n`
      }

      if (f.geometry.type === 'Point') {
        const coords = f.geometry.coordinates as [number, number]
        coordinatesKML = `<Point><coordinates>${coords[0]},${coords[1]},${maxAlt}</coordinates></Point>`
      } else if (f.geometry.type === 'LineString') {
        const coords = f.geometry.coordinates as [number, number][]
        const coordStr = coords.map(c => `${c[0]},${c[1]},${maxAlt}`).join(' ')
        coordinatesKML = `<LineString><coordinates>${coordStr}</coordinates></LineString>`
      } else if (f.geometry.type === 'Polygon') {
        const coords = f.geometry.coordinates[0] as [number, number][]
        const coordStr = coords.map(c => `${c[0]},${c[1]},${maxAlt}`).join(' ')
        coordinatesKML = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
      }

      return `    <Placemark>
      <name>${name}</name>
${extendedData}      ${coordinatesKML}
    </Placemark>`
    }).join('\n')

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Flight Plan Export</name>
    <description>Exported on ${new Date().toISOString()}</description>
${kmlFeatures}
  </Document>
</kml>`
  }

  // CSVフォーマットに変換
  const convertToCSV = (features: GeoJSON.Feature[]): string => {
    const rows = ['Type,Name,Latitude,Longitude,Radius(m),MaxAltitude(m)']

    features.forEach(f => {
      const props = f.properties || {}
      const name = props.name || f.id || 'Unnamed'

      // 高度情報を取得
      const drawnFeature = drawnFeatures.find(df => String(df.id) === String(f.id))
      const maxAlt = drawnFeature?.maxAltitude !== undefined ? drawnFeature.maxAltitude : ''

      if (f.geometry.type === 'Point') {
        const coords = f.geometry.coordinates as [number, number]
        const radius = props.isCircle && props.radiusKm ? (props.radiusKm * 1000).toFixed(0) : ''
        rows.push(`Point,${name},${coords[1]},${coords[0]},${radius},${maxAlt}`)
      } else if (f.geometry.type === 'LineString') {
        const coords = f.geometry.coordinates as [number, number][]
        coords.forEach((c, i) => {
          rows.push(`LinePoint,${name}_${i + 1},${c[1]},${c[0]},,${maxAlt}`)
        })
      } else if (f.geometry.type === 'Polygon') {
        const coords = f.geometry.coordinates[0] as [number, number][]
        coords.forEach((c, i) => {
          rows.push(`PolygonPoint,${name}_${i + 1},${c[1]},${c[0]},,${maxAlt}`)
        })
      }
    })

    return rows.join('\n')
  }

  // 10進数座標を度分秒（DMS）に変換
  const decimalToDMS = (decimal: number, isLatitude: boolean): string => {
    const absolute = Math.abs(decimal)
    const degrees = Math.floor(absolute)
    const minutesDecimal = (absolute - degrees) * 60
    const minutes = Math.floor(minutesDecimal)
    const seconds = Math.floor((minutesDecimal - minutes) * 60)

    const direction = isLatitude
      ? (decimal >= 0 ? '北緯' : '南緯')
      : (decimal >= 0 ? '東経' : '西経')

    return `${direction}${degrees}°${minutes}'${seconds}"`
  }

  // NOTAMフォーマットに変換
  const convertToDMS = (features: GeoJSON.Feature[]): string => {
    const lines: string[] = []
    let featureIndex = 1

    features.forEach(f => {
      const props = f.properties || {}
      const name = props.name || f.id || `範囲${featureIndex}`

      // 高度情報を取得
      const drawnFeature = drawnFeatures.find(df => String(df.id) === String(f.id))
      const maxAlt = drawnFeature?.maxAltitude

      // 高度情報の文字列を生成（下限：地表面、上限：海抜高度）
      let altitudeStr = ''
      if (maxAlt !== undefined) {
        altitudeStr = ` (下限：地表面、上限：${maxAlt}m)`
      }

      const coords: [number, number][] = []

      if (f.geometry.type === 'Point') {
        const point = f.geometry.coordinates as [number, number]
        coords.push(point)
      } else if (f.geometry.type === 'LineString') {
        const lineCoords = f.geometry.coordinates as [number, number][]
        coords.push(...lineCoords)
      } else if (f.geometry.type === 'Polygon') {
        const polygonCoords = f.geometry.coordinates[0] as [number, number][]
        // ポリゴンの場合、最後の座標は最初の座標と同じ（閉じるため）なので除外
        coords.push(...polygonCoords.slice(0, -1))
      }

      if (coords.length > 0) {
        lines.push(`【${name}】${altitudeStr}`)
        coords.forEach((coord, index) => {
          const lat = decimalToDMS(coord[1], true)
          const lng = decimalToDMS(coord[0], false)
          const wpNumber = index + 1
          lines.push(`WP${wpNumber}: ${lat}  ${lng}`)
        })
        lines.push('') // 空行を追加
        featureIndex++
      }
    })

    return lines.join('\n')
  }

  // プレビュー表示
  const handleShowPreview = () => {
    if (!drawRef.current || isDisposedRef.current) return

    // 空の名前があるかチェック
    const featuresWithEmptyNames = drawnFeatures.filter(f => isNameEmpty(f.name))
    if (featuresWithEmptyNames.length > 0) {
      const message = featuresWithEmptyNames.length === 1
        ? '1つのフィーチャーに名前が設定されていません。エクスポート前に名前を入力してください。'
        : `${featuresWithEmptyNames.length}個のフィーチャーに名前が設定されていません。エクスポート前に名前を入力してください。`

      showToast(message, 'error')
      return
    }

    let allFeatures: GeoJSON.FeatureCollection
    try {
      allFeatures = drawRef.current.getAll()
    } catch (error) {
      // #region agent log (debug)
      fetch('http://127.0.0.1:7242/ingest/95e2077b-40eb-4a7c-a9eb-5a01c799bc92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/DrawingTools.tsx:handleShowPreview',message:'draw-getAll-failed',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log (debug)
      return
    }
    let data = ''

    switch (exportFormat) {
      case 'geojson':
        data = convertToGeoJSON(allFeatures.features)
        break
      case 'kml':
        data = convertToKML(allFeatures.features)
        break
      case 'csv':
        data = convertToCSV(allFeatures.features)
        break
      case 'dms':
        data = convertToDMS(allFeatures.features)
        break
    }

    setPreviewData(data)
    setShowPreview(true)
  }

  // ダウンロード実行
  const handleDownload = () => {
    const mimeTypes: Record<ExportFormat, string> = {
      geojson: 'application/json',
      kml: 'application/vnd.google-earth.kml+xml',
      csv: 'text/csv',
      dms: 'text/plain'
    }

    const extensions: Record<ExportFormat, string> = {
      geojson: 'geojson',
      kml: 'kml',
      csv: 'csv',
      dms: 'txt'
    }

    const blob = new Blob([previewData], { type: mimeTypes[exportFormat] })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flight-plan-${new Date().toISOString().slice(0, 10)}.${extensions[exportFormat]}`
    a.click()
    URL.revokeObjectURL(url)
    setShowPreview(false)
  }

  // 座標をテキスト形式でコピー
  const handleCopyCoordinates = async () => {
    const coordText = drawnFeatures.map(f => {
      if (f.type === 'point') {
        const coords = f.coordinates as GeoJSON.Position
        return `${f.name}: ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
      } else if (f.type === 'circle' && f.center) {
        return `${f.name}: 中心 ${f.center[1].toFixed(6)}, ${f.center[0].toFixed(6)} / 半径 ${f.radius}m`
      } else if (f.type === 'line') {
        const coords = f.coordinates as GeoJSON.Position[]
        return `${f.name}:\n` + coords.map((c, i) =>
          `  WP${i + 1}: ${c[1].toFixed(6)}, ${c[0].toFixed(6)}`
        ).join('\n')
      } else {
        const coords = f.coordinates as GeoJSON.Position[][]
        if (coords.length > 0 && coords[0].length > 0) {
          return `${f.name} (${f.type}):\n` + coords[0].slice(0, -1).map((c, i) =>
            `  P${i + 1}: ${c[1].toFixed(6)}, ${c[0].toFixed(6)}`
          ).join('\n')
        }
        return `${f.name} (${f.type}): No coordinates`
      }
    }).join('\n\n')

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      showToast('このブラウザではクリップボードへのコピーがサポートされていません', 'error')
      return
    }

    try {
      await navigator.clipboard.writeText(coordText)
      showToast('座標をクリップボードにコピーしました', 'success')
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      showToast('クリップボードへのコピーに失敗しました', 'error')
    }
  }

  // 選択フィーチャーの編集モードに入る / 編集完了
  const handleEditFeature = () => {
    if (!drawRef.current || !selectedFeatureId) return
    if (isEditing) {
      // 編集中の場合は選択モードに戻る
      drawRef.current.changeMode('simple_select', { featureIds: [selectedFeatureId] })
      setIsEditing(false)
    } else {
      // 編集モードに入る
      drawRef.current.changeMode('direct_select', { featureId: selectedFeatureId })
      setIsEditing(true)
    }
  }

  // 描画モードをキャンセル
  const handleCancelMode = () => {
    if (!drawRef.current || !map) return
    drawRef.current.changeMode('simple_select')
    setDrawMode('none')
    setIsEditing(false)
    map.getCanvas().style.cursor = ''
  }

  // 円のリサイズ
  const handleResizeCircle = (newRadiusM: number) => {
    if (!drawRef.current || !selectedFeatureId) return

    const feature = drawRef.current.get(selectedFeatureId)
    if (!feature || !feature.properties?.isCircle || !feature.properties?.center) return

    const center = feature.properties.center as [number, number]
    const radiusKm = newRadiusM / 1000

    // 既存の頂点数を保持、なければデフォルト24
    const savedCirclePoints = (feature.properties.circlePoints as number) || 24

    // 新しい円ポリゴンを作成
    const newCirclePolygon = createCirclePolygon(center, radiusKm, savedCirclePoints)

    // フィーチャーを更新
    drawRef.current.delete(selectedFeatureId)
    const newFeature = drawRef.current.add({
      type: 'Feature',
      properties: {
        isCircle: true,
        radiusKm,
        center,
        circlePoints: savedCirclePoints
      },
      geometry: newCirclePolygon
    })

    // 新しいフィーチャーを選択
    if (newFeature && newFeature[0]) {
      setSelectedFeatureId(newFeature[0])
      drawRef.current.changeMode('simple_select', { featureIds: newFeature })
    }

    updateFeatures()
  }

  const bgColor = darkMode ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)'
  const textColor = darkMode ? '#fff' : '#333'
  const borderColor = darkMode ? '#555' : '#ddd'
  const buttonBg = darkMode ? '#444' : '#f0f0f0'
  const buttonActiveBg = '#3388ff'

  // 埋め込み時は折りたたみボタンを表示しない
  if (!isOpen && !embedded) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          top: 120,
          left: 300,
          padding: '10px 16px',
          backgroundColor: '#3388ff',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 1000
        }}
      >
        飛行経路作成
      </button>
    )
  }

  // 埋め込み時で閉じている場合は折りたたみヘッダーのみ表示
  if (!isOpen && embedded) {
    return (
      <div style={{ marginBottom: '12px', borderRadius: '4px', overflow: 'hidden' }}>
        <div
          onClick={() => setIsOpen(true)}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: '#3388ff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            userSelect: 'none',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a6fc9'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3388ff'}
        >
          <span>飛行経路／飛行範囲</span>
          <span style={{ fontSize: '12px' }}>▼</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={embedded ? {
        // 埋め込み時のスタイル
        marginBottom: '12px',
        backgroundColor: darkMode ? '#222' : '#f8f8f8',
        borderRadius: '4px',
        overflow: 'hidden'
      } : {
        // フローティング時のスタイル
        position: 'fixed',
        top: 120,
        left: 300,
        width: '280px',
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        zIndex: 1000,
        overflow: 'hidden'
      }}>
        {/* Header - クリック可能 */}
        <div
          onClick={() => embedded && setIsOpen(false)}
          style={{
            padding: embedded ? '10px 8px' : '12px 16px',
            backgroundColor: '#3388ff',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: embedded ? 'pointer' : 'default',
            userSelect: 'none',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => embedded && (e.currentTarget.style.backgroundColor = '#2a6fc9')}
          onMouseLeave={(e) => embedded && (e.currentTarget.style.backgroundColor = '#3388ff')}
        >
          <h3 style={{ margin: 0, fontSize: embedded ? '13px' : '14px', fontWeight: 500 }}>飛行経路／飛行範囲</h3>
          {embedded ? (
            <span style={{ fontSize: '12px', transition: 'transform 0.3s' }}>▲</span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '18px'
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Status Banner */}
        {(drawMode !== 'none' || isEditing) && (
          <div style={{
            padding: '8px 16px',
            backgroundColor: isEditing ? '#e8f5e9' : '#fff3e0',
            borderBottom: `1px solid ${isEditing ? '#4caf50' : '#ff9800'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: isEditing ? '#2e7d32' : '#e65100', flex: 1 }}>
              {isEditing ? '編集中' : MODE_LABELS[drawMode]}
            </span>
            <button
              onClick={handleCancelMode}
              style={{
                padding: '4px 12px',
                backgroundColor: isEditing ? '#4caf50' : 'transparent',
                border: isEditing ? 'none' : '1px solid currentColor',
                borderRadius: '4px',
                color: isEditing ? '#fff' : '#e65100',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
                flexShrink: 0
              }}
            >
              {isEditing ? '完了' : 'キャンセル'}
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: `2px solid ${darkMode ? '#444' : '#e0e0e0'}`,
          backgroundColor: darkMode ? '#2a2a2a' : '#fafafa'
        }}>
          <button
            onClick={() => setActiveTab('draw')}
            style={{
              flex: 1,
              padding: '12px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'draw' ? '3px solid #3388ff' : '3px solid transparent',
              color: activeTab === 'draw' ? '#3388ff' : (darkMode ? '#999' : '#666'),
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'draw' ? 600 : 400,
              transition: 'all 0.2s',
              marginBottom: '-2px'
            }}
          >
            描画
          </button>
          <button
            onClick={() => drawnFeatures.length > 0 && setActiveTab('manage')}
            disabled={drawnFeatures.length === 0}
            title={drawnFeatures.length === 0 ? 'データがありません' : ''}
            style={{
              flex: 1,
              padding: '12px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'manage' ? '3px solid #3388ff' : '3px solid transparent',
              color: activeTab === 'manage' ? '#3388ff' : (darkMode ? '#999' : '#666'),
              cursor: drawnFeatures.length === 0 ? 'not-allowed' : 'pointer',
              opacity: drawnFeatures.length === 0 ? 0.5 : 1,
              fontSize: '13px',
              fontWeight: activeTab === 'manage' ? 600 : 400,
              transition: 'all 0.2s',
              marginBottom: '-2px',
              position: 'relative'
            }}
          >
            管理
            {drawnFeatures.length > 0 && (
              <span style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                backgroundColor: '#ff5722',
                color: '#fff',
                borderRadius: '10px',
                padding: '2px 6px',
                fontSize: '10px',
                fontWeight: 'bold'
              }}>
                {drawnFeatures.length}
              </span>
            )}
          </button>
          <button
            onClick={() => drawnFeatures.length > 0 && setActiveTab('export')}
            disabled={drawnFeatures.length === 0}
            title={drawnFeatures.length === 0 ? 'データがありません' : ''}
            style={{
              flex: 1,
              padding: '12px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'export' ? '3px solid #3388ff' : '3px solid transparent',
              color: activeTab === 'export' ? '#3388ff' : (darkMode ? '#999' : '#666'),
              cursor: drawnFeatures.length === 0 ? 'not-allowed' : 'pointer',
              opacity: drawnFeatures.length === 0 ? 0.5 : 1,
              fontSize: '13px',
              fontWeight: activeTab === 'export' ? 600 : 400,
              transition: 'all 0.2s',
              marginBottom: '-2px'
            }}
          >
            出力
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '12px 8px' }}>
          {activeTab === 'draw' && (
            <>
              <div style={{
                marginBottom: '12px',
                padding: '10px',
                backgroundColor: darkMode ? '#2a3a4a' : '#e3f2fd',
                borderRadius: '6px'
              }}>
                <label style={{ fontSize: '12px', color: darkMode ? '#90caf9' : '#1565c0', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  描画ツール
                </label>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleModeChange('polygon')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: drawMode === 'polygon' ? buttonActiveBg : buttonBg,
                  color: drawMode === 'polygon' ? '#fff' : textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="ポリゴン（飛行範囲）"
              >
                ポリゴン
              </button>
              <button
                onClick={() => handleModeChange('circle')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: drawMode === 'circle' ? buttonActiveBg : buttonBg,
                  color: drawMode === 'circle' ? '#fff' : textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="円（半径指定）"
              >
                円
              </button>
              <button
                onClick={() => handleModeChange('point')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: drawMode === 'point' ? buttonActiveBg : buttonBg,
                  color: drawMode === 'point' ? '#fff' : textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="ウェイポイント"
              >
                WP
              </button>
              <button
                onClick={() => handleModeChange('line')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: drawMode === 'line' ? buttonActiveBg : buttonBg,
                  color: drawMode === 'line' ? '#fff' : textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="飛行経路（ライン）"
              >
                経路
              </button>
            </div>
          </div>

          {/* 円の半径設定 */}
          {drawMode === 'circle' && (
            <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#333' : '#f0f8ff', borderRadius: '4px', border: '1px solid #3388ff' }}>
              <label style={{ fontSize: '12px', color: '#3388ff', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                半径: {circleRadius}m
              </label>
              <p style={{ fontSize: '10px', color: darkMode ? '#ccc' : '#666', margin: '0 0 8px' }}>
                地図をクリックして円を配置
              </p>
              <select
                value={circleRadius}
                onChange={(e) => setCircleRadius(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: buttonBg,
                  color: textColor
                }}
              >
                <option value={10}>10m</option>
                <option value={30}>30m</option>
                <option value={50}>50m</option>
                <option value={100}>100m</option>
                <option value={150}>150m</option>
                <option value={200}>200m</option>
                <option value={300}>300m</option>
                <option value={500}>500m</option>
                <option value={1000}>1km</option>
                <option value={2000}>2km</option>
                <option value={5000}>5km</option>
              </select>
            </div>
          )}

          {/* 円の頂点数設定 */}
          {drawMode === 'circle' && (
            <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#333' : '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
              <label style={{ fontSize: '12px', color: '#4caf50', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                円の頂点数
              </label>
              <select
                value={circlePoints}
                onChange={(e) => setCirclePoints(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: buttonBg,
                  color: textColor
                }}
              >
                <option value={8}>8点（簡易）</option>
                <option value={12}>12点</option>
                <option value={16}>16点</option>
                <option value={24}>24点（標準）</option>
                <option value={32}>32点（滑らか）</option>
                <option value={48}>48点（精密）</option>
                <option value={64}>64点（高精度）</option>
              </select>
            </div>
          )}

          {/* WP連続配置モード */}
          {drawMode === 'point' && (
            <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#333' : '#f0f8ff', borderRadius: '4px', border: '1px solid #3388ff' }}>
              <label style={{
                fontSize: '12px',
                color: darkMode ? '#eee' : '#333',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => setContinuousMode(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 'bold' }}>連続配置モード</span>
              </label>
              <p style={{ fontSize: '10px', color: darkMode ? '#ccc' : '#666', margin: '6px 0 0', paddingLeft: '24px' }}>
                {continuousMode ? 'クリックで連続してWPを配置' : 'クリックで1つ配置して終了'}
              </p>
            </div>
          )}

              {/* 操作ガイド */}
              <div style={{
                marginTop: '12px',
                padding: '10px',
                backgroundColor: darkMode ? '#2a2a2a' : '#f9f9f9',
                borderRadius: '6px',
                border: `1px solid ${borderColor}`
              }}>
                <button
                  onClick={() => setShowGuide(!showGuide)}
                  style={{
                    width: '100%',
                    padding: '6px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: darkMode ? '#ccc' : '#666',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>操作ガイド</span>
                  <span style={{ fontSize: '10px' }}>{showGuide ? '▲' : '▼'}</span>
                </button>
                {showGuide && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: darkMode ? '#aaa' : '#666',
                    lineHeight: '1.6'
                  }}>
                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                      <li>ポリゴン/経路: クリックで頂点追加、最初の点をクリックで完了</li>
                      <li>円: 中心をクリックして配置</li>
                      <li>編集: 図形を選択後「編集」ボタン → 頂点をドラッグで移動</li>
                      <li>頂点削除: 編集モードで頂点を選択 → Delete/Backspaceキー</li>
                      <li>移動: 図形をドラッグ</li>
                      <li>選択: Shift+ドラッグで複数選択</li>
                      <li>削除: 図形選択後、Delete/Backspaceキー（確認あり）</li>
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 管理タブ */}
          {activeTab === 'manage' && (
            <>
              <div style={{
                marginBottom: '12px',
                padding: '10px',
                backgroundColor: darkMode ? '#2a3a2a' : '#f1f8e9',
                borderRadius: '6px'
              }}>
                {/* ヘッダー: タイトル + 件数 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: darkMode ? '#a5d6a7' : '#2e7d32', fontWeight: 600 }}>
                    描画済み
                  </label>
                  <span style={{ fontSize: '11px', color: darkMode ? '#888' : '#666' }}>
                    {filteredFeatures.length}/{drawnFeatures.length}件
                  </span>
                </div>

                {/* 検索バー */}
                <input
                  type="text"
                  placeholder="名前で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    marginBottom: '8px',
                    border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
                    borderRadius: '4px',
                    backgroundColor: darkMode ? '#333' : '#fff',
                    color: darkMode ? '#fff' : '#333',
                    fontSize: '12px',
                    boxSizing: 'border-box'
                  }}
                />

                {/* タイプフィルタ */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {(['all', 'polygon', 'circle', 'point', 'line'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '10px',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        backgroundColor: typeFilter === type
                          ? '#3388ff'
                          : (darkMode ? '#444' : '#e0e0e0'),
                        color: typeFilter === type ? '#fff' : (darkMode ? '#ccc' : '#666')
                      }}
                    >
                      {type === 'all' ? '全て' : type === 'polygon' ? 'ポリゴン' : type === 'circle' ? '円' : type === 'point' ? 'WP' : '経路'}
                    </button>
                  ))}
                </div>

                {/* 一括操作ボタン */}
                {filteredFeatures.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <button
                      onClick={handleSelectAll}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        fontSize: '11px',
                        border: `1px solid ${darkMode ? '#555' : '#ccc'}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: darkMode ? '#333' : '#fff',
                        color: darkMode ? '#ccc' : '#666'
                      }}
                    >
                      {checkedFeatureIds.size === filteredFeatures.length ? '全解除' : '全選択'}
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      disabled={checkedFeatureIds.size === 0}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        fontSize: '11px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: checkedFeatureIds.size === 0 ? 'not-allowed' : 'pointer',
                        backgroundColor: checkedFeatureIds.size === 0
                          ? (darkMode ? '#444' : '#e0e0e0')
                          : '#f44336',
                        color: checkedFeatureIds.size === 0
                          ? (darkMode ? '#666' : '#999')
                          : '#fff'
                      }}
                    >
                      選択削除 ({checkedFeatureIds.size})
                    </button>
                  </div>
                )}

                {/* フィーチャーリスト */}
                <div style={{
                  maxHeight: '150px',
                  overflowY: 'auto',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px'
                }}>
                  {filteredFeatures.length === 0 ? (
                    <p style={{ padding: '8px', fontSize: '11px', color: darkMode ? '#aaa' : '#888', margin: 0, textAlign: 'center' }}>
                      {drawnFeatures.length === 0 ? '地図上をクリックして描画' : '該当なし'}
                    </p>
                  ) : (
                    filteredFeatures.map(f => (
                      <div
                        key={f.id}
                        style={{
                          padding: '6px 8px',
                          borderBottom: `1px solid ${darkMode ? '#333' : '#eee'}`,
                          fontSize: '12px',
                          backgroundColor: selectedFeatureId === f.id
                            ? (darkMode ? 'rgba(30, 58, 95, 0.6)' : 'rgba(187, 222, 251, 0.6)')
                            : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {/* チェックボックス */}
                        <input
                          type="checkbox"
                          checked={checkedFeatureIds.has(f.id)}
                          onChange={() => toggleFeatureCheck(f.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', flexShrink: 0 }}
                        />
                        {/* タイプアイコン */}
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: f.type === 'point' ? '50%' : f.type === 'circle' ? '50%' : '2px',
                          backgroundColor: f.type === 'point' ? '#ff9800' : f.type === 'circle' ? '#9c27b0' : f.type === 'line' ? '#4caf50' : '#3388ff',
                          flexShrink: 0
                        }} />
                        {/* 名前（クリックでズーム） */}
                        <span
                          style={{
                            flex: 1,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          onClick={() => {
                            setSelectedFeatureId(f.id)
                            zoomToFeature(f)
                          }}
                          title={f.name}
                        >
                          {f.name}
                        </span>
                        {/* ZOOMボタン */}
                        <button
                          onClick={() => {
                            setSelectedFeatureId(f.id)
                            zoomToFeature(f)
                          }}
                          style={{
                            padding: '2px 6px',
                            fontSize: '9px',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            backgroundColor: darkMode ? 'rgba(66, 165, 245, 0.2)' : 'rgba(21, 101, 192, 0.1)',
                            color: darkMode ? '#90caf9' : '#1565c0',
                            flexShrink: 0
                          }}
                        >
                          ZOOM
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

          {/* 選択中の円のリサイズ */}
          {selectedFeatureId && drawnFeatures.find(f => f.id === selectedFeatureId)?.type === 'circle' && (
            <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#333' : '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
              <label style={{ fontSize: '12px', color: '#4caf50', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                円のサイズ変更
              </label>
              <select
                value={drawnFeatures.find(f => f.id === selectedFeatureId)?.radius || 100}
                onChange={(e) => handleResizeCircle(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: buttonBg,
                  color: textColor
                }}
              >
                <option value={10}>10m</option>
                <option value={30}>30m</option>
                <option value={50}>50m</option>
                <option value={100}>100m</option>
                <option value={150}>150m</option>
                <option value={200}>200m</option>
                <option value={300}>300m</option>
                <option value={500}>500m</option>
                <option value={1000}>1km</option>
                <option value={2000}>2km</option>
                <option value={5000}>5km</option>
              </select>
            </div>
          )}

          {/* 選択中の円の頂点数変更 */}
          {selectedFeatureId && drawnFeatures.find(f => f.id === selectedFeatureId)?.type === 'circle' && (
            <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#333' : '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
              <label style={{ fontSize: '12px', color: '#4caf50', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                円の頂点数（WP数）
              </label>
              <select
                value={(drawnFeatures.find(f => f.id === selectedFeatureId)?.properties?.circlePoints as number) || 24}
                onChange={(e) => {
                  const newPoints = Number(e.target.value)
                  const currentFeature = drawnFeatures.find(f => f.id === selectedFeatureId)
                  if (currentFeature && drawRef.current) {
                    const feature = drawRef.current.get(selectedFeatureId)
                    if (feature?.properties?.center && feature?.properties?.radiusKm) {
                      const center = feature.properties.center as [number, number]
                      const radiusKm = feature.properties.radiusKm as number
                      const newCirclePolygon = createCirclePolygon(center, radiusKm, newPoints)
                      drawRef.current.delete(selectedFeatureId)
                      const newFeature = drawRef.current.add({
                        type: 'Feature',
                        properties: { isCircle: true, radiusKm, center, circlePoints: newPoints },
                        geometry: newCirclePolygon
                      })
                      if (newFeature && newFeature[0]) {
                        setSelectedFeatureId(newFeature[0])
                        drawRef.current.changeMode('simple_select', { featureIds: newFeature })
                      }
                      updateFeatures()
                    }
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: buttonBg,
                  color: textColor
                }}
              >
                <option value={8}>8点（簡易）</option>
                <option value={12}>12点</option>
                <option value={16}>16点</option>
                <option value={24}>24点（標準）</option>
                <option value={32}>32点（滑らか）</option>
                <option value={48}>48点（精密）</option>
                <option value={64}>64点（高精度）</option>
              </select>
            </div>
          )}

          {/* 選択中のフィーチャー名変更 */}
          {selectedFeatureId && (() => {
            const currentFeature = drawnFeatures.find(f => f.id === selectedFeatureId)
            const currentName = currentFeature?.name || ''
            const hasEmptyName = isNameEmpty(currentName)

            // 頂点数を計算
            let vertexCount = 0
            if (currentFeature) {
              if (currentFeature.type === 'polygon' && Array.isArray(currentFeature.coordinates) && currentFeature.coordinates.length > 0) {
                const outerRing = currentFeature.coordinates[0]
                if (Array.isArray(outerRing)) {
                  vertexCount = outerRing.length - 1 // 最後は最初と同じ座標なので-1
                }
              } else if (currentFeature.type === 'line' && Array.isArray(currentFeature.coordinates)) {
                vertexCount = currentFeature.coordinates.length
              } else if (currentFeature.type === 'circle') {
                vertexCount = (currentFeature.properties?.circlePoints as number) || 24
              }
            }

            return (
              <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#333' : '#f0f7ff', borderRadius: '4px', border: `1px solid ${darkMode ? '#555' : '#2196f3'}` }}>
                <label style={{ fontSize: '12px', color: darkMode ? '#64b5f6' : '#2196f3', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  名前
                  {hasEmptyName && (
                    <span style={{ color: '#f44336', marginLeft: '8px', fontSize: '11px' }}>
                      ※ 名前を入力してください
                    </span>
                  )}
                  {vertexCount > 0 && (
                    <span style={{ color: darkMode ? '#aaa' : '#666', marginLeft: '8px', fontSize: '11px', fontWeight: 'normal' }}>
                      ({vertexCount}点)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={currentName}
                  onChange={(e) => handleRenameFeature(selectedFeatureId, e.target.value)}
                  placeholder="フィーチャー名を入力"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: hasEmptyName ? '2px solid #f44336' : `1px solid ${borderColor}`,
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: hasEmptyName ? (darkMode ? '#3d2020' : '#fff5f5') : buttonBg,
                    color: textColor,
                    outline: 'none'
                  }}
                />
              </div>
            )
          })()}

          {/* 飛行高度設定 */}
          {selectedFeatureId && (() => {
            const currentFeature = drawnFeatures.find(f => f.id === selectedFeatureId)
            const elevation = currentFeature?.elevation
            const flightHeight = currentFeature?.flightHeight
            const maxAltitude = currentFeature?.maxAltitude

            return (
              <div style={{
                marginBottom: '12px',
                padding: '8px',
                backgroundColor: darkMode ? '#333' : '#f0f7ff',
                borderRadius: '4px',
                border: `1px solid ${darkMode ? '#555' : '#2196f3'}`
              }}>
                <label style={{
                  fontSize: '12px',
                  color: darkMode ? '#64b5f6' : '#2196f3',
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 'bold'
                }}>
                  飛行高度設定
                </label>

                {/* 標高表示と取得ボタン */}
                <div style={{ marginBottom: '8px' }}>
                  <label style={{
                    fontSize: '11px',
                    color: darkMode ? '#aaa' : '#666',
                    display: 'block',
                    marginBottom: '4px'
                  }}>
                    標高（国土地理院）
                  </label>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={elevation !== undefined ? `${elevation}m` : '未取得'}
                      readOnly
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: darkMode ? '#222' : '#f5f5f5',
                        color: textColor,
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={() => handleFetchElevation(selectedFeatureId)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4caf50',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      取得
                    </button>
                  </div>
                </div>

                {/* 飛行高度入力 */}
                <div style={{ marginBottom: '8px' }}>
                  <label style={{
                    fontSize: '11px',
                    color: darkMode ? '#aaa' : '#666',
                    display: 'block',
                    marginBottom: '4px'
                  }}>
                    飛行高度（相対高度）
                  </label>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={flightHeight ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : Number(e.target.value)
                        handleUpdateFlightHeight(selectedFeatureId, val)
                      }}
                      placeholder="例: 150"
                      disabled={elevation === undefined}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: elevation === undefined ? (darkMode ? '#222' : '#f5f5f5') : buttonBg,
                        color: elevation === undefined ? (darkMode ? '#666' : '#999') : textColor,
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '11px', color: darkMode ? '#aaa' : '#666', whiteSpace: 'nowrap' }}>m</span>
                  </div>
                  {elevation === undefined && (
                    <p style={{ fontSize: '10px', color: '#f44336', margin: '4px 0 0' }}>
                      ※ 先に標高を取得してください
                    </p>
                  )}
                </div>

                {/* 上限高度表示 */}
                <div>
                  <label style={{
                    fontSize: '11px',
                    color: darkMode ? '#aaa' : '#666',
                    display: 'block',
                    marginBottom: '4px'
                  }}>
                    上限（海抜高度）
                  </label>
                  <input
                    type="text"
                    value={maxAltitude !== undefined ? `${maxAltitude}m` : '未設定'}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: `1px solid ${borderColor}`,
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: darkMode ? '#222' : '#f5f5f5',
                      color: maxAltitude !== undefined ? (darkMode ? '#4caf50' : '#2e7d32') : textColor,
                      fontWeight: maxAltitude !== undefined ? 'bold' : 'normal',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* 説明 */}
                <p style={{
                  fontSize: '10px',
                  color: darkMode ? '#aaa' : '#666',
                  margin: '8px 0 0',
                  lineHeight: 1.4
                }}>
                  下限：地表面、上限：標高+飛行高度
                </p>
              </div>
            )
          })()}

          {/* 編集・削除ボタン */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            <button
              onClick={handleEditFeature}
              disabled={!selectedFeatureId}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: isEditing ? '#4caf50' : (selectedFeatureId ? (darkMode ? '#1e3a5f' : '#e3f2fd') : buttonBg),
                color: isEditing ? '#fff' : (selectedFeatureId ? (darkMode ? '#64b5f6' : '#1565c0') : (darkMode ? '#666' : '#999')),
                border: `1px solid ${isEditing ? '#4caf50' : (selectedFeatureId ? (darkMode ? '#1565c0' : borderColor) : borderColor)}`,
                borderRadius: '4px',
                cursor: selectedFeatureId ? 'pointer' : 'not-allowed',
                fontSize: '11px',
                fontWeight: isEditing ? 'bold' : 'normal'
              }}
            >
              {isEditing ? '編集完了' : '編集'}
            </button>
            <button
              onClick={handleDelete}
              disabled={!selectedFeatureId}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: selectedFeatureId ? (darkMode ? '#4a2020' : '#ffebee') : buttonBg,
                color: selectedFeatureId ? (darkMode ? '#ef9a9a' : '#c62828') : (darkMode ? '#666' : '#999'),
                border: `1px solid ${selectedFeatureId ? (darkMode ? '#c62828' : borderColor) : borderColor}`,
                borderRadius: '4px',
                cursor: selectedFeatureId ? 'pointer' : 'not-allowed',
                fontSize: '11px'
              }}
            >
              削除
            </button>
          </div>

          {/* 頂点編集の操作説明 */}
          {selectedFeatureId && (() => {
            const currentFeature = drawnFeatures.find(f => f.id === selectedFeatureId)
            const isCircle = currentFeature?.type === 'circle'
            const isPolygonOrLine = currentFeature?.type === 'polygon' || currentFeature?.type === 'line'

            if (!isCircle && isPolygonOrLine) {
              if (isEditing) {
                // 編集モード中の詳細説明
                return (
                  <div style={{
                    marginBottom: '12px',
                    padding: '8px',
                    backgroundColor: darkMode ? '#2d3e2d' : '#f1f8e9',
                    borderRadius: '4px',
                    border: '1px solid #8bc34a',
                    fontSize: '11px',
                    color: darkMode ? '#c5e1a5' : '#558b2f'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>頂点の編集方法</div>
                    <div style={{ lineHeight: '1.6' }}>
                      - 頂点を移動: 青い点をドラッグ<br/>
                      - 頂点を追加: 辺の中点（小さい点）をクリック<br/>
                      - 頂点を削除: 頂点を選択 → Delete/Backspace
                    </div>
                  </div>
                )
              } else {
                // 編集モード前のヒント
                return (
                  <div style={{
                    marginBottom: '12px',
                    padding: '6px 8px',
                    backgroundColor: darkMode ? '#1e3a5f' : '#e3f2fd',
                    borderRadius: '4px',
                    border: `1px solid ${darkMode ? '#2196f3' : '#90caf9'}`,
                    fontSize: '10px',
                    color: darkMode ? '#90caf9' : '#1565c0'
                  }}>
                    「編集」ボタンで頂点の追加・削除・移動が可能
                  </div>
                )
              }
            }
            return null
          })()}
            </>
          )}

          {/* 出力タブ */}
          {activeTab === 'export' && (
            <>
              <div style={{
                marginBottom: '12px',
                padding: '10px',
                backgroundColor: darkMode ? '#2a2a3a' : '#e8f5e9',
                borderRadius: '6px'
              }}>
                <label style={{ fontSize: '12px', color: darkMode ? '#81c784' : '#2e7d32', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  エクスポート形式
                </label>

          {/* エクスポート形式選択 */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {(['geojson', 'kml', 'csv', 'dms'] as ExportFormat[]).map(format => (
                <button
                  key={format}
                  onClick={() => setExportFormat(format)}
                  style={{
                    flex: '1 0 auto',
                    padding: '6px 12px',
                    backgroundColor: exportFormat === format ? '#3388ff' : buttonBg,
                    color: exportFormat === format ? '#fff' : (darkMode ? '#ccc' : '#666'),
                    border: `1px solid ${exportFormat === format ? '#3388ff' : borderColor}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: exportFormat === format ? 'bold' : 'normal'
                  }}
                >
                  {EXPORT_FORMAT_LABELS[format]}
                </button>
              ))}
            </div>
          </div>

          {/* 出力ボタン */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={handleCopyCoordinates}
              disabled={drawnFeatures.length === 0}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: drawnFeatures.length > 0 ? '#e3f2fd' : buttonBg,
                color: drawnFeatures.length > 0 ? '#1565c0' : (darkMode ? '#666' : '#999'),
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                cursor: drawnFeatures.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: '11px'
              }}
            >
              座標コピー
            </button>
            <button
              onClick={handleShowPreview}
              disabled={drawnFeatures.length === 0}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: drawnFeatures.length > 0 ? '#e8f5e9' : buttonBg,
                color: drawnFeatures.length > 0 ? '#2e7d32' : (darkMode ? '#666' : '#999'),
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                cursor: drawnFeatures.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: '11px'
              }}
            >
              データ出力
            </button>
          </div>

          {/* 全削除 */}
          {drawnFeatures.length > 0 && (
            <button
              onClick={handleDeleteAll}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '6px',
                backgroundColor: 'transparent',
                color: '#c62828',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px'
              }}
            >
              全て削除
            </button>
          )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }} onClick={() => {
          setShowDeleteConfirm(false)
          setPendingDeleteIds([])
        }}>
          <div style={{
            backgroundColor: darkMode ? '#2a2a2a' : '#fff',
            borderRadius: '16px',
            width: '400px',
            maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              padding: '32px 24px 24px',
              textAlign: 'center'
            }}>
              {/* アイコン: 外側リング + 内側円 + ! */}
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                backgroundColor: darkMode ? 'rgba(239, 83, 80, 0.1)' : 'rgba(239, 83, 80, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: `2px solid ${darkMode ? '#ef5350' : '#ef5350'}`,
                  backgroundColor: darkMode ? 'rgba(239, 83, 80, 0.15)' : 'rgba(239, 83, 80, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: '#ef5350'
                }}>
                  !
                </div>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600, color: darkMode ? '#fff' : '#333' }}>
                削除しますか？
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: darkMode ? '#999' : '#666', lineHeight: 1.5 }}>
                選択された {selectedCount} 個のオブジェクトを削除します
              </p>
            </div>
            <div style={{
              padding: '16px 24px 24px',
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setPendingDeleteIds([])
                }}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  backgroundColor: darkMode ? '#3a3a3a' : '#fff',
                  border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 500,
                  color: darkMode ? '#ccc' : '#333'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmDeleteWithClear}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  backgroundColor: darkMode ? 'rgba(239, 83, 80, 0.15)' : 'rgba(239, 83, 80, 0.08)',
                  color: '#ef5350',
                  border: '1px solid #ef5350',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title={`エクスポートプレビュー (${EXPORT_FORMAT_LABELS[exportFormat]})`}
        darkMode={darkMode}
        footer={
          <>
            <button
              onClick={async () => {
                if (!navigator.clipboard || !navigator.clipboard.writeText) {
                  showToast('このブラウザではクリップボードへのコピーがサポートされていません', 'error')
                  return
                }
                try {
                  await navigator.clipboard.writeText(previewData)
                  showToast('クリップボードにコピーしました', 'success')
                } catch (error) {
                  console.error('Failed to copy to clipboard:', error)
                  showToast('クリップボードへのコピーに失敗しました', 'error')
                }
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: darkMode ? '#333' : '#f0f0f0',
                border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: darkMode ? '#fff' : '#333'
              }}
            >
              コピー
            </button>
            <button
              onClick={handleDownload}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3388ff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              ダウンロード
            </button>
          </>
        }
      >
        <pre
          style={{
            margin: 0,
            padding: '12px',
            backgroundColor: darkMode ? '#2d2d2d' : '#f5f5f5',
            borderRadius: '4px',
            fontSize: '11px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            fontFamily: 'Monaco, Consolas, monospace',
            color: darkMode ? '#e0e0e0' : '#333',
            border: darkMode ? '1px solid #444' : 'none'
          }}
        >
          {previewData}
        </pre>
      </Modal>
    </>
  )
}

export default DrawingTools
