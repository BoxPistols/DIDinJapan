# 天気予報機能 要件定義書

**作成日**: 2026年1月18日
**更新日**: 2026年1月18日
**ステータス**: 要件確定

## 機能要件

### 1. 天気データ取得

#### 1.1 時間粒度
- **最短**: 5分後の天気
- **最長**: 3日後（72時間後）の天気
- **粒度**: 5分単位の詳細データが必要

#### 1.2 対応地域
- **対象**: 日本全国
- **方式**: 指定座標（緯度経度）から自動判定

#### 1.3 取得データ
- 気温
- 降水確率
- 天気状態（晴れ、曇り、雨等）
- **風速（m/s）** ⭐ ドローン運用必須
- **風向（度数法 0～360°）** ⭐ ドローン運用必須
- 気圧
- 湿度
- その他気象データ

#### 1.4 ドローン運用に必要な指標
- **風速レベル**: 安全判定用
  - 0-2 m/s: 安全（良好）
  - 2-5 m/s: 注意（飛行可能だが注意）
  - 5-10 m/s: 警告（操縦性低下）
  - 10+ m/s: 危険（飛行不可）
- **風向**: 機体の向きと相対風向
- **ラスタ予報**: 風速分布の可視化

### 2. UI/表示機能

#### 2.1 マップオーバーレイ
- 地図上に天気情報をレイヤーとして表示
- 複数地点の天気同時表示
- タイムスライダー（5分単位で時間移動可能）

#### 2.2 予報表示
- 現在時刻の天気
- 5分ごとの予報（3日分）
- 一覧表示またはタイムライン表示

#### 2.3 UX
- レスポンシブデザイン
- ダークモード対応
- 高速な時間切り替え

---

## API選定分析

### 現状の問題

**Open-Meteo**: 1時間単位 → **不適切** ❌
```
└─ 5分単位の要件に未対応
```

**Tsukumijima**: 日単位のみ → **不適切** ❌
```
└─ 3日まで対応するも、時間単位のデータなし
```

### 推奨API組み合わせ

#### **Option A: 気象庁 メッシュ情報API** ⭐推奨

```
エンドポイント: https://www.jma.go.jp/bosai/mesh/data/
特徴:
  - 5分単位のデータ取得可能
  - 1km～5kmメッシュ（詳細）
  - 3日予報まで対応
  - 日本全国対応
  - 完全無料
```

**メッシュコード方式**:
```
例: 53393841 （東京渋谷付近）
  └─ 第1～2階：都道府県メッシュ
     第3～4階：詳細メッシュ

取得URL:
https://www.jma.go.jp/bosai/mesh/data/mesh/20260118150000.json
```

**データ構造**:
```json
{
  "mesh1": {
    "時刻": {
      "temp": 5.2,          // 気温（℃）
      "pop": 10,            // 降水確率（%）
      "wind": {
        "speed": 2.5,       // 風速（m/s） ⭐ ドローン運用
        "direction": 180    // 風向（度数法 0-360°） ⭐ ドローン運用
      },
      "pressure": 1013,     // 気圧（hPa）
      "humidity": 72,       // 湿度（%）
      "weather": 1          // 天気コード
    }
  }
}
```

**メリット**:
- ✅ 5分単位の詳細データ
- ✅ 3日予報対応
- ✅ 日本全国1kmメッシュ
- ✅ 完全無料・APIキー不要
- ✅ 気象庁公式データ
- ✅ CORS対応確認済み

**デメリット**:
- ⚠️ ドキュメントが限定的
- ⚠️ メッシュコード変換が必要
- ⚠️ 更新時刻が固定（毎時0分、30分）

**参考**: https://www.jma.go.jp/bosai/mesh/

---

#### **Option B: WeatherAPI.com + 気象庁メッシュAPI 併用**

```
短期予報（5分～1時間）: WeatherAPI.com
  - 15分単位で最大24時間先
  - 無料: 50req/日（限定的）

中・長期予報（1日～3日）: 気象庁メッシュAPI
  - 5分単位で最大72時間先
  - 完全無料
```

**メリット**:
- より詳細なデータ取得
- フォールバック機能

**デメリット**:
- 複雑な実装
- WeatherAPI無料枠が限定的

---

#### **Option C: Rainviewer API**

```
エンドポイント: https://api.rainviewer.com/weather/

特徴:
  - レーダー画像ベース
  - 5分単位の降水予報
  - 3日先まで対応
  - マップオーバーレイに最適
```

**メリット**:
- ✅ 視覚的なレーダー画像
- ✅ 5分単位
- ✅ マップ統合が簡単

**デメリット**:
- ⚠️ 温度等の詳細データなし
- ⚠️ 降水情報特化

---

## API料金比較

### 完全無料API

#### 1. **気象庁 メッシュ情報API** ⭐⭐⭐ 最推奨

```
料金: 完全無料
リクエスト制限: なし
商用利用: ✅ 可能
認証: 不要
```

**推奨理由**:
- 日本国内での利用なら完全無料
- 商用利用でも追加費用なし
- 気象庁公式データ

