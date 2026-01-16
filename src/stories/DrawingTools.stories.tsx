import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { DrawingTools } from '../components/DrawingTools'
import { createMockMapEnvironment } from './helpers/mockMap'

/**
 * DrawingTools - 描画ツール・飛行経路エディタ
 *
 * ドローンの飛行経路、飛行範囲、ウェイポイントなどを地図上に描画・編集するコンポーネント。
 * MapLibre GL と Mapbox GL Draw を使用し、複数の描画モードをサポートします。
 *
 * ## 機能
 * - ポリゴン、円、ウェイポイント、飛行経路の描画
 * - 描画フィーチャーの管理・編集・削除
 * - GeoJSON、KML、CSV、NOTAM 形式のエクスポート
 * - LocalStorage によるデータ永続化
 * - ダークモード対応
 * - サイドバー埋め込みモード
 */
const meta: Meta<typeof DrawingTools> = {
  title: 'Components/DrawingTools',
  component: DrawingTools,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
## 概要

DrawingTools は、MapLibre GL と Mapbox GL Draw を統合した高度なドローン飛行経路・飛行範囲エディタです。2900行以上の複雑な実装で、複数の描画モード、複数のUIタブ、ローカルストレージ永続化、複数形式のエクスポート機能を提供します。

## 技術仕様

### コンポーネント Props

\`\`\`typescript
export interface DrawingToolsProps {
  map: maplibregl.Map | null
  onFeaturesChange?: (features: DrawnFeature[]) => void
  darkMode?: boolean
  embedded?: boolean
  mapLoaded?: boolean
  onOpenHelp?: () => void
}

interface DrawnFeature {
  id: string
  type: 'polygon' | 'circle' | 'point' | 'line'
  name: string
  coordinates: GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][]
  radius?: number
  center?: [number, number]
  properties?: Record<string, unknown>
  elevation?: number
  flightHeight?: number
  maxAltitude?: number
}

type DrawMode = 'none' | 'polygon' | 'circle' | 'point' | 'line'
type ExportFormat = 'geojson' | 'kml' | 'csv' | 'dms'
\`\`\`

### 描画モード（GeoJSON型対応）

| モード | GeoJSON型 | 座標形式 | 用途 |
|--------|----------|--------|------|
| **Polygon** | Polygon | Position[][][] | 飛行禁止区域、飛行範囲 |
| **Circle** | Polygon（内部化） | 円形配列 | バッファゾーン、警戒範囲 |
| **Point** | Point | Position [lng, lat] | ウェイポイント、検査ポイント |
| **Line** | LineString | Position[] | 飛行経路、巡回ルート |

### 状態管理アーキテクチャ

**React State:**
\`\`\`typescript
const [isOpen, setIsOpen] = useState(embedded)
const [activeTab, setActiveTab] = useState<'draw' | 'manage' | 'export'>('draw')
const [drawMode, setDrawMode] = useState<DrawMode>('none')
const [drawnFeatures, setDrawnFeatures] = useState<DrawnFeature[]>([])
const [circleRadius, setCircleRadius] = useState(100)
const [exportFormat, setExportFormat] = useState<ExportFormat>('geojson')
const [checkedFeatureIds, setCheckedFeatureIds] = useState<Set<string>>(new Set())
const [searchQuery, setSearchQuery] = useState('')
const [typeFilter, setTypeFilter] = useState<'all' | DrawMode>('all')
\`\`\`

**Refs（再レンダリング不要）:**
- \`drawRef\`: Mapbox Draw インスタンス
- \`drawModeRef\`: 描画モード（イベントハンドラ用）
- \`continuousModeRef\`: ウェイポイント連続配置フラグ
- \`isRestoringRef\`: LocalStorage 復元中フラグ
- \`isDisposedRef\`: アンマウント時クリーンアップフラグ

### LocalStorage 永続化

**キー**: \`did-map-drawn-features\`

**フォーマット（GeoJSON FeatureCollection）:**
\`\`\`json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "feature-uuid-1",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[139.767, 35.681], [139.768, 35.681], ...]]
      },
      "properties": {
        "name": "飛行範囲1",
        "type": "polygon",
        "elevation": 12.5,
        "flightHeight": 50,
        "maxAltitude": 62.5
      }
    }
  ]
}
\`\`\`

**保存戦略:**
- トリガー: \`drawnFeatures\` 状態変更（debounce 500ms）
- 読込: コンポーネントマウント時に自動復元
- 破棄: 手動削除のみ
- 容量: ブラウザ上限 5-10MB（フィーチャー数に応じて決定）

### Mapbox GL Draw 統合

**初期化:**
\`\`\`typescript
import MapboxDraw from '@mapbox/mapbox-gl-draw'

drawRef.current = new MapboxDraw({
  displayControlsDefault: false,
  controls: { polygon: true, line_string: true, point: true, trash: true }
})
map.addControl(drawRef.current)
\`\`\`

**イベントハンドリング:**
\`\`\`typescript
map.on('draw.create', updateFeatures)
map.on('draw.update', updateFeatures)
map.on('draw.delete', updateFeatures)

function updateFeatures() {
  const geoJSON = drawRef.current.getAll()
  const converted = convertToDrawnFeatures(geoJSON)
  setDrawnFeatures(converted)
}
\`\`\`

**スタイリング:**
- アクティブ: 青 (#0080ff), ストローク 2px
- 非アクティブ: グレー (#cccccc), ストローク 1px
- ポイント: 5-7px 円形

### エクスポート形式の仕様

#### GeoJSON (RFC 7946)
- **MIME**: \`application/geo+json\`
- **エンコーディング**: UTF-8
- **用途**: Web GIS, ArcGIS, QGIS, PostGIS
- **ファイル名**: \`features.geojson\`

#### KML 2.2 (OGC標準)
- **XML 宣言**: \`<?xml version="1.0" encoding="UTF-8"?>\`
- **ネームスペース**: \`xmlns="http://www.opengis.net/kml/2.2"\`
- **座標順序**: lng,lat,elevation
- **用途**: Google Earth, ArcGIS, Google Maps
- **ファイル名**: \`features.kml\`
- **注**: 日本語は UTF-8 で記述（BOM なし）

#### CSV (RFC 4180)
- **BOM**: UTF-8 BOM なし（Excel 開く際は BOM 推奨）
- **区切り文字**: カンマ（,）
- **引用文字**: ダブルクォート（"）
- **改行**: CRLF (\r\n)
- **ヘッダー行**: id,name,type,lat,lng,elevation,flightHeight,maxAltitude
- **用途**: Excel, Google Sheets, Database

#### NOTAM (度分秒フォーマット)
\`\`\`
N35°40'52.08"E139°46'04.50"
\`\`\`
**計算式:**
\`\`\`
度 = floor(小数部)
分 = floor((小数部 - 度) * 60)
秒 = ((小数部 - 度) * 60 - 分) * 60
\`\`\`
**用途**: 航空局 NOTAM 申請
**精度**: 秒単位（誤差 < 30m）

### 円描画の技術詳細

**Haversine 公式を使用した円のポリゴン化:**
\`\`\`typescript
export function createCirclePolygon(
  center: [lng, lat],
  radiusKm: number,
  pointCount: number = 32
): GeoJSON.Polygon {
  const points: [number, number][] = []
  const R = 6371  // 地球半径（km）
  const latRad = toRad(lat)
  const lngRad = toRad(lng)

  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * (Math.PI * 2)
    const latRad2 = Math.asin(
      Math.sin(latRad) * Math.cos(radiusKm / R) +
      Math.cos(latRad) * Math.sin(radiusKm / R) * Math.cos(angle)
    )
    const lngRad2 = lngRad + Math.atan2(
      Math.sin(angle) * Math.sin(radiusKm / R) * Math.cos(latRad),
      Math.cos(radiusKm / R) - Math.sin(latRad) * Math.sin(latRad2)
    )
    points.push([toDeg(lngRad2), toDeg(latRad2)])
  }
  points.push(points[0])  // 閉じた環
  return { type: 'Polygon', coordinates: [points] }
}
\`\`\`

**デフォルト: 32 ポイント = 11.25° 間隔 = 最大誤差 < 100m（赤道 1° ≈ 111km）**

### パフォーマンス最適化

**デバウンス処理:**
\`\`\`typescript
function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Args) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

const debouncedSave = debounce(saveToLocalStorage, 500)
\`\`\`

**メモ化（フィルタ結果）:**
\`\`\`typescript
const filteredFeatures = useMemo(() => {
  return drawnFeatures.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === 'all' || f.type === typeFilter
    return matchesSearch && matchesType
  })
}, [drawnFeatures, searchQuery, typeFilter])
\`\`\`

### Storybook モック実装

**MockMap クラス（最小限のインターフェース）:**
\`\`\`typescript
// src/stories/helpers/mockMap.ts
export class MockMap {
  private _zoom = 10
  private _center: [number, number] = [137.0, 36.5]
  private _listeners: Map<EventType, Set<MapEventHandler>> = new Map()
  private _controls: any[] = []
  private _layers: Map<string, any> = new Map()
  private _sources: Map<string, any> = new Map()

  getZoom(): number { return this._zoom }
  setZoom(zoom: number): this { this._zoom = zoom; return this }
  getCenter(): { lng: number; lat: number } { /* ... */ }
  setCenter(lngLat: [number, number] | { lng: number; lat: number }): this { /* ... */ }
  addControl(control: any): this { this._controls.push(control); return this }
  removeControl(control: any): this { /* ... */ }
  on(event: EventType, handler: MapEventHandler): this { /* ... */ }
  addLayer(layer: any): this { /* ... */ }
  addSource(sourceId: string, source: any): this { /* ... */ }
  // その他の必要なメソッド
}
\`\`\`

**制限事項**: ビジュアルレンダリングなし、イベント手動発火のみ

### ブラウザ互換性

| ブラウザ | バージョン | 対応状況 | 注記 |
|---------|-----------|--------|------|
| Chrome | 90+ | ✅ 完全 | WeakMap, Proxy 完全対応 |
| Firefox | 88+ | ✅ 完全 | |
| Safari | 14+ | ✅ 完全 | iOS 14+ |
| Edge | 90+ | ✅ 完全 | Chromium ベース |
| IE 11 | - | ❌ 非対応 | WeakMap, Proxy 未対応 |

### 既知の制限事項

1. **ホール付きポリゴン**: 作成不可（Mapbox Draw の制限）
2. **大量フィーチャー**: 1000+ で UI パフォーマンス低下
3. **LocalStorage 容量**: 5-10MB 上限（ブラウザ依存）
4. **円の頂点数**: 32 固定（カスタマイズ不可）

### 再現手順（開発時）

1. \`npm run dev\` で開発サーバー起動
2. \`npm run storybook\` で Storybook ポート 6006 起動
3. \`Components/DrawingTools\` → \`WithMap\` ストーリー開く
4. 各描画モードを試行
5. \`Manage\` タブでフィーチャーリスト確認
6. \`Export\` タブで各形式ダウンロード確認
        `
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    map: {
      description: 'MapLibre GL インスタンス',
      control: false
    },
    onFeaturesChange: {
      description: 'フィーチャー変更時のコールバック',
      action: 'features-changed'
    },
    darkMode: {
      description: 'ダークモード',
      control: { type: 'boolean' }
    },
    embedded: {
      description: 'サイドバー埋め込みモード',
      control: { type: 'boolean' }
    },
    mapLoaded: {
      description: 'マップロード状態',
      control: { type: 'boolean' }
    },
    onOpenHelp: {
      description: 'ヘルプモーダルを開く',
      action: 'open-help'
    }
  },
  args: {
    map: null,
    onFeaturesChange: fn(),
    darkMode: false,
    embedded: false,
    mapLoaded: false,
    onOpenHelp: fn()
  }
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * デフォルト状態
 * マップが未指定の場合の警告表示
 */
