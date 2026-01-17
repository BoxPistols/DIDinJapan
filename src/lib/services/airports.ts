/**
 * Airport Data Service
 * Japanese airports with restriction zones
 *
 * データソース:
 * - 国土交通省 DIPS (ドローン情報基盤システム)
 * - 国土数値情報 空港データ (https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C28-v3_0.html)
 * - AIS JAPAN 航空路誌
 *
 * 制限半径の根拠:
 * - 国際空港・主要空港: 航空法により進入表面・転移表面等の制限あり
 *   - 小型無人機等飛行禁止法対象8空港: 約24km（実際は空港ごとに異なる制限表面）
 * - 地方空港: 概ね6km（進入表面の水平距離を参考値として設定）
 * - 小規模空港・飛行場: 2-3km
 *
 * 注意: 実際の飛行制限区域は空港ごとに異なり、制限表面（水平表面、円錐表面、
 * 進入表面、転移表面、延長進入表面、外側水平表面）に基づきます。
 * 正確な情報は必ずDIPSまたはAIS JAPANで確認してください。
 *
 * @see https://www.mlit.go.jp/koku/koku_fr10_000041.html 航空法における制限表面
 */

import { Airport } from '../types'
import { createCirclePolygon, calculateDistance } from '../utils/geo'

export type AirportMarkerProperties = {
  id: string
  name: string
  nameEn?: string
  type: Airport['type']
  radiusKm: number
}

