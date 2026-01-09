/**
 * Drawing Tools Component
 * DIPS風の描画ツール - ポリゴン、円、ウェイポイント、飛行経路
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type maplibregl from 'maplibre-gl'
import { createCirclePolygon } from '../lib/utils/geo'

// 描画モードの型定義
type DrawMode = 'none' | 'polygon' | 'circle' | 'point' | 'line'

// モード名の日本語表示
const MODE_LABELS: Record<DrawMode, string> = {
  none: '',
  polygon: 'ポリゴン描画中',
  circle: '円を配置（クリック）',
  point: 'ウェイポイント配置中',
  line: '経路描画中'
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
}

export interface DrawingToolsProps {
  map: maplibregl.Map | null
  onFeaturesChange?: (features: DrawnFeature[]) => void
  darkMode?: boolean
}

/**
 * DrawingTools Component
 * 飛行経路・飛行範囲の描画ツール
 */
export function DrawingTools({ map, onFeaturesChange, darkMode = false }: DrawingToolsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [drawnFeatures, setDrawnFeatures] = useState<DrawnFeature[]>([])
  const [circleRadius, setCircleRadius] = useState(100) // メートル
  const drawRef = useRef<MapboxDraw | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)

  // Draw初期化
  useEffect(() => {
    if (!map) return

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
            'fill-opacity': 0.2
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
            'fill-opacity': 0.3
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
            'line-width': 2
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
            'circle-color': '#fff'
          }
        },
        // 頂点 - アクティブ
        {
          id: 'gl-draw-polygon-and-line-vertex-stroke-inactive',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#fff'
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

    // イベントハンドラ
    const handleCreate = (e: { features: Array<{ id: string }> }) => {
      updateFeatures()
      // 作成後、自動的に選択状態にして編集しやすく
      if (e.features.length > 0) {
        const newFeatureId = e.features[0].id
        setSelectedFeatureId(newFeatureId)
        // 作成後、選択モードに戻す
        setTimeout(() => {
          draw.changeMode('simple_select', { featureIds: [newFeatureId] })
        }, 100)
      }
      setDrawMode('none')
    }

    const handleUpdate = () => {
      updateFeatures()
    }

    const handleDelete = () => {
      updateFeatures()
      setSelectedFeatureId(null)
    }

    const handleSelectionChange = (e: { features: Array<{ id: string }> }) => {
      if (e.features.length > 0) {
        setSelectedFeatureId(e.features[0].id)
      } else {
        setSelectedFeatureId(null)
      }
    }

    // 描画モード変更時のUI更新
    const handleModeChange = (e: { mode: string }) => {
      if (e.mode === 'simple_select' || e.mode === 'direct_select') {
        // 編集モードではカーソルを変更
        map.getCanvas().style.cursor = e.mode === 'direct_select' ? 'move' : ''
        setIsEditing(e.mode === 'direct_select')
      } else {
        setIsEditing(false)
      }
    }

    map.on('draw.create', handleCreate)
    map.on('draw.update', handleUpdate)
    map.on('draw.delete', handleDelete)
    map.on('draw.selectionchange', handleSelectionChange)
    map.on('draw.modechange', handleModeChange)

    return () => {
      try {
        // マップが有効な場合のみクリーンアップ
        if (map && map.getCanvas()) {
          map.off('draw.create', handleCreate)
          map.off('draw.update', handleUpdate)
          map.off('draw.delete', handleDelete)
          map.off('draw.selectionchange', handleSelectionChange)
          map.off('draw.modechange', handleModeChange)
          // @ts-expect-error MapLibreとMapboxの互換性
          map.removeControl(draw)
        }
      } catch {
        // マップが既に破棄されている場合は無視
      }
      drawRef.current = null
    }
  }, [map])

  // 円描画モードのクリックハンドラ
  useEffect(() => {
    if (!map || drawMode !== 'circle') return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const center: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      // 円ポリゴンを作成（少ない座標点で）
      const radiusKm = circleRadius / 1000
      const circlePolygon = createCirclePolygon(center, radiusKm, 24) // 24点でシンプルに

      if (drawRef.current) {
        drawRef.current.add({
          type: 'Feature',
          properties: { isCircle: true, radiusKm, center },
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

  // フィーチャー更新
  const updateFeatures = useCallback(() => {
    if (!drawRef.current) return

    const allFeatures = drawRef.current.getAll()
    const features: DrawnFeature[] = allFeatures.features.map((f) => {
      let type: DrawnFeature['type'] = 'polygon'
      if (f.geometry.type === 'Point') type = 'point'
      else if (f.geometry.type === 'LineString') type = 'line'
      else if (f.properties?.isCircle) type = 'circle'

      const id = typeof f.id === 'string' ? f.id : String(f.id)

      return {
        id,
        type,
        name: (f.properties?.name as string) || `${type}-${id.slice(0, 6)}`,
        coordinates: f.geometry.type !== 'GeometryCollection' ? f.geometry.coordinates : [],
        radius: f.properties?.radiusKm ? (f.properties.radiusKm as number) * 1000 : undefined,
        center: f.properties?.center as [number, number] | undefined,
        properties: f.properties || {}
      }
    })

    setDrawnFeatures(features)
    onFeaturesChange?.(features)
  }, [onFeaturesChange])

  // 描画モード変更
  const handleModeChange = (mode: DrawMode) => {
    if (!drawRef.current || !map) return

    setDrawMode(mode)
    setIsEditing(false)

    // カーソルを描画モードに合わせて変更
    const canvas = map.getCanvas()

    switch (mode) {
      case 'polygon':
        drawRef.current.changeMode('draw_polygon')
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

  // プレビュー表示
  const handleShowPreview = () => {
    if (!drawRef.current) return

    const allFeatures = drawRef.current.getAll()

    // シンプルな出力形式に変換
    const exportData = {
      type: 'FeatureCollection',
      features: allFeatures.features.map(f => {
        const props = { ...f.properties }
        // 円の場合は中心点と半径のみを出力
        if (props.isCircle && props.center) {
          return {
            type: 'Feature',
            properties: {
              type: 'circle',
              radiusM: (props.radiusKm as number) * 1000,
              center: props.center
            },
            geometry: {
              type: 'Point',
              coordinates: props.center
            }
          }
        }
        return f
      }),
      metadata: {
        exportedAt: new Date().toISOString(),
        featureCount: allFeatures.features.length
      }
    }

    setPreviewData(JSON.stringify(exportData, null, 2))
    setShowPreview(true)
  }

  // ダウンロード実行
  const handleDownload = () => {
    const blob = new Blob([previewData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flight-plan-${new Date().toISOString().slice(0, 10)}.geojson`
    a.click()
    URL.revokeObjectURL(url)
    setShowPreview(false)
  }

  // 座標をテキスト形式でコピー
  const handleCopyCoordinates = () => {
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

    navigator.clipboard.writeText(coordText)
    alert('座標をクリップボードにコピーしました')
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

    // 新しい円ポリゴンを作成
    const newCirclePolygon = createCirclePolygon(center, radiusKm, 24)

    // フィーチャーを更新
    drawRef.current.delete(selectedFeatureId)
    const newFeature = drawRef.current.add({
      type: 'Feature',
      properties: { isCircle: true, radiusKm, center },
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

  if (!isOpen) {
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

  return (
    <>
      <div style={{
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
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#3388ff',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '14px' }}>飛行経路／飛行範囲</h3>
          <button
            onClick={() => setIsOpen(false)}
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
        </div>

        {/* Status Banner */}
        {(drawMode !== 'none' || isEditing) && (
          <div style={{
            padding: '8px 16px',
            backgroundColor: isEditing ? '#e8f5e9' : '#fff3e0',
            borderBottom: `1px solid ${isEditing ? '#4caf50' : '#ff9800'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: isEditing ? '#2e7d32' : '#e65100' }}>
              {isEditing ? '編集中 - 頂点をドラッグ' : MODE_LABELS[drawMode]}
            </span>
            <button
              onClick={handleCancelMode}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: '1px solid currentColor',
                borderRadius: '4px',
                color: isEditing ? '#2e7d32' : '#e65100',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              {isEditing ? '完了' : 'キャンセル'}
            </button>
          </div>
        )}

        {/* Drawing Tools */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', display: 'block', marginBottom: '6px' }}>
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
              <p style={{ fontSize: '10px', color: darkMode ? '#aaa' : '#666', margin: '0 0 8px' }}>
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

          {/* 描画済みフィーチャー一覧 */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', display: 'block', marginBottom: '6px' }}>
              描画済み ({drawnFeatures.length})
            </label>
            <div style={{
              maxHeight: '120px',
              overflowY: 'auto',
              border: `1px solid ${borderColor}`,
              borderRadius: '4px'
            }}>
              {drawnFeatures.length === 0 ? (
                <p style={{ padding: '8px', fontSize: '11px', color: darkMode ? '#888' : '#888', margin: 0, textAlign: 'center' }}>
                  地図上をクリックして描画
                </p>
              ) : (
                drawnFeatures.map(f => (
                  <div
                    key={f.id}
                    style={{
                      padding: '6px 8px',
                      borderBottom: `1px solid ${borderColor}`,
                      fontSize: '11px',
                      backgroundColor: selectedFeatureId === f.id ? (darkMode ? '#444' : '#e8f4ff') : 'transparent',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedFeatureId(f.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: f.type === 'point' ? '50%' : '2px',
                        backgroundColor: '#3388ff'
                      }} />
                      <span>{f.name}</span>
                      <span style={{ marginLeft: 'auto', color: darkMode ? '#888' : '#888' }}>
                        {f.type === 'circle' && f.radius ? `${f.radius}m` : ''}
                      </span>
                    </div>
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

          {/* 編集・削除ボタン */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            <button
              onClick={handleEditFeature}
              disabled={!selectedFeatureId}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: isEditing ? '#4caf50' : (selectedFeatureId ? '#e3f2fd' : buttonBg),
                color: isEditing ? '#fff' : (selectedFeatureId ? '#1565c0' : (darkMode ? '#666' : '#999')),
                border: `1px solid ${isEditing ? '#4caf50' : borderColor}`,
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
                backgroundColor: selectedFeatureId ? '#ffebee' : buttonBg,
                color: selectedFeatureId ? '#c62828' : (darkMode ? '#666' : '#999'),
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                cursor: selectedFeatureId ? 'pointer' : 'not-allowed',
                fontSize: '11px'
              }}
            >
              削除
            </button>
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

        {/* Help */}
        <div style={{
          padding: '8px 16px',
          backgroundColor: darkMode ? '#222' : '#f8f8f8',
          borderTop: `1px solid ${borderColor}`,
          fontSize: '10px',
          color: darkMode ? '#888' : '#666'
        }}>
          <p style={{ margin: '0 0 4px', fontWeight: 'bold' }}>操作ガイド:</p>
          <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: 1.6 }}>
            <li><strong>ポリゴン/経路:</strong> クリックで頂点追加、最初の点をクリックで完了</li>
            <li><strong>円:</strong> 半径選択後、地図をクリックで配置</li>
            <li><strong>編集:</strong> 図形選択→「編集」→頂点ドラッグで変形</li>
            <li><strong>移動:</strong> 図形をドラッグして移動</li>
          </ul>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
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
        }} onClick={() => setShowPreview(false)}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #ddd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>エクスポートプレビュー</h3>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '16px'
            }}>
              <pre style={{
                margin: 0,
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'Monaco, Consolas, monospace'
              }}>
                {previewData}
              </pre>
            </div>
            <div style={{
              padding: '16px',
              borderTop: '1px solid #ddd',
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewData)
                  alert('クリップボードにコピーしました')
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
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
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DrawingTools
