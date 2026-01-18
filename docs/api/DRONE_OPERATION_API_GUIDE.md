# ドローン運用統合APIガイド

**作成日**: 2026年1月18日
**ステータス**: 完全無料API構成
**対象**: ドローン飛行計画・運用管理システム

---

## 概要

日本国内でドローン（無人航空機）を安全かつ適切に運用するために必要な情報を、完全無料の公開APIから取得・統合するガイドです。

**必須情報**:
1. ✅ **天気予報（風速・降水確率）** → ドローン飛行安全性判定
2. ✅ **電波状況（通信カバレッジ）** → リモートID・遠隔操縦の通信確保
3. ✅ **日没時間（民間薄明時間）** → MLIT法的飛行可能時間帯

**実装コスト**: **¥0** 全てのAPIが完全無料

---

## 1. 天気予報データ

### API: 気象庁 メッシュ情報API ⭐

#### 特徴
```
URL: https://www.jma.go.jp/bosai/mesh/
料金: 完全無料
認証: 不要
時間粒度: 5分単位
対応期間: 過去～72時間先（3日先）
対応地域: 日本全国（1km×1kmメッシュ）
```

#### 取得データ
```typescript
interface DroneWeatherData {
  timestamp: string;           // "2026-01-18T15:30:00+09:00"
  meshCode: string;            // "53393841" (メッシュコード)
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  weather: {
    // ドローン運用に直接関連するデータ
    wind: {
      speed: number;           // 風速（m/s）⭐ 最重要
      direction: number;       // 風向（0-360°）
      level: DroneWindLevel;   // 安全レベル判定
    };
    precipitation: {
      probability: number;     // 降水確率（%）
      amount?: number;         // 降水量（mm）
    };
    temperature: number;       // 気温（℃）
    humidity?: number;         // 湿度（%）
    pressure?: number;         // 気圧（hPa）
    weatherCode: number;       // 天気コード
    description: string;       // "晴れ" "曇り" "雨" 等
  };
  // ドローン飛行判定
  droneOperability: {
    canFly: boolean;           // 飛行可否
    safetyLevel: DroneWindLevel;
    windRisk: string;          // "無し" "注意" "警告" "危険"
    precipitationRisk: string; // 降水リスク
    recommendedActions: string[];
  };
}

// ドローン風速レベル定義
type DroneWindLevel = 'safe' | 'caution' | 'warning' | 'danger';

// 風速安全基準
const DRONE_WIND_THRESHOLDS = {
  safe:     [0, 2],     // 0-2 m/s: 安全（良好）- GREEN
  caution:  [2, 5],     // 2-5 m/s: 注意（飛行可能） - YELLOW-GREEN
  warning:  [5, 10],    // 5-10 m/s: 警告（操縦難化） - YELLOW
  danger:   [10, 100]   // 10+ m/s: 危険（飛行不可） - RED
};
```

#### 利用例
```bash
# 過去のデータ取得
curl "https://www.jma.go.jp/bosai/mesh/data/mesh/20260118150000.json"

# 表示フォーマット例
{
  "mesh1": {
    "2026-01-18T15:30": {
      "temp": 5.2,
      "pop": 10,
      "wind": { "speed": 2.5, "direction": 180 },
      "pressure": 1013,
      "humidity": 72,
      "weather": 1
    }
  }
}
```

#### メリット/デメリット
✅ **メリット**:
- 完全無料・制限なし
- 5分単位の詳細データ
- 気象庁公式信頼度高い
- 認証・APIキー不要
- CORS対応確認済み
- 商用利用可

⚠️ **デメリット**:
- ドキュメント限定的
- メッシュコード変換が必要
- 更新時刻が毎時0分・30分固定

---

## 2. 電波状況（通信カバレッジ）

### 推奨オプション A: OpenSignal（視覚的参照）

#### 特徴
```
URL: https://www.opensignal.com/networks/japan/
料金: 完全無料
認証: 不要（ブラウザアクセス）
カバー: NTT Docomo / KDDI au / SoftBank / 楽天Mobile
更新頻度: リアルタイム
```

#### 用途
- フライト前の事前調査（ブラウザで視覚確認）
- キャリア別カバレッジ比較
- 不感地帯の特定