// 主要空港データ（小型無人機等飛行禁止法の対象空港含む）
export const MAJOR_AIRPORTS: Airport[] = [
  // 小型無人機等飛行禁止法で指定された8空港
  {
    id: 'NRT',
    name: '成田国際空港',
    nameEn: 'Narita International Airport',
    type: 'international',
    coordinates: [140.3929, 35.772],
    radiusKm: 24
  },
  {
    id: 'HND',
    name: '東京国際空港（羽田）',
    nameEn: 'Tokyo International Airport (Haneda)',
    type: 'international',
    coordinates: [139.7798, 35.5494],
    radiusKm: 24
  },
  {
    id: 'KIX',
    name: '関西国際空港',
    nameEn: 'Kansai International Airport',
    type: 'international',
    coordinates: [135.244, 34.4347],
    radiusKm: 24
  },
  {
    id: 'ITM',
    name: '大阪国際空港（伊丹）',
    nameEn: 'Osaka International Airport (Itami)',
    type: 'international',
    coordinates: [135.438, 34.7855],
    radiusKm: 24
  },
  {
    id: 'NGO',
    name: '中部国際空港',
    nameEn: 'Chubu Centrair International Airport',
    type: 'international',
    coordinates: [136.8052, 34.8584],
    radiusKm: 24
  },
  {
    id: 'CTS',
    name: '新千歳空港',
    nameEn: 'New Chitose Airport',
    type: 'international',
    coordinates: [141.6922, 42.7752],
    radiusKm: 24
  },
  {
    id: 'FUK',
    name: '福岡空港',
    nameEn: 'Fukuoka Airport',
    type: 'international',
    coordinates: [130.4511, 33.5859],
    radiusKm: 24
  },
  {
    id: 'OKA',
    name: '那覇空港',
    nameEn: 'Naha Airport',
    type: 'international',
    coordinates: [127.6465, 26.1958],
    radiusKm: 24
  },
  // その他の主要空港
  {
    id: 'SDJ',
    name: '仙台空港',
    nameEn: 'Sendai Airport',
    type: 'domestic',
    coordinates: [140.9225, 38.1397],
    radiusKm: 6
  },
  {
    id: 'HIJ',
    name: '広島空港',
    nameEn: 'Hiroshima Airport',
    type: 'domestic',
    coordinates: [132.922, 34.4361],
    radiusKm: 6
  },
  {
    id: 'KMJ',
    name: '熊本空港',
    nameEn: 'Kumamoto Airport',
    type: 'domestic',
    coordinates: [130.8553, 32.8373],
    radiusKm: 6
  },
  {
    id: 'KOJ',
    name: '鹿児島空港',
    nameEn: 'Kagoshima Airport',
    type: 'domestic',
    coordinates: [130.7191, 31.8034],
    radiusKm: 6
  },
  {
    id: 'NGS',
    name: '長崎空港',
    nameEn: 'Nagasaki Airport',
    type: 'domestic',
    coordinates: [129.9146, 32.9169],
    radiusKm: 6
  },
  {
    id: 'OIT',
    name: '大分空港',
    nameEn: 'Oita Airport',
    type: 'domestic',
    coordinates: [131.7368, 33.4794],
    radiusKm: 6
  },
  {
    id: 'KMI',
    name: '宮崎空港',
    nameEn: 'Miyazaki Airport',
    type: 'domestic',
    coordinates: [131.4489, 31.8772],
    radiusKm: 6
  },
  {
    id: 'TAK',
    name: '高松空港',
    nameEn: 'Takamatsu Airport',
    type: 'domestic',
    coordinates: [134.0159, 34.2142],
    radiusKm: 6
  },
  {
    id: 'MYJ',
    name: '松山空港',
    nameEn: 'Matsuyama Airport',
    type: 'domestic',
    coordinates: [132.6997, 33.8272],
    radiusKm: 6
  },
  {
    id: 'KCZ',
    name: '高知龍馬空港',
    nameEn: 'Kochi Ryoma Airport',
    type: 'domestic',
    coordinates: [133.6694, 33.5461],
    radiusKm: 6
  },
  {
    id: 'TKS',
    name: '徳島空港',
    nameEn: 'Tokushima Airport',
    type: 'domestic',
    coordinates: [134.6067, 34.1328],
    radiusKm: 6
  },
  {
    id: 'OKJ',
    name: '岡山空港',
    nameEn: 'Okayama Airport',
    type: 'domestic',
    coordinates: [133.855, 34.7569],
    radiusKm: 6
  },
  {
    id: 'UBJ',
    name: '山口宇部空港',
    nameEn: 'Yamaguchi Ube Airport',
    type: 'domestic',
    coordinates: [131.2789, 33.93],
    radiusKm: 6
  },
  {
    id: 'IZO',
    name: '出雲空港',
    nameEn: 'Izumo Airport',
    type: 'domestic',
    coordinates: [132.89, 35.4136],
    radiusKm: 6
  },
  {
    id: 'TTJ',
    name: '鳥取空港',
    nameEn: 'Tottori Airport',
    type: 'domestic',
    coordinates: [134.1669, 35.53],
    radiusKm: 6
  },
  {
    id: 'KMQ',
    name: '小松空港',
    nameEn: 'Komatsu Airport',
    type: 'domestic',
    coordinates: [136.4067, 36.3947],
    radiusKm: 6
  },
  {
    id: 'TOY',
    name: '富山空港',
    nameEn: 'Toyama Airport',
    type: 'domestic',
    coordinates: [137.1878, 36.6483],
    radiusKm: 6
  },
  {
    id: 'NKM',
    name: '県営名古屋空港',
    nameEn: 'Nagoya Airfield',
    type: 'domestic',
    coordinates: [136.9239, 35.255],
    radiusKm: 6
  },
  {
    id: 'FSZ',
    name: '静岡空港',
    nameEn: 'Shizuoka Airport',
    type: 'domestic',
    coordinates: [138.19, 34.7961],
    radiusKm: 6
  },
  {
    id: 'MMJ',
    name: '松本空港',
    nameEn: 'Matsumoto Airport',
    type: 'domestic',
    coordinates: [137.9228, 36.1669],
    radiusKm: 6
  },
  {
    id: 'KIJ',
    name: '新潟空港',
    nameEn: 'Niigata Airport',
    type: 'domestic',
    coordinates: [139.1211, 37.9558],
    radiusKm: 6
  },
  {
    id: 'AKJ',
    name: '旭川空港',
    nameEn: 'Asahikawa Airport',
    type: 'domestic',
    coordinates: [142.4475, 43.6708],
    radiusKm: 6
  },
  {
    id: 'HKD',
    name: '函館空港',
    nameEn: 'Hakodate Airport',
    type: 'domestic',
    coordinates: [140.8219, 41.77],
    radiusKm: 6
  }
]

