# Next Actions & Technical Architecture

## プロジェクト概要

**プロジェクト名**: DID in Japan (Japan Drone Map)
**説明**: 日本の地理データ（人口集中地区）とドローン飛行禁止エリア、気象情報をオーバーレイ表示できるWebGISアプリケーション
**バージョン**: 1.0.0
**ライセンス**: MIT

---

## ファイル構造（詳細ツリー）

```
DIDinJapan/
├── docs/                          # ドキュメント
│   ├── PROJECT_REQUIREMENTS.md     # プロジェクト要件書
│   ├── UPDATE_REQUIREMENTS.md      # 更新要件書
│   └── NEXT_ACTION.md              # このファイル
│
├── GeoJSON/                        # 地理データ（全47都道府県）
│   ├── h22_did_01_hokkaido.geojson
│   ├── h22_did_02_aomori.geojson
│   ├── ... (h22_did_03 〜 h22_did_47)
│   └── shp2geojson.txt            # 変換ドキュメント
│
├── rawdata/                        # 元のシェープファイルデータ
│   ├── 2010_did_ddsw_01.zip
│   ├── 2010_did_ddsw_02.zip
│   └── ... (x47)
│
├── SHP/                            # シェープファイル（サンプル）
│   ├── h22_did_13.shp/dbf/prj/shx
│   └── h22_did_14.shp/dbf/prj/shx
│
├── scripts/                        # ビルドスクリプト
│   └── download_did_2020.sh
│
├── src/                            # ソースコード（メイン）
│   ├── App.tsx                     # メインアプリコンポーネント
│   ├── main.tsx                    # エントリーポイント
│   ├── index.css                   # グローバルスタイル
│   │
│   ├── components/                 # Reactコンポーネント
│   │   ├── CustomLayerManager.tsx   # カスタムレイヤー管理UI
│   │   └── index.ts                # コンポーネントエクスポート
│   │
│   ├── lib/                        # ライブラリ・ユーティリティ
│   │   ├── index.ts                # メインエクスポート
│   │   ├── types.ts                # TypeScript型定義
│   │   │
│   │   ├── config/                 # 設定ファイル
│   │   │   ├── baseMaps.ts          # ベースマップ設定
│   │   │   ├── layers.ts            # DID・空港などのレイヤー設定
│   │   │   └── overlays.ts          # 気象情報のオーバーレイ設定
│   │   │
│   │   ├── services/               # API・データ処理サービス
│   │   │   ├── rainViewer.ts        # RainViewer API（雨雲レーダー）
│   │   │   ├── openWeather.ts       # OpenWeatherMap API（気象情報）
│   │   │   ├── airports.ts          # 空港データ処理
│   │   │   ├── noFlyZones.ts        # ドローン飛行禁止エリア処理
│   │   │   └── customLayers.ts      # カスタムレイヤー処理
│   │   │
│   │   └── utils/                  # ユーティリティ関数
│   │       └── geo.ts               # GeoJSON処理・モック生成
│   │
│   └── stories/                    # Storybook ドキュメント
│       ├── Introduction.mdx         # イントロダクション
│       ├── Configuration.mdx        # 設定ガイド
│       ├── Examples.mdx             # 使用例
│       ├── Services.mdx             # サービス解説
│       ├── GeoUtils.mdx             # ユーティリティ解説
│       ├── CustomLayerManager.stories.tsx  # コンポーネント例
│       └── assets/                  # ドキュメント内のアセット
│
├── .storybook/                     # Storybook設定
│   └── main.ts
│
├── index.html                      # HTMLエントリー
├── package.json                    # NPMパッケージ設定
├── tsconfig.json                   # TypeScript設定（本体）
├── tsconfig.lib.json               # TypeScript設定（ライブラリ）
├── vite.config.ts                  # Vite ビルド設定
└── README.md                       # プロジェクト概要
```

---

## 技術スタック（詳細）

### フロントエンド・ビルドツール

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **React** | ^18.0.0 | UIフレームワーク（Peer Dependency） |
| **TypeScript** | ^5.7.2 | 型安全性を確保 |
| **Vite** | ^6.0.7 | ビルドツール・開発サーバー |
| **@vitejs/plugin-react** | ^4.3.4 | React用Viteプラグイン |

### 地図ライブラリ

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **MapLibre GL JS** | ^4.0.0 | WebGIS（地図ライブラリ） |
| **@types/geojson** | ^7946.0.16 | GeoJSON型定義 |

### ドキュメント・UI開発

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Storybook** | ^8.6.15 | コンポーネント・ドキュメント管理 |
| **@storybook/react** | ^8.6.15 | React統合 |
| **@storybook/react-vite** | ^8.6.15 | Vite統合 |
| **@storybook/addon-essentials** | ^8.6.14 | 基本ツール |
| **@storybook/addon-interactions** | ^8.6.14 | インタラクション管理 |
| **@storybook/addon-links** | ^8.6.15 | リンク機能 |
| **@storybook/test** | ^8.6.15 | テスト統合 |

### 型定義

| 技術 | バージョン |
|------|-----------|
| **@types/react** | ^18.3.18 |
| **@types/react-dom** | ^18.3.5 |