#### 2. Tsukumijima

```
料金: 完全無料
リクエスト制限: なし
商用利用: ⚠️ 非推奨
```

**制限**: 日単位のみ（5分単位の要件に非対応）

### 有料API（参考）

#### OpenWeatherMap

```
無料プラン: 1,000req/日
One Call API: $200/月～
```

#### WeatherAPI.com

```
無料プラン: 50req/日
有料プラン: $25/月（10,000req/月）～
```

#### Rainviewer

```
無料プラン: 50req/時間
有料プラン: $99/月～
```

### 価格比較表

| API | 料金 | 無料req/日 | 5分単位 | 3日対応 | 商用 |
|-----|------|----------|--------|--------|------|
| **気象庁メッシュ** | 無料 | 無制限 | ✅ | ✅ | ✅ |
| Tsukumijima | 無料 | 無制限 | ❌ | ✅ | ⚠️ |
| OpenWeatherMap | $200/月 | 1,000 | ❌ | ✅ | ✅ |
| WeatherAPI.com | $25/月 | 50 | ✅ | ✅ | ✅ |
| Rainviewer | $99/月 | 50/h | ✅ | ✅ | ✅ |

---

## 最終推奨

### **気象庁 メッシュ情報API** を推奨

**理由**:
1. ✅ 5分単位の詳細データ
2. ✅ 3日予報対応
3. ✅ 日本全国1kmメッシュ
4. ✅ 完全無料
5. ✅ マップオーバーレイに最適
6. ✅ 気象庁公式データで信頼性高い

**実装アーキテクチャ**:

```
┌─ 地図コンポーネント（MapboxGL等）
│  │
│  ├─ メッシュレイヤー（気象庁データ）
│  │  └─ 5分ごとに更新
│  │
│  ├─ タイムスライダー
│  │  └─ 5分単位で時間移動
│  │
│  └─ 天気情報オーバーレイ
│     └─ テンプレート表示
│
└─ APIデータ取得
   │
   ├─ メッシュコード変換
   │  └─ 座標 → メッシュコード
   │
   ├─ 気象庁メッシュAPI呼び出し
   │  └─ 過去～72時間先
   │
   └─ LocalStorageキャッシング
      └─ 1時間ごと更新
```

---

## 実装仕様

### データ構造

```typescript
interface WindData {
  speed: number;        // 風速（m/s）⭐ ドローン必須
  direction: number;    // 風向（度数法 0-360°）⭐ ドローン必須
  level: 'safe' | 'caution' | 'warning' | 'danger'; // 安全レベル
}

interface WeatherMeshData {
  timestamp: string; // "2026-01-18T15:30:00+09:00"
  meshCode: string;  // "53393841"
  latitude: number;  // 35.6595
  longitude: number; // 139.7004
  weather: {
    temp: number;                     // 気温（℃）
    temp_range?: [number, number];    // 最低・最高
    precipitation: number;            // 降水確率（%）
    wind: WindData;                   // 風情報（ドローン運用必須）
    pressure?: number;                // 気圧（hPa）
    humidity?: number;                // 湿度（%）
    weatherCode: number;              // 天気コード
    description: string;              // "晴れ" 等
  };
  // ドローン運用性判定
  droneOperability: {
    canFly: boolean;                  // 飛行可否判定
    safetyLevel: 'safe' | 'caution' | 'warning' | 'danger';
    reason?: string;                  // 飛行不可の理由
  };
}

interface TimeSeriesWeather {
  meshCode: string;
  forecasts: WeatherMeshData[];
}
```

### コンポーネント設計

```
WeatherMapOverlay/
├── WeatherMapContainer
│   ├── MapComponent (MapboxGL)
│   │   └── WeatherMeshLayer
│   │       └── MeshData表示
│   ├── WeatherTimeline
│   │   ├── TimeSlider (5分単位)
│   │   └── TimeDisplay
│   └── WeatherInfo
│       └── 現在時刻の詳細情報
└── hooks/
    ├── useWeatherMesh() // データ取得
    ├── useMeshCodeConversion() // 座標変換
    └── useWeatherCache() // キャッシング
```

### メッシュコード変換

```typescript
/**
 * 緯度経度 → メッシュコード変換
 * 標準メッシュシステム（第4次地域区分）
 */
function latLonToMeshCode(lat: number, lon: number): string {
  // 第1次メッシュ（100km×100km）
  const p = Math.floor(lat * 1.5);
  const q = Math.floor(lon - 100);

  // 第2次メッシュ（10km×10km）
  const r = Math.floor((lat - p / 1.5) * 15);
  const s = Math.floor((lon - (q + 100)) * 15);

  // 第3次メッシュ（1km×1km）
  const t = Math.floor((lat * 60 - (p * 40 + r * 4)) / 1);
  const u = Math.floor((lon * 60 - (q * 40 + s * 4)) / 1);

  return `${p}${q}${r}${s}${t}${u}`;
}
```

---

## タイムライン表示

### 5分単位のタイムスライダー