/**
 * 地方空港・小規模空港データ
 * ※ map-auto-waypointより移植、座標・半径は参考値
 * ※ 正確な制限区域はDIPSで確認してください
 */
export const REGIONAL_AIRPORTS: Airport[] = [
  // ========== 北海道 ==========
  {
    id: 'OBO',
    name: '帯広空港',
    nameEn: 'Obihiro Airport',
    type: 'domestic',
    coordinates: [143.2172, 42.7333],
    radiusKm: 6
  },
  {
    id: 'KUH',
    name: '釧路空港',
    nameEn: 'Kushiro Airport',
    type: 'domestic',
    coordinates: [144.1928, 43.0411],
    radiusKm: 6
  },
  {
    id: 'MMB',
    name: '女満別空港',
    nameEn: 'Memanbetsu Airport',
    type: 'domestic',
    coordinates: [144.1644, 43.8806],
    radiusKm: 6
  },
  {
    id: 'SHB',
    name: '中標津空港',
    nameEn: 'Nakashibetsu Airport',
    type: 'domestic',
    coordinates: [144.96, 43.5775],
    radiusKm: 3
  },
  {
    id: 'MBE',
    name: '紋別空港',
    nameEn: 'Monbetsu Airport',
    type: 'domestic',
    coordinates: [143.4044, 44.3039],
    radiusKm: 3
  },
  {
    id: 'WKJ',
    name: '稚内空港',
    nameEn: 'Wakkanai Airport',
    type: 'domestic',
    coordinates: [141.8008, 45.4042],
    radiusKm: 6
  },
  {
    id: 'RIS',
    name: '利尻空港',
    nameEn: 'Rishiri Airport',
    type: 'domestic',
    coordinates: [141.1864, 45.2411],
    radiusKm: 3
  },
  {
    id: 'OIR',
    name: '奥尻空港',
    nameEn: 'Okushiri Airport',
    type: 'domestic',
    coordinates: [139.4328, 42.0717],
    radiusKm: 2
  },
  {
    id: 'RJCO',
    name: '丘珠空港',
    nameEn: 'Okadama Airport',
    type: 'domestic',
    coordinates: [141.3816, 43.1176],
    radiusKm: 3
  },
  // ========== 東北 ==========
  {
    id: 'AOJ',
    name: '青森空港',
    nameEn: 'Aomori Airport',
    type: 'domestic',
    coordinates: [140.6908, 40.7347],
    radiusKm: 6
  },
  {
    id: 'MSJ',
    name: '三沢空港',
    nameEn: 'Misawa Airport',
    type: 'domestic',
    coordinates: [141.3686, 40.7033],
    radiusKm: 6
  },
  {
    id: 'HNA',
    name: '花巻空港',
    nameEn: 'Hanamaki Airport',
    type: 'domestic',
    coordinates: [141.1353, 39.4286],
    radiusKm: 6
  },
  {
    id: 'AXT',
    name: '秋田空港',
    nameEn: 'Akita Airport',
    type: 'domestic',
    coordinates: [140.2186, 39.6156],
    radiusKm: 6
  },
  {
    id: 'ONJ',
    name: '大館能代空港',
    nameEn: 'Odate-Noshiro Airport',
    type: 'domestic',
    coordinates: [140.3714, 40.1919],
    radiusKm: 3
  },
  {
    id: 'GAJ',
    name: '山形空港',
    nameEn: 'Yamagata Airport',
    type: 'domestic',
    coordinates: [140.3714, 38.4119],
    radiusKm: 6
  },
  {
    id: 'SYO',
    name: '庄内空港',
    nameEn: 'Shonai Airport',
    type: 'domestic',
    coordinates: [139.7878, 38.8122],
    radiusKm: 3
  },
  {
    id: 'FKS',
    name: '福島空港',
    nameEn: 'Fukushima Airport',
    type: 'domestic',
    coordinates: [140.4311, 37.2275],
    radiusKm: 6
  },
  // ========== 関東（離島・飛行場） ==========
  {
    id: 'RJTF',
    name: '調布飛行場',
    nameEn: 'Chofu Airport',
    type: 'domestic',
    coordinates: [139.5281, 35.6717],
    radiusKm: 3
  },
  {
    id: 'IBR',
    name: '茨城空港',
    nameEn: 'Ibaraki Airport',
    type: 'domestic',
    coordinates: [140.4156, 36.1811],
    radiusKm: 6
  },
  {
    id: 'OIM',
    name: '大島空港',
    nameEn: 'Oshima Airport',
    type: 'domestic',
    coordinates: [139.3603, 34.7822],
    radiusKm: 3
  },
  {
    id: 'MYE',
    name: '三宅島空港',
    nameEn: 'Miyakejima Airport',
    type: 'domestic',
    coordinates: [139.5603, 34.0736],
    radiusKm: 3
  },
  {
    id: 'HAC',
    name: '八丈島空港',
    nameEn: 'Hachijojima Airport',
    type: 'domestic',
    coordinates: [139.7858, 33.1153],
    radiusKm: 3
  },
  // ========== 北陸 ==========
  {
    id: 'NTQ',
    name: '能登空港',
    nameEn: 'Noto Airport',
    type: 'domestic',
    coordinates: [136.9619, 37.2931],
    radiusKm: 3
  },
  {
    id: 'FKJ',
    name: '福井空港',
    nameEn: 'Fukui Airport',
    type: 'domestic',
    coordinates: [136.2236, 36.1428],
    radiusKm: 2
  },
  // ========== 近畿 ==========
  {
    id: 'UKB',
    name: '神戸空港',
    nameEn: 'Kobe Airport',
    type: 'domestic',
    coordinates: [135.2239, 34.6328],
    radiusKm: 6
  },
  {
    id: 'SHM',
    name: '南紀白浜空港',
    nameEn: 'Nanki-Shirahama Airport',
    type: 'domestic',
    coordinates: [135.3644, 33.6622],
    radiusKm: 3
  },
  {
    id: 'TJH',
    name: '但馬空港',
    nameEn: 'Tajima Airport',
    type: 'domestic',
    coordinates: [134.7869, 35.5128],
    radiusKm: 2
  },
  // ========== 中国 ==========
  {
    id: 'IWJ',
    name: '石見空港',
    nameEn: 'Iwami Airport',
    type: 'domestic',
    coordinates: [131.7906, 34.6764],
    radiusKm: 3
  },
  {
    id: 'YGJ',
    name: '米子空港',
    nameEn: 'Yonago Airport',
    type: 'domestic',
    coordinates: [133.2364, 35.4922],
    radiusKm: 6
  },
  {
    id: 'IWK',
    name: '岩国空港',
    nameEn: 'Iwakuni Kintaikyo Airport',
    type: 'domestic',
    coordinates: [132.2361, 34.1456],
    radiusKm: 6
  },
  // ========== 九州（本土追加） ==========
  {
    id: 'KKJ',
    name: '北九州空港',
    nameEn: 'Kitakyushu Airport',
    type: 'domestic',
    coordinates: [131.0349, 33.8459],
    radiusKm: 6
  },
  {
    id: 'HSG',
    name: '佐賀空港',
    nameEn: 'Saga Airport',
    type: 'domestic',
    coordinates: [130.3022, 33.1497],
    radiusKm: 3
  },
  // ========== 九州（離島） ==========
  {
    id: 'TSJ',
    name: '対馬空港',
    nameEn: 'Tsushima Airport',
    type: 'domestic',
    coordinates: [129.3306, 34.285],
    radiusKm: 3
  },
  {
    id: 'IKI',
    name: '壱岐空港',
    nameEn: 'Iki Airport',
    type: 'domestic',
    coordinates: [129.7853, 33.7489],
    radiusKm: 2
  },
  {
    id: 'FUJ',
    name: '福江空港',
    nameEn: 'Fukue Airport',
    type: 'domestic',
    coordinates: [128.8328, 32.6664],
    radiusKm: 3
  },
  {
    id: 'TNE',
    name: '種子島空港',
    nameEn: 'Tanegashima Airport',
    type: 'domestic',
    coordinates: [130.9917, 30.6056],
    radiusKm: 3
  },
  {
    id: 'KUM',
    name: '屋久島空港',
    nameEn: 'Yakushima Airport',
    type: 'domestic',
    coordinates: [130.6589, 30.3856],
    radiusKm: 3
  },
  {
    id: 'ASJ',
    name: '奄美空港',
    nameEn: 'Amami Airport',
    type: 'domestic',
    coordinates: [129.7125, 28.4306],
    radiusKm: 6
  },
  {
    id: 'TKN',
    name: '徳之島空港',
    nameEn: 'Tokunoshima Airport',
    type: 'domestic',
    coordinates: [128.8817, 27.8364],
    radiusKm: 3
  },
  {
    id: 'OKE',
    name: '沖永良部空港',
    nameEn: 'Okinoerabu Airport',
    type: 'domestic',
    coordinates: [128.7011, 27.4256],
    radiusKm: 2
  },
  {
    id: 'RNJ',
    name: '与論空港',
    nameEn: 'Yoron Airport',
    type: 'domestic',
    coordinates: [128.4014, 27.0439],
    radiusKm: 2
  },
  // ========== 沖縄 ==========
  {
    id: 'ISG',
    name: '新石垣空港',
    nameEn: 'New Ishigaki Airport',
    type: 'domestic',
    coordinates: [124.245, 24.3964],
    radiusKm: 6
  },
  {
    id: 'MMY',
    name: '宮古空港',
    nameEn: 'Miyako Airport',
    type: 'domestic',
    coordinates: [125.295, 24.7828],
    radiusKm: 6
  },
  {
    id: 'SHI',
    name: '下地島空港',
    nameEn: 'Shimojishima Airport',
    type: 'domestic',
    coordinates: [125.1447, 24.8267],
    radiusKm: 6
  },
  {
    id: 'UEO',
    name: '久米島空港',
    nameEn: 'Kumejima Airport',
    type: 'domestic',
    coordinates: [126.7139, 26.3636],
    radiusKm: 3
  },
  {
    id: 'OGN',
    name: '与那国空港',
    nameEn: 'Yonaguni Airport',
    type: 'domestic',
    coordinates: [122.9789, 24.4669],
    radiusKm: 3
  }
]