#### 利用方法
```
ブラウザで https://www.opensignal.com/networks/japan/
↓
飛行予定地点の住所/座標で検索
↓
各キャリアのカバレッジ表示（5G/LTE/4G）
↓
チェックボックスで複数キャリアを同時表示
```

**Pros**:
- UI/UX優秀で直感的
- リアルタイムクラウドソース
- 5Gカバレッジも表示
- 複数キャリア同時比較

**Cons**:
- プログラマティックAPI不提供
- 手動確認が必要
- 画面スクレイピング非推奨

---

### 推奨オプション B: CellMapper（高度な技術参照）

#### 特徴
```
URL: https://www.cellmapper.net/map
料金: 完全無料（プレミアム$3/月オプション）
認証: 不要
カバー: 全キャリア対応
粒度: 個別タワー位置表示
```

#### 用途
- 個別基地局位置の特定
- 5G NSA/SA区別確認
- コミュニティ最新データ活用

#### 利用方法
```
1. https://www.cellmapper.net/map をブラウザで開く
2. 飛行予定座標を入力
3. 左パネルで "Layers" から対象キャリア/バンド選択
4. Map上にタワー表示 → 飛行エリアの通信安定性確認
```

**Pros**:
- ユーザーコントリビューションで常に最新
- 個別タワー位置の詳細表示
- 完全無料
- 5G NSA/SA判別可能

**Cons**:
- API不提供（ビジュアルのみ）
- データ反映に数日ラグあり
- リモートエリアは欠落可能性

---

### 統合例: キャッシング戦略

実装段階では、以下の手法で「電波状況」を概念的に管理：

```typescript
interface NetworkCoverageAssessment {
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  assessmentDate: string;
  assessmentMethod: 'opensignal' | 'cellmapper' | 'user_reported';

  // キャリア別カバレッジ評価
  carriers: {
    docomo: CoverageLevel;      // 'excellent' | 'good' | 'fair' | 'poor' | 'none'
    kddi: CoverageLevel;
    softbank: CoverageLevel;
    rakuten?: CoverageLevel;
  };

  // 最小要件チェック（リモートID/C2通信用）
  minRequirement: {
    has4GLte: boolean;          // LTE以上必須
    hasSingleCarrier: boolean;  // 最低1キャリア必須
    estimatedSignal: 'strong' | 'moderate' | 'weak' | 'poor';
  };

  // ドローンリモートID通信チェック
  remoteIdCapable: boolean;     // 最低4Gで飛行可能判定
  recommendedCarrier?: string;  // 推奨キャリア（最強信号）

  // ユーザー報告値（初回飛行時に記録）
  userFeedback?: {
    reportedSignal: number;     // 信号強度（-120～-30 dBm）
    reportedSpeedMbps?: number; // 実測速度
    reportedIssues?: string[];
    reportedDate: string;
  };
}

type CoverageLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'none';
```

---

## 3. 日没時間（民間薄明時間）

### API: Sunrise-Sunset.org ⭐推奨

#### 特徴
```
URL: https://api.sunrise-sunset.org/json
料金: 完全無料
認証: 不要
対応地域: 全世界（日本座標対応）
精度: ±1分
データ: 日出・日没・民間薄明時間
```

#### MLIT規制対応

日本の航空法では以下の規制あり:

```
■ 無人航空機の飛行禁止時間帯
- 民間薄明時間終了後（夜間）のドローン飛行禁止
- 例外: 照明設備のあるエリアで許可申請された場合のみ

■ 民間薄明時間（Civil Twilight）とは
- 日没後、太陽の中心が地平線下6°に達するまでの時間
- この間は自然光で十分な視認性がある
- 日本語では「民間薄明」と呼称

参考: MLIT無人航空機飛行規則
- https://www.mlit.go.jp/koku/koku_tk10_000003.html
```

#### APIエンドポイント

```bash
GET https://api.sunrise-sunset.org/json?lat={lat}&lng={lng}&date={YYYY-MM-DD}&tzid={timezone}
```

**パラメータ**:
- `lat`: 緯度
- `lng`: 経度
- `date`: 日付（YYYY-MM-DD）
- `tzid`: タイムゾーン（Asia/Tokyo for JST）

#### リクエスト例