export const Default: Story = {
  render: () => (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '600px'
      }}>
        <h3 style={{ margin: '0 0 12px 0' }}>DrawingTools - デフォルト状態</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
          DrawingTools コンポーネントは MapLibre GL インスタンスを必須とします。
        </p>
        <div style={{
          backgroundColor: '#fff3cd',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#856404',
          border: '1px solid #ffc107',
          marginBottom: '12px'
        }}>
          <strong>⚠️ 警告:</strong> map prop が null の場合、DrawingTools は表示されません。
        </div>
        <div style={{
          backgroundColor: '#f0f0f0',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <strong>実装例:</strong>
          <pre style={{
            margin: '8px 0 0 0',
            overflow: 'auto',
            fontSize: '11px'
          }}>
{`<DrawingTools
  map={mapInstance}
  onFeaturesChange={(features) => {
    console.log('Features updated:', features)
  }}
  mapLoaded={true}
/>`}
          </pre>
        </div>
      </div>
    </div>
  )
}

/**
 * マップ付き初期状態
 * モック Map インスタンスを使用した初期状態
 */
export const WithMap: Story = {
  render: (args) => {
    const mockMap = createMockMapEnvironment()

    return (
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <DrawingTools
          map={mockMap as unknown as maplibregl.Map}
          mapLoaded={true}
          {...args}
        />
        <div style={{
          backgroundColor: '#e3f2fd',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px',
          marginTop: '20px'
        }}>
          <strong>📌 情報:</strong> モック Map を使用しています。
          実際のアプリケーションでは、本物の MapLibre GL インスタンスが使用されます。
        </div>
      </div>
    )
  }
}

