#!/usr/bin/env python3
"""
GSI 2024年ポスト災害標高データをダウンロードするスクリプト

2024年能登半島地震後の地形変化を捉えるため、
国土地理院のDEM（標高データ）を取得します。

使用方法:
    python scripts/download_gsi_2024.py

出力先: rawdata/2024/
"""

import time
import urllib.request
import json
from pathlib import Path
from urllib.parse import urlencode

# プロジェクトルートからの相対パス
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "rawdata" / "2024"

# 能登半島・輪島市周辺の座標範囲
# 海砂港地域を中心とした範囲
NOTO_BOUNDS = {
    "north": 37.42,
    "south": 37.39,
    "east": 136.90,
    "west": 136.87
}

# GSI Vector Tile サービス
# DEM（標高データ）タイル: 5mメッシュの標高データ
GSI_DEM_URL = "https://cyberjapandata.gsi.go.jp/xyz/dem5b/{z}/{x}/{y}.txt"

# 地理院タイルAPI (メタデータ)
GSI_TILE_INFO = "https://tile.openstreetmap.jp/styles/osm-bright/style.json"

# GSI 標高データ download service
GSI_DOWNLOAD_BASE = "https://www.gsi.go.jp/cais/download"


def get_zoom_level_for_bounds(bounds):
    """
    座標範囲からズームレベルを計算
    （細粒度のデータを取得するため高ズーム推奨）
    """
    return 14  # 能登半島地域の詳細データ用


def get_tiles_for_bounds(bounds, zoom):
    """
    座標範囲からタイル座標を計算
    """
    import math
    
    def lat_lon_to_tile(lat, lon, z):
        """緯度経度をタイル座標に変換"""
        n = 2.0 ** z
        x = int((lon + 180.0) / 360.0 * n)
        y = int((1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n)
        return x, y
    
    x_min, y_max = lat_lon_to_tile(bounds["north"], bounds["west"], zoom)
    x_max, y_min = lat_lon_to_tile(bounds["south"], bounds["east"], zoom)
    
    tiles = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            tiles.append((x, y, zoom))
    
    return tiles


def download_dem_tiles():
    """
    GSI DEM（標高データ）タイルをダウンロード
    
    Returns:
        成功したタイル数
    """
    print("=" * 60)
    print("GSI 2024年ポスト災害標高データ ダウンローダー")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print()
    
    # タイル座標を計算
    zoom = get_zoom_level_for_bounds(NOTO_BOUNDS)
    tiles = get_tiles_for_bounds(NOTO_BOUNDS, zoom)
    
    print(f"Downloading {len(tiles)} DEM tiles for Noto region (z={zoom})...")
    print(f"Bounds: {NOTO_BOUNDS}")
    print("-" * 40)
    
    downloaded_count = 0
    failed_count = 0
    
    # DEM タイルデータをダウンロード
    for i, (x, y, z) in enumerate(tiles):
        url = GSI_DEM_URL.format(z=z, x=x, y=y)
        output_file = OUTPUT_DIR / f"dem_{z}_{x}_{y}.txt"
        
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                             "AppleWebKit/537.36 (KHTML, like Gecko) "
                             "Chrome/120.0.0.0 Safari/537.36"
            }
            req = urllib.request.Request(url, headers=headers)
            
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read()
                
                # 標高データが存在するか確認（空でない確認）
                if len(content) > 0:
                    with open(output_file, "wb") as f:
                        f.write(content)
                    downloaded_count += 1
                    print(f"  [{i+1}/{len(tiles)}] Downloaded tile z={z} x={x} y={y}")
                else:
                    print(f"  [{i+1}/{len(tiles)}] Empty tile z={z} x={x} y={y}")
        
        except Exception as e:
            failed_count += 1
            print(f"  [{i+1}/{len(tiles)}] Error (z={z} x={x} y={y}): {e}")
        
        # サーバー負荷軽減
        if i < len(tiles) - 1:
            time.sleep(1)
    
    print("-" * 40)
    print(f"Complete! Downloaded: {downloaded_count}, Failed: {failed_count}")
    print()
    
    return downloaded_count


def create_metadata():
    """
    メタデータ（2024年ポスト災害データ情報）を作成
    """
    metadata = {
        "name": "GSI 2024 Post-Earthquake Terrain Data",
        "description": "2024年能登半島地震後の地形データ（GSI DEM）",
        "source": "Geospatial Information Authority of Japan (GSI)",
        "date": "2024-01-01",
        "region": {
            "name": "Noto Peninsula - Wajima City",
            "bounds": NOTO_BOUNDS,
            "coordinates": {
                "center_lat": (NOTO_BOUNDS["north"] + NOTO_BOUNDS["south"]) / 2,
                "center_lon": (NOTO_BOUNDS["east"] + NOTO_BOUNDS["west"]) / 2
            }
        },
        "data_type": "DEM (Digital Elevation Model)",
        "resolution": "5m mesh",
        "reference": {
            "earthquake": "2024 Noto Peninsula Earthquake (M7.6)",
            "max_uplift": "~4 meters",
            "coastal_advance": "~200 meters seaward"
        }
    }
    
    metadata_file = OUTPUT_DIR / "metadata.json"
    with open(metadata_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    
    print(f"Created metadata: {metadata_file.name}")


def main():
    """メイン処理"""
    try:
        count = download_dem_tiles()
        
        if count > 0:
            create_metadata()
            print("\nNext step: npm run convert:gsi2024")
        else:
            print("\nWarning: No tiles were downloaded successfully.")
            print("Check network connection and GSI service availability.")
    
    except Exception as e:
        print(f"\nFatal error: {e}")
        exit(1)


if __name__ == "__main__":
    main()
