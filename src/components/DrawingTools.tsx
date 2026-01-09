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

// 描画されたフィーチャーの型
interface DrawnFeature {
  id: string
  type: 'polygon' | 'circle' | 'point' | 'line'
  name: string
  coordinates: GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][]
  radius?: number // 円の場合の半径(m)
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

  // Draw初期化
  useEffect(() => {
    if (!map) return

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      styles: [
        // 飛行範囲（ポリゴン）- 赤
        {
          id: 'gl-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': '#FF4444',
            'fill-opacity': 0.3
          }
        },
        {
          id: 'gl-draw-polygon-stroke',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'line-color': '#FF4444',
            'line-width': 2
          }
        },
        // 飛行経路（ライン）- 青
        {
          id: 'gl-draw-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
          paint: {
            'line-color': '#4444FF',
            'line-width': 3
          }
        },
        // ウェイポイント（ポイント）
        {
          id: 'gl-draw-point',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: {
            'circle-radius': 8,
            'circle-color': '#FF4444',
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2
          }
        },
        // 頂点
        {
          id: 'gl-draw-polygon-and-line-vertex-active',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#FFFFFF',
            'circle-stroke-color': '#FF4444',
            'circle-stroke-width': 2
          }
        }
      ]
    })

    // @ts-expect-error MapLibreとMapboxの互換性
    map.addControl(draw, 'top-left')
    drawRef.current = draw

    // イベントハンドラ
    const handleCreate = () => {
      updateFeatures()
    }

    const handleUpdate = () => {
      updateFeatures()
    }

    const handleDelete = () => {
      updateFeatures()
    }

    const handleSelectionChange = (e: { features: Array<{ id: string }> }) => {
      if (e.features.length > 0) {
        setSelectedFeatureId(e.features[0].id)
      } else {
        setSelectedFeatureId(null)
      }
    }

    map.on('draw.create', handleCreate)
    map.on('draw.update', handleUpdate)
    map.on('draw.delete', handleDelete)
    map.on('draw.selectionchange', handleSelectionChange)

    return () => {
      map.off('draw.create', handleCreate)
      map.off('draw.update', handleUpdate)
      map.off('draw.delete', handleDelete)
      map.off('draw.selectionchange', handleSelectionChange)
      // @ts-expect-error MapLibreとMapboxの互換性
      map.removeControl(draw)
    }
  }, [map])

  // 円描画モードのクリックハンドラ
  useEffect(() => {
    if (!map || drawMode !== 'circle') return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const center: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      // 円ポリゴンを作成
      const radiusKm = circleRadius / 1000
      const circlePolygon = createCirclePolygon(center, radiusKm)

      if (drawRef.current) {
        const featureId = drawRef.current.add({
          type: 'Feature',
          properties: { isCircle: true, radiusKm, center },
          geometry: circlePolygon
        })
        console.log('Circle added:', featureId)
        updateFeatures()
      }

      setDrawMode('none')
    }

    map.on('click', handleClick)
    map.getCanvas().style.cursor = 'crosshair'

    return () => {
      map.off('click', handleClick)
      map.getCanvas().style.cursor = ''
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
        properties: f.properties || {}
      }
    })

    setDrawnFeatures(features)
    onFeaturesChange?.(features)
  }, [onFeaturesChange])

  // 描画モード変更
  const handleModeChange = (mode: DrawMode) => {
    if (!drawRef.current) return

    setDrawMode(mode)

    switch (mode) {
      case 'polygon':
        drawRef.current.changeMode('draw_polygon')
        break
      case 'circle':
        // 円はカスタムモードで処理
        drawRef.current.changeMode('simple_select')
        break
      case 'point':
        drawRef.current.changeMode('draw_point')
        break
      case 'line':
        drawRef.current.changeMode('draw_line_string')
        break
      default:
        drawRef.current.changeMode('simple_select')
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

  // 座標エクスポート
  const handleExport = () => {
    if (!drawRef.current) return

    const allFeatures = drawRef.current.getAll()
    const exportData = {
      type: 'FeatureCollection',
      features: allFeatures.features,
      metadata: {
        exportedAt: new Date().toISOString(),
        featureCount: allFeatures.features.length
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flight-plan-${new Date().toISOString().slice(0, 10)}.geojson`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 座標をテキスト形式でコピー
  const handleCopyCoordinates = () => {
    const coordText = drawnFeatures.map(f => {
      if (f.type === 'point') {
        const coords = f.coordinates as GeoJSON.Position
        return `${f.name}: ${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
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

  const bgColor = darkMode ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)'
  const textColor = darkMode ? '#fff' : '#333'
  const borderColor = darkMode ? '#555' : '#ddd'
  const buttonBg = darkMode ? '#444' : '#f0f0f0'
  const buttonActiveBg = '#4a90d9'

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          top: 120,
          left: 300,
          padding: '10px 16px',
          backgroundColor: '#4a90d9',
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
        backgroundColor: '#4a90d9',
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
          <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: darkMode ? '#333' : '#f8f8f8', borderRadius: '4px' }}>
            <label style={{ fontSize: '12px', color: darkMode ? '#aaa' : '#666', display: 'block', marginBottom: '4px' }}>
              半径: {circleRadius}m - 地図をクリックして配置
            </label>
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
                      backgroundColor: f.type === 'line' ? '#4444FF' : '#FF4444'
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

        {/* アクションボタン */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
            選択削除
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={drawnFeatures.length === 0}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: drawnFeatures.length > 0 ? '#ffebee' : buttonBg,
              color: drawnFeatures.length > 0 ? '#c62828' : (darkMode ? '#666' : '#999'),
              border: `1px solid ${borderColor}`,
              borderRadius: '4px',
              cursor: drawnFeatures.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '11px'
            }}
          >
            全削除
          </button>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
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
            onClick={handleExport}
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
            GeoJSON出力
          </button>
        </div>
      </div>

      {/* Help */}
      <div style={{
        padding: '8px 16px',
        backgroundColor: darkMode ? '#222' : '#f8f8f8',
        borderTop: `1px solid ${borderColor}`,
        fontSize: '10px',
        color: darkMode ? '#888' : '#888'
      }}>
        <p style={{ margin: '0 0 4px' }}>描画方法:</p>
        <ul style={{ margin: 0, paddingLeft: '16px' }}>
          <li>ポリゴン: クリックで頂点追加、ダブルクリックで完了</li>
          <li>円: クリックで中心を指定</li>
          <li>WP: クリックでポイント配置</li>
          <li>経路: クリックで経由点追加、ダブルクリックで完了</li>
        </ul>
      </div>
    </div>
  )
}

export default DrawingTools