/**
 * 自衛隊・米軍基地データ
 * ※ 制限区域は基地ごとに異なります
 * ※ 小型無人機等飛行禁止法により上空飛行は禁止されています
 */
export const MILITARY_BASES: Airport[] = [
  // ========== 航空自衛隊 ==========
  {
    id: 'RJAH',
    name: '百里基地',
    nameEn: 'Hyakuri Air Base',
    type: 'military',
    coordinates: [140.4147, 36.1811],
    radiusKm: 6
  },
  {
    id: 'RJFK',
    name: '築城基地',
    nameEn: 'Tsuiki Air Base',
    type: 'military',
    coordinates: [131.04, 33.685],
    radiusKm: 4
  },
  {
    id: 'RJFN',
    name: '新田原基地',
    nameEn: 'Nyutabaru Air Base',
    type: 'military',
    coordinates: [131.45, 32.0833],
    radiusKm: 4
  },
  {
    id: 'RJNA',
    name: '浜松基地',
    nameEn: 'Hamamatsu Air Base',
    type: 'military',
    coordinates: [137.7033, 34.7503],
    radiusKm: 4
  },
  {
    id: 'RJNK',
    name: '小松基地',
    nameEn: 'Komatsu Air Base',
    type: 'military',
    coordinates: [136.4065, 36.3946],
    radiusKm: 6
  },
  {
    id: 'RJSA',
    name: '三沢基地（空自）',
    nameEn: 'Misawa Air Base (JASDF)',
    type: 'military',
    coordinates: [141.3686, 40.7033],
    radiusKm: 6
  },
  {
    id: 'RJCJ',
    name: '千歳基地',
    nameEn: 'Chitose Air Base',
    type: 'military',
    coordinates: [141.6667, 42.7944],
    radiusKm: 6
  },
  {
    id: 'RJTE',
    name: '入間基地',
    nameEn: 'Iruma Air Base',
    type: 'military',
    coordinates: [139.4108, 35.8419],
    radiusKm: 4
  },
  // ========== 在日米軍 ==========
  {
    id: 'RJTY',
    name: '横田基地',
    nameEn: 'Yokota Air Base',
    type: 'military',
    coordinates: [139.3486, 35.7486],
    radiusKm: 6
  },
  {
    id: 'RJTA',
    name: '厚木基地',
    nameEn: 'Naval Air Facility Atsugi',
    type: 'military',
    coordinates: [139.45, 35.4547],
    radiusKm: 6
  },
  {
    id: 'RJOI',
    name: '岩国基地',
    nameEn: 'Marine Corps Air Station Iwakuni',
    type: 'military',
    coordinates: [132.2361, 34.1456],
    radiusKm: 6
  },
  {
    id: 'RODN',
    name: '嘉手納基地',
    nameEn: 'Kadena Air Base',
    type: 'military',
    coordinates: [127.7675, 26.3516],
    radiusKm: 6
  },
  {
    id: 'ROTM',
    name: '普天間基地',
    nameEn: 'Marine Corps Air Station Futenma',
    type: 'military',
    coordinates: [127.7558, 26.2742],
    radiusKm: 4
  }
]

