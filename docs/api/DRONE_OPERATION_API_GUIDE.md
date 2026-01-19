# ドローン運用統合APIガイド

**詳細仕様**: Storybook → `API/15_天気予報API仕様` を参照

---

## 概要

日本国内でドローン（無人航空機）を安全かつ適切に運用するために必要な情報を、完全無料の公開APIから取得・統合するシステム。

## 必須情報

| 情報 | API | 用途 |
|------|-----|------|
| 天気予報（風速・降水） | 気象庁メッシュ | 飛行安全性判定 |
| 電波状況 | LTEカバレッジ | リモートID・遠隔操縦 |
| 日没時間 | Sunrise-Sunset.org | 法的飛行可能時間帯 |

**実装コスト**: **¥0**（全API完全無料）

---

## 飛行安全判定ルール

```typescript
canFly = true
  && windSpeed < 10      // 風速10m/s未満
  && precipitation <= 50 // 降水確率50%以下
  && hasLTE              // LTE通信圏内
  && isDaylight          // 民間薄明時間内
```

## 安全レベル

| レベル | 色 | 説明 |
|--------|-----|------|
| `safe` | 🟢 | 安全に飛行可能 |
| `caution` | 🟡 | 注意が必要 |
| `warning` | 🟠 | 警告 |
| `danger` | 🔴 | 危険 |
| `prohibited` | ⛔ | 飛行禁止 |

## 風速基準

| 風速 (m/s) | レベル | 判定 |
|:---:|:---:|:---|
| 0 - 2 | safe | 安全（良好） |
| 2 - 5 | caution | 注意（飛行可能） |
| 5 - 10 | warning | 警告（操縦難化） |
| 10+ | danger | 危険（飛行不可） |

---

## ファイル構成

```
src/lib/
├── services/
│   ├── jmaMesh.ts           # 気象庁メッシュAPI
│   ├── sunriseSunset.ts     # 日没時刻API
│   ├── networkCoverage.ts   # LTEカバレッジ
│   ├── weatherApi.ts        # Open-Meteo（都道府県予報）
│   └── rainViewer.ts        # 雨雲レーダー
├── hooks/
│   ├── useWeatherMesh.ts    # 気象データ
│   ├── useFlightWindow.ts   # 飛行可能時間帯
│   ├── useNetworkCoverage.ts # 通信状況
│   └── useOperationSafety.ts # 統合安全判定
└── utils/
    └── meshCodeConverter.ts  # メッシュコード変換
```

---

## 使用例

```typescript
import { useOperationSafety, getSafetyLevelColor } from 'japan-drone-map'

function FlightCheck({ lat, lng, meshCode }) {
  const safety = useOperationSafety(lat, lng, meshCode)

  if (safety.loading) return <div>安全確認中...</div>

  return (
    <div style={{ backgroundColor: getSafetyLevelColor(safety.safetyLevel) }}>
      {safety.canFly ? '✓ 飛行可能' : '✗ 飛行不可'}
      <ul>
        {safety.reasons.map((r, i) => <li key={i}>{r.message}</li>)}
      </ul>
    </div>
  )
}
```

---

## 実装ステータス

### ✅ 実装完了

- **サービス層**: jmaMesh, sunriseSunset, networkCoverage
- **フック層**: useWeatherMesh, useFlightWindow, useNetworkCoverage, useOperationSafety
- **UI**: SafetyIndicator, FlightPlanChecker, DroneOperationDashboard
- **ユーティリティ**: meshCodeConverter（17テスト合格）

### 今後の改善予定

- [ ] 実際のJMA API連携（現在はモック）
- [ ] ユーザー報告LTEデータ収集機能
- [ ] 地図オーバーレイレイヤー追加

---

## 詳細情報

Storybook ドキュメントを参照:
- **天気予報API仕様**: `API/15_天気予報API仕様`
- **サービスAPI**: `API/Services`
- **使用例**: `Examples/MapIntegration`

## 参考リンク

- [気象庁 気象データ高度利用ポータル](https://www.data.jma.go.jp/developer/index.html)
- [Sunrise-Sunset API](https://sunrise-sunset.org/api)
- [MLIT 無人航空機規制](https://www.mlit.go.jp/koku/koku_tk10_000003.html)
