import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import notifier from 'node-notifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DIR = path.join(__dirname, '../rawdata/2020');
const OUTPUT_DIR = path.join(__dirname, '../public/GeoJSON/2020');
const MAPSHAPER_BIN = path.join(__dirname, '../node_modules/.bin/mapshaper');

// 都道府県コードとローマ字のマッピング
const PREFS = {
  '01': 'hokkaido', '02': 'aomori', '03': 'iwate', '04': 'miyagi', '05': 'akita',
  '06': 'yamagata', '07': 'fukushima', '08': 'ibaraki', '09': 'tochigi', '10': 'gunma',
  '11': 'saitama', '12': 'chiba', '13': 'tokyo', '14': 'kanagawa', '15': 'niigata',
  '16': 'toyama', '17': 'ishikawa', '18': 'fukui', '19': 'yamanashi', '20': 'nagano',
  '21': 'gifu', '22': 'shizuoka', '23': 'aichi', '24': 'mie', '25': 'shiga',
  '26': 'kyoto', '27': 'osaka', '28': 'hyogo', '29': 'nara', '30': 'wakayama',
  '31': 'tottori', '32': 'shimane', '33': 'okayama', '34': 'hiroshima', '35': 'yamaguchi',
  '36': 'tokushima', '37': 'kagawa', '38': 'ehime', '39': 'kochi', '40': 'fukuoka',
  '41': 'saga', '42': 'nagasaki', '43': 'kumamoto', '44': 'oita', '45': 'miyazaki',
  '46': 'kagoshima', '47': 'okinawa'
};

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// rawdata/2020 内のzipファイルを探す
const files = fs.readdirSync(RAW_DIR).filter(file => file.endsWith('.zip'));

if (files.length === 0) {
  console.log('No ZIP files found in rawdata/2020/');
  process.exit(0);
}

console.log(`Found ${files.length} ZIP files. Starting conversion...`);

try {
  files.forEach(file => {
  const zipPath = path.join(RAW_DIR, file);
  // ファイル名から都道府県コードを抽出 (例: 2020_did_ddsw_01-JGD2011.zip -> 01)
  // ファイル名パターン例:
  // - 2020_did_ddsw_01-JGD2011.zip (既存)
  // - did_2020_01.zip (download_did_2020.py生成)
  const match = file.match(/_(\d{2})\.zip$/) || file.match(/_(\d{2})[-_]/) || file.match(/^(\d{2})/);
  
  if (!match) {
    console.warn(`Skipping ${file}: Could not extract prefecture code.`);
    return;
  }
  
  const prefCode = match[1];
  const prefName = PREFS[prefCode];
  
  if (!prefName) {
    console.warn(`Skipping ${file}: Unknown prefecture code ${prefCode}.`);
    return;
  }

  console.log(`Processing ${prefName} (${prefCode})...`);

  // 一時ディレクトリに解凍
  const tempDir = path.join(RAW_DIR, 'temp', prefCode);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    execSync(`unzip -q "${zipPath}" -d "${tempDir}"`);
    
    // .shpファイルを探す
    const shpFile = fs.readdirSync(tempDir).find(f => f.endsWith('.shp'));
    
    if (shpFile) {
      const shpPath = path.join(tempDir, shpFile);
      const outputFilename = `r02_did_${prefCode}_${prefName}.geojson`;
      const outputPath = path.join(OUTPUT_DIR, outputFilename);

      // mapshaperで変換
      // -proj wgs84: JGD2011からWGS84(EPSG:4326)へ変換 (mapshaperはproj4文字列や標準的なエイリアスを受け付ける)
      // JGD2011は概ねWGS84とみなして変換されることが多いが、厳密にはパラメータが必要。
      // mapshaperの簡易変換を使用。
      execSync(`"${MAPSHAPER_BIN}" "${shpPath}" -o "${outputPath}" format=geojson`);
      
      console.log(`  Created ${outputFilename}`);
    } else {
      console.warn(`  No .shp file found in ${file}`);
    }

  } catch (error) {
    console.error(`  Error processing ${file}:`, error.message);
  } finally {
    // 掃除
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  });

  // tempディレクトリ自体の削除
  if (fs.existsSync(path.join(RAW_DIR, 'temp'))) {
      fs.rmdirSync(path.join(RAW_DIR, 'temp'));
  }

  console.log('Conversion complete.');

  notifier.notify({
    title: 'DID 2020データ変換完了',
    message: 'すべての都道府県データの変換が完了しました',
    sound: false
  });

} catch (error) {
  console.error('Conversion failed:', error);
  notifier.notify({
    title: 'DID 2020データ変換失敗',
    message: 'エラーが発生しました',
    sound: false
  });
  process.exit(1);
}