/**
 * ヘリポートデータ
 * ※ map-auto-waypointより移植
 * ※ ドクターヘリ・緊急用ヘリポートを含む
 */
export const HELIPORTS: Airport[] = [
  // ========== 主要ヘリポート ==========
  {
    id: 'RJTI',
    name: '東京ヘリポート',
    nameEn: 'Tokyo Heliport',
    type: 'heliport',
    coordinates: [139.8372, 35.6403],
    radiusKm: 0.5
  },
  {
    id: 'HLP-YAO',
    name: '八尾ヘリポート',
    nameEn: 'Yao Heliport',
    type: 'heliport',
    coordinates: [135.6019, 34.5967],
    radiusKm: 0.5
  },
  {
    id: 'HLP-MAI',
    name: '舞洲ヘリポート',
    nameEn: 'Maishima Heliport',
    type: 'heliport',
    coordinates: [135.3931, 34.6592],
    radiusKm: 0.5
  },
  {
    id: 'HLP-YOK',
    name: '横浜ヘリポート',
    nameEn: 'Yokohama Heliport',
    type: 'heliport',
    coordinates: [139.6333, 35.4667],
    radiusKm: 0.5
  },
  {
    id: 'HLP-NAG',
    name: '名古屋ヘリポート',
    nameEn: 'Nagoya Heliport',
    type: 'heliport',
    coordinates: [136.9, 35.1833],
    radiusKm: 0.5
  },
  // ========== ビル屋上ヘリポート ==========
  {
    id: 'HLP-TORA',
    name: '虎ノ門ヒルズヘリポート',
    nameEn: 'Toranomon Hills Heliport',
    type: 'heliport',
    coordinates: [139.75, 35.6667],
    radiusKm: 0.2
  },
  {
    id: 'HLP-ROPPONGI',
    name: '六本木ヒルズヘリポート',
    nameEn: 'Roppongi Hills Heliport',
    type: 'heliport',
    coordinates: [139.7292, 35.6603],
    radiusKm: 0.2
  },
  // ========== 病院ヘリポート（ドクターヘリ） ==========
  {
    id: 'HLP-LUKE',
    name: '聖路加国際病院ヘリポート',
    nameEn: "St. Luke's Hospital Heliport",
    type: 'heliport',
    coordinates: [139.7731, 35.6714],
    radiusKm: 0.2
  },
  {
    id: 'HLP-NMC',
    name: '日本医科大学付属病院ヘリポート',
    nameEn: 'Nippon Medical School Hospital Heliport',
    type: 'heliport',
    coordinates: [139.7683, 35.7028],
    radiusKm: 0.2
  }
]