### スクリプト

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動（http://localhost:5173） |
| `npm run build` | 本体 + ライブラリビルド |
| `npm run build:lib` | ライブラリのみビルド |
| `npm run preview` | ビルド結果をプレビュー |
| `npm run storybook` | Storybook開発サーバー起動（port 6006） |
| `npm run build-storybook` | Storybookをビルド |

---

## API仕様

### 1. RainViewer API（雨雲レーダー）✅ 本番運用

#### エンドポイント
```
GET https://api.rainviewer.com/public/weather-maps.json
```

#### 実装ファイル
- **メイン**: `src/lib/services/rainViewer.ts`
- **設定**: `src/lib/config/overlays.ts` （Line 42-60）
- **UI統合**: `src/App.tsx` （Line 477-517, 522-549）

#### 仕様
```typescript
// fetchRainRadarTimestamp(): Promise<string | null>
// 最新の雨�云レーダータイムスタンプを取得

interface RainViewerData {
  version: string
  generated: number       // Unix timestamp
  host: string
  radar: {
    past: RainViewerTimestamp[]    // 過去データ
    nowcast: RainViewerTimestamp[] // 予報データ
  }
  satellite?: {
    infrared: RainViewerTimestamp[]
  }
}

interface RainViewerTimestamp {
  time: number          // Unix timestamp
  path: string          // タイルパス
  coverage: number      // カバレッジ率
}
```

#### タイルURL形式
```
https://tilecache.rainviewer.com/{path}/{z}/{x}/{y}/tile.png
例) https://tilecache.rainviewer.com/radar/1234567890/256/10/100/50/tile.png
```

#### 特徴
- **APIキー不要** ✓
- **更新頻度**: 5分ごと自動更新
- **キャッシュ戦略**: 5分間有効
- **フォールバック**: API失敗時 → `(見本)` プレフィックス付きモック

#### フォールバック処理
```typescript
// API失敗時の処理（rainViewer.ts:45-49）
catch (error) {
  console.error('Failed to fetch rain radar timestamp:', error)
  const mockDate = new Date()
  const mockTimestamp = Math.floor(mockDate.getTime() / 1000)
  return `(見本)/radar/${mockTimestamp}/256` // モックマーク付き
}
```

### 2. OpenWeatherMap API（気象情報）⚠️ 構造実装済み

#### エンドポイント（2種類）

**天気情報**
```
GET https://api.openweathermap.org/data/2.5/weather
パラメータ: lat, lon, appid, units=metric
```

**タイルレイヤー**
```
GET https://tile.openweathermap.org/map/{layer}/{z}/{x}/{y}.png
パラメータ: appid（オプション）
```

#### 実装ファイル
- **メイン**: `src/lib/services/openWeather.ts`
- **型定義**: `src/lib/types.ts` （WeatherData, WindData）

#### 利用可能なレイヤー
```typescript
type OWMLayer =
  | 'clouds_new'        // 雲量
  | 'precipitation_new' // 降水
  | 'pressure_new'      // 気圧
  | 'wind_new'          // 風
  | 'temp_new'          // 気温
```

#### 仕様
```typescript
interface WeatherData {
  timestamp: number       // Unix timestamp (ms)
  wind?: WindData
  rain?: number           // mm/h (1時間降水量)
  visibility?: number     // meters
}

interface WindData {
  speed: number           // m/s
  direction: number       // degrees (0-360)
  gust?: number           // m/s
}
```

#### 必須要件
- **APIキー**: 必須（https://openweathermap.org/api で取得）
- **現在の状態**: APIキー未設定のため、タイルレイヤーのみ限定機能で利用可能

### 3. モックデータ（デモンストレーション）

#### 生成場所と機能

**建物・地物** (`src/lib/utils/geo.ts:194-206`)
```typescript
// generateBuildingsGeoJSON()
// 駅舎、官公庁舎などのダミーGeoJSON生成
```

**風フィールド** (`src/App.tsx:398-426`)
```typescript
// handleMockGeoJSON()内で生成
// ベクトルフィールドの可視化（デモ用）
```

**LTEカバレッジ** (`src/App.tsx:382`)
```typescript
// ローカル定義モック
// カバレッジエリアを表示
```

#### マーク方法
- API失敗時またはデモ時: **`(見本)`** プレフィックス付きで表示
- 例: `(見本)風向・風量`

---

## 主要コンポーネント・機能詳細

### App.tsx（メインアプリケーション）

#### 主要な状態管理
```typescript
// Line 82-95: 天候オーバーレイの状態管理
const [weatherStates, setWeatherStates] = useState<
  Map<string, boolean>
>(new Map())

// Line 101-105: 雨雲レーダーの現在パス
const [rainRadarPath, setRainRadarPath] = useState<string | null>(null)

// Line 107-110: マップインスタンス
const [map, setMap] = useState<maplibregl.Map | null>(null)
```

#### 主要な処理フロー

