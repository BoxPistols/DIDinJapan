/**
 * Mock Elevation Service for Storybook
 * 
 * elevationService の外部API呼び出しをモックし、
 * Storybook上でも座標・高度情報の取得をシミュレートできます。
 */

import type { CoordinateInfo, ElevationData } from '../../lib/services/elevationService'

/**
 * 座標ベースの予め定義された高度データ
 * 実際のアプリケーションでは GSI API から取得しますが、
 * Storybook ではこれらの値を返します
 */
const MOCK_ELEVATION_DATA: Record<string, number> = {
  // 東京エリア
  '139.767,35.681': 12.5,  // 東京駅
  '139.7,35.7': 18.3,
  
  // 大阪エリア
  '135.500,34.732': 8.2,   // 大阪駅
  '135.5,34.73': 15.6,
  
  // 那覇エリア
  '127.648,26.197': 5.1,   // 那覇空港
  '127.65,26.2': 3.8,
  
  // 能登半島（地震隆起エリア）
  '137.35,37.55': 125.4,   // 能登半島
  '137.3,37.5': 118.2,
  
  // デフォルト値（高度データなし地域）
  '130.5,30.5': 0,
}

/**
 * 座標キーを生成（マッチング用）
 */
function getElevationKey(lng: number, lat: number): string {
  return `${lng.toFixed(3)},${lat.toFixed(3)}`
}

/**
 * 指定座標の高度を取得（モック版）
 */
export function getMockElevation(lng: number, lat: number): ElevationData {
  const key = getElevationKey(lng, lat)
  
  // 完全一致するデータがあればそれを返す
  if (MOCK_ELEVATION_DATA[key] !== undefined) {
    return {
      longitude: lng,
      latitude: lat,
      elevation: MOCK_ELEVATION_DATA[key],
      source: 'gsi-dem',
      timestamp: new Date().toISOString(),
      accuracy: 'mock'
    }
  }
  
  // キー内の周辺データを探す
  for (const [mockKey, elevation] of Object.entries(MOCK_ELEVATION_DATA)) {
    const [mockLng, mockLat] = mockKey.split(',').map(Number)
    const distance = Math.sqrt(
      Math.pow(lng - mockLng, 2) + Math.pow(lat - mockLat, 2)
    )
    
    // 0.1度以内なら返す（約11km以内）
    if (distance < 0.1) {
      return {
        longitude: lng,
        latitude: lat,
        elevation: elevation,
        source: 'gsi-dem',
        timestamp: new Date().toISOString(),
        accuracy: 'mock'
      }
    }
  }
  
  // マッチするデータがない場合、ランダムな高度を返す
  const randomElevation = Math.random() * 500 + 10 // 10-510m
  return {
    longitude: lng,
    latitude: lat,
    elevation: randomElevation,
    source: 'gsi-dem',
    timestamp: new Date().toISOString(),
    accuracy: 'mock'
  }
}

/**
 * モック版：座標・高度情報を取得
 */
export async function mockGetCoordinateInfo(
  lngLat: { lng: number; lat: number }
): Promise<CoordinateInfo> {
  // ネットワーク遅延をシミュレート
  await new Promise(resolve => setTimeout(resolve, 300))
  
  const elevation = getMockElevation(lngLat.lng, lngLat.lat)
  
  return {
    lng: lngLat.lng,
    lat: lngLat.lat,
    elevation: elevation.elevation,
    formatted: {
      coordinates: `${lngLat.lat.toFixed(6)}°, ${lngLat.lng.toFixed(6)}°`,
      elevation: `${elevation.elevation.toFixed(1)} m`
    }
  }
}

/**
 * モック版：推奨飛行高度を取得
 */
export async function mockGetRecommendedFlightAltitude(
  lng: number,
  lat: number,
  safetyMarginMeters: number = 30
): Promise<number | null> {
  // ネットワーク遅延をシミュレート
  await new Promise(resolve => setTimeout(resolve, 300))
  
  const elevation = getMockElevation(lng, lat)
  if (!elevation) return null
  
  return elevation.elevation + safetyMarginMeters
}