/**
 * Get all airports (major + regional + military)
 */
export function getAllAirports(): Airport[] {
  return [...MAJOR_AIRPORTS, ...REGIONAL_AIRPORTS, ...MILITARY_BASES]
}

/**
 * Get all airports including heliports
 */
export function getAllAirportsWithHeliports(): Airport[] {
  return [...MAJOR_AIRPORTS, ...REGIONAL_AIRPORTS, ...MILITARY_BASES, ...HELIPORTS]
}

/**
 * Get airports that require special restrictions (小型無人機等飛行禁止法)
 */
export function getNoFlyLawAirports(): Airport[] {
  return MAJOR_AIRPORTS.filter((a) => a.radiusKm >= 24)
}

/**
 * Generate GeoJSON for airport restriction zones
 */
export function generateAirportGeoJSON(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []

  for (const airport of getAllAirports()) {
    const polygon = createCirclePolygon(airport.coordinates, airport.radiusKm)

    features.push({
      type: 'Feature',
      properties: {
        id: airport.id,
        name: airport.name,
        nameEn: airport.nameEn,
        type: airport.type,
        radiusKm: airport.radiusKm
      },
      geometry: polygon
    })
  }

  return {
    type: 'FeatureCollection',
    features
  }
}

/**
 * Generate GeoJSON for airport markers (points)
 */
