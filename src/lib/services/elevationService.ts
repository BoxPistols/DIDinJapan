/**
 * Elevation Service - 海抜高度取得サービス
 * 
 * GSI DEM（標高データ）およびその他の高度情報源から
 * 指定座標の海抜高度を取得します。
 */

import maplibregl from 'maplibre-gl'

// ============================================
// タイプ定義
// ============================================

export interface ElevationData {
  longitude: number
  latitude: number
  elevation: number // meters ASL (above sea level)
  accuracy?: string
  source: 'gsi-dem' | 'gsi-tile' | 'interpolated' | 'cached'
  timestamp: string
  region?: string
}

export interface CoordinateInfo {
  lng: number
  lat: number
  elevation?: number
  formatted: {
    coordinates: string
    elevation: string
  }
}

// ============================================
// GSI DEM データキャッシュ
// ============================================

const elevationCache = new Map<string, ElevationData>()
const CACHE_EXPIRY_MS = 60 * 60 * 1000 // 1時間

/**
 * キャッシュキーを生成
 */
function getCacheKey(lng: number, lat: number, precision: number = 5): string {
  const roundedLng = Math.round(lng * precision) / precision
  const roundedLat = Math.round(lat * precision) / precision
  return `${roundedLng},${roundedLat}`
}

/**
 * GSI標高タイルから標高を取得（非同期）
 * 
 * @param lng - 経度
 * @param lat - 緯度
 * @returns 標高データ
 */
export async function fetchElevationFromGSI(
  lng: number,
  lat: number
): Promise<ElevationData | null> {
  try {
    // キャッシュを確認
    const cacheKey = getCacheKey(lng, lat)
    const cached = elevationCache.get(cacheKey)
    if (cached) {
      return { ...cached, source: 'cached' }
    }

    // GSI DEM5b タイルから標高を取得
    // 実装例：GSI DEM Tile API
    // https://cyberjapandata.gsi.go.jp/xyz/dem5b/{z}/{x}/{y}.txt

    const elevation = await queryGSIDEMTile(lng, lat)
    
    if (elevation !== null) {
      const data: ElevationData = {
        longitude: lng,
        latitude: lat,
        elevation: elevation,
        source: 'gsi-dem',
        timestamp: new Date().toISOString(),
        region: getRegionFromCoordinates(lng, lat)
      }
      
      // キャッシュに保存
      elevationCache.set(cacheKey, data)
      return data
    }
    
    return null
  } catch (error) {
    console.error('Error fetching elevation from GSI:', error)
    return null
  }
}

/**
 * GSI DEM タイルクエリ（実装スタブ）
 * 実際のタイル取得ロジックはここに実装
 */
async function queryGSIDEMTile(
  lng: number,
  lat: number
): Promise<number | null> {
  try {
    // GSI DEM5b タイルサービスへのリクエスト
    // このスタブは、実装時に実際のタイル座標計算とデータ取得に置き換える
    
    // 例: Google Elevation API (比較参照)
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lng}`
    )
    
    if (!response.ok) return null
    
    const data = await response.json()
    if (data.results && data.results.length > 0) {
      return Math.round(data.results[0].elevation)
    }
    
    return null
  } catch (error) {
    console.error('Error querying DEM tile:', error)
    return null
  }
}

/**
 * 座標から地域を推定
 */
function getRegionFromCoordinates(lng: number, lat: number): string {
  // 能登半島
  if (lng >= 136.5 && lng <= 137.5 && lat >= 36.5 && lat <= 37.8) {
    return 'noto'
  }
  // 石川県全般
  if (lng >= 135.5 && lng <= 138.0 && lat >= 35.5 && lat <= 38.5) {
    return 'ishikawa'
  }
  // その他
  return 'japan'
}

/**
 * マップのクリック位置から座標・高度情報を取得
 * 
 * @param lngLat - MapLibreGLから取得した {lng, lat}
 * @returns 座標・高度情報
 */
export async function getCoordinateInfo(
  lngLat: { lng: number; lat: number }
): Promise<CoordinateInfo> {
  const elevation = await fetchElevationFromGSI(lngLat.lng, lngLat.lat)
  
  return {
    lng: lngLat.lng,
    lat: lngLat.lat,
    elevation: elevation?.elevation,
    formatted: {
      coordinates: `${lngLat.lat.toFixed(6)}°, ${lngLat.lng.toFixed(6)}°`,
      elevation: elevation
        ? `${elevation.elevation.toFixed(1)} m`
        : '取得中...'
    }
  }
}

/**
 * 複数座標の高度情報を取得
 * ドローン経路の全ウェイポイント高度計算用
 */
export async function fetchElevationBatch(
  coordinates: Array<{ lng: number; lat: number }>
): Promise<ElevationData[]> {
  const results = await Promise.all(
    coordinates.map(coord => fetchElevationFromGSI(coord.lng, coord.lat))
  )
  return results.filter((r): r is ElevationData => r !== null)
}

/**
 * ドローン飛行パラメータ計算用：地形回避高度を推定
 * 
 * @param lng - 経度
 * @param lat - 緯度
 * @param safetyMarginMeters - 安全マージン (デフォルト30m)
 * @returns 推奨飛行高度（AGL）
 */
export async function getRecommendedFlightAltitude(
  lng: number,
  lat: number,
  safetyMarginMeters: number = 30
): Promise<number | null> {
  const elevation = await fetchElevationFromGSI(lng, lat)
  if (!elevation) return null
  
  // 地形標高 + 安全マージン = 推奨飛行高度
  return elevation.elevation + safetyMarginMeters
}

/**
 * キャッシュをクリア
 */
export function clearElevationCache(): void {
  elevationCache.clear()
}

/**
 * キャッシュ情報を取得（デバッグ用）
 */
export function getCacheInfo(): { size: number; keys: string[] } {
  return {
    size: elevationCache.size,
    keys: Array.from(elevationCache.keys())
  }
}