/**
 * ポリゴン描画モード
 * ポリゴン描画機能の説明
 */
export const PolygonMode: Story = {
  render: () => (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '600px'
      }}>
        <h3 style={{ margin: '0 0 12px 0' }}>ポリゴン描画モード</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
          複数のポイントをクリックして多角形を描画します。
        </p>
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '12px'
        }}>
          <strong>操作手順:</strong>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
            <li>「ポリゴン描画」ボタンをクリック</li>
            <li>地図上をクリックしてポイントを追加</li>
            <li>「完了」を押すか、最初のポイント付近をダブルクリック</li>
            <li>ポリゴンが作成されます</li>
          </ol>
        </div>
        <div style={{
          backgroundColor: '#fff3cd',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <strong>用途:</strong> 飛行範囲、立入禁止区域、観測エリアなど
        </div>
      </div>
    </div>
  )
}

/**
 * 円描画モード
 * 円描画機能の説明
 */
export const CircleMode: Story = {
  render: () => (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '600px'
      }}>
        <h3 style={{ margin: '0 0 12px 0' }}>円描画モード</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
          クリック位置を中心とした円を作成します。半径は自由に設定可能です。
        </p>
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '12px'
        }}>
          <strong>操作手順:</strong>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
            <li>「円を配置」ボタンをクリック</li>
            <li>半径をメートル単位で指定（デフォルト100m）</li>
            <li>地図上をクリック</li>
            <li>指定した半径の円が作成されます</li>
          </ol>
        </div>
        <div style={{
          backgroundColor: '#fff3cd',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <strong>用途:</strong> バッファゾーン、観測半径、警戒範囲など
        </div>
      </div>
    </div>
  )
}

