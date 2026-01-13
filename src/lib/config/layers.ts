/**
 * Layer Configurations - DID (Densely Inhabited Districts) by Prefecture
 */

import { LayerGroup } from '../types'

// 都道府県別の色
export const PREFECTURE_COLORS: Record<string, string> = {
  '01': '#74b9ff', // 北海道
  '02': '#0984e3', // 青森
  '03': '#00cec9', // 岩手
  '04': '#00b894', // 宮城
  '05': '#55efc4', // 秋田
  '06': '#81ecec', // 山形
  '07': '#a29bfe', // 福島
  '08': '#ffeaa7', // 茨城
  '09': '#fdcb6e', // 栃木
  '10': '#fd79a8', // 群馬
  '11': '#45b7d1', // 埼玉
  '12': '#96ceb4', // 千葉
  '13': '#ff6b6b', // 東京
  '14': '#4ecdc4', // 神奈川
  '15': '#dfe6e9', // 新潟
  '16': '#b2bec3', // 富山
  '17': '#636e72', // 石川
  '18': '#2d3436', // 福井
  '19': '#e17055', // 山梨
  '20': '#d63031', // 長野
  '21': '#e84393', // 岐阜
  '22': '#6c5ce7', // 静岡
  '23': '#fdcb6e', // 愛知
  '24': '#fab1a0', // 三重
  '25': '#74b9ff', // 滋賀
  '26': '#00b894', // 京都
  '27': '#e17055', // 大阪
  '28': '#0984e3', // 兵庫
  '29': '#6c5ce7', // 奈良
  '30': '#fd79a8', // 和歌山
  '31': '#00cec9', // 鳥取
  '32': '#55efc4', // 島根
  '33': '#ffeaa7', // 岡山
  '34': '#ff7675', // 広島
  '35': '#a29bfe', // 山口
  '36': '#81ecec', // 徳島
  '37': '#fab1a0', // 香川
  '38': '#fdcb6e', // 愛媛
  '39': '#e84393', // 高知
  '40': '#00cec9', // 福岡
  '41': '#74b9ff', // 佐賀
  '42': '#a29bfe', // 長崎
  '43': '#ff7675', // 熊本
  '44': '#fd79a8', // 大分
  '45': '#00b894', // 宮崎
  '46': '#e17055', // 鹿児島
  '47': '#0984e3'  // 沖縄
}

