# データ配布・利用ガイド

このドキュメントでは、DID-J26プロジェクトで使用している地理データを他のプロジェクトで利用する方法を説明します。

---

## 📋 目次

- [データソース一覧](#データソース一覧)
- [データの公式性と信頼性](#データの公式性と信頼性)
- [ファイル配置マップ](#ファイル配置マップ)
- [他プロジェクトでの利用方法](#他プロジェクトでの利用方法)
- [データ更新手順](#データ更新手順)
- [ライセンス・出典表示](#ライセンス出典表示)
- [API化する場合の設計案](#api化する場合の設計案)
- [パフォーマンス比較](#パフォーマンス比較)

---

## データソース一覧

### ✅ 公式データ（政府機関提供）

| データ名 | 提供元 | 公式URL | 更新周期 | 信頼性 |
|---------|--------|---------|---------|--------|
| **人口集中地区（DID）** | e-Stat（総務省統計局） | [e-Stat](https://www.e-stat.go.jp/) | 5年ごと | 🔴 最高 |
| **空港敷地（C28）** | 国土数値情報（国土交通省） | [空港データ](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P13.html) | 年1回 | 🔴 最高 |
| **空港周辺空域（A32）** | 国土数値情報（国土交通省） | [進入表面等](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A32.html) | 年1回 | 🔴 最高 |
| **地理院地図タイル** | 国土地理院 | [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html) | 随時 | 🔴 最高 |

### ⚠️ 参考データ（加工・補助データ）

| データ名 | ソース | 用途 | 注意事項 |
|---------|--------|------|---------|
| **飛行禁止区域（赤）** | 手動作成 | 国家重要施設周辺（小型無人機等飛行禁止法） | 参考情報・公式データではない |
| **飛行禁止区域（黄）** | 手動作成 | 注意エリア | 参考情報・公式データではない |
| **施設データ** | OSM/自治体オープンデータ | 駐屯地・消防署・医療機関 | 参考情報・位置精度に限界あり |

---

## データの公式性と信頼性

### 🎯 エンジニア組織が重視すべきポイント

#### 1. **DIDデータは最新の正確な公式データか？**

**✅ YES - e-Stat（政府統計の総合窓口）から直接取得**

- **データソース**: 令和2年（2020年）国勢調査
- **提供元**: 総務省統計局
- **取得方法**: e-Stat APIから自動ダウンロード（`scripts/download_did_2020.py`）
- **変換処理**: 公式Shapefile → GeoJSON（`scripts/convert_did_2020.js`）
- **座標系**: JGD2011 → WGS84（測地系変換済み）
- **データ精度**: 国勢調査に基づく統計境界（最高精度）

**検証方法:**
```bash
# 元データと比較検証
python3 scripts/download_did_2020.py --verify
npm run convert:did -- --verify
```

#### 2. **空港空域も同様に、自作ではなく正確なデータか？**

**✅ YES - 国土数値情報（国土交通省）から直接取得**

- **データソース**: 国土数値情報 P13（空港データ）、A32（進入表面等）
- **提供元**: 国土交通省
- **データ内容**: C28（空港敷地）の公式ポリゴン
- **更新頻度**: 年1回（国土数値情報の更新に準拠）

**空港データに含まれる公式情報:**
- `C28_005`: 空港名
- `C28_006`: 設置者区分
- `C28_012`: 滑走路長（m）
- `C28_013`: 滑走路幅（m）
- その他詳細仕様（国土数値情報 P13 仕様書準拠）

**⚠️ 注意:**
- 空港周辺空域の詳細な進入表面等は、国土地理院の空域タイル（ラスタータイル）を併用
- 自作データは一切含まない

---

## ファイル配置マップ

### プロジェクト構造

```
DIDinJapan/
├── public/
│   ├── GeoJSON/
│   │   ├── 2020/                          # ✅ DID公式データ（令和2年）
│   │   │   ├── r02_did_01_hokkaido.geojson
│   │   │   ├── r02_did_13_tokyo.geojson
│   │   │   ├── ...
│   │   │   └── r02_did_47_okinawa.geojson  # 全47都道府県
│   │   │
│   │   ├── 2024/                          # ✅ 地形データ
│   │   │   └── noto_2024_elevation.geojson # 能登半島地震後地形
│   │   │
│   │   └── airports/                      # ✅ 空港公式データ
│   │       └── airport_surfaces.geojson   # 国土数値情報 C28
│   │
│   └── data/
│       ├── no_fly_red.geojson             # ⚠️ 参考データ（手動作成）
│       ├── no_fly_yellow.geojson          # ⚠️ 参考データ（手動作成）
│       └── facilities/                    # ⚠️ 参考データ（OSM/自治体）
│           ├── military_bases.geojson
│           ├── fire_stations.geojson
│           ├── medical_facilities.geojson
│           └── landing_sites.geojson
│
├── scripts/
│   ├── download_did_2020.py               # DID自動ダウンロード
│   ├── convert_did_2020.js                # DID GeoJSON変換
│   └── convert_airport_data.js            # 空港データ変換
│
└── docs/
    ├── DID_DATA_UPDATE_GUIDE.md           # DID更新手順
    └── DATA_DISTRIBUTION_GUIDE.md         # 本ドキュメント
```

### データファイルサイズ一覧

| ファイルパス | サイズ | 備考 |
|-------------|--------|------|
| `public/GeoJSON/2020/r02_did_13_tokyo.geojson` | ~500KB | 東京都DID |
| `public/GeoJSON/2020/r02_did_*.geojson` (全47) | ~15MB | 全国DID |
| `public/GeoJSON/airports/airport_surfaces.geojson` | 107KB | 全国空港敷地 |
| `public/data/no_fly_red.geojson` | 2.1KB | 参考データ |
| `public/data/no_fly_yellow.geojson` | 2.6KB | 参考データ |

---

## 他プロジェクトでの利用方法

### 方法1: Git Submodule（推奨）

**メリット:**
- データの出典が明確（Git履歴で追跡可能）
- 更新時は `git submodule update` で最新化
- ライセンス・出典表示が自動的に継承される

**セットアップ:**

```bash
# 新規プロジェクトでSubmoduleとして追加
cd your-project
git submodule add https://github.com/BoxPistols/DID-J26.git data-source

# データファイルへのシンボリックリンク作成
ln -s data-source/public/GeoJSON public/geojson

# 更新時
git submodule update --remote
```

**使用例（React/Next.js）:**

```typescript
import tokyoDID from './data-source/public/GeoJSON/2020/r02_did_13_tokyo.geojson'

// MapLibre GL JSで読み込み
map.addSource('tokyo-did', {
  type: 'geojson',
  data: tokyoDID
})
```

---

### 方法2: 直接ダウンロード

**公開URLから直接取得:**

```bash
# 東京都DID
wget https://raw.githubusercontent.com/BoxPistols/DID-J26/main/public/GeoJSON/2020/r02_did_13_tokyo.geojson

# 空港敷地
wget https://raw.githubusercontent.com/BoxPistols/DID-J26/main/public/GeoJSON/airports/airport_surfaces.geojson

# 全都道府県を一括取得
for i in {01..47}; do
  wget https://raw.githubusercontent.com/BoxPistols/DID-J26/main/public/GeoJSON/2020/r02_did_${i}_*.geojson
done
```

**ランタイムで動的読み込み:**

```typescript
// フロントエンドで動的読み込み
const response = await fetch(
  'https://raw.githubusercontent.com/BoxPistols/DID-J26/main/public/GeoJSON/2020/r02_did_13_tokyo.geojson'
)
const tokyoDID = await response.json()

map.addSource('tokyo-did', {
  type: 'geojson',
  data: tokyoDID
})
```

---

### 方法3: npm パッケージ化（今後の実装予定）

**設計案:** `docs/npm_package_plan.md` 参照

```bash
# インストール（将来）
npm install @did-j26/data
```

```typescript
import { DIDData, AirportData } from '@did-j26/data'

// 全国DID取得
const allDID = DIDData.getAll()

// 都道府県別
const tokyoDID = DIDData.getByPrefecture('13') // 東京都
const osakaOID = DIDData.getByPrefecture('27') // 大阪府

// 空港データ
const airports = AirportData.getAll()
const narita = AirportData.getByName('成田国際空港')
```

---

### 方法4: 自組織で最新データを取得

**変換スクリプトを自組織で実行:**

```bash
# 1. このリポジトリをクローン
git clone https://github.com/BoxPistols/DID-J26.git
cd DID-J26

# 2. 依存関係インストール
npm install

# 3. 最新DIDデータをe-Statから取得
npm run download:did

# 4. GeoJSON変換
npm run convert:did

# 5. 変換済みファイルを自組織のプロジェクトにコピー
cp public/GeoJSON/2020/*.geojson /path/to/your-project/data/
```

**詳細手順:** `docs/DID_DATA_UPDATE_GUIDE.md` 参照

---

## データ更新手順

### DIDデータの更新（5年ごと）

次回更新: **2025年国勢調査**（データ公開は2026-2027年予定）

**更新手順:**

1. **e-Stat APIのURL更新**
   ```python
   # scripts/download_did_2020.py
   SURVEY_ID = "D002005112025"  # 2020 → 2025
   ```

2. **自動ダウンロード実行**
   ```bash
   npm run download:did
   ```

3. **GeoJSON変換**
   ```bash
   npm run convert:did
   ```

4. **検証**
   ```bash
   # ファイル数確認（47都道府県）
   ls public/GeoJSON/2025/*.geojson | wc -l

   # 座標系確認（WGS84であること）
   jq '.crs' public/GeoJSON/2025/r02_did_13_tokyo.geojson
   ```

### 空港データの更新（年1回）

**更新手順:**

1. **国土数値情報から最新データダウンロード**
   - URL: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P13.html
   - Shape形式を選択

2. **GeoJSON変換**
   ```bash
   # rawdata/airports/ に配置後
   npm run convert:airport
   ```

3. **出力確認**
   ```bash
   # プロパティ確認
   jq '.features[0].properties' public/GeoJSON/airports/airport_surfaces.geojson
   ```

---

## ライセンス・出典表示

### DIDデータ

**ライセンス:** [e-Stat利用規約](https://www.e-stat.go.jp/terms-of-use)

**利用条件:**
- ✅ 自由利用可能（複製、公衆送信、翻訳・変形等）
- ✅ 商用利用可能
- ✅ 出典表示必須

**出典表示テンプレート:**

```
出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）
「人口集中地区」（令和2年国勢調査）データを加工して作成
```

**HTMLでの表示例:**

```html
<div class="data-attribution">
  出典：<a href="https://www.e-stat.go.jp/">政府統計の総合窓口(e-Stat)</a><br>
  「人口集中地区」（令和2年国勢調査）データを加工して作成
</div>
```

### 空港データ

**ライセンス:** [国土数値情報利用規約](https://nlftp.mlit.go.jp/ksj/other/yakkan.html)

**出典表示テンプレート:**

```
出典：国土交通省「国土数値情報（空港データ）」
（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P13.html）
```

### 地理院タイル

**ライセンス:** [国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)

**出典表示テンプレート:**

```
地理院タイル：国土地理院
（https://maps.gsi.go.jp/development/ichiran.html）
```

---

## API化する場合の設計案

### パフォーマンス・コスト分析

バックエンドエンジニアが検討している「AWS + API」方式と、現行の静的配置を比較します。

#### 静的配置（現行）

**メリット:**
- ⚡ **高速**: CDN配信で世界中から低レイテンシ
- 💰 **低コスト**: GitHub Pages / Vercel / Netlify は無料枠で十分
- 🔒 **キャッシュ**: ブラウザ・CDNキャッシュで2回目以降は即座に表示
- 📦 **シンプル**: サーバーレス不要

**デメリット:**
- ❌ **更新**: 再ビルド・デプロイが必要
- ❌ **動的フィルタ**: サーバーサイドフィルタリング不可

**推奨用途:**
- DIDデータ（5年に1回の更新）
- 空港データ（年1回の更新）
- 地形データ（更新頻度が低い）

---

#### AWS + API方式

**アーキテクチャ例:**

```
┌─────────────┐
│  Frontend   │
│  (React)    │
└──────┬──────┘
       │ API Request
       ↓
┌─────────────────────┐
│  API Gateway        │
│  + Lambda           │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│  S3 Bucket          │
│  (GeoJSON Storage)  │
└─────────────────────┘
```

**メリット:**
- ✅ **動的更新**: データ更新時、即座に反映
- ✅ **動的フィルタ**: 「東京都のDIDのみ」など、サーバーサイドで軽量化
- ✅ **認証**: API Key / Cognitoで利用制限可能

**デメリット:**
- 💰 **コスト**: Lambda + API Gateway + S3 で月$10-50（トラフィック次第）
- 🐌 **レイテンシ**: Cold Startで初回300-500ms
- 🛠️ **複雑性**: インフラ管理が必要

**推奨用途:**
- リアルタイム気象データ（OpenWeatherMap API）
- NOTAM情報（航空情報・日次更新）
- ユーザー個別の飛行計画データ

---

### ハイブリッド方式（推奨）

**設計:**

| データ種別 | 配信方式 | 理由 |
|-----------|---------|------|
| **DID** | 静的配置（CDN） | 5年に1回の更新・全国で15MB程度 |
| **空港** | 静的配置（CDN） | 年1回の更新・107KB |
| **地形** | 静的配置（CDN） | 更新頻度低い |
| **気象** | API（AWS Lambda） | リアルタイム性が必要 |
| **NOTAM** | API（AWS Lambda） | 日次更新・リアルタイム性が必要 |
| **ユーザーデータ** | API（AWS Lambda + RDS） | 個別データ・認証必要 |

**実装例:**

```typescript
// 静的データ（CDN）
import tokyoDID from './public/GeoJSON/2020/r02_did_13_tokyo.geojson'

// 動的データ（API）
const weather = await fetch('https://api.your-backend.com/weather?lat=35.6&lon=139.7')
  .then(r => r.json())

// 地図に両方を表示
map.addSource('did', { type: 'geojson', data: tokyoDID })
map.addSource('weather', { type: 'geojson', data: weather })
```

---

### API実装例（参考）

**Lambda関数（Node.js）:**

```javascript
// lambda/getDID.js
const AWS = require('aws-sdk')
const s3 = new AWS.S3()

exports.handler = async (event) => {
  const { prefecture } = event.queryStringParameters

  // S3からGeoJSON取得
  const params = {
    Bucket: 'did-data-bucket',
    Key: `2020/r02_did_${prefecture}_*.geojson`
  }

  const data = await s3.getObject(params).promise()
  const geojson = JSON.parse(data.Body.toString())

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400' // 1日キャッシュ
    },
    body: JSON.stringify(geojson)
  }
}
```

**CloudFormation / SAM テンプレート:**

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  DIDDataBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: did-data-bucket
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        IgnorePublicAcls: true

  GetDIDFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: lambda/
      Handler: getDID.handler
      Runtime: nodejs18.x
      Timeout: 10
      Environment:
        Variables:
          BUCKET_NAME: !Ref DIDDataBucket
      Events:
        GetDID:
          Type: Api
          Properties:
            Path: /did
            Method: get

Outputs:
  ApiEndpoint:
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/did'
```

**デプロイ:**

```bash
sam build
sam deploy --guided
```

---

## パフォーマンス比較

### 実測値（想定）

| 項目 | 静的配置（CDN） | AWS Lambda API |
|------|----------------|---------------|
| **初回ロード** | 50-100ms | 300-500ms（Cold Start） |
| **2回目以降** | 0ms（キャッシュ） | 50-100ms（Warm） |
| **データサイズ** | 15MB（全国DID） | 同左 |
| **月間コスト** | $0（GitHub Pages） | $10-50（Lambda + S3） |
| **CDN配信** | ✅ GitHub CDN | ⚠️ CloudFront必要 |
| **キャッシュ制御** | ✅ ブラウザ自動 | ⚠️ 実装必要 |

### 結論

**DID・空港データのような静的な公式データは、現行の静的配置が最適です。**

**理由:**
1. **更新頻度が低い**（5年・1年に1回）
2. **データサイズが軽量**（全国で15MB程度）
3. **CDN配信で高速**
4. **コストゼロ**
5. **キャッシュ効率が高い**

**API化すべきデータ:**
- リアルタイム気象データ
- NOTAM（日次更新）
- ユーザー個別データ

---

## データ品質保証

### 検証スクリプト

**座標系検証:**

```bash
# WGS84 (EPSG:4326) であることを確認
jq -r '.crs.properties.name' public/GeoJSON/2020/*.geojson | sort -u
# 期待値: "urn:ogc:def:crs:OGC:1.3:CRS84" または null（デフォルトWGS84）
```

**プロパティ検証:**

```bash
# DIDデータの必須プロパティ確認
jq '.features[0].properties | keys' public/GeoJSON/2020/r02_did_13_tokyo.geojson
# 期待値: ["都道府県コード", "市区町村コード", "DID名", "人口", ...]
```

**ジオメトリ検証:**

```bash
# Polygon/MultiPolygon であることを確認
jq -r '.features[].geometry.type' public/GeoJSON/2020/r02_did_13_tokyo.geojson | sort -u
# 期待値: "Polygon" または "MultiPolygon"
```

### CI/CD検証

**GitHub Actions で自動検証:**

```yaml
# .github/workflows/data-validation.yml
name: Data Validation

on:
  push:
    paths:
      - 'public/GeoJSON/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Validate GeoJSON
        run: |
          npm install -g geojsonhint
          geojsonhint public/GeoJSON/2020/*.geojson

      - name: Check Coordinate System
        run: |
          # WGS84確認
          for file in public/GeoJSON/2020/*.geojson; do
            crs=$(jq -r '.crs.properties.name // "WGS84"' "$file")
            echo "$file: $crs"
          done
```

---

## FAQ

### Q1: なぜAWS + APIではなく静的配置なのか？

**A:** DIDデータは以下の特性があるため、静的配置が最適です：

- **更新頻度**: 5年に1回（国勢調査）
- **データサイズ**: 全国で15MB程度（軽量）
- **リアルタイム性不要**: 統計データのため即時性不要
- **キャッシュ効率**: ブラウザキャッシュで2回目以降は0ms
- **コスト**: GitHub Pages / Vercel で完全無料

API化が必要なのは、リアルタイム気象データやNOTAMなど**日次・時間単位で更新されるデータ**です。

### Q2: データの更新はどうやって検知するのか？

**A:** 以下の方法で最新データを監視できます：

1. **e-Stat更新通知**
   - e-Statメールマガジン登録
   - 国勢調査実施年（5年ごと）に自動通知

2. **国土数値情報更新ページ**
   - https://nlftp.mlit.go.jp/ksj/
   - 更新履歴ページを定期確認

3. **GitHub Actions スケジューラ**（自動化）
   ```yaml
   on:
     schedule:
       - cron: '0 0 1 * *'  # 毎月1日にチェック
   ```

### Q3: 他のプロジェクトでライセンス違反しないためには？

**A:** 以下を必ず実施してください：

1. **出典表示を必ず記載**（e-Stat利用規約）
2. **データの改変内容を明記**（Shapefile → GeoJSON変換など）
3. **商用利用の場合も出典表示必須**
4. **再配布時もライセンス・出典を継承**

### Q4: データの精度はどれくらいか？

**A:**

- **DID**: 国勢調査の統計境界（最高精度・公式データ）
- **空港**: 国土数値情報（±数m・公式データ）
- **飛行禁止区域**: 手動作成（参考情報・精度保証なし）

**実用上の注意:**
- 実際の飛行可否は必ずDIPS・NOTAMで最新確認
- DIDは統計データのため、最新の市街地変化とずれる場合あり

---

## 関連ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [DID_DATA_UPDATE_GUIDE.md](./DID_DATA_UPDATE_GUIDE.md) | DIDデータの更新手順 |
| [npm_package_plan.md](./npm_package_plan.md) | npmパッケージ化計画 |
| [COLLISION_DETECTION_SPEC.md](./COLLISION_DETECTION_SPEC.md) | 衝突判定仕様 |
| [PROJECT_REQUIREMENTS.md](./PROJECT_REQUIREMENTS.md) | プロジェクト要件 |

---

## 参考リンク

### 公式データソース

- [e-Stat（政府統計の総合窓口）](https://www.e-stat.go.jp/)
- [国土数値情報（国土交通省）](https://nlftp.mlit.go.jp/ksj/)
- [国土地理院 地理院地図](https://maps.gsi.go.jp/)

### ライセンス・利用規約

- [e-Stat利用規約](https://www.e-stat.go.jp/terms-of-use)
- [国土数値情報利用規約](https://nlftp.mlit.go.jp/ksj/other/yakkan.html)
- [国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)

### 技術資料

- [GeoJSON仕様（RFC 7946）](https://tools.ietf.org/html/rfc7946)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)

---

**最終更新:** 2026-01-18
**作成者:** DID-J26 Development Team
**バージョン:** 1.0.0
