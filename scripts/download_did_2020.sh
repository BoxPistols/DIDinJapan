#!/bin/bash

# DID（人口集中地区）2020年データダウンロード・変換スクリプト
#
# 必要なツール:
# - curl
# - unzip
# - ogr2ogr (GDAL)
#
# インストール方法:
# macOS: brew install gdal
# Ubuntu: sudo apt-get install gdal-bin

set -e

DOWNLOAD_DIR="./downloads/did_2020"
OUTPUT_DIR="./GeoJSON_2020"

# 都道府県コードと名前のマッピング
declare -A PREFS=(
  ["01"]="hokkaido"
  ["02"]="aomori"
  ["03"]="iwate"
  ["04"]="miyagi"
  ["05"]="akita"
  ["06"]="yamagata"
  ["07"]="fukushima"
  ["08"]="ibaraki"
  ["09"]="tochigi"
  ["10"]="gunma"
  ["11"]="saitama"
  ["12"]="chiba"
  ["13"]="tokyo"
  ["14"]="kanagawa"
  ["15"]="niigata"
  ["16"]="toyama"
  ["17"]="ishikawa"
  ["18"]="fukui"
  ["19"]="yamanashi"
  ["20"]="nagano"
  ["21"]="gifu"
  ["22"]="shizuoka"
  ["23"]="aichi"
  ["24"]="mie"
  ["25"]="shiga"
  ["26"]="kyoto"
  ["27"]="osaka"
  ["28"]="hyogo"
  ["29"]="nara"
  ["30"]="wakayama"
  ["31"]="tottori"
  ["32"]="shimane"
  ["33"]="okayama"
  ["34"]="hiroshima"
  ["35"]="yamaguchi"
  ["36"]="tokushima"
  ["37"]="kagawa"
  ["38"]="ehime"
  ["39"]="kochi"
  ["40"]="fukuoka"
  ["41"]="saga"
  ["42"]="nagasaki"
  ["43"]="kumamoto"
  ["44"]="oita"
  ["45"]="miyazaki"
  ["46"]="kagoshima"
  ["47"]="okinawa"
)

mkdir -p "$DOWNLOAD_DIR"
mkdir -p "$OUTPUT_DIR"

echo "=== DID 2020年データダウンロード・変換スクリプト ==="
echo ""
echo "注意: e-Statからのデータダウンロードは手動で行う必要があります。"
echo ""
echo "手順:"
echo "1. https://www.e-stat.go.jp/gis/statmap-search?page=1&type=2 にアクセス"
echo "2. 境界データダウンロード > 小地域 > 国勢調査 > 2020年 > 人口集中地区 を選択"
echo "3. 各都道府県のShapefileをダウンロードして $DOWNLOAD_DIR に配置"
echo "4. このスクリプトを再実行して変換を行う"
echo ""

# ダウンロードディレクトリにShapefileがあるか確認
shp_count=$(find "$DOWNLOAD_DIR" -name "*.shp" 2>/dev/null | wc -l)

if [ "$shp_count" -eq 0 ]; then
  echo "Shapefileが見つかりません。"
  echo "上記の手順でデータをダウンロードしてください。"
  exit 1
fi

echo "Shapefileが見つかりました。GeoJSONへの変換を開始します..."
echo ""

# Shapefileを検索してGeoJSONに変換
for shp in "$DOWNLOAD_DIR"/*.shp; do
  if [ -f "$shp" ]; then
    filename=$(basename "$shp" .shp)

    # 都道府県コードを抽出（ファイル名の最初の2桁）
    pref_code=$(echo "$filename" | grep -oE '^[0-9]{2}' || echo "")

    if [ -n "$pref_code" ] && [ -n "${PREFS[$pref_code]}" ]; then
      pref_name="${PREFS[$pref_code]}"
      output_file="$OUTPUT_DIR/r02_did_${pref_code}_${pref_name}.geojson"

      echo "変換中: $filename -> $output_file"

      # ogr2ogrでGeoJSONに変換（座標系をEPSG:4326に変換）
      ogr2ogr -f GeoJSON \
        -t_srs EPSG:4326 \
        "$output_file" \
        "$shp"

      echo "完了: $output_file"
    else
      echo "スキップ: $filename（都道府県コードを特定できません）"
    fi
  fi
done

echo ""
echo "変換完了！"
echo "出力ディレクトリ: $OUTPUT_DIR"