**雨雲レーダー更新** (Line 522-549)
```typescript
useEffect(() => {
  if (!weatherStates.get('rain-radar')) return

  const interval = setInterval(async () => {
    const path = await updateRainRadar()
    if (path && map.getSource('rain-radar')) {
      map.getSource('rain-radar').setData(tileUrl)
    }
  }, 5 * 60 * 1000)  // 5分ごと

  return () => clearInterval(interval)
}, [weatherStates, mapLoaded])
```

**オーバーレイの動的追加** (Line 464-549)
```typescript
// toggleWeatherOverlay(): 天候レイヤーの追加/削除
// 雨雲, 風, 気圧などを動的に切り替え
```

### CustomLayerManager.tsx

ユーザー定義レイヤー（GeoJSON）の管理UI：
- アップロード
- スタイル編集
- 表示/非表示切り替え

### 設定ファイル

#### overlays.ts（オーバーレイ設定）
```typescript
export const WEATHER_OVERLAYS: WeatherOverlay[] = [
  {
    id: 'rain-radar',
    name: '雨雲',
    opacity: 0.6,
    dynamic: true,
    updateInterval: 5 * 60 * 1000  // 5分更新
  },
  {
    id: 'wind',
    name: '風向・風量',
    opacity: 0.5,
    dynamic: true,
    updateInterval: 10 * 60 * 1000  // 10分更新
  },
  // ... その他のレイヤー
]
```

#### layers.ts（DIDレイヤー）
- 47都道府県ごとのGeoJSONソース定義
- 色分けスキーム
- ホバー機能

#### baseMaps.ts（ベースマップ）
- OpenStreetMap
- 衛星画像
- 濃淡起伏図

---

## データフロー図

```
┌─────────────────────────────────────────────────────────────┐
│                   App.tsx (メイン)                          │
└──────────┬──────────────────────────────────────────────────┘
           │
           ├─► MapLibre GL JS ─► Maplibregl.Map
           │                     (地図レンダリング)
           │
           ├─► rainViewer.ts ─► RainViewer API
           │   (fetchRainRadarTimestamp)    └─► タイルキャッシュ
           │
           ├─► openWeather.ts ─► OpenWeatherMap API
           │   (fetchWeatherData)  └─► 気象タイル
           │
           ├─► geo.ts ─► モック生成
           │   (generateBuildingsGeoJSON)  └─► GeoJSON
           │
           ├─► CustomLayerManager ─► ユーザー定義レイヤー
           │
           └─► 設定ファイル
               ├─ layers.ts （DID, 空港）
               ├─ overlays.ts （気象）
               └─ baseMaps.ts （ベースマップ）
```

---

## 開発・デプロイワークフロー

### ローカル開発

```bash
# 1. 依存関係のインストール
npm install

# 2. 開発サーバー起動
npm run dev
# → http://localhost:5173

# 3. Storybook起動（オプション）
npm run storybook
# → http://localhost:6006
```

### ビルド & デプロイ

```bash
# 1. 本体 + ライブラリをビルド
npm run build

# 2. ビルド成果物（dist/）をデプロイ
npm run preview  # ローカルテスト
```

### ライブラリとしての利用

```typescript
// 他のプロジェクトで利用
import { buildRainTileUrl, fetchWeatherData } from 'japan-drone-map'
```

---

## TypeScript設定

### tsconfig.json（本体アプリ）
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### tsconfig.lib.json（ライブラリビルド）
- ライブラリ出力用の独立した設定
- `dist/lib` に型定義（.d.ts）を出力

---

## パッケージエクスポート

```json
{
  "exports": {
    ".": {
      "import": "./dist/lib/index.js",
      "types": "./dist/lib/index.d.ts"
    },
    "./components": {
      "import": "./dist/components/index.js",
      "types": "./dist/components/index.d.ts"
    }
  }
}
```

#### 公開API（src/lib/index.ts）
- `buildRainTileUrl()`
- `fetchRainRadarTimestamp()`
- `buildOWMTileUrl()`
- `fetchWeatherData()`
- `generateBuildingsGeoJSON()`
- レイヤー・オーバーレイ設定
- 型定義（WeatherData, WindData等）

---

## 今後の拡張計画

### Phase 3+（ロードマップより）

1. **OpenWeatherMap API の完全統合**
   - APIキー管理
   - 風向・風速のライブ表示
   - 気象警報・注意報の追加

2. **リアルタイムデータ拡張**
   - 気象庁 API の直接統合（より詳細な気象予報）
   - ドローン飛行規制情報のAPI連携
   - 空港ステータス情報

3. **パフォーマンス最適化**
   - キャッシング戦略の強化
   - タイル事前読み込み
   - オフラインモード対応

4. **UIエンハンスメント**
   - タイムスライダー（過去・未来）
   - レイヤーグループ化
   - カスタムポップアップテンプレート

5. **モバイル対応**
   - レスポンシブUI
   - タッチジェスチャー最適化

---

## 関連ドキュメント

- **PROJECT_REQUIREMENTS.md** - 詳細な機能要件
- **UPDATE_REQUIREMENTS.md** - 実装済み機能の更新履歴
- **README.md** - クイックスタート

---

**最終更新**: 2026年1月9日
**作成者**: Claude Code
