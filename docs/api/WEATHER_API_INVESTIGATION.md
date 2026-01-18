# 天気予報API 詳細調査報告書

**作成日**: 2026年1月18日
**ステータス**: 実装前調査
**優先度**: 中

## 目次

1. [概要](#概要)
2. [API仕様比較](#api仕様比較)
3. [推奨API](#推奨api)
4. [実装コード](#実装コード)
5. [キャッシング戦略](#キャッシング戦略)
6. [セキュリティ対応](#セキュリティ対応)
7. [料金体系](#料金体系)
8. [実装チェックリスト](#実装チェックリスト)

---

## 概要

React/JavaScriptアプリケーションで、日本国内の指定座標（緯度経度）の天気予報を取得するための調査結果。

### 調査対象API

1. **Open-Meteo** ⭐ 推奨
2. **OpenWeatherMap**
3. **WeatherAPI.com**
4. **Tsukumijima（気象庁API）**

---

## API仕様比較

### クイック比較表

| 項目 | Open-Meteo | OpenWeatherMap | WeatherAPI | Tsukumijima |
|------|-----------|----------------|-----------|------------|
| **無料プラン** | ✅ 10,000req/日 | ⚠️ 1,000req/日 | ⚠️ 50req/日 | ✅ 無制限 |
| **登録** | 不要 | 必須 | 必須 | 不要 |
| **APIキー** | 不要 | 必須 | 必須 | 不要 |
| **CORS** | ✅ 対応 | △ 要設定 | △ 要設定 | ✅ 対応 |
| **日本対応** | ✅ JMA統合 | △ 国際 | ✅ | ✅ 公式 |
| **予報期間** | 7～16日 | 48h+8日 | 14日 | 3日 |
| **時間単位** | ✅ 1時間 | ✅ 1時間 | ✅ 15分 | ❌ なし |
| **商用利用** | $29/月 | $200/月 | $25/月 | ❌ 非推奨 |

### 詳細仕様

#### 1. Open-Meteo

**Endpoint**: `https://api.open-meteo.com/v1/forecast`

**リクエスト例**:
```
GET /v1/forecast?latitude=35.6762&longitude=139.6503
  &hourly=temperature_2m,precipitation,weather_code,wind_speed_10m
  &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max
  &forecast_days=7
  &timezone=Asia/Tokyo
```

**レスポンス構造**:
```json
{
  "latitude": 35.6762,
  "longitude": 139.6503,
  "timezone": "Asia/Tokyo",
  "hourly": {
    "time": ["2026-01-18T00:00", "2026-01-18T01:00", ...],
    "temperature_2m": [5.2, 4.8, 4.3, ...],
    "precipitation": [0, 0, 0.1, ...],
    "weather_code": [1, 1, 45, ...],
    "wind_speed_10m": [2.5, 2.3, 2.1, ...]
  },
  "daily": {
    "time": ["2026-01-18", "2026-01-19", ...],
    "temperature_2m_max": [8.5, 9.2, 7.1, ...],
    "temperature_2m_min": [2.1, 3.5, 1.8, ...],
    "precipitation_sum": [0, 2.5, 5.2, ...],
    "precipitation_probability_max": [0, 60, 85, ...]
  }
}
```

**天気コード対応**:
- 0 = 晴れ
- 1,2,3 = 曇り（程度別）
- 45,48 = 霧
- 51-67 = 小雨～大雨
- 71-79 = 小雪～大雪
- 80-82 = 驟雨
- 95-99 = 雷雨

**主な特徴**:
- ✅ 気象庁（JMA）データを使用
- ✅ 登録不要・APIキー不要
- ✅ CORS対応で即座に利用可能
- ✅ 10,000リクエスト/日（非商用）
- ✅ 7～16日の長期予報対応
- ✅ 商用利用も$29/月と手頃

---

#### 2. OpenWeatherMap

**Endpoint**: `https://api.openweathermap.org/data/3.0/onecall`

**リクエスト例**:
```
GET /data/3.0/onecall?lat=35.6762&lon=139.6503
  &appid=YOUR_API_KEY
  &units=metric
  &lang=ja
```

**取得可能情報**:
- current: 現在天気
- hourly: 時間別予報（最大48時間）
- daily: 日別予報（最大8日間）
- alerts: 警報・注意報

**レスポンス例**:
```json
{
  "current": {
    "dt": 1642505540,
    "temp": 5.2,
    "humidity": 72,
    "wind_speed": 2.5,
    "weather": [{"main": "Clear", "description": "晴れ"}]
  },
  "hourly": [...],
  "daily": [...]
}
```

**料金体系**:
- Free: 1,000リクエスト/日（古いAPI 2.5のみ）
- One Call 3.0: $200/月（100,000req/月）～

**注意点**:
- Free Tierではhourly/daily予報が非対応
- 日本国内の精度が低い（国際モデル）
- CORS設定が複雑

---

#### 3. WeatherAPI.com

**Endpoint**: `https://api.weatherapi.com/v1/forecast.json`

**リクエスト例**:
```
GET /v1/forecast.json?key=YOUR_API_KEY
  &q=Tokyo
  &aqi=yes
  &alerts=yes
  &lang=ja
```

**主な特徴**:
- 位置情報から自動で地域判定（city_code不要）
- 大気汚染指標（AQI）対応
- 時間単位で最大14日分
- 警報・注意報対応

**無料枠**: 50リクエスト/日（最も限定的）

---

#### 4. Tsukumijima（気象庁API）

**Endpoint**: `https://weather.tsukumijima.net/api/forecast/city/{city_code}`

**city_code例**:
- 130000: 東京
- 260000: 千葉
- 140000: 神奈川
- 330000: 埼玉

**レスポンス例**:
```json
{
  "location": {
    "area": "東京地方",
    "prefecture": "東京都",
    "district": "東京"
  },
  "forecasts": [
    {
      "date": "2026-01-18",
      "dateLabel": "今日",
      "telop": "晴れ",
      "temperature": {
        "min": {"celsius": "2"},
        "max": {"celsius": "8"}
      }
    }
  ]
}
```

**限定情報**:
- 天気（telop）のみ
- 3日間の予報のみ
- 気象庁の発表時刻に依存
- ⚠️ 重要な用途での利用は非推奨

---

## 推奨API

### **1位: Open-Meteo** 🏆

**理由**:
- 非商用なら完全無料・制限なし
- 気象庁データを使用し精度が高い
- 登録・APIキー不要で即座に利用可能
- CORS対応
- 7～16日の長期予報対応
- 商用利用時も$29/月と手頃

**推奨用途**:
- 本格的な天気予報機能
- 長期予報が必要
- 商用・非商用両対応

**実装難易度**: ⭐☆☆（最簡単）

---

### **2位: Tsukumijima** 🥈

**理由**:
- 気象庁公式データ
- 完全無料・制限なし
- 登録・APIキー不要

**制限**:
- 3日予報のみ
- 重要な用途での利用は非推奨
- 短期予報のみに限定

**実装難易度**: ⭐☆☆

---

### **3位: WeatherAPI.com** 🥉

**理由**:
- バランス型
- ドキュメント充実
- 複数出力形式対応

**制限**:
- 無料枠が極めて限定的（50/日）
- 商用利用には有料が必須

---

## 実装コード

### Open-Meteo実装（推奨）

```typescript
import { useState, useEffect } from 'react';

// カスタムフック
const useWeatherOpenMeteo = (latitude: number, longitude: number) => {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const params = new URLSearchParams({
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
          forecast_days: '7',
          timezone: 'Asia/Tokyo',
        });

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setWeather(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };

    if (latitude && longitude) {
      fetchWeather();
    }
  }, [latitude, longitude]);

  return { weather, loading, error };
};

// 天気コード→表示文字列の変換
const getWeatherDescription = (code: number): string => {
  const weatherMap: Record<number, string> = {
    0: '晴れ',
    1: 'ほぼ晴れ',
    2: '曇り',
    3: '曇り',
    45: '霧',
    48: '霧',
    51: '小雨',
    53: '雨',
    55: '大雨',
    71: '小雪',
    73: '雪',
    75: '大雪',
    80: '驟雨',
    81: '強い驟雨',
    82: '激しい驟雨',
    95: '雷雨',
    96: '雷雨（雹）',
    99: '雷雨（雹）',
  };
  return weatherMap[code] || '不明';
};

// コンポーネント使用例
export const WeatherComponent = ({
  latitude = 35.6762,
  longitude = 139.6503
}: {
  latitude?: number;
  longitude?: number
}) => {
  const { weather, loading, error } = useWeatherOpenMeteo(latitude, longitude);

  if (loading) return <div className="text-gray-500">天気情報読み込み中...</div>;
  if (error) return <div className="text-red-500">エラー: {error}</div>;
  if (!weather) return null;

  const today = weather.daily;
  const todayWeatherCode = today.weather_code[0];
  const todayMaxTemp = today.temperature_2m_max[0];
  const todayMinTemp = today.temperature_2m_min[0];
  const rainProbability = today.precipitation_probability_max[0];

  return (
    <div className="bg-blue-50 p-4 rounded-lg">
      <h3 className="text-lg font-bold mb-2">天気予報</h3>

      {/* 現在の天気 */}
      <div className="mb-4 p-3 bg-white rounded">
        <p className="text-2xl font-bold">{getWeatherDescription(todayWeatherCode)}</p>
        <div className="text-sm text-gray-600 mt-1">
          <p>最高気温: {todayMaxTemp}°C</p>
          <p>最低気温: {todayMinTemp}°C</p>
          <p>降水確率: {rainProbability}%</p>
        </div>
      </div>

      {/* 7日間予報 */}
      <div className="text-sm">
        <h4 className="font-semibold mb-2">7日間予報</h4>
        <div className="grid grid-cols-4 gap-2">
          {today.time.slice(0, 7).map((date: string, idx: number) => (
            <div key={date} className="text-center text-xs p-2 bg-white rounded">
              <p className="font-semibold">
                {new Date(date).toLocaleDateString('ja-JP', {
                  month: 'numeric',
                  day: 'numeric'
                })}
              </p>
              <p className="my-1">{getWeatherDescription(today.weather_code[idx])}</p>
              <p className="text-xs text-gray-600">
                {today.temperature_2m_max[idx]}°C / {today.temperature_2m_min[idx]}°C
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

---

## キャッシング戦略

### LocalStorageを使ったキャッシング

```typescript
class WeatherCache {
  private storageKey = 'weather_cache';
  private cacheTime: number;

  constructor(cacheTime: number = 3600000) { // デフォルト1時間
    this.cacheTime = cacheTime;
  }

  getCache(key: string): any {
    try {
      const cached = localStorage.getItem(`${this.storageKey}_${key}`);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > this.cacheTime) {
        localStorage.removeItem(`${this.storageKey}_${key}`);
        return null;
      }
      return data;
    } catch (err) {
      console.error('Cache retrieval error:', err);
      return null;
    }
  }

  setCache(key: string, data: any): void {
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(
        `${this.storageKey}_${key}`,
        JSON.stringify(cacheData)
      );
    } catch (err) {
      console.error('Cache storage error:', err);
    }
  }

  clearCache(key: string): void {
    localStorage.removeItem(`${this.storageKey}_${key}`);
  }

  clearAllCache(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(this.storageKey)) {
        localStorage.removeItem(key);
      }
    });
  }
}

// フックでの使用
const useWeatherWithCache = (
  latitude: number,
  longitude: number,
  cacheTime: number = 3600000
) => {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cache = new WeatherCache(cacheTime);

  useEffect(() => {
    const fetchWeather = async () => {
      const cacheKey = `${latitude}-${longitude}`;

      // キャッシュから取得
      const cachedData = cache.getCache(cacheKey);
      if (cachedData) {
        setWeather(cachedData);
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          daily: 'temperature_2m_max,temperature_2m_min',
          timezone: 'Asia/Tokyo',
        });

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params}`
        );
        const data = await response.json();

        cache.setCache(cacheKey, data);
        setWeather(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [latitude, longitude]);

  return {
    weather,
    loading,
    error,
    clearCache: () => cache.clearCache(`${latitude}-${longitude}`)
  };
};
```

---

## セキュリティ対応

### APIキー管理（OpenWeatherMap等使用時）

```typescript
// .env.local（Gitから除外）
// REACT_APP_OPENWEATHER_API_KEY=your_secret_key

// コンポーネント
const apiKey = process.env.REACT_APP_OPENWEATHER_API_KEY;

if (!apiKey) {
  throw new Error('API キーが設定されていません');
}
```

### CORS対応（Vite設定例）

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/weather': {
        target: 'https://api.openweathermap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/weather/, '/data/2.5'),
      },
    },
  },
});
```

---

## 料金体系

| API | 無料プラン | 有料プラン |
|-----|----------|----------|
| **Open-Meteo** | 10,000req/日（非商用） | $29/月（100万req/月） |
| **OpenWeatherMap** | 1,000req/日 | $200～/月 |
| **WeatherAPI.com** | 50req/日 | $25/月（10,000req/月）～ |
| **Tsukumijima** | 無制限 | なし |

---

## 実装チェックリスト

### 基本機能
- [ ] APIの選択と確認
- [ ] 基本的なフェッチ機能の実装
- [ ] エラーハンドリングの実装
- [ ] ローディング状態の管理

### 拡張機能
- [ ] キャッシング機能
- [ ] リトライ機能
- [ ] 複数地点の管理
- [ ] 更新間隔の設定

### UI/UX
- [ ] 天気アイコンの表示
- [ ] レスポンシブデザイン対応
- [ ] ダークモード対応
- [ ] アクセシビリティ対応

### パフォーマンス
- [ ] リクエスト制限への対応
- [ ] キャッシング効率の確認
- [ ] バンドル サイズの最適化
- [ ] 遅延読み込みの検討

### テスト
- [ ] ユニットテストの作成
- [ ] E2Eテストの作成
- [ ] エラーケースのテスト
- [ ] パフォーマンステスト

### デプロイ
- [ ] 環境変数の設定
- [ ] APIキーの安全な管理
- [ ] 本番環境での動作確認
- [ ] ドキュメントの更新

---

## 参考資料

- [Open-Meteo API Documentation](https://open-meteo.com/)
- [OpenWeatherMap API](https://openweathermap.org/api)
- [WeatherAPI.com Documentation](https://www.weatherapi.com/docs/)
- [Tsukumijima Weather API](https://weather.tsukumijima.net/)
- [React Hooks - Official Documentation](https://react.dev/reference/react)
- [Fetch API - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

---

**最終推奨**: **Open-Meteo** を使用した実装を推奨します。

