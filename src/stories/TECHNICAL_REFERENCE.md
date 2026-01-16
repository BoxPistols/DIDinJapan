# DID in Japan - 技術リファレンス

エンジニア向けの包括的な技術ドキュメント。地理データ、座標系、API 仕様、計算式、フォーマット変換を網羅。

---

## 目次

1. [座標系・地理データ](#座標系地理データ)
2. [外部 API 仕様](#外部-api-仕様)
3. [GeoJSON フォーマット](#geojson-フォーマット)
4. [データ変換・計算式](#データ変換計算式)
5. [エクスポート形式](#エクスポート形式)
6. [MapLibre GL / Mapbox GL Draw](#maplibre-gl--mapbox-gl-draw)
7. [ドローン固有の概念](#ドローン固有の概念)
8. [LocalStorage スキーマ](#localstorage-スキーマ)
9. [パフォーマンス考慮事項](#パフォーマンス考慮事項)

---

## 座標系・地理データ

### WGS84 (EPSG:4326)

**定義**: World Geodetic System 1984

**座標軸の定義:**
```
経度（Longitude）: -180° ～ +180°
  負の値 = 西経（West）
  正の値 = 東経（East）

緯度（Latitude）: -90° ～ +90°
  負の値 = 南緯（South）
  正の値 = 北緯（North）
```

**日本の座標範囲:**
```
最西端: 130.0°E (与那国島)
最東端: 145.8°E (南鳥島)
最南端: 20.4°N (沖ノ鳥島)
最北端: 45.5°N (択捉島)

通常の民間ドローン運用: 130-145°E, 30-45°N
```

**精度レベル:**
| 小数位数 | 精度 | 用途 |
|---------|------|------|
| 2 | 1.1 km | 国・地域 |
| 3 | 111 m | 市区町村 |
| 4 | 11 m | 街区 |
| 5 | 1.1 m | **本アプリ推奨** |
| 6 | 0.11 m | 正確な計測 |
| 7 | 1.1 cm | GPS RTK |

### 距離計算（Haversine 公式）

**目的**: 地球上の2点間の大圏距離を計算

**公式:**
```
a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
c = 2 * atan2(√a, √(1−a))
d = R * c  (R = 地球半径)
```

**実装:**
```typescript
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371  // 地球半径（km）
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
```

**精度**: ±0.5%（地球を完全な球体と仮定）

### 円のポリゴン化

**目的**: 中心点と半径から等距離の円を GeoJSON Polygon に変換

**アルゴリズム: Haversine 方式**
```typescript
export function createCirclePolygon(
  center: [lng, lat],
  radiusKm: number,
  pointCount: number = 32
): GeoJSON.Polygon {
  const points: [number, number][] = []
  const R = 6371  // 地球半径（km）
  const latRad = toRad(lat)
  const lngRad = toRad(lng)

  for (let i = 0; i <= pointCount; i++) {
    const angle = (i / pointCount) * (Math.PI * 2)
    
    // 新しい緯度
    const latRad2 = Math.asin(
      Math.sin(latRad) * Math.cos(radiusKm / R) +
      Math.cos(latRad) * Math.sin(radiusKm / R) * Math.cos(angle)
    )
    
    // 新しい経度
    const lngRad2 = lngRad + Math.atan2(
      Math.sin(angle) * Math.sin(radiusKm / R) * Math.cos(latRad),
      Math.cos(radiusKm / R) - Math.sin(latRad) * Math.sin(latRad2)
    )
    
    points.push([toDeg(lngRad2), toDeg(latRad2)])
  }
  
  return {
    type: 'Polygon',
    coordinates: [points]
  }
}
```

**パラメータ:**
- `center`: [経度, 緯度]
- `radiusKm`: 半径（キロメートル）
- `pointCount`: ポリゴンの頂点数（デフォルト: 32）

**誤差分析:**
- 32 ポイント: 最大誤差 < 100m
- 64 ポイント: 最大誤差 < 25m
- 128 ポイント: 最大誤差 < 5m

---

## 外部 API 仕様

### GSI DEM（国土地理院 標高タイルAPI）

**エンドポイント:**
```
GET https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php
```

**リクエスト パラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `lon` | float | ✅ | 経度 (-180～180) |
| `lat` | float | ✅ | 緯度 (-90～90) |
| `outtype` | string | ✅ | JSON のみ |

**リクエスト例:**
```bash
curl "https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=139.767&lat=35.681&outtype=JSON"
```

**レスポンス:**
```json
{
  "elevation": 12.5,        // メートル（ASL - 海面基準）
  "hsrc": "DEM5B"           // データソース
}
```

**レスポンスコード:**
| ステータス | 説明 |
|-----------|------|
| 200 OK | 正常 |
| 400 Bad Request | パラメータエラー |
| 404 Not Found | 対象地域外（海上など） |
| 429 Too Many Requests | レート制限（理論上無制限） |
| 503 Service Unavailable | サーバーエラー |

**仕様:**
- **カバレッジ**: 日本全国 (北緯 20°～45°, 東経 130°～145°)
- **精度**: ±2.5m (DEM5B)
- **解像度**: 5m グリッド
- **レート制限**: 公式ドキュメント上は無制限
- **CORS**: 対応（クライアント側から直接呼び出し可）
- **HTTPS**: 必須
- **TLS バージョン**: 1.2 以上

**実装上の注意:**
```typescript
// タイムアウト 5秒
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 5000)

fetch(`...getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`, {
  signal: controller.signal
})
  .catch(e => {
    if (e.name === 'AbortError') {
      console.warn('GSI API タイムアウト')
    }
  })
  .finally(() => clearTimeout(timeoutId))
```

### キャッシング戦略

**目的**: 同じ座標への重複リクエストを削減

**実装:**
```typescript
const elevationCache = new Map<string, ElevationData>()

function getCacheKey(lng: number, lat: number, precision: number = 5): string {
  const roundedLng = Math.round(lng * precision) / precision
  const roundedLat = Math.round(lat * precision) / precision
  return `${roundedLng},${roundedLat}`
}

// 小数第5位でグループ化
// 誤差: 0.00001° ≈ 1.1m（赤道 1° ≈ 111km）
```

**キャッシュヒット率の推定:**
- ユーザーが同じエリアで複数ポイント選択: 50-70%
- ウェイポイント密集エリア: 60-80%
- 全国規模の移動: 5-10%

---

## GeoJSON フォーマット

### RFC 7946 仕様

**ルート FeatureCollection:**
```json
{
  "type": "FeatureCollection",
  "features": [
    // Feature オブジェクト配列
  ]
}
```

### Geometry タイプと座標形式

#### Point（ウェイポイント）
```json
{
  "type": "Point",
  "coordinates": [139.767, 35.681]
}
```
**座標形式:** `[経度, 緯度]` (左・右の順序！)

#### LineString（飛行経路）
```json
{
  "type": "LineString",
  "coordinates": [
    [139.767, 35.681],
    [139.768, 35.682],
    [139.769, 35.683]
  ]
}
```
**座標形式:** `[点1, 点2, ...]`（2 点以上必須）

#### Polygon（飛行禁止区域・飛行範囲）
```json
{
  "type": "Polygon",
  "coordinates": [
    [  // 外輪（Exterior Ring）
      [139.767, 35.681],
      [139.768, 35.681],
      [139.768, 35.682],
      [139.767, 35.682],
      [139.767, 35.681]  // 閉じた環！
    ],
    [  // ホール（Hole） - オプション
      [139.7675, 35.6815],
      [139.7675, 35.6820],
      [139.7680, 35.6820],
      [139.7680, 35.6815],
      [139.7675, 35.6815]
    ]
  ]
}
```
**重要:** 最初と最後の座標は同じ（閉じた環）

#### Circle（円 - Polygon として表現）
```json
{
  "type": "Polygon",
  "coordinates": [
    [
      [139.767, 35.681],  // 方位 0°
      [139.7683, 35.6815],  // 方位 11.25°
      // ... 32 ポイント
      [139.767, 35.681]   // 最後は最初と同じ
    ]
  ]
}
```

### Feature オブジェクト

```json
{
  "type": "Feature",
  "id": "feature-uuid-1",
  "geometry": {
    "type": "Point",
    "coordinates": [139.767, 35.681]
  },
  "properties": {
    "name": "ウェイポイント1",
    "type": "point",
    "description": "着陸地点",
    "elevation": 12.5,
    "flightHeight": 50,
    "maxAltitude": 62.5,
    "timestamp": "2024-01-16T12:34:56Z"
  }
}
```

### Properties スキーマ

**必須フィールド:**
```typescript
interface FeatureProperties {
  name: string                    // ユーザー定義名
  type: 'polygon' | 'circle' | 'point' | 'line'
}

interface ExtendedProperties extends FeatureProperties {
  // オプション
  description?: string
  elevation?: number              // メートル（ASL）
  flightHeight?: number           // メートル（AGL）
  maxAltitude?: number            // elevation + flightHeight
  radius?: number                 // 円の場合（メートル）
  center?: [number, number]       // 円の場合
  timestamp?: string              // ISO 8601 形式
  [key: string]: unknown          // 拡張可能
}
```

---

## データ変換・計算式

### 座標フォーマット変換

#### 10進数 ↔ 度分秒（DMS）

**10進数 → DMS:**
```typescript
export function formatCoordinatesDMS(lng: number, lat: number): string {
  function toDMS(value: number, isLng: boolean): string {
    const sign = value >= 0 ? (isLng ? 'E' : 'N') : (isLng ? 'W' : 'S')
    const abs = Math.abs(value)
    const degree = Math.floor(abs)
    const minute = Math.floor((abs - degree) * 60)
    const second = ((abs - degree) * 60 - minute) * 60

    return `${degree}°${minute}'${second.toFixed(2)}"${sign}`
  }

  return `${toDMS(lat, false)} ${toDMS(lng, true)}`
}

// 例: (139.75, 35.666666) → "35°40'0.00"N 139°45'0.00"E"
```

**DMS → 10進数:**
```typescript
export function parseDMS(dmsString: string): { lat: number; lng: number } {
  // "35°40'0.00"N 139°45'0.00"E" をパース
  const pattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])/g
  const matches = [...dmsString.matchAll(pattern)]
  
  if (matches.length !== 2) throw new Error('Invalid DMS format')
  
  const [lat, lng] = matches.map(m => {
    const [, degree, minute, second, dir] = m
    let value = +degree + +minute / 60 + +second / 3600
    if (['S', 'W'].includes(dir)) value *= -1
    return value
  })
  
  return { lat, lng }
}
```

### 高度計算

#### 推奨飛行高度の計算

**公式:**
```
推奨飛行高度（AGL）= 地形高度（ASL） + 安全マージン
```

**実装:**
```typescript
export async function getRecommendedFlightAltitude(
  lng: number,
  lat: number,
  safetyMarginMeters: number = 30
): Promise<number | null> {
  const elevation = await fetchElevationFromGSI(lng, lat)
  if (!elevation) return null
  
  return elevation.elevation + safetyMarginMeters
}

// 例: 地形高度 100m + 安全マージン 30m = 推奨飛行高度 130m AGL
```

**安全マージン推奨値:**
| 環境 | マージン | 理由 |
|------|---------|------|
| 平坦地 | 20m | 最小限のマージン |
| **通常環境** | **30m** | **推奨値** |
| 山岳地 | 50m | 風による乱流対策 |
| 市街地 | 50-100m | 障害物回避 |

### バッファゾーン計算

**目的**: 指定フィーチャーから一定距離のバッファゾーンを作成

**Polygon の場合:**
```typescript
export function bufferPolygon(
  polygon: GeoJSON.Polygon,
  bufferKm: number
): GeoJSON.Polygon {
  // 全ポイントを等距離オフセット
  const buffered = polygon.coordinates.map(ring =>
    ring.map(point => {
      // 簡易実装: 座標を度単位でオフセット
      // 正確には: Turf.js などのライブラリ使用推奨
      const offsetDeg = bufferKm / 111  // 1° ≈ 111km
      return [point[0] + offsetDeg, point[1] + offsetDeg]
    })
  )
  
  return { type: 'Polygon', coordinates: buffered }
}
```

**推奨ライブラリ:**
```typescript
import * as turf from '@turf/turf'

const point = turf.point([139.767, 35.681])
const buffered = turf.buffer(point, 1, { units: 'kilometers' })
```

---

## エクスポート形式

### GeoJSON (RFC 7946)

**MIME タイプ:** `application/geo+json`

**ファイルヘッダ:**
```json
{
  "type": "FeatureCollection",
  "features": [...]
}
```

**Character Encoding:** UTF-8（BOM なし）

**用途:**
- Web GIS アプリケーション
- ArcGIS Desktop
- QGIS
- PostGIS
- Leaflet, MapBox, MapLibre GL

**実装例:**
```typescript
function exportAsGeoJSON(features: DrawnFeature[]): string {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: features.map(f => ({
      type: 'Feature',
      id: f.id,
      geometry: { type: f.type as any, coordinates: f.coordinates },
      properties: {
        name: f.name,
        type: f.type,
        elevation: f.elevation,
        flightHeight: f.flightHeight
      }
    }))
  }
  
  return JSON.stringify(geojson, null, 2)
}
```

### KML 2.2 (OGC 標準)

**MIME タイプ:** `application/vnd.google-earth.kml+xml`

**ファイル構造:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>飛行計画</name>
    <Placemark>
      <name>WP1</name>
      <Point>
        <coordinates>139.767,35.681,50</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>飛行範囲</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              139.767,35.681,0
              139.768,35.681,0
              139.768,35.682,0
              139.767,35.682,0
              139.767,35.681,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>
```

**座標形式:** `経度,緯度,高度AGL`

**Character Encoding:** UTF-8（BOM あり推奨）

**用途:**
- Google Earth
- Google Maps
- ArcGIS
- その他 GIS 汎用

### CSV (RFC 4180)

**MIME タイプ:** `text/csv; charset=utf-8`

**フォーマット:**
```csv
id,name,type,lat,lng,elevation,flightHeight,maxAltitude,description
feature-1,ウェイポイント1,point,35.681,139.767,12.5,50,62.5,着陸地点
feature-2,飛行範囲1,polygon,35.681,139.767,12.5,50,62.5,
```

**仕様:**
- **区切り文字**: カンマ (,)
- **クォート**: ダブルクォート (")
- **改行**: CRLF (\r\n)
- **エンコーディング**: UTF-8 BOM なし（Excel で開く際は BOM 推奨）
- **ヘッダー**: 1 行目に列名

**用途:**
- Excel
- Google Sheets
- データベース
- データ分析ツール

### NOTAM フォーマット（度分秒）

**NOTAM:** Notice to Airmen / Notice to Air Missions

**フォーマット例:**
```
N35°40'52.08" E139°46'04.50"
```

**仕様:**
| 要素 | 形式 | 例 |
|------|------|-----|
| 緯度 | N##°##'##.##" | N35°40'52.08" |
| 経度 | E###°##'##.##" | E139°46'04.50" |
| 分離文字 | スペース | (スペース) |

**計算式:**
```typescript
function toDMS(degrees: number, isLng: boolean): string {
  const sign = degrees >= 0 ? (isLng ? 'E' : 'N') : (isLng ? 'W' : 'S')
  const abs = Math.abs(degrees)
  
  const degree = Math.floor(abs)
  const minuteDecimal = (abs - degree) * 60
  const minute = Math.floor(minuteDecimal)
  const second = (minuteDecimal - minute) * 60
  
  const degStr = String(degree).padStart(isLng ? 3 : 2, '0')
  const minStr = String(minute).padStart(2, '0')
  const secStr = second.toFixed(2).padStart(5, '0')
  
  return `${sign}${degStr}°${minStr}'${secStr}"`
}
```

**精度:**
- 秒単位 = ±15.3m（赤道）
- 用途: NOTAM 申請、航空機運用

---

## MapLibre GL / Mapbox GL Draw

### MapLibre GL インターフェース

**初期化:**
```typescript
import maplibregl from 'maplibre-gl'

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://..../style.json',
  center: [139.767, 35.681],
  zoom: 12
})
```

### Mapbox GL Draw 統合

**初期化:**
```typescript
import MapboxDraw from '@mapbox/mapbox-gl-draw'

const draw = new MapboxDraw({
  displayControlsDefault: false,
  controls: {
    polygon: true,
    line_string: true,
    point: true,
    trash: true
  }
})

map.addControl(draw)
```

**イベントハンドリング:**
```typescript
map.on('draw.create', updateFeatures)
map.on('draw.update', updateFeatures)
map.on('draw.delete', updateFeatures)

function updateFeatures() {
  const geoJSON = draw.getAll()
  // GeoJSON を処理
}
```

**返却される GeoJSON:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": "9dca52c9afde4372b1456e96437fcfbb",
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[...], [...], ...]]
      },
      "properties": {}
    }
  ]
}
```

---

## ドローン固有の概念

### 高度表記

**ASL (Above Sea Level) - 海面基準高度**
- 海面からの絶対的な高さ
- 地形が高い場所でも同じ ASL = 同じ高度
- 気圧高度計で測定
- **用途**: 航空業界標準、航空法、NOTAM

**AGL (Above Ground Level) - 地上基準高度**
- 現在の地上からの相対的な高さ
- 地形が高い場所では AGL が低い
- レーダー高度計で測定
- **用途**: ドローン飛行、衝突回避

**関係式:**
```
AGL = ASL - 地形高度（elevation）

例）
  ASL: 150m
  地形高度: 100m
  AGL: 50m ← ドローンは地上 50m 上を飛行
```

### 高度制限

**日本の法律：**
- **地上高**: 150m 以下（航空法 132 条）
- **対地高度**: 300m 以下（電波法）

**実装:**
```typescript
interface AltitudeConstraints {
  maxAglMeters: number = 150        // 地上高上限
  recommendedSafetyMargin: number = 30  // 安全マージン
  
  // 推奨飛行高度の計算
  recommendedAgl = elevation + 30
  
  // 法令遵守チェック
  if (recommendedAgl > 150) {
    console.warn('地上高 150m を超えています')
  }
}
```

---

## LocalStorage スキーマ

### キー と FeatureCollection

**キー:** `did-map-drawn-features`

**値（GeoJSON FeatureCollection）:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "feature-uuid-1",
      "geometry": {
        "type": "Point",
        "coordinates": [139.767, 35.681]
      },
      "properties": {
        "name": "ウェイポイント1",
        "type": "point",
        "elevation": 12.5,
        "flightHeight": 50,
        "maxAltitude": 62.5
      }
    }
  ]
}
```

### ストレージ制限

**ブラウザ容量制限:**
| ブラウザ | 容量 | 仕様 |
|---------|------|------|
| Chrome/Firefox/Safari | 5-10 MB | 同一オリジン |
| Edge | 5-10 MB | Chromium ベース |
| IE 11 | 10 MB | userData behavior |

**計算例:**
```
1 フィーチャー（複雑なポリゴン）= 約 3-5 KB
→ 1000 フィーチャー = 3-5 MB

