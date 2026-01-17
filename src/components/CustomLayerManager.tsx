/**
 * Custom Layer Manager Component
 * ユーザーがカスタムレイヤーをインポート/エクスポート/管理するUI
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import {
  CustomLayerService,
  CustomLayer,
  CustomLayerConfig,
  readGeoJSONFile,
  downloadAsFile
} from '../lib/services/customLayers'
import { showToast } from '../utils/toast'
import { showConfirm } from '../utils/dialog'
import { getAppTheme } from '../styles/theme'
import { Modal } from './Modal'

export interface CustomLayerManagerProps {
  onLayerAdded: (layer: CustomLayer) => void
  onLayerRemoved: (layerId: string) => void
  onLayerToggle: (layerId: string, visible: boolean) => void
  onLayerFocus?: (layerId: string) => void
  visibleLayers: Set<string>
  darkMode: boolean
}

type GeometryCounts = {
  polygon: number
  line: number
  point: number
}

const DRAWING_STORAGE_KEY = 'did-map-drawn-features'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isGeometryType = (t: unknown): t is GeoJSON.Geometry['type'] => {
  if (typeof t !== 'string') return false
  return (
    t === 'Point' ||
    t === 'MultiPoint' ||
    t === 'LineString' ||
    t === 'MultiLineString' ||
    t === 'Polygon' ||
    t === 'MultiPolygon' ||
    t === 'GeometryCollection'
  )
}

const loadDrawingFeatureCollection = (): GeoJSON.FeatureCollection | null => {
  try {
    const raw = localStorage.getItem(DRAWING_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return null
    if (parsed.type !== 'FeatureCollection') return null
    const featuresRaw = parsed.features
    if (!Array.isArray(featuresRaw)) return null

    const features: Array<GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>> = []
    for (const f of featuresRaw) {
      if (!isRecord(f)) continue
      if (f.type !== 'Feature') continue
      const geomRaw = f.geometry
      if (!isRecord(geomRaw)) continue
      if (!isGeometryType(geomRaw.type)) continue

      const idRaw = f.id
      const id = typeof idRaw === 'string' || typeof idRaw === 'number' ? idRaw : undefined
      const props = isRecord(f.properties) ? (f.properties as Record<string, unknown>) : {}

      features.push({
        type: 'Feature',
        id,
        properties: props,
        geometry: geomRaw as unknown as GeoJSON.Geometry
      })
    }

    return { type: 'FeatureCollection', features }
  } catch {
    return null
  }
}

const getDrawingKindLabel = (kind: 'polygon' | 'line' | 'point' | 'all'): string => {
  if (kind === 'polygon') return 'ポリゴン'
  if (kind === 'line') return '経路'
  if (kind === 'point') return 'WP'
  return '全て'
}

const countGeometryTypes = (fc: GeoJSON.FeatureCollection): GeometryCounts => {
  const counts: GeometryCounts = { polygon: 0, line: 0, point: 0 }

  fc.features.forEach((f) => {
    const t = f.geometry?.type
    if (!t) return
    if (t === 'Polygon' || t === 'MultiPolygon') {
      counts.polygon += 1
      return
    }
    if (t === 'LineString' || t === 'MultiLineString') {
      counts.line += 1
      return
    }
    if (t === 'Point' || t === 'MultiPoint') {
      counts.point += 1
    }
  })

  return counts
}

const getLayerSignature = (layer: CustomLayer): string => {
  // NOTE: 「完全に同じレイヤー（データ＋見た目）」のみを重複扱いにする
  // - データだけで重複判定すると、色違いで同じ形状を持ちたいケースを潰してしまう
  // - JSON.stringify は順序依存だが、アプリ内生成・保存データなら安定する想定
  return `${JSON.stringify(layer.data)}|${layer.category}|${layer.color}|${layer.opacity}`
}

/**
 * Layer categories and their visual properties
 */
