import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import notifier from 'node-notifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DIR = path.join(__dirname, '../rawdata/airport_surfaces');
const OUTPUT_DIR = path.join(__dirname, '../public/GeoJSON/airports');
const MAPSHAPER_BIN = path.join(__dirname, '../node_modules/.bin/mapshaper');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'airport_surfaces.geojson');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Check for mapshaper
if (!fs.existsSync(MAPSHAPER_BIN)) {
    console.error('Error: mapshaper not found. Please run "npm install" first.');
    process.exit(1);
}

// rawdata/airport_surfaces 内のzipファイルを探す
if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
}

const files = fs.readdirSync(RAW_DIR).filter(file => file.endsWith('.zip'));

if (files.length === 0) {
  console.log('No ZIP files found in rawdata/airport_surfaces/');
  process.exit(0);
}

console.log(`Found ${files.length} ZIP files. Starting conversion...`);

const tempDir = path.join(RAW_DIR, 'temp');
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

try {
  let shpFiles = [];

  // 1. Unzip all files
  files.forEach(file => {
    console.log(`Unzipping ${file}...`);
    const zipPath = path.join(RAW_DIR, file);
    try {
        execSync(`unzip -q -o "${zipPath}" -d "${tempDir}"`);
    } catch (e) {
        console.warn(`Failed to unzip ${file}: ${e.message}`);
    }
  });

  // 2. Find relevant .shp files (Prioritize UTF-8, only Airport polygon)
  const findShpFiles = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
          const res = path.resolve(dir, entry.name);
          if (entry.isDirectory()) {
              findShpFiles(res);
          } else if (entry.isFile() && entry.name.endsWith('.shp')) {
              // Only target Airport polygon data (C28-xx_Airport.shp)
              if (entry.name.includes('_Airport.shp')) {
                  shpFiles.push(res);
              }
          }
      }
  };
  findShpFiles(tempDir);

  if (shpFiles.length === 0) {
      console.log('No Airport polygon (.shp) files found.');
      process.exit(1);
  }

  // Filter: If UTF-8 exists, ignore Shift-JIS to avoid duplicates
  const utf8Files = shpFiles.filter(f => f.includes('UTF-8'));
  const targetFiles = utf8Files.length > 0 ? utf8Files : shpFiles;

  console.log(`Found ${targetFiles.length} Airport Shapefiles. Converting...`);

  // 3. Convert using mapshaper
  // -i: input files with encoding option
  // -proj wgs84: Convert to WGS84
  // -simplify: Reduce file size
  // -o: Output
  
  // Construct input string with encoding
  // mapshaper -i file.shp encoding=shiftjis ...
  // Note: If folder says UTF-8, we use utf-8. If Shift-JIS, we use shiftjis.
  
  const inputs = targetFiles.map(f => {
      const encoding = f.includes('Shift-JIS') ? 'shiftjis' : 'utf-8';
      return `"${f}" encoding=${encoding}`;
  }).join(' ');

  const cmd = `"${MAPSHAPER_BIN}" -i ${inputs} combine-files -proj wgs84 -simplify 10% -o "${OUTPUT_FILE}" format=geojson`;
  
  console.log('Running mapshaper...');
  execSync(cmd, { stdio: 'inherit' });

  console.log(`Success! Created ${OUTPUT_FILE}`);

  notifier.notify({
    title: '空港データ変換完了',
    message: 'Shapefileの変換が完了しました',
    sound: false
  });

} catch (error) {
  console.error('Conversion failed:', error.message);
  notifier.notify({
    title: '空港データ変換失敗',
    message: 'エラーが発生しました',
    sound: false
  });
} finally {
  // Cleanup
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}