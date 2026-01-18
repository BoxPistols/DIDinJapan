# DIDデータ更新ガイド

e-Stat（政府統計の総合窓口）から人口集中地区（DID）データを取得し、MapLibreで使用可能なGeoJSON形式に変換するまでの手順を記載します。

## 概要

| 項目 | 内容 |
|-----|------|
| データソース | e-Stat 統計地理情報システム |
| 対象データ | 国勢調査 人口集中地区（DID） |
| 入力形式 | シェープファイル（.shp） |
| 出力形式 | GeoJSON |
| 測地系 | JGD2011 → WGS84 |

## ディレクトリ構成

```
project/
├── rawdata/
│   └── 2020/              # ダウンロードしたzipファイル（.gitignore対象）
├── public/
│   └── GeoJSON/
│       └── 2020/          # 変換後のGeoJSON
└── scripts/
    ├── download_did_2020.py   # ダウンロードスクリプト
    └── convert_did_2020.js    # 変換スクリプト
```

## 手順

### 1. ダウンロード

```bash
npm run download:did
```

または直接実行：

```bash
python3 scripts/download_did_2020.py
```

**処理内容:**
- e-Statから47都道府県分のDIDシェープファイルをダウンロード
- 保存先: `rawdata/2020/did_2020_XX.zip`
- 既存ファイルはスキップ
- サーバー負荷軽減のため3秒間隔で取得

### 2. GeoJSON変換

```bash
npm run convert:did
```

**処理内容:**
- `rawdata/2020/` 内のzipファイルを解凍
- mapshaperでシェープファイルをGeoJSONに変換
- 出力先: `public/GeoJSON/2020/r02_did_XX_prefecture.geojson`

## e-Stat API仕様

### ダウンロードURL構造

```
https://www.e-stat.go.jp/gis/statmap-search/data?
  dlserveyId=D002005112020  # 調査ID（令和2年国勢調査）
  &code=XX                   # 都道府県コード（01-47）
  &coordSys=1                # 座標系（1: 世界測地系）
  &format=shape              # 形式（shape: シェープファイル）
  &downloadType=5            # ダウンロード種別
  &datum=2011                # 測地系（JGD2011）
```

### 調査ID一覧

| 年度 | 調査ID |
|-----|--------|
| 2020年（令和2年） | D002005112020 |
| 2015年（平成27年） | D002005112015 |
| 2010年（平成22年） | D002005112010 |

## 都道府県コード

| コード | 都道府県 | コード | 都道府県 | コード | 都道府県 |
|-------|---------|-------|---------|-------|---------|
| 01 | 北海道 | 17 | 石川 | 33 | 岡山 |
| 02 | 青森 | 18 | 福井 | 34 | 広島 |
| 03 | 岩手 | 19 | 山梨 | 35 | 山口 |
| 04 | 宮城 | 20 | 長野 | 36 | 徳島 |
| 05 | 秋田 | 21 | 岐阜 | 37 | 香川 |
| 06 | 山形 | 22 | 静岡 | 38 | 愛媛 |
| 07 | 福島 | 23 | 愛知 | 39 | 高知 |
| 08 | 茨城 | 24 | 三重 | 40 | 福岡 |
| 09 | 栃木 | 25 | 滋賀 | 41 | 佐賀 |
| 10 | 群馬 | 26 | 京都 | 42 | 長崎 |
| 11 | 埼玉 | 27 | 大阪 | 43 | 熊本 |
| 12 | 千葉 | 28 | 兵庫 | 44 | 大分 |
| 13 | 東京 | 29 | 奈良 | 45 | 宮崎 |
| 14 | 神奈川 | 30 | 和歌山 | 46 | 鹿児島 |
| 15 | 新潟 | 31 | 鳥取 | 47 | 沖縄 |
| 16 | 富山 | 32 | 島根 | | |

## トラブルシューティング

### ダウンロードが失敗する

- e-Statサーバーの混雑時はリトライが必要
- スクリプトを再実行すると、未取得分のみダウンロード

### 変換時にエラーが出る

- mapshaperがインストールされているか確認: `npm install`
- zipファイルが破損している場合は該当ファイルを削除して再ダウンロード

### 特定の県だけ再取得したい

```bash
# 例: 東京（13）を再取得
rm rawdata/2020/did_2020_13.zip
npm run download:did
npm run convert:did
```

## 参考リンク

- [e-Stat 統計地理情報システム](https://www.e-stat.go.jp/gis)
- [e-Stat 境界データダウンロード](https://www.e-stat.go.jp/gis/statmap-search?type=2)
- [国土数値情報 DIDデータ](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A16.html)
- [mapshaper](https://github.com/mbloch/mapshaper)

## ライセンス

DIDデータは[e-Stat利用規約](https://www.e-stat.go.jp/terms-of-use)に基づき利用可能です。

```
出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）
「人口集中地区」データを加工して作成
```