```bash
# 東京（渋谷）での2026年1月25日の日没時刻取得
curl "https://api.sunrise-sunset.org/json?lat=35.6595&lng=139.7004&date=2026-01-25&tzid=Asia/Tokyo"
```

#### レスポンス例

```json
{
  "results": {
    "sunrise": "2026-01-25T06:47:02",
    "sunset": "2026-01-25T16:32:45",
    "solar_noon": "2026-01-25T11:40:00",
    "day_length": "09:45:43",
    "civil_twilight_begin": "2026-01-25T06:18:30",
    "civil_twilight_end": "2026-01-25T17:01:17",       ⭐ ドローン飛行の法的上限時刻
    "nautical_twilight_begin": "2026-01-25T05:47:00",
    "nautical_twilight_end": "2026-01-25T17:32:45",
    "astronomical_twilight_begin": "2026-01-25T05:15:30",
    "astronomical_twilight_end": "2026-01-25T18:04:15"
  },
  "status": "OK"
}
```

#### 取得データ構造

```typescript
interface DroneOperationTimingData {
  date: string;                  // "2026-01-25"
  location: {
    latitude: number;
    longitude: number;
    timezone: string;            // "Asia/Tokyo"
  };

  // 太陽位置情報
  sunData: {
    sunrise: string;             // ISO8601 形式
    sunset: string;
    solarNoon: string;
    dayLength: string;            // "HH:MM:SS" 形式
  };

  // ドローン飛行規制対応
  droneFlightWindow: {
    legalBegin: string;           // civil_twilight_begin
    legalEnd: string;             // civil_twilight_end ⭐ MLIT法的上限
    legalDurationMinutes: number; // 飛行可能時間帯の長さ（分）
    isDaylightOnly: true;         // 常に true（日中のみ）
  };

  // 薄明時間詳細
  twilight: {
    civil: {
      begin: string;              // 民間薄明開始
      end: string;                // 民間薄明終了 ⭐ 法的飛行上限
    };
    nautical: {
      begin: string;              // 航海薄明開始
      end: string;
    };
    astronomical: {
      begin: string;              // 天文薄明開始
      end: string;
    };
  };

  // 飛行許可判定
  flightPermission: {
    canFlyWithoutApproval: boolean;    // 常にtrue（昼間のみ）
    requiresLightingApproval: boolean; // 民間薄明後は要許可
    maxFlightTime: string;             // civil_twilight_end
    warningZone: {
      begin: string;                   // 日没30分前
      message: string;
    };
  };
}
```

#### 利用パターン

```typescript
// パターン1: 単日飛行計画
async function getPlanForToday(lat: number, lng: number) {
  const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  const response = await fetch(
    `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${today}&tzid=Asia/Tokyo`
  );
  const data = await response.json();
  return data.results.civil_twilight_end;  // 飛行上限時刻
}

// パターン2: 複数日計画（7日分）
async function getMissionSchedule(lat: number, lng: number) {
  const schedule = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const response = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${dateStr}&tzid=Asia/Tokyo`
    );
    const data = await response.json();

    schedule.push({
      date: dateStr,
      flightDeadline: data.results.civil_twilight_end,
      dayLength: data.results.day_length
    });
  }
  return schedule;
}

// パターン3: ドローン飛行チェック（リアルタイム）
async function canFlyNow(lat: number, lng: number): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const response = await fetch(
    `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${today}&tzid=Asia/Tokyo`
  );
  const data = await response.json();

  const now = new Date();
  const civilTwilightEnd = new Date(data.results.civil_twilight_end);

  return now < civilTwilightEnd;  // 民間薄明時間内なら飛行可能
}
```

**Pros**:
- 完全無料・認証不要
- MLIT法的要件に正確に対応
- ±1分の高精度
- 単純なREST API
- 過去・未来の日付にも対応

**Cons**:
- 速度制限非公開（過度な利用は避けべき）
- ステータスは「OK」のみ（エラー判定は別途実装）
- TTLサイクル不明

---

## 4. 統合アーキテクチャ

### データレイヤー統合設計

```
┌─────────────────────────────────────────────────────────────┐
│        ドローン運用管理システム（Frontend/Backend）         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         統合APIデータレイヤー（Caching & State）            │
├─────────────────────────────────────────────────────────────┤
│ • useWeatherMesh()          [気象庁API]                    │
│ • useNetworkCoverage()      [OpenSignal + CellMapper]      │
│ • useFlightWindow()         [Sunrise-Sunset.org]            │
│ • useOperationSafety()      [統合判定ロジック]              │
└─────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┬──────────────────┐
        ↓                     ↓                  ↓
   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐
   │ 気象予報API │   │ 電波状況参照 │   │ 日没時刻API    │
   │ 気象庁メッシュ│   │ OpenSignal  │   │Sunrise-Sunset  │
   │ 5分間隔     │   │ CellMapper  │   │±1分精度        │
   └─────────────┘   └─────────────┘   └─────────────────┘
   • 風速・風向       • キャリア       • 民間薄明時間
   • 降水確率        • LTE/5G        • 昼間飛行判定
   • 気温・湿度      • カバレッジ    • MLIT対応
