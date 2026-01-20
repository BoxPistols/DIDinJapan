/**
 * Overlay Configurations - Geographic and Weather overlays
 */

import { GeoOverlay, WeatherOverlay, RestrictionCategory, RestrictionZone } from '../types'

// ============================================
// 地理情報オーバーレイ (Geographic Overlays)
// ============================================
export const GEO_OVERLAYS: GeoOverlay[] = [
  {
    id: 'hillshade',
    name: '陰影起伏',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png'],
    opacity: 0.4,
    category: 'geo',
    description: '陰影起伏図（地形の凹凸を陰影で強調）'
  },
  {
    id: 'relief',
    name: '色別標高図',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png'],
    opacity: 0.5,
    category: 'geo',
    description: '色別標高図（標高を色分け表示）'
  },
  {
    id: 'slope',
    name: '傾斜量図',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/slopemap/{z}/{x}/{y}.png'],
    opacity: 0.5,
    category: 'geo',
    description: '傾斜量図（傾斜の大きい場所を強調）'
  },
  {
    id: 'buildings',
    name: '地物',
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf'],
    opacity: 0.6,
    category: 'geo',
    minZoom: 14,
    description: '地物（建物・駅舎などの建造物）※見本データ'
  },
  {
    // NOTE: 実体は「隆起エリア（点/ヒートマップ）」として comparison layer 側で描画する
    // 右上UIのチェックボックスは toggleOverlay ではなく比較レイヤーのON/OFFに紐づける（App側で特別扱い）
    id: 'terrain-2024-noto',
    name: '能登半島隆起エリア',
    tiles: [],
    geojson: '/GeoJSON/2024/noto_2024_elevation.geojson',
    opacity: 0.6,
    category: 'geo',
    description: '2024年能登半島地震後の隆起を示す点サンプル'
  }
]

// ============================================
// 天候情報オーバーレイ (Weather Overlays)
// ============================================
export const WEATHER_OVERLAYS: WeatherOverlay[] = [
  {
    id: 'rain-radar',
    name: '雨雲',
    opacity: 0.6,
    dynamic: true,
    updateInterval: 5 * 60 * 1000 // 5分
  },
  {
    id: 'wind',
    name: '風向・風量',
    opacity: 0.5,
    dynamic: true,
    updateInterval: 10 * 60 * 1000 // 10分
  }
]

// ============================================
// 電波情報オーバーレイ (Signal Overlays)
// ============================================
export const SIGNAL_OVERLAYS: GeoOverlay[] = [
  {
    id: 'lte-coverage',
    name: 'LTE',
    tiles: [], // 電波カバレッジデータは別途取得
    opacity: 0.4,
    category: 'geo'
  }
]

// ============================================
// 禁止エリア (Restriction Zones)
// ============================================

// 禁止エリアの色定義
export const RESTRICTION_COLORS = {
  airport: '#9C27B0', // 紫 - 空港など周辺空域
  did: '#FFB6C1', // ピンク - 人口集中地区
  emergency: '#FFA500', // オレンジ - 緊急用務空域
  manned: '#87CEEB', // 水色 - 有人機発着エリア
  remote_id: '#DDA0DD', // 薄紫 - リモートID特定区域
  no_fly_red: '#FF0000', // 赤 - レッドゾーン
  no_fly_yellow: '#FFFF00' // 黄 - イエローゾーン
}

// 禁止エリア設定
export const RESTRICTION_ZONES: RestrictionZone[] = [
  {
    id: 'airport-airspace',
    name: '空港など周辺空域',
    type: 'airport',
    color: RESTRICTION_COLORS.airport,
    opacity: 0.6,
    // NOTE: ラスタタイルは廃止し、ベクトル（タイルGeoJSON）を優先してクライアント側で描画する
    geojsonTileTemplate: 'https://maps.gsi.go.jp/xyz/kokuarea/{z}/{x}/{y}.geojson',
    path: '/GeoJSON/airports/airport_surfaces.geojson',
    description: '空港等の周辺空域（航空局提供：進入表面・転移表面等）および敷地範囲'
  },
  {
    id: 'did-area',
    name: '人口集中地区',
    type: 'did',
    color: RESTRICTION_COLORS.did,
    opacity: 0.5,
    tiles: ['https://cyberjapandata.gsi.go.jp/xyz/did2015/{z}/{x}/{y}.png'],
    description: '人口集中地区（DID）- 国勢調査に基づく'
  }
  // {
  //   id: 'emergency-airspace',
  //   name: '緊急用務空域',
  //   type: 'emergency',
  //   color: RESTRICTION_COLORS.emergency,
  //   opacity: 0.5,
  //   path: '/data/emergency.geojson',
  //   description: '災害等による緊急用務空域'
  // },
  // {
  //   id: 'manned-aircraft',
  //   name: '有人機発着エリア',
  //   type: 'manned',
  //   color: RESTRICTION_COLORS.manned,
  //   opacity: 0.4,
  //   path: '/data/manned.geojson',
  //   description: '有人機の離着陸エリア'
  // },
  // {
  //   id: 'remote-id-zone',
  //   name: 'リモートID特定区域',
  //   type: 'remote_id',
  //   color: RESTRICTION_COLORS.remote_id,
  //   opacity: 0.4,
  //   path: '/data/remote_id.geojson',
  //   description: 'リモートID特定区域'
  // }
]

// 小型無人機等飛行禁止法エリア
export const NO_FLY_ZONES: RestrictionZone[] = [
  {
    id: 'no-fly-red',
    name: 'レッドゾーン',
    type: 'no_fly_red',
    color: RESTRICTION_COLORS.no_fly_red,
    opacity: 0.5,
    path: '/data/no_fly_red.geojson',
    description: '小型無人機等飛行禁止法 - 重要施設周辺'
  },
  {
    id: 'no-fly-yellow',
    name: 'イエローゾーン',
    type: 'no_fly_yellow',
    color: RESTRICTION_COLORS.no_fly_yellow,
    opacity: 0.4,
    path: '/data/no_fly_yellow.geojson',
    description: '小型無人機等飛行禁止法 - 注意区域'
  }
]

// カテゴリ別に整理
export const RESTRICTION_CATEGORIES: RestrictionCategory[] = [
  {
    id: 'airspace-restrictions',
    name: '禁止エリア',
    zones: RESTRICTION_ZONES
  },
  {
    id: 'no-fly-law',
    name: '小型無人機等飛行禁止法',
    zones: NO_FLY_ZONES
  }
]

// 全ての禁止エリアを取得
export function getAllRestrictionZones(): RestrictionZone[] {
  return [...RESTRICTION_ZONES, ...NO_FLY_ZONES]
}
