import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DIR = path.join(__dirname, '../rawdata/2024');
const OUTPUT_DIR = path.join(__dirname, '../public/GeoJSON/2024');

/**
 * DEM タイルテキストデータをパース
 * GSI DEM5bのテキストフォーマット: カンマ区切りの高度値
 */
function parseDEMTile(content, tileX, tileY, tileZ) {
  const lines = content.toString().split('\n').filter(l => l.trim());
  const features = [];
  
  // タイル座標をPixel座標に変換し、さらに緯度経度に変換
  const tileSize = 256; // ピクセルサイズ
  
  lines.forEach((line, pixelY) => {
    const elevations = line.split(',').map(v => {
      const num = parseFloat(v);
      return isNaN(num) ? null : num;
    });
    
    elevations.forEach((elevation, pixelX) => {
      if (elevation !== null && elevation !== undefined) {
        // ピクセル座標を緯度経度に変換
        const [lat, lon] = pixelToLatLon(tileX, tileY, tileZ, pixelX, pixelY);
        
        // Feature Collectionに追加
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          properties: {
            elevation: elevation,
            tile: `${tileZ}_${tileX}_${tileY}`,
            pixelX: pixelX,
            pixelY: pixelY
          }
        });
      }
    });
  });
  
  return features;
}

/**
 * タイル座標+ピクセル座標を緯度経度に変換
 */
function pixelToLatLon(tileX, tileY, tileZ, pixelX, pixelY) {
  const n = Math.pow(2, tileZ);
  
  // タイル座標+ピクセル座標をWeb Mercator座標に変換
  const mapSize = 256 * n;
  const x = (tileX * 256 + pixelX) / mapSize * 360 - 180;
  
  const merc_y = -((tileY * 256 + pixelY) / mapSize * 2 - 1) * Math.PI;
  const y = (2 * Math.atan(Math.exp(merc_y)) - Math.PI / 2) * 180 / Math.PI;
  
  return [y, x]; // [lat, lon]
}

/**
 * 複数のDEM タイルを統合してGeoJSONを生成
 */
function convertDEMToGeoJSON() {
  if (!fs.existsSync(RAW_DIR)) {
    console.log(`No raw data directory found: ${RAW_DIR}`);
    process.exit(0);
  }
  
  const files = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('dem_') && f.endsWith('.txt'));
  
  if (files.length === 0) {
    console.log('No DEM tile files found in rawdata/2024/');
    process.exit(0);
  }
  
  console.log(`Found ${files.length} DEM tile files. Starting conversion...`);
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  let totalFeatures = 0;
  const allFeatures = [];
  
  files.forEach((file, index) => {
    console.log(`\n[${index + 1}/${files.length}] Processing ${file}...`);
    
    // ファイル名からタイル座標を抽出 (dem_z_x_y.txt)
    const match = file.match(/dem_(\d+)_(\d+)_(\d+)\.txt/);
    if (!match) {
      console.warn(`  Skipping: Could not extract tile coordinates from ${file}`);
      return;
    }
    
    const [, z, x, y] = match.map(Number);
    
    try {
      const content = fs.readFileSync(path.join(RAW_DIR, file), 'utf-8');
      const features = parseDEMTile(content, x, y, z);
      
      allFeatures.push(...features);
      totalFeatures += features.length;
      
      console.log(`  Parsed ${features.length} elevation points from tile z=${z} x=${x} y=${y}`);
    } catch (error) {
      console.error(`  Error processing ${file}:`, error.message);
    }
  });
  
  // GeoJSON FeatureCollection を生成
  if (allFeatures.length > 0) {
    const geojson = {
      type: 'FeatureCollection',
      name: 'GSI 2024 Post-Earthquake Elevation Data',
      crs: {
        type: 'name',
        properties: {
          name: 'EPSG:4326'
        }
      },
      features: allFeatures
    };
    
    const outputFile = path.join(OUTPUT_DIR, 'noto_2024_elevation.geojson');
    fs.writeFileSync(outputFile, JSON.stringify(geojson, null, 2));
    
    console.log(`\n✓ Created ${outputFile}`);
    console.log(`  Total features: ${totalFeatures}`);
  } else {
    console.log('\nNo elevation data found to convert.');
  }
  
  console.log('\nConversion complete.');
}

/**
 * 高度差分情報を生成（2020年データとの比較用）
 */
function generateElevationDifferenceInfo() {
  const infoFile = path.join(OUTPUT_DIR, 'elevation_info.json');
  
  const info = {
    source: 'GSI DEM5b (5m mesh)',
    date: '2024-01-01',
    region: {
      name: 'Noto Peninsula - Wajima City, Ishikawa',
      bounds: {
        north: 37.42,
        south: 37.39,
        east: 136.90,
        west: 136.87
      }
    },
    earthquake: {
      event: '2024 Noto Peninsula Earthquake',
      magnitude: 7.6,
      date: '2024-01-01 16:10 JST'
    },
    terrain_changes: {
      max_uplift_meters: 4.0,
      coastal_advance_meters: 200,
      affected_area: 'Kaiso Port and surrounding coastal region'
    },
    data_format: {
      type: 'GeoJSON FeatureCollection',
      geometry: 'Point',
      properties: [
        'elevation (meters above sea level)',
        'tile (z_x_y format)',
        'pixelX, pixelY (position within tile)'
      ]
    }
  };
  
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2));
  console.log(`\n✓ Created elevation info: ${path.basename(infoFile)}`);
}

// メイン実行
convertDEMToGeoJSON();
generateElevationDifferenceInfo();