// 地域別レイヤーグループ（令和2年国勢調査データ）
export const LAYER_GROUPS: LayerGroup[] = [
  {
    name: '北海道・東北',
    layers: [
      { id: 'did-01', name: '北海道', path: '/GeoJSON/2020/r02_did_01_hokkaido.geojson', color: PREFECTURE_COLORS['01'] },
      { id: 'did-02', name: '青森県', path: '/GeoJSON/2020/r02_did_02_aomori.geojson', color: PREFECTURE_COLORS['02'] },
      { id: 'did-03', name: '岩手県', path: '/GeoJSON/2020/r02_did_03_iwate.geojson', color: PREFECTURE_COLORS['03'] },
      { id: 'did-04', name: '宮城県', path: '/GeoJSON/2020/r02_did_04_miyagi.geojson', color: PREFECTURE_COLORS['04'] },
      { id: 'did-05', name: '秋田県', path: '/GeoJSON/2020/r02_did_05_akita.geojson', color: PREFECTURE_COLORS['05'] },
      { id: 'did-06', name: '山形県', path: '/GeoJSON/2020/r02_did_06_yamagata.geojson', color: PREFECTURE_COLORS['06'] },
      { id: 'did-07', name: '福島県', path: '/GeoJSON/2020/r02_did_07_fukushima.geojson', color: PREFECTURE_COLORS['07'] },
    ]
  },
  {
    name: '関東',
    layers: [
      { id: 'did-08', name: '茨城県', path: '/GeoJSON/2020/r02_did_08_ibaraki.geojson', color: PREFECTURE_COLORS['08'] },
      { id: 'did-09', name: '栃木県', path: '/GeoJSON/2020/r02_did_09_tochigi.geojson', color: PREFECTURE_COLORS['09'] },
      { id: 'did-10', name: '群馬県', path: '/GeoJSON/2020/r02_did_10_gunma.geojson', color: PREFECTURE_COLORS['10'] },
      { id: 'did-11', name: '埼玉県', path: '/GeoJSON/2020/r02_did_11_saitama.geojson', color: PREFECTURE_COLORS['11'] },
      { id: 'did-12', name: '千葉県', path: '/GeoJSON/2020/r02_did_12_chiba.geojson', color: PREFECTURE_COLORS['12'] },
      { id: 'did-13', name: '東京都', path: '/GeoJSON/2020/r02_did_13_tokyo.geojson', color: PREFECTURE_COLORS['13'] },
      { id: 'did-14', name: '神奈川県', path: '/GeoJSON/2020/r02_did_14_kanagawa.geojson', color: PREFECTURE_COLORS['14'] },
    ]
  },
  {
    name: '中部',
    layers: [
      { id: 'did-15', name: '新潟県', path: '/GeoJSON/2020/r02_did_15_niigata.geojson', color: PREFECTURE_COLORS['15'] },
      { id: 'did-16', name: '富山県', path: '/GeoJSON/2020/r02_did_16_toyama.geojson', color: PREFECTURE_COLORS['16'] },
      { id: 'did-17', name: '石川県', path: '/GeoJSON/2020/r02_did_17_ishikawa.geojson', color: PREFECTURE_COLORS['17'] },
      { id: 'did-18', name: '福井県', path: '/GeoJSON/2020/r02_did_18_fukui.geojson', color: PREFECTURE_COLORS['18'] },
      { id: 'did-19', name: '山梨県', path: '/GeoJSON/2020/r02_did_19_yamanashi.geojson', color: PREFECTURE_COLORS['19'] },
      { id: 'did-20', name: '長野県', path: '/GeoJSON/2020/r02_did_20_nagano.geojson', color: PREFECTURE_COLORS['20'] },
      { id: 'did-21', name: '岐阜県', path: '/GeoJSON/2020/r02_did_21_gifu.geojson', color: PREFECTURE_COLORS['21'] },
      { id: 'did-22', name: '静岡県', path: '/GeoJSON/2020/r02_did_22_shizuoka.geojson', color: PREFECTURE_COLORS['22'] },
      { id: 'did-23', name: '愛知県', path: '/GeoJSON/2020/r02_did_23_aichi.geojson', color: PREFECTURE_COLORS['23'] },
    ]
  },
  {
    name: '近畿',
    layers: [
      { id: 'did-24', name: '三重県', path: '/GeoJSON/2020/r02_did_24_mie.geojson', color: PREFECTURE_COLORS['24'] },
      { id: 'did-25', name: '滋賀県', path: '/GeoJSON/2020/r02_did_25_shiga.geojson', color: PREFECTURE_COLORS['25'] },
      { id: 'did-26', name: '京都府', path: '/GeoJSON/2020/r02_did_26_kyoto.geojson', color: PREFECTURE_COLORS['26'] },
      { id: 'did-27', name: '大阪府', path: '/GeoJSON/2020/r02_did_27_osaka.geojson', color: PREFECTURE_COLORS['27'] },
      { id: 'did-28', name: '兵庫県', path: '/GeoJSON/2020/r02_did_28_hyogo.geojson', color: PREFECTURE_COLORS['28'] },
      { id: 'did-29', name: '奈良県', path: '/GeoJSON/2020/r02_did_29_nara.geojson', color: PREFECTURE_COLORS['29'] },
      { id: 'did-30', name: '和歌山県', path: '/GeoJSON/2020/r02_did_30_wakayama.geojson', color: PREFECTURE_COLORS['30'] },
    ]
  },
  {
    name: '中国',
    layers: [
      { id: 'did-31', name: '鳥取県', path: '/GeoJSON/2020/r02_did_31_tottori.geojson', color: PREFECTURE_COLORS['31'] },
      { id: 'did-32', name: '島根県', path: '/GeoJSON/2020/r02_did_32_shimane.geojson', color: PREFECTURE_COLORS['32'] },
      { id: 'did-33', name: '岡山県', path: '/GeoJSON/2020/r02_did_33_okayama.geojson', color: PREFECTURE_COLORS['33'] },
      { id: 'did-34', name: '広島県', path: '/GeoJSON/2020/r02_did_34_hiroshima.geojson', color: PREFECTURE_COLORS['34'] },
      { id: 'did-35', name: '山口県', path: '/GeoJSON/2020/r02_did_35_yamaguchi.geojson', color: PREFECTURE_COLORS['35'] },
    ]
  },
  {
    name: '四国',
    layers: [
      { id: 'did-36', name: '徳島県', path: '/GeoJSON/2020/r02_did_36_tokushima.geojson', color: PREFECTURE_COLORS['36'] },
      { id: 'did-37', name: '香川県', path: '/GeoJSON/2020/r02_did_37_kagawa.geojson', color: PREFECTURE_COLORS['37'] },
      { id: 'did-38', name: '愛媛県', path: '/GeoJSON/2020/r02_did_38_ehime.geojson', color: PREFECTURE_COLORS['38'] },
      { id: 'did-39', name: '高知県', path: '/GeoJSON/2020/r02_did_39_kochi.geojson', color: PREFECTURE_COLORS['39'] },
    ]
  },
  {
    name: '九州・沖縄',
    layers: [
      { id: 'did-40', name: '福岡県', path: '/GeoJSON/2020/r02_did_40_fukuoka.geojson', color: PREFECTURE_COLORS['40'] },
      { id: 'did-41', name: '佐賀県', path: '/GeoJSON/2020/r02_did_41_saga.geojson', color: PREFECTURE_COLORS['41'] },
      { id: 'did-42', name: '長崎県', path: '/GeoJSON/2020/r02_did_42_nagasaki.geojson', color: PREFECTURE_COLORS['42'] },
      { id: 'did-43', name: '熊本県', path: '/GeoJSON/2020/r02_did_43_kumamoto.geojson', color: PREFECTURE_COLORS['43'] },
      { id: 'did-44', name: '大分県', path: '/GeoJSON/2020/r02_did_44_oita.geojson', color: PREFECTURE_COLORS['44'] },
      { id: 'did-45', name: '宮崎県', path: '/GeoJSON/2020/r02_did_45_miyazaki.geojson', color: PREFECTURE_COLORS['45'] },
      { id: 'did-46', name: '鹿児島県', path: '/GeoJSON/2020/r02_did_46_kagoshima.geojson', color: PREFECTURE_COLORS['46'] },
      { id: 'did-47', name: '沖縄県', path: '/GeoJSON/2020/r02_did_47_okinawa.geojson', color: PREFECTURE_COLORS['47'] },
    ]
  }
]

// レイヤーIDから都道府県名を取得するためのマップ
export function createLayerIdToNameMap(): Map<string, string> {
  const map = new Map<string, string>()
  LAYER_GROUPS.forEach(group => {
    group.layers.forEach(layer => {
      map.set(layer.id, layer.name)
    })
  })
  return map
}

// 全レイヤーを取得
export function getAllLayers() {
  return LAYER_GROUPS.flatMap(g => g.layers)
}