/**
 * ウェイポイント配置モード
 * ポイント配置機能の説明
 */
export const PointMode: Story = {
  render: () => (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '600px'
      }}>
        <h3 style={{ margin: '0 0 12px 0' }}>ウェイポイント配置モード</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
          離散的なポイント（ウェイポイント）を地図上に配置します。
        </p>
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '12px'
        }}>
          <strong>操作手順:</strong>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
            <li>「ウェイポイント配置」ボタンをクリック</li>
            <li>地図上をクリックしてポイントを追加</li>
            <li>連続配置モードで複数ポイントを素早く配置可能</li>
            <li>各ポイントに名前を付けることができます</li>
          </ol>
        </div>
        <div style={{
          backgroundColor: '#fff3cd',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <strong>用途:</strong> 複数の着陸地点、検査ポイント、関心地点など
        </div>
      </div>
    </div>
  )
}

/**
 * 飛行経路描画モード
 * 線描画機能の説明
 */
export const LineMode: Story = {
  render: () => (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '600px'
      }}>
        <h3 style={{ margin: '0 0 12px 0' }}>飛行経路描画モード</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
          複数のポイントを線でつなぐ経路を作成します。
        </p>
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '12px'
        }}>
          <strong>操作手順:</strong>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
            <li>「経路描画」ボタンをクリック</li>
            <li>地図上をクリックして経路ポイントを追加</li>
            <li>自動で前のポイントと線でつながります</li>
            <li>「完了」を押して経路を確定</li>
          </ol>
        </div>
        <div style={{
          backgroundColor: '#fff3cd',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <strong>用途:</strong> 自動巡回ルート、検査経路、連続監視エリア
        </div>
      </div>
    </div>
  )
}

