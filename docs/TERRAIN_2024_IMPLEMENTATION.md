# 2024年ポスト災害地形データ実装ガイド

## 概要

このドキュメントは、2024年能登半島地震後の地形変化を可視化するための実装について説明します。2020年（震災前）と2024年（震災後）のデータを比較し、ドローンフライト計画に必要な座標・海抜高度情報を取得できます。

## 実装概要

### 1. GSI 2024年ポスト災害データ取得

**スクリプト**: `scripts/download_gsi_2024.py`

```bash
npm run download:gsi2024
```

#### 機能
- 能登半島（輪島市周辺）のGSI標高タイル（DEM5b）をダウンロード
- 地理院地図のV/Tile形式デザム（5mメッシュ）を取得
- 能登半島座標範囲：
  - 経度: 136.87 - 136.90°E
  - 緯度: 37.39 - 37.42°N（拡張可）
- 出力: `rawdata/2024/` ディレクトリ

#### パラメータ
```python
NOTO_BOUNDS = {
    "north": 37.42,
    "south": 37.39,
    "east": 136.90,
    "west": 136.87
}
```

### 2. DEM データ変換

**スクリプト**: `scripts/convert_gsi_2024.js`

```bash
npm run convert:gsi2024
```

#### 機能
- DEM タイルテキストデータ（高度値）をGeoJSON形式に変換
- ピクセル座標 → 緯度経度への座標変換
- Feature Collection として出力
- 出力: `public/GeoJSON/2024/noto_2024_elevation.geojson`

#### 出力形式
```json
{
  "type": "FeatureCollection",
  "name": "GSI 2024 Post-Earthquake Elevation Data",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [lon, lat]
      },
      "properties": {
        "elevation": 45.2,
        "tile": "14_10000_5000",
        "pixelX": 128,
        "pixelY": 64
      }
    }
  ]
}
```

### 3. Web UI 統合

#### レイヤー設定 (`src/lib/config/layers.ts`)

```typescript
export const TERRAIN_2024_LAYERS = [
  {
    id: 'terrain-2024-noto',
    name: '能登半島地形 (2024年)',
    path: '/GeoJSON/2024/noto_2024_elevation.geojson',
    year: 2024,
    region: 'noto',
    color: TERRAIN_2024_COLOR // #FF4444
  }
]
```

#### オーバーレイ設定 (`src/lib/config/overlays.ts`)

```typescript
{
  id: 'terrain-2024',
  name: '2024年地形データ（ポスト災害）',
  geojson: '/GeoJSON/2024/noto_2024_elevation.geojson',
  opacity: 0.6,
  category: 'geo',
  description: '2024年能登半島地震後の地形データ（GSI DEM）'
}
```

### 4. 座標・高度取得サービス

**ファイル**: `src/lib/services/elevationService.ts`

#### 主要関数

##### getCoordinateInfo(lngLat)
マップのクリック位置から座標・高度情報を取得

```typescript
import { getCoordinateInfo } from 'japan-drone-map'

const info = await getCoordinateInfo({ lng: 136.876, lat: 37.405 })
// {
//   lng: 136.876,
//   lat: 37.405,
//   elevation: 45.2,
//   formatted: {
//     coordinates: "37.405000°, 136.876000°",
//     elevation: "45.2 m"
//   }
// }
```

##### fetchElevationFromGSI(lng, lat)
指定座標の海抜高度を取得（GSI DEM）

```typescript
const elevation = await fetchElevationFromGSI(136.876, 37.405)
// ElevationData {
//   longitude: 136.876,
//   latitude: 37.405,
//   elevation: 45.2,
//   source: 'gsi-dem',
//   timestamp: "2026-01-15T...",
//   region: "noto"
// }
```

##### getRecommendedFlightAltitude(lng, lat, safetyMargin)
ドローン飛行推奨高度を計算（地形 + 安全マージン）

```typescript
const recommendedAltitude = await getRecommendedFlightAltitude(
  136.876, 37.405, 30  // 安全マージン 30m
)
// 75.2 (AGL = 地形45.2m + 安全30m)
```

##### fetchElevationBatch(coordinates)
複数座標の高度を一括取得（経路計画用）

```typescript
const waypoints = [
  { lng: 136.870, lat: 37.400 },
  { lng: 136.880, lat: 37.410 },
  { lng: 136.890, lat: 37.420 }
]
const elevations = await fetchElevationBatch(waypoints)
```

## 2020年との比較

### 参考レイヤー

```typescript
export const TERRAIN_2020_REFERENCE = {
  id: 'terrain-2020-ishikawa',
  name: '石川県 (2020年基準)',
  path: '/GeoJSON/2020/r02_did_17_ishikawa.geojson',
  year: 2020,
  region: 'ishikawa',
  color: TERRAIN_2020_COLOR // #4444FF
}
```