```

### 統合ステート管理

```typescript
interface DroneOperationState {
  // 基本情報
  mission: {
    id: string;
    location: { latitude: number; longitude: number };
    plannedDate: string;
    missionType: 'survey' | 'delivery' | 'inspection' | 'research';
  };

  // 外部APIデータ
  weatherData: DroneWeatherData[];           // 気象庁メッシュ
  networkData: NetworkCoverageAssessment;    // 電波状況
  timingData: DroneOperationTimingData;      // 日没情報

  // 統合判定結果
  operationStatus: {
    safeToFly: boolean;                      // 総合判定
    reasonsIfNotSafe: string[];              // 飛行不可の理由
    riskLevel: 'green' | 'yellow' | 'red';   // リスク評価
    lastUpdate: string;
  };

  // キャッシング
  cache: {
    weatherLastUpdate: string;               // 気象データの最終更新
    networkLastCheck: string;                // 電波確認時刻
    timingLastFetch: string;                 // 日没情報取得時刻
    cacheValidityMinutes: 30;                // キャッシュ有効期限
  };
}
```

---

## 5. 実装チェックリスト

### Phase 1: API統合基盤
- [ ] `useWeatherMesh()` カスタムフック実装
  - 気象庁APIデータ取得
  - メッシュコード変換
  - 5分単位キャッシング

- [ ] `useNetworkCoverage()` カスタムフック実装
  - 飛行地点のキャリア別カバレッジ評価
  - ユーザー報告データストレージ
  - ローカルキャッシュ管理

- [ ] `useFlightWindow()` カスタムフック実装
  - Sunrise-Sunset.org連携
  - MLIT法的飛行時間帯判定
  - 日付別スケジュール生成

### Phase 2: 統合判定ロジック
- [ ] `useOperationSafety()` カスタムフック実装
  ```typescript
  // 以下を統合判定
  ✓ 風速チェック（safe/caution/warning/danger）
  ✓ 降水判定（雨中飛行不可）
  ✓ 電波確保（最低4G必須）
  ✓ 飛行時間帯（民間薄明時間内か）
  ✓ 総合リスク評価
  ```

### Phase 3: UI/表示層
- [ ] DroneOperationDashboard コンポーネント
  - 天気概況表示
  - 電波状況表示
  - 飛行可能時間帯表示
  - 総合判定インジケーター

- [ ] FlightPlanChecker コンポーネント
  - 複数日スケジュール確認
  - リスク予測
  - 推奨フライト時間帯

- [ ] MapboxGL統合
  - 気象メッシュレイヤー（風速・降水）
  - 電波カバレッジオーバーレイ
  - 飛行可能エリア可視化

### Phase 4: テスト・最適化
- [ ] TypeScript型チェック完全化
- [ ] ユニットテスト（各hook）
- [ ] E2Eテスト（統合判定ロジック）
- [ ] キャッシング戦略最適化
- [ ] ダークモード対応
- [ ] レスポンシブデザイン対応

---

## 6. データ更新戦略

### キャッシング・更新周期

```typescript
const UPDATE_INTERVALS = {
  weather: 5 * 60 * 1000,        // 5分ごと（気象庁の更新スケジュール対応）
  flightWindow: 24 * 60 * 60 * 1000,  // 日1回（日付変更時）
  networkCoverage: 7 * 24 * 60 * 60 * 1000,  // 週1回（手動更新推奨）
};