/**
 * ダークモード
 * 夜間モードでの表示
 */
export const DarkMode: Story = {
  render: (args) => {
    const mockMap = createMockMapEnvironment()

    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#1e1e1e',
        minHeight: '100vh',
        color: '#e0e0e0'
      }}>
        <DrawingTools
          map={mockMap as unknown as maplibregl.Map}
          mapLoaded={true}
          darkMode={true}
          {...args}
        />
      </div>
    )
  },
  args: {
    darkMode: true
  }
}

/**
 * エクスポート形式ガイド
 * 各エクスポート形式の説明
 */
export const ExportFormats: Story = {
  render: () => (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '600px'
      }}>
        <h3 style={{ margin: '0 0 16px 0' }}>エクスポート形式</h3>

        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>GeoJSON</h4>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
            標準的な地理データ形式。Web GIS アプリケーションで広く使用されます。
          </p>
          <div style={{
            backgroundColor: '#f0f0f0',
            padding: '8px',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'monospace'
          }}>
            {`{ "type": "FeatureCollection", "features": [...] }`}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>KML</h4>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
            Google Earth 形式。Google Maps、Google Earth で表示できます。
          </p>
          <div style={{
            backgroundColor: '#f0f0f0',
            padding: '8px',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'monospace'
          }}>
            {`<?xml version="1.0"?>`}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>CSV</h4>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
            スプレッドシート互換形式。Excel や Google Sheets で編集できます。
          </p>
          <div style={{
            backgroundColor: '#f0f0f0',
            padding: '8px',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'monospace'
          }}>
            {`id,name,type,lat,lng,...`}
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>NOTAM</h4>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
            度分秒形式。NOTAM 申請に対応した形式です。
          </p>
          <div style={{
            backgroundColor: '#f0f0f0',
            padding: '8px',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'monospace'
          }}>
            {`35°40'52.00"N 139°46'04.40"E`}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * インタラクティブデモ
 * 実際のインタラクティブな使用例
 */
export const Interactive: Story = {
  render: (args) => {
    const mockMap = createMockMapEnvironment()

    return (
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <DrawingTools
          map={mockMap as unknown as maplibregl.Map}
          mapLoaded={true}
          embedded={true}
          {...args}
        />
        <div style={{
          backgroundColor: '#e3f2fd',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px',
          marginTop: '20px'
        }}>
          <strong>💡 使い方:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>上部のタブで「描画」「管理」「エクスポート」を切り替え</li>
            <li>「描画」タブで各描画モードを選択</li>
            <li>「管理」タブで作成したフィーチャーを表示・編集・削除</li>
            <li>「エクスポート」タブで様々な形式でダウンロード</li>
          </ul>
        </div>
      </div>
    )
  },
  args: {
    embedded: true
  }
}
