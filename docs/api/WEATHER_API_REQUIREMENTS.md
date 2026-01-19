# 天気予報機能 概要

**詳細仕様**: Storybook → `API/15_天気予報API仕様` を参照

---

## 概要

日本全国47都道府県の天気予報を表示する機能。Open-Meteo APIを使用し、完全無料・認証不要で動作。

## 機能一覧

| 機能 | ショートカット | 説明 |
|------|:---:|------|
| 天気予報クリックモード | `W` | 地図クリックで天気ポップアップ表示 |
| 雨雲レーダー | `C` | リアルタイム雨雲オーバーレイ |
| 詳細予報パネル | - | 48時間予報 + 7日間週間予報 |

## 使用API

| API | 用途 | 料金 | 認証 |
|-----|------|------|------|
| Open-Meteo | 天気予報（47都道府県） | 無料 | 不要 |
| RainViewer | 雨雲レーダー | 無料 | 不要 |

## ファイル構成

```
src/
├── lib/services/
│   ├── weatherApi.ts      # Open-Meteo API連携
│   └── rainViewer.ts      # RainViewer API連携
└── components/weather/
    └── WeatherForecastPanel.tsx
```

## 詳細情報

Storybook ドキュメントを参照:
- **天気予報API仕様**: `API/15_天気予報API仕様`
- **サービスAPI**: `API/Services`
- **使用例**: `Examples/MapIntegration`