const CATEGORIES = [
  { id: 'emergency', name: '緊急用務空域', color: '#FFA500' },
  { id: 'manned', name: '有人機発着エリア', color: '#87CEEB' },
  { id: 'remote_id', name: 'リモートID特定区域', color: '#DDA0DD' },
  { id: 'lte', name: 'LTEエリア', color: '#4CAF50' },
  { id: 'wind', name: '風況データ', color: '#2196F3' },
  { id: 'custom', name: 'カスタム', color: '#888888' }
]

/**
 * CustomLayerManager Component
 *
 * Manages user-created custom geographic layers with import/export functionality.
 * Allows users to:
 * - Import GeoJSON files as custom layers
 * - Export layers as GeoJSON
 * - Delete custom layers with confirmation
 * - Configure layer properties (name, category, color, opacity)
 *
 * @component
 * @param props - Component props
 * @returns JSX Element
 */
export function CustomLayerManager({
  onLayerAdded,
  onLayerRemoved,
  onLayerToggle,
  onLayerFocus,
  visibleLayers,
  darkMode
}: CustomLayerManagerProps) {
  const theme = useMemo(() => getAppTheme(darkMode), [darkMode])
  const [isOpen, setIsOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [customLayers, setCustomLayers] = useState<CustomLayer[]>(() => CustomLayerService.getAll())
  const [importing, setImporting] = useState(false)
  const [drawingFC, setDrawingFC] = useState<GeoJSON.FeatureCollection | null>(null)
  const [drawingKind, setDrawingKind] = useState<'polygon' | 'line' | 'point' | 'all'>('polygon')
  const [importSource, setImportSource] = useState<'file' | 'drawing'>('drawing')
  const [newLayerConfig, setNewLayerConfig] = useState<Partial<CustomLayerConfig>>({
    category: 'custom',
    color: '#888888',
    opacity: 0.5
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Handles GeoJSON file selection and import
   * Reads file, validates GeoJSON format, and adds as new layer
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const geojson = await readGeoJSONFile(file)

      const config: CustomLayerConfig = {
        id: `custom-${Date.now()}`,
        name: newLayerConfig.name || file.name.replace(/\.[^/.]+$/, ''),
        category: newLayerConfig.category || 'custom',
        color: newLayerConfig.color || '#888888',
        opacity: newLayerConfig.opacity ?? 0.5,
        description: newLayerConfig.description
      }

      const newLayer = CustomLayerService.importGeoJSON(geojson, config)
      setCustomLayers(CustomLayerService.getAll())
      onLayerAdded(newLayer)

      // Reset form
      setNewLayerConfig({
        category: 'custom',
        color: '#888888',
        opacity: 0.5
      })

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Failed to import GeoJSON:', error)
      showToast('GeoJSONファイルの読み込みに失敗しました', 'error')
    } finally {
      setImporting(false)
    }
  }

  /**
   * Handles layer deletion with user confirmation
   * Shows confirm dialog before removing layer from storage
   */
  const handleRemoveLayer = async (layerId: string) => {
    const confirmed = await showConfirm('このレイヤーを削除しますか？', {
      confirmText: '削除',
      cancelText: 'キャンセル'
    })
    if (confirmed) {
      CustomLayerService.remove(layerId)
      setCustomLayers(CustomLayerService.getAll())
      onLayerRemoved(layerId)
      showToast('レイヤーを削除しました', 'success')
    }
  }

  /**
   * Exports all custom layers as a JSON file
   */
  const handleExportAll = () => {
    const data = CustomLayerService.exportAll()
    downloadAsFile(data, 'custom-layers.json')
  }

  /**
   * Exports a single custom layer as GeoJSON file
   */
  const handleExportLayer = (layerId: string) => {
    const data = CustomLayerService.exportAsGeoJSON(layerId)
    if (data) {
      const layer = CustomLayerService.getById(layerId)
      downloadAsFile(data, `${layer?.name || layerId}.geojson`)
    }
  }

  const focusLayer = (layerId: string) => {
    // フォーカスするなら、まず表示状態にしておく（見えないままズームすると混乱するため）
    if (!visibleLayers.has(layerId)) {
      onLayerToggle(layerId, true)
    }
    onLayerFocus?.(layerId)
  }

  const refreshLayers = () => {
    setCustomLayers(CustomLayerService.getAll())
  }

  const refreshDrawing = () => {
    const fc = loadDrawingFeatureCollection()
    setDrawingFC(fc)
    if (!fc || fc.features.length === 0) {
      setImportSource('file')
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const fc = loadDrawingFeatureCollection()
    setDrawingFC(fc)
    setImportSource(fc && fc.features.length > 0 ? 'drawing' : 'file')
    setShowHelp(false)
  }, [isOpen])

  const getFilteredDrawingFeatures = (
    fc: GeoJSON.FeatureCollection,
    kind: 'polygon' | 'line' | 'point' | 'all'
  ): Array<GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>> => {
    const isMatch = (t: GeoJSON.Geometry['type']): boolean => {
      if (kind === 'all') return true
      if (kind === 'polygon') return t === 'Polygon' || t === 'MultiPolygon'
      if (kind === 'line') return t === 'LineString' || t === 'MultiLineString'
      if (kind === 'point') return t === 'Point' || t === 'MultiPoint'
      return false
    }

    return fc.features.filter(
      (f): f is GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => {
        const t = f.geometry?.type
        return !!t && isMatch(t)
      }
    )
  }

  const handleImportFromDrawing = () => {
    const fc = drawingFC ?? loadDrawingFeatureCollection()
    setDrawingFC(fc)
    if (!fc || fc.features.length === 0) {
      showToast('描画データがありません（左の描画ツールで作成してください）', 'error')
      return
    }

    const features = getFilteredDrawingFeatures(fc, drawingKind)
    if (features.length === 0) {
      showToast(`描画データに「${getDrawingKindLabel(drawingKind)}」がありません`, 'error')
      return
    }

    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16)
    const kindLabel = getDrawingKindLabel(drawingKind)

    const config: CustomLayerConfig = {
      id: `custom-drawing-${Date.now()}`,
      name: newLayerConfig.name || `描画（${kindLabel}） ${ts}`,
      category: newLayerConfig.category || 'custom',
      color: newLayerConfig.color || '#888888',
      opacity: newLayerConfig.opacity ?? 0.5,
      description: `描画ツールから登録（${kindLabel}）`
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: features as unknown as GeoJSON.Feature[]
    }

    const newLayer = CustomLayerService.importGeoJSON(geojson, config)
    setCustomLayers(CustomLayerService.getAll())
    onLayerAdded(newLayer)
    focusLayer(newLayer.id)
    showToast('描画データをカスタムレイヤーに登録しました', 'success')
  }

  const duplicateCountByLayerId = useMemo(() => {
    const sigToIds = new Map<string, string[]>()
    customLayers.forEach((layer) => {
      const sig = getLayerSignature(layer)
      const arr = sigToIds.get(sig)
      if (arr) {
        arr.push(layer.id)
      } else {
        sigToIds.set(sig, [layer.id])
      }
    })

    const byId = new Map<string, number>()
    sigToIds.forEach((ids) => {
      if (ids.length <= 1) return
      ids.forEach((id) => byId.set(id, ids.length))
    })
    return byId
  }, [customLayers])

  const duplicateGroupsCount = useMemo(() => {
    const sigToCount = new Map<string, number>()
    customLayers.forEach((layer) => {
      const sig = getLayerSignature(layer)
      sigToCount.set(sig, (sigToCount.get(sig) ?? 0) + 1)
    })
    let groups = 0
    sigToCount.forEach((c) => {
      if (c > 1) groups += 1
    })
    return groups
  }, [customLayers])

  const handleRemoveDuplicateLayers = async () => {
    if (customLayers.length === 0) return

    const confirmed = await showConfirm(
      '同内容（データ・色・透明度が同一）のレイヤー重複を整理しますか？\n※各グループで最新の1件だけ残し、残りは削除します。',
      { confirmText: '整理する', cancelText: 'キャンセル' }
    )
    if (!confirmed) return

    const layers = CustomLayerService.getAll()
    const sigToLayers = new Map<string, CustomLayer[]>()
    layers.forEach((layer) => {
      const sig = getLayerSignature(layer)
      const arr = sigToLayers.get(sig)
      if (arr) {
        arr.push(layer)
      } else {
        sigToLayers.set(sig, [layer])
      }
    })

    let removed = 0
    sigToLayers.forEach((group) => {
      if (group.length <= 1) return
      const sorted = [...group].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      const keep = sorted[0]
      sorted.slice(1).forEach((l) => {
        if (l.id === keep.id) return
        CustomLayerService.remove(l.id)
        onLayerRemoved(l.id)
        removed += 1
      })
    })

    setCustomLayers(CustomLayerService.getAll())
    showToast(
      removed > 0 ? `重複レイヤーを${removed}件削除しました` : '重複は見つかりませんでした',
      'success'
    )
  }

  /**
   * Handles bulk import of multiple layers from JSON file
   * Reads JSON file and imports all layers defined in it
   */
  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const result = CustomLayerService.import(content)

      if (result.success) {
        setCustomLayers(CustomLayerService.getAll())
        showToast(`${result.count}件のレイヤーをインポートしました`, 'success')
      } else {
        showToast(`インポートに失敗しました: ${result.error}`, 'error')
      }
    } catch (error) {
      showToast('ファイルの読み込みに失敗しました', 'error')
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 64, // 右下・固定UIと被らない位置
          padding: '10px 16px',
          backgroundColor: 'rgba(51, 136, 255, 0.85)', // 少し透過して地図を邪魔しない
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          cursor: 'pointer',
          fontSize: '12px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          zIndex: 1000
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(51, 136, 255, 0.95)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(51, 136, 255, 0.85)')}
      >
        カスタムレイヤー管理
      </button>
    )
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 64, // 右端の固定UI（2D/ヘルプ等）と被らないように余白を確保
          width: '360px',
          maxHeight: '80vh',
          backgroundColor: theme.colors.panelBg,
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          zIndex: 1000,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: theme.colors.buttonBgActive,
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <h3 style={{ margin: 0, fontSize: '14px' }}>カスタムレイヤー管理</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              title={showHelp ? 'ヘルプを閉じる' : 'ヘルプ'}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.35)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1
              }}
            >
              ?
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '18px'
              }}
              title="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* Add Layer (unified) */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: theme.colors.textMuted }}>
                レイヤーを追加
              </h4>
              {importSource === 'drawing' && (
                <button
                  type="button"
                  onClick={refreshDrawing}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.colors.textSubtle,
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: 0
                  }}
                  title="描画データを再読み込み"
                >
                  更新
                </button>
              )}
            </div>

            <div style={{ marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="レイヤー名（任意）"
                value={newLayerConfig.name || ''}
                onChange={(e) => setNewLayerConfig({ ...newLayerConfig, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: `1px solid ${theme.colors.borderStrong}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginBottom: '4px',
                  backgroundColor: theme.colors.buttonBg,
                  color: theme.colors.text
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <select
                value={newLayerConfig.category}
                onChange={(e) => {
                  const cat = CATEGORIES.find((c) => c.id === e.target.value)
                  setNewLayerConfig({
                    ...newLayerConfig,
                    category: e.target.value,
                    color: cat?.color || '#888888'
                  })
                }}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: `1px solid ${theme.colors.borderStrong}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: theme.colors.buttonBg,
                  color: theme.colors.text
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>

              <input
                type="color"
                value={newLayerConfig.color}
                onChange={(e) => setNewLayerConfig({ ...newLayerConfig, color: e.target.value })}
                style={{ width: '40px', height: '32px', border: 'none', cursor: 'pointer' }}
              />
            </div>

            {/* Data source selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => setImportSource('file')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  backgroundColor:
                    importSource === 'file' ? theme.colors.buttonBgActive : theme.colors.buttonBg,
                  color: importSource === 'file' ? '#fff' : theme.colors.text,
                  border:
                    importSource === 'file' ? 'none' : `1px solid ${theme.colors.borderStrong}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700
                }}
                title="GeoJSONファイルから追加"
              >
                ファイル
              </button>
              <button
                type="button"
                onClick={() => setImportSource('drawing')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  backgroundColor:
                    importSource === 'drawing'
                      ? theme.colors.buttonBgActive
                      : theme.colors.buttonBg,
                  color: importSource === 'drawing' ? '#fff' : theme.colors.text,
                  border:
                    importSource === 'drawing' ? 'none' : `1px solid ${theme.colors.borderStrong}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700
                }}
                title="描画ツールの保存データから追加"
              >
                描画
              </button>
            </div>

            {importSource === 'file' ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.geojson"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: importing
                      ? theme.colors.borderStrong
                      : theme.colors.buttonBgActive,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: importing ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 800
                  }}
                >
                  {importing ? 'インポート中...' : 'GeoJSONファイルを選択'}
                </button>
                <div style={{ marginTop: '6px', fontSize: '10px', color: theme.colors.textSubtle }}>
                  GeoJSONを取り込んでカスタムレイヤーとして保存します
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    value={drawingKind}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === 'polygon' || v === 'line' || v === 'point' || v === 'all') {
                        setDrawingKind(v)
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: `1px solid ${theme.colors.borderStrong}`,
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: theme.colors.buttonBg,
                      color: theme.colors.text
                    }}
                  >
                    <option value="polygon">ポリゴンのみ</option>
                    <option value="line">経路のみ</option>
                    <option value="point">WPのみ</option>
                    <option value="all">すべて</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleImportFromDrawing}
                    disabled={!drawingFC || drawingFC.features.length === 0}
                    style={{
                      padding: '6px 10px',
                      backgroundColor:
                        !drawingFC || drawingFC.features.length === 0
                          ? darkMode
                            ? 'rgba(255,255,255,0.08)'
                            : '#eee'
                          : theme.colors.buttonBgActive,
                      color:
                        !drawingFC || drawingFC.features.length === 0
                          ? theme.colors.textSubtle
                          : '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor:
                        !drawingFC || drawingFC.features.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                    title={
                      !drawingFC || drawingFC.features.length === 0
                        ? '描画データがありません'
                        : `描画データを登録（${drawingFC.features.length} features）`
                    }
                  >
                    登録
                  </button>
                </div>

                <div style={{ marginTop: '6px', fontSize: '10px', color: theme.colors.textSubtle }}>
                  {drawingFC
                    ? `${drawingFC.features.length} features（描画ツールの保存データ）`
                    : '描画データなし'}
                </div>
              </>
            )}
          </div>

          {/* Existing Layers */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: theme.colors.textMuted }}>
                登録済みレイヤー ({customLayers.length})
              </h4>
              <button
                type="button"
                onClick={refreshLayers}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.colors.textSubtle,
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: 0
                }}
                title="一覧を再読み込み（ID重複も自動修復されます）"
              >
                更新
              </button>
            </div>

            {duplicateGroupsCount > 0 && (
              <div
                style={{ fontSize: '10px', color: theme.colors.textSubtle, marginBottom: '6px' }}
              >
                同内容の重複が {duplicateGroupsCount}{' '}
                グループあります（必要なら「重複整理」で解消できます）
              </div>
            )}

            {customLayers.length === 0 ? (
              <p
                style={{
                  fontSize: '11px',
                  color: theme.colors.textSubtle,
                  textAlign: 'center',
                  padding: '16px'
                }}
              >
                カスタムレイヤーがありません
              </p>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {customLayers.map((layer) => (
                  <div
                    key={layer.id}
                    style={{
                      padding: '8px',
                      marginBottom: '4px',
                      backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#f8f8f8',
                      borderRadius: '4px',
                      fontSize: '11px',
                      border: `1px solid ${theme.colors.border}`
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={visibleLayers.has(layer.id)}
                        onChange={(e) => onLayerToggle(layer.id, e.target.checked)}
                      />
                      <span
                        style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: layer.color,
                          borderRadius: '2px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => focusLayer(layer.id)}
                        style={{
                          flex: 1,
                          textAlign: 'left',
                          padding: 0,
                          background: 'none',
                          border: 'none',
                          fontWeight: 600,
                          color: theme.colors.text,
                          cursor: 'pointer'
                        }}
                        title="クリックでズーム"
                      >
                        {layer.name}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginLeft: '24px' }}>
                      <span style={{ color: theme.colors.textSubtle, fontSize: '10px' }}>
                        {CATEGORIES.find((c) => c.id === layer.category)?.name || layer.category}
                      </span>
                      <span style={{ color: theme.colors.textSubtle, fontSize: '10px' }}>|</span>
                      <span style={{ color: theme.colors.textSubtle, fontSize: '10px' }}>
                        {layer.data.features.length} features
                      </span>
                      <span style={{ color: theme.colors.textSubtle, fontSize: '10px' }}>|</span>
                      <span style={{ color: theme.colors.textSubtle, fontSize: '10px' }}>
                        {(() => {
                          const c = countGeometryTypes(layer.data)
                          return `ポリゴン:${c.polygon} 経路:${c.line} WP:${c.point}`
                        })()}
                      </span>
                      <span style={{ color: theme.colors.textSubtle, fontSize: '10px' }}>|</span>
                      <span
                        style={{ color: theme.colors.textSubtle, fontSize: '10px' }}
                        title={layer.id}
                      >
                        id:{layer.id.slice(-6)}
                      </span>
                      {duplicateCountByLayerId.has(layer.id) && (
                        <>
                          <span style={{ color: theme.colors.textSubtle, fontSize: '10px' }}>
                            |
                          </span>
                          <span
                            style={{
                              color: darkMode ? '#ffca28' : '#8d6e63',
                              fontSize: '10px',
                              fontWeight: 700
                            }}
                            title="同内容（データ・色・透明度が同一）のレイヤーが複数あります"
                          >
                            同内容×{duplicateCountByLayerId.get(layer.id)}
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      style={{ display: 'flex', gap: '4px', marginTop: '4px', marginLeft: '24px' }}
                    >
                      <button
                        type="button"
                        onClick={() => focusLayer(layer.id)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '10px',
                          backgroundColor: darkMode
                            ? 'rgba(51,136,255,0.18)'
                            : 'rgba(51,136,255,0.12)',
                          border: `1px solid ${
                            darkMode ? 'rgba(160, 199, 255, 0.55)' : 'rgba(21, 101, 192, 0.35)'
                          }`,
                          borderRadius: '2px',
                          cursor: 'pointer',
                          color: darkMode ? '#a0c7ff' : '#1565c0',
                          fontWeight: 700
                        }}
                        title="ズーム"
                      >
                        ZOOM
                      </button>
                      <button
                        onClick={() => handleExportLayer(layer.id)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '10px',
                          backgroundColor: darkMode ? 'rgba(255,255,255,0.10)' : '#e8e8e8',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          color: theme.colors.text
                        }}
                      >
                        エクスポート
                      </button>
                      <button
                        onClick={() => handleRemoveLayer(layer.id)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '10px',
                          backgroundColor: darkMode ? 'rgba(239, 83, 80, 0.18)' : '#ffebee',
                          color: darkMode ? '#ff8a80' : '#c62828',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bulk Operations */}
          <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: '12px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: theme.colors.textMuted }}>
              一括操作
            </h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={handleExportAll}
                disabled={customLayers.length === 0}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontSize: '11px',
                  backgroundColor:
                    customLayers.length === 0
                      ? darkMode
                        ? 'rgba(255,255,255,0.08)'
                        : '#eee'
                      : darkMode
                        ? 'rgba(255,255,255,0.10)'
                        : '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: customLayers.length === 0 ? 'not-allowed' : 'pointer',
                  color: theme.colors.text
                }}
              >
                全てエクスポート
              </button>
              <label
                style={{
                  flex: 1,
                  padding: '8px',
                  fontSize: '11px',
                  backgroundColor: darkMode ? 'rgba(255,255,255,0.10)' : '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  color: theme.colors.text
                }}
              >
                一括インポート
                <input
                  type="file"
                  accept=".json"
                  onChange={handleBulkImport}
                  style={{ display: 'none' }}
                />
              </label>
              <button
                onClick={handleRemoveDuplicateLayers}
                disabled={duplicateGroupsCount === 0}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontSize: '11px',
                  backgroundColor:
                    duplicateGroupsCount === 0
                      ? darkMode
                        ? 'rgba(255,255,255,0.08)'
                        : '#eee'
                      : darkMode
                        ? 'rgba(255, 202, 40, 0.16)'
                        : 'rgba(255, 202, 40, 0.22)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: duplicateGroupsCount === 0 ? 'not-allowed' : 'pointer',
                  color:
                    duplicateGroupsCount === 0
                      ? theme.colors.textSubtle
                      : darkMode
                        ? '#ffca28'
                        : '#7b5a00',
                  fontWeight: 700
                }}
                title={
                  duplicateGroupsCount === 0
                    ? '同内容の重複はありません'
                    : '同内容の重複を整理（最新のみ残す）'
                }
              >
                重複整理
              </button>
            </div>
          </div>
        </div>

        {/* Help text */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#f8f8f8',
            borderTop: `1px solid ${theme.colors.border}`,
            fontSize: '10px',
            color: theme.colors.textSubtle
          }}
        >
          GeoJSON形式のファイルをインポートできます。
          データはブラウザのローカルストレージに保存されます。
        </div>
      </div>

      <Modal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="カスタムレイヤー管理について"
        darkMode={darkMode}
        width="560px"
        maxHeight="70vh"
        overlayOpacity={0.25}
        zIndex={2001}
      >
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: theme.colors.text }}>
          <div style={{ fontWeight: 800, marginBottom: '6px' }}>これは何？</div>
          <div style={{ color: theme.colors.textMuted }}>
            公開データが無い/足りない場合に、あなたのGeoJSON（ファイル or
            描画）を地図に追加して保存・管理する機能です。
          </div>
          <div style={{ marginTop: '12px', fontWeight: 800 }}>できること</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: '20px', color: theme.colors.textMuted }}>
            <li>ファイル（GeoJSON）や描画ツールの作成データからレイヤー追加</li>
            <li>表示ON/OFF、ズーム、エクスポート、削除</li>
            <li>一括エクスポート/一括インポート、同内容重複の整理</li>
          </ul>
          <div style={{ marginTop: '12px', fontWeight: 800 }}>注意</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: '20px', color: theme.colors.textMuted }}>
            <li>
              データはブラウザのローカルストレージに保存されます（端末/ブラウザが変わると引き継がれません）
            </li>
            <li>同じ内容を複数回登録すると重複します（必要なら「重複整理」）</li>
          </ul>
        </div>
      </Modal>
    </>
  )
}

export default CustomLayerManager