export function generateAirportMarkersGeoJSON(): GeoJSON.FeatureCollection<
  GeoJSON.Point,
  AirportMarkerProperties
> {
  const features: Array<GeoJSON.Feature<GeoJSON.Point, AirportMarkerProperties>> =
    getAllAirports().map((airport) => ({
      type: 'Feature',
      properties: {
        id: airport.id,
        name: airport.name,
        nameEn: airport.nameEn,
        type: airport.type,
        radiusKm: airport.radiusKm
      },
      geometry: {
        type: 'Point',
        coordinates: airport.coordinates
      }
    }))

  return {
    type: 'FeatureCollection',
    features
  }
}

/**
 * Generate GeoJSON for heliports only
 */
export function generateHeliportGeoJSON(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = HELIPORTS.map((heliport) => ({
    type: 'Feature',
    properties: {
      id: heliport.id,
      name: heliport.name,
      nameEn: heliport.nameEn,
      type: 'heliport',
      radiusKm: heliport.radiusKm
    },
    geometry: createCirclePolygon(heliport.coordinates, heliport.radiusKm)
  }))

  return {
    type: 'FeatureCollection',
    features
  }
}

/**
 * Check if a point is within any airport restriction zone
 */
export function isInAirportZone(lat: number, lng: number): { inZone: boolean; airport?: Airport } {
  for (const airport of getAllAirports()) {
    const distance = calculateDistance(lat, lng, airport.coordinates[1], airport.coordinates[0])

    if (distance <= airport.radiusKm) {
      return { inZone: true, airport }
    }
  }

  return { inZone: false }
}

export const AirportService = {
  getAllAirports,
  getNoFlyLawAirports,
  generateGeoJSON: generateAirportGeoJSON,
  generateMarkers: generateAirportMarkersGeoJSON,
  isInZone: isInAirportZone
}