```typescript
interface TimelineConfig {
  interval: 5; // 5分間隔
  range: 3 * 24 * 60; // 3日 = 4320分
  steps: 864; // 4320 / 5
  initialOffset: 0; // 現在時刻
}

// タイムライン用データ構造
const timeline = [];
for (let i = 0; i < 864; i++) {
  const offset = i * 5; // 分
  const time = new Date(Date.now() + offset * 60 * 1000);
  timeline.push({
    index: i,
    time: time.toISOString(),
    weather: meshData[i],
    label: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
  });
}
```

---

## マップレイヤー設計

### MapboxGL メッシュレイヤー

#### レイヤー1: 降水確率（デフォルト表示）

```typescript
const precipitationLayer = {
  id: 'weather-mesh-precipitation',
  type: 'fill',
  source: 'weather-data',
  paint: {
    'fill-color': [
      'interpolate',
      ['linear'],
      ['get', 'precipitation'],
      0, '#4575b4',    // 無し（青）
      10, '#74add1',   // 低い（薄青）
      30, '#fee090',   // 中（黄）
      60, '#f46d43',   // 高（橙）
      100, '#a50026'   // 非常に高（赤）
    ],
    'fill-opacity': 0.6
  }
};
```

#### レイヤー2: 風速（ドローン運用用） ⭐

```typescript
const windSpeedLayer = {
  id: 'weather-mesh-wind',
  type: 'fill',
  source: 'weather-data',
  paint: {
    'fill-color': [
      'interpolate',
      ['linear'],
      ['get', 'wind_speed'],
      0, '#1a9850',     // 0-2 m/s: 安全（緑）
      2, '#91cf60',     // 2-5 m/s: 注意（黄緑）
      5, '#fee08b',     // 5-10 m/s: 警告（黄）
      10, '#fc8d59',    // 10+ m/s: 危険（赤）
      15, '#d73027'
    ],
    'fill-opacity': 0.7
  },
  layout: {
    visibility: 'none' // 初期非表示
  }
};
```

#### レイヤー3: 風向矢印（ドローン運用用） ⭐

```typescript
const windDirectionLayer = {
  id: 'weather-mesh-wind-arrow',
  type: 'symbol',
  source: 'weather-data-points',
  layout: {
    'icon-image': 'wind-arrow',
    'icon-rotate': ['get', 'wind_direction'],
    'icon-allow-overlap': true,
    'icon-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      1,
      0.6
    ]
  },
  paint: {
    'icon-color': [
      'step',
      ['get', 'wind_speed'],
      '#1a9850',  // 緑: 安全
      2, '#91cf60',  // 黄緑: 注意
      5, '#fee08b',  // 黄: 警告
      10, '#fc8d59'  // 赤: 危険
    ]
  },
  visibility: 'none' // 初期非表示
};
```

#### トグル機能

```typescript
// ユーザーがレイヤー表示を切り替え可能
const layerToggleOptions = [
  { id: 'precipitation', label: '降水確率', icon: 'cloud-rain' },
  { id: 'wind_speed', label: '風速', icon: 'wind', droneMode: true },
  { id: 'wind_direction', label: '風向', icon: 'compass', droneMode: true },
  { id: 'temperature', label: '気温', icon: 'thermometer' }
];
```

---

## キャッシング戦略

```typescript
class WeatherMeshCache {
  // 5分ごとにAPI更新
  // 72時間分をLocalStorageに保存

  private updateInterval = 5 * 60 * 1000; // 5分
  private cacheTime = 72 * 60 * 60 * 1000; // 72時間

  async updateCache(meshCode: string) {
    const cachedData = this.getFromStorage(meshCode);
    const now = Date.now();

    // 最新データが5分以内なら更新不要
    if (cachedData?.lastUpdate && now - cachedData.lastUpdate < this.updateInterval) {
      return cachedData.data;
    }

    // APIから取得
    const data = await this.fetchFromAPI(meshCode);
    this.saveToStorage(meshCode, data);
    return data;
  }
}
```

---

## 完了条件

- [ ] 気象庁メッシュAPI仕様確認
- [ ] メッシュコード変換ロジック実装
- [ ] カスタムフック実装（useWeatherMesh）
- [ ] MapboxGLレイヤー実装
- [ ] タイムスライダー実装（5分単位）
- [ ] キャッシング機能実装
- [ ] エラーハンドリング実装
- [ ] TypeScript型定義
- [ ] ユニットテスト作成
- [ ] E2Eテスト作成
- [ ] ビルド成功確認
- [ ] ダークモード対応
- [ ] レスポンシブ対応
- [ ] ドキュメント作成

---

## 参考資料

- [気象庁 メッシュ情報API](https://www.jma.go.jp/bosai/mesh/)
- [メッシュシステムの説明](https://www.jma.go.jp/jma/kishou/know/mesh/meshinfo.html)
- [MapboxGL Documentation](https://docs.mapbox.com/mapbox-gl-js/)
- [ISO 8601 DateTime Format](https://en.wikipedia.org/wiki/ISO_8601)