// LocalStorageキー
const CACHE_KEYS = {
  weather: `drone_weather_${meshCode}`,
  network: `drone_network_${lat}_${lng}`,
  flightWindow: `drone_flightwindow_${lat}_${lng}_${date}`,
};
```

### エラーハンドリング

```typescript
// APIアクセス失敗時のフォールバック
interface ErrorRecovery {
  weatherFail: {
    fallback: 'local_cache' | 'degraded_mode';
    message: '気象データが取得できません。キャッシュを使用しています';
  };
  networkFail: {
    fallback: 'manual_input' | 'prompt_user_check';
    message: '電波確認サイトで手動確認してください';
  };
  timingFail: {
    fallback: 'conservative_estimate';
    message: '日没予想時刻が取得できません。日没1時間前に飛行を停止してください';
  };
}
```

---

## 7. 実装コスト分析

### 無料 APIのみの実装

| API | 料金 | リクエスト制限 | 認証 | 備考 |
|-----|------|-------------|------|------|
| **気象庁メッシュ** | ¥0 | なし | 不要 | 推奨 |
| **Sunrise-Sunset.org** | ¥0 | 無制限推定 | 不要 | 推奨 |
| **OpenSignal** | ¥0 | - | 不要 | 視覚参照用 |
| **CellMapper** | ¥0 | - | 不要 | 視覚参照用 |

**総コスト: ¥0（永久無料）**

---

## 8. セキュリティ・法的考慮事項

### MLIT無人航空機規制対応

```
✓ 飛行禁止時間帯: civil_twilight_end 以降
✓ 通信確保: リモートID / C2通信（最低4G必須）
✓ 気象条件: 風速10 m/s以上で飛行禁止
✓ 目視確認: 目視外飛行には許可申請必須
✓ 日中飛行: このシステムは日中飛行のみ対応
```

### プライバシー

```
⚠️ 注意事項:
- ユーザーが登録する座標・飛行計画は個人情報
- LocalStorageのみで管理し、サーバー送信不可
- ブラウザローカルストレージ以外に保存しない
```

### API利用規約

```
✓ 気象庁メッシュAPI
  - 商用・非商用両対応
  - 帰属表示: "気象庁メッシュ情報を使用"

✓ Sunrise-Sunset.org
  - 帰属表示必須: リンク含める
  - 非商用推奨（商用利用は相談推奨）
```

---

## 9. 参考資料

### 公式ドキュメント
- [気象庁メッシュ情報](https://www.jma.go.jp/bosai/mesh/)
- [Sunrise-Sunset.org API](https://sunrise-sunset.org/api)
- [OpenSignal Coverage Maps](https://www.opensignal.com/)
- [CellMapper](https://www.cellmapper.net/map)

### MLIT無人航空機規制
- [国土交通省 無人航空機の飛行許可・承認](https://www.mlit.go.jp/koku/koku_tk10_000003.html)
- [MLIT 無人航空機飛行規則](https://elaws.e-gov.go.jp/document?lawid=428AC0000000015)

### 関連技術
- [MapboxGL Documentation](https://docs.mapbox.com/mapbox-gl-js/)
- [標準メッシュシステム](https://www.jma.go.jp/jma/kishou/know/mesh/meshinfo.html)
- [ISO 8601 DateTime](https://en.wikipedia.org/wiki/ISO_8601)

---

## 10. FAQ / トラブルシューティング

### Q. なぜ気象庁メッシュAPI？
A. Open-Meteoは1時間粒度のため、5分粒度の要件に対応不可。気象庁は完全無料で5分精度。

### Q. 電波状況をプログラマティックに取得できないのか？
A. 主要キャリア（Docomo/au/SoftBank）は公開APIを提供していません。OpenSignal/CellMapperで視覚的に確認し、本運用では初回飛行時にユーザーが測定値を登録する設計。

### Q. Sunrise-Sunset.orgはレート制限があるのか？
A. 公開されていませんが、過度な自動リクエスト（例：1分ごと）は避けべき。キャッシュを活用。

### Q. 夜間飛行は対応予定か？
A. 現在は日中飛行のみ。夜間飛行にはMLIT特別許可（照明設備等）が必要であり、本ガイドのスコープ外。

---

**更新履歴**:
- 2026-01-18: 初版作成（気象庁メッシュ＋電波状況＋日没時間の統合ガイド）