→ 実質的には 1000-2000 フィーチャーが上限
```

### 保存タイミング

**トリガー:**
- フィーチャー追加/変更/削除時
- **Debounce**: 500ms（複数変更を 1 回の保存にまとめる）

**読込:**
- コンポーネントマウント時
- オペレーション: localStorage.getItem + JSON.parse

---

## パフォーマンス考慮事項

### 座標キャッシング

**戦略:**
```typescript
const cache = new Map<string, ElevationData>()
const precision = 5  // 小数第5位

function getCacheKey(lng: number, lat: number): string {
  return `${Math.round(lng * 100000) / 100000},${Math.round(lat * 100000) / 100000}`
}
```

**メリット:**
- GSI API 呼び出し削減（50-80% 削減）
- ネットワーク遅延削減（300-500ms → 0ms）

**デメリット:**
- 精度低下（1.1m）
- メモリ使用量増加（100 座標 = 約 10 KB）

### API リクエスト最適化

**並列リクエスト:**
```typescript
async function batchFetchElevation(coordinates: Array<[number, number]>) {
  // Promise.all で並列化（推奨: 10-20 並列）
  return Promise.all(
    coordinates.slice(0, 20).map(([lng, lat]) =>
      fetchElevationFromGSI(lng, lat)
    )
  )
}
```

**タイムアウト設定:**
```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 5000)

