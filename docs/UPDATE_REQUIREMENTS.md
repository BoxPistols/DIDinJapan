# DIDデータ最新化 要件定義

## 概要

現在のデータ（平成22年/2010年）を令和2年（2020年）国勢調査データに更新する。

## 現状

- データ年次: 平成22年（2010年）
- ファイル形式: GeoJSON
- 座標系: EPSG:4326
- ファイル数: 47都道府県

## 目標

- データ年次: 令和2年（2020年）
- ファイル形式: GeoJSON（現行維持）
- 座標系: EPSG:4326（現行維持）

## データソース

| ソース | URL | 形式 |
|--------|-----|------|
| e-Stat 統計地理情報システム | https://www.e-stat.go.jp/gis | Shapefile |
| G空間情報センター | https://www.geospatial.jp/ckan/dataset/soumu-r2-did | Shapefile |

## 作業手順

1. **データ取得**
   - G空間情報センターまたはe-Statから令和2年DIDデータをダウンロード
   - 47都道府県分を取得

2. **データ変換**
   - Shapefile → GeoJSON変換（ogr2ogr使用）
   - 座標系変換: JGD2011 → EPSG:4326

3. **ファイル配置**
   - 命名規則: `r02_did_XX_prefecture.geojson`
   - 配置先: `GeoJSON/`

4. **検証**
   - 座標系の確認
   - ファイル整合性チェック
   - サンプル表示による目視確認

5. **旧データの扱い**
   - `GeoJSON/archive/h22/` に移動、または別ブランチで保持

## 必要ツール

- GDAL/OGR（ogr2ogr）
- Python + geopandas（オプション）

## 備考

- 次回更新: 令和7年（2025年）国勢調査後