### 地震の影響

| パラメータ | 値 |
|-----------|-----|
| **地震規模** | M7.6 |
| **最大隆起** | 約4m |
| **海岸線前進** | 約200m |
| **震源地** | 能登半島沖 |
| **主要被害地域** | 輪島市（海砂港周辺） |

## ドローンフライト計画での活用

### 1. DID回避（人口集中地区）

```typescript
import { LAYER_GROUPS } from 'japan-drone-map'

// 石川県DIDto確認
const ishikawa = LAYER_GROUPS.find(g => 
  g.layers.find(l => l.id === 'did-17')
)
```

### 2. 海抜高度取得と飛行計画

```typescript
import { 
  getCoordinateInfo, 
  getRecommendedFlightAltitude,
  fetchElevationBatch 
} from 'japan-drone-map'

// ユーザーが地図をクリック
map.on('click', async (e) => {
  // 座標情報取得
  const info = await getCoordinateInfo(e.lngLat)
  
  // 推奨飛行高度計算
  const safeAltitude = await getRecommendedFlightAltitude(
    e.lngLat.lng, 
    e.lngLat.lat, 
    50 // 50mのマージン
  )
  
  console.log(`飛行推奨高度: ${safeAltitude}m AGL`)
})

// 経路ウェイポイント全体の高度確認
const route = [
  { lng: 136.870, lat: 37.400 },
  { lng: 136.880, lat: 37.410 },
  { lng: 136.890, lat: 37.420 }
]

const elevations = await fetchElevationBatch(route)
elevations.forEach((el, i) => {
  console.log(`WP${i}: 高度 ${el.elevation}m`)
})
```

### 3. 座標スライスボード表示

```typescript
// マップのクリック位置から情報パネル表示
map.on('click', async (e) => {
  const info = await getCoordinateInfo(e.lngLat)
  
  // UI パネルを更新
  document.getElementById('coord-panel').innerHTML = `
    <h3>座標・高度情報</h3>
    <p>緯度経度: ${info.formatted.coordinates}</p>
    <p>海抜高度: ${info.formatted.elevation}</p>
    <p>推奨飛行高度: ${info.elevation ? info.elevation + 30 : '計算中...'}m AGL</p>
  `
})
```

## キャッシング戦略

高度情報はメモリキャッシュ（1時間有効）に保存され、同じ座標への再リクエストは高速です。

```typescript
import { getCacheInfo, clearElevationCache } from 'japan-drone-map'

// キャッシュ情報確認
const cache = getCacheInfo()
console.log(`キャッシュ: ${cache.size}個の座標`)

// キャッシュクリア（メモリ解放）
clearElevationCache()
```

## データ仕様

### GSI DEM5b

- **解像度**: 5m メッシュ
- **座標系**: WGS84 (EPSG:4326)
- **高度基準**: 楕円体高からジオイド高へ変換（日本標準）
- **精度**: ±3m 程度

### 能登半島データセット範囲

```
北限: 37.42°N
南限: 37.39°N
東限: 136.90°E
西限: 136.87°E
```

## トラブルシューティング

### DEM データが見つからない

1. スクリプト実行確認
```bash
npm run download:gsi2024  # DEM タイルダウンロード
npm run convert:gsi2024   # GeoJSON 変換
```

2. 出力ファイル確認
```bash
ls public/GeoJSON/2024/
# noto_2024_elevation.geojson が存在するか確認
```

### 高度取得が遅い

- GSI API のレート制限に達している可能性
- キャッシュサイズを確認：`getCacheInfo()`
- 必要に応じてキャッシュクリア：`clearElevationCache()`

### 座標がずれている

- 座標系がWGS84（EPSG:4326）であることを確認
- マップの投影法（メルカトル図法）と座標系の不一致がないか確認

## 今後の拡張

1. **リアルタイム震災情報連携**
   - 国土地理院の新規DEMデータ自動取得
   - 月単位での地形変化トレーキング

2. **より詳細な地形データ**
   - 1mメッシュの超高解像度DEM
   - 建物モデル（3D）の統合

3. **ドローン飛行計画の最適化**
   - 地形を避けた自動経路生成
   - 関ては回避 + 高度最適化

4. **モバイルアプリ対応**
   - スマートフォンでのリアルタイム座標・高度表示
   - オフラインマップ対応

## 参考資料

- [国土地理院 - GSI Maps](https://maps.gsi.go.jp/)
- [国土地理院 - DEM データ](https://www.gsi.go.jp/map.html)
- [2024年能登半島地震 - 地理院地図での表示](https://www.gsi.go.jp/news/20240105_earthquake_noto.html)

---

**実装日**: 2026年1月15日
**対応OSバージョン**: Node.js 18+, Chrome/Firefox/Safari 最新版
**ライセンス**: MIT