try {
  await fetch(url, { signal: controller.signal })
} finally {
  clearTimeout(timeout)
}
```

### LocalStorage パフォーマンス

**遅延書き込み（Debounce）:**
```typescript
const debouncedSave = debounce(
  (data: GeoJSON.FeatureCollection) => {
    localStorage.setItem('key', JSON.stringify(data))
  },
  500  // 500ms 遅延
)
```

**効果:**
- 連続した 10 回の変更 → 1 回の保存
- ブロッキング I/O 削減

### メモ化（描画フィルタ）

```typescript
const filteredFeatures = useMemo(() => {
  return drawnFeatures.filter(f => {
    const matchesSearch = f.name.includes(searchQuery)
    const matchesType = typeFilter === 'all' || f.type === typeFilter
    return matchesSearch && matchesType
  })
}, [drawnFeatures, searchQuery, typeFilter])
```

---

## 参考資料・外部リンク

- **WGS84**: https://en.wikipedia.org/wiki/World_Geodetic_System
- **GeoJSON RFC 7946**: https://tools.ietf.org/html/rfc7946
- **KML 2.2 OGC 標準**: https://www.ogc.org/standards/kml/
- **GSI DEM API**: https://maps.gsi.go.jp/development/siyou.html
- **MapLibre GL**: https://maplibre.org/maplibre-gl-js/
- **Mapbox GL Draw**: https://github.com/mapbox/mapbox-gl-draw
- **Turf.js**: https://turfjs.org/ (地理計算ライブラリ)

---

**最終更新**: 2024-01-16
**バージョン**: 1.0
