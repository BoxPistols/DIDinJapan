# 地図データエクスポートガイド

## 概要

本ドキュメントは、DID-J26アプリケーションの地図データを他のドローン飛行計画アプリケーションへ移植する際の参照資料です。

---

## 1. エクスポート対象ファイル一覧

### 1.1 GeoJSONデータ（静的ファイル）

| パス | 内容 | サイズ |
|------|------|--------|
| `public/GeoJSON/2020/` | 全47都道府県DID（人口集中地区） | 約59MB |
| `public/GeoJSON/airports/airport_surfaces.geojson` | 空港敷地データ | 111KB |
| `public/GeoJSON/2024/noto_2024_elevation.geojson` | 能登半島地形（2024年） | 5.5KB |
| `public/data/no_fly_red.geojson` | 飛行禁止区域（レッドゾーン） | 2.2KB |
| `public/data/no_fly_yellow.geojson` | 飛行禁止区域（イエローゾーン） | 2.7KB |
| `public/data/facilities/` | 施設データ（4ファイル） | 任意 |

### 1.2 設定ファイル

| パス | 内容 |
|------|------|
| `src/lib/config/baseMaps.ts` | ベースマップ定義（OSM、地理院、航空写真） |
| `src/lib/config/layers.ts` | DIDレイヤー設定、都道府県カラー定義 |
| `src/lib/config/overlays.ts` | オーバーレイ設定（地形、気象、禁止区域） |
| `src/lib/config/facilities.ts` | 施設レイヤー設定 |

### 1.3 サービス・ユーティリティ

| パス | 内容 |
|------|------|
| `src/lib/services/airports.ts` | 主要空港座標・半径データ（MAJOR_AIRPORTS配列） |
| `src/lib/services/noFlyZones.ts` | 飛行禁止区域生成ロジック |
| `src/lib/services/elevationService.ts` | 国土地理院高度情報取得 |
| `src/lib/utils/geo.ts` | 地理計算関数（距離、座標変換等） |
| `src/lib/types.ts` | TypeScript型定義 |

---

## 2. データソースと出典表示義務

### 2.1 ライセンス要件

| データ | ソース | ライセンス | 出典表示 |
|--------|--------|------------|----------|
| DID（人口集中地区） | e-Stat（政府統計の総合窓口） | CC BY 4.0 | **必須** |
| 空港敷地 | 国土数値情報（国土交通省） | CC BY 4.0 | **必須** |
| 地理院タイル | 国土地理院 | 利用規約に準拠 | **必須** |
| 気象データ | OpenWeatherMap / RainViewer | 各サービス規約 | 要確認 |

### 2.2 出典表示例

```
本アプリケーションは以下のデータを使用しています：
- 人口集中地区データ：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）
- 空港敷地データ：国土交通省 国土数値情報
- 地図タイル：国土地理院
```

---

## 3. AWS S3 + CloudFlare 運用時の注意事項

### 3.1 推奨ディレクトリ構成

```
s3-bucket/
├── geojson/
│   ├── did/
│   │   └── 2020/
│   │       ├── 01_hokkaido.geojson
│   │       ├── 02_aomori.geojson
│   │       └── ... (47ファイル)
│   ├── airports/
│   │   └── surfaces.geojson
│   └── restrictions/
│       ├── red.geojson
│       └── yellow.geojson
├── config/
│   ├── base-maps.json
│   ├── layers.json
│   └── airports.json          ← MAJOR_AIRPORTSをJSON化
└── meta/
    └── version.json           ← バージョン管理用
```

### 3.2 CORS設定

S3バケットに以下のCORSポリシーを設定すること：

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-app.com", "https://*.your-domain.com"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length"],
      "MaxAgeSeconds": 86400
    }
  ]
}
```

### 3.3 キャッシュ戦略

| データ種別 | 推奨Cache-Control | 理由 |
|-----------|-------------------|------|
| DID（2020年版） | `max-age=31536000` (1年) | 国勢調査は5年ごと更新 |
| 空港敷地 | `max-age=2592000` (30日) | 稀に更新あり |
| 飛行禁止区域 | `max-age=86400` (1日) | 臨時TFR等の変動あり |
| 設定ファイル | `max-age=3600` (1時間) | 運用に応じて調整 |

### 3.4 ファイルサイズ最適化

| 手法 | 効果 | 備考 |
|------|------|------|
| gzip圧縮 | 60-70%削減 | CloudFlareで自動対応可 |
| TopoJSON変換 | 50-70%削減 | クライアント側で変換処理必要 |
| 都道府県別分割 | 初期ロード削減 | オンデマンドロード実装必要 |

---

## 4. 技術仕様

### 4.1 座標系

- **座標参照系**: WGS84 (EPSG:4326)
- **フォーマット**: GeoJSON (RFC 7946準拠)

### 4.2 主要空港データ構造

`airports.ts`内の`MAJOR_AIRPORTS`配列をJSON化する場合の構造：

```json
{
  "airports": [
    {
      "id": "NRT",
      "name": "成田国際空港",
      "coordinates": [140.3929, 35.772],
      "radiusKm": 24,
      "type": "international"
    },
    {
      "id": "HND",
      "name": "東京国際空港（羽田）",
      "coordinates": [139.7798, 35.5494],
      "radiusKm": 24,
      "type": "international"
    }
  ]
}
```

### 4.3 DIDファイル命名規則

```
r02_did_{都道府県コード}_{都道府県名}.geojson

例：
r02_did_01_hokkaido.geojson
r02_did_13_tokyo.geojson
r02_did_47_okinawa.geojson
```

---

## 5. 移植時のチェックリスト

### 5.1 必須作業

- [ ] GeoJSONファイルをS3にアップロード
- [ ] CORS設定を適用
- [ ] 出典表示をアプリケーションに追加
- [ ] MAJOR_AIRPORTS配列をJSON化してアップロード

### 5.2 推奨作業

- [ ] CloudFlareキャッシュルール設定
- [ ] gzip圧縮の有効化確認
- [ ] バージョン管理用meta/version.jsonの作成
- [ ] ヘルスチェック用エンドポイントの設定

### 5.3 確認事項

- [ ] 座標系がWGS84であることを確認
- [ ] 既存アプリとの座標系整合性を確認
- [ ] 各データのライセンス要件を確認
- [ ] 転送量・コスト見積もりを実施

---

## 6. データ更新時の対応

### 6.1 DIDデータ更新（5年周期）

次回更新予定：2025年国勢調査データ公開後（2026-2027年頃）

更新手順：
1. e-Statから新データをダウンロード
2. GeoJSON形式に変換
3. S3にアップロード（新バージョンディレクトリ）
4. version.jsonを更新
5. クライアントアプリの参照先を更新

### 6.2 臨時飛行禁止区域（TFR）

運用上、飛行禁止区域は動的に変更される可能性があるため、
API経由でのリアルタイム更新機能の検討を推奨。

---

## 7. 問い合わせ先

データ内容に関する質問は、DID-J26リポジトリのIssueにて受付。

---

**ドキュメント作成日**: 2026年1月19日
**対象リポジトリ**: DID-J26
**データ基準日**: 2020年国勢調査（DID）、2024年（能登地形）
