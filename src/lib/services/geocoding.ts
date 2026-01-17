/**
 * Geocoding Service
 * OpenStreetMap Nominatim APIを使用した住所検索・逆ジオコーディング
 *
 * データソース: OpenStreetMap Nominatim
 * API制限: 1秒1リクエスト（デバウンス推奨）
 * 利用規約: https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org'

export interface GeocodingResult {
  displayName: string
  lat: number
  lng: number
  type: string
  importance: number
  address?: {
    state?: string // 都道府県
    city?: string // 市区町村
    town?: string // 町名
    suburb?: string // 地区
    road?: string // 道路名
    house_number?: string
    postcode?: string
  }
  boundingBox?: [number, number, number, number] // [minLat, maxLat, minLng, maxLng]
}

export interface SearchOptions {
  limit?: number
  country?: string
  viewbox?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
  bounded?: boolean
}

/**
 * 住所・建物名から座標を検索（フォワードジオコーディング）
 * @param query 検索クエリ（住所、建物名、地名等）
 * @param options 検索オプション
 * @returns 検索結果の配列
 */
export async function searchAddress(
  query: string,
  options: SearchOptions = {}
): Promise<GeocodingResult[]> {
  if (!query || query.trim().length < 2) {
    return []
  }

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: String(options.limit || 5),
    'accept-language': 'ja',
    countrycodes: options.country || 'jp'
  })

  // 検索範囲を制限（日本国内）
  if (options.viewbox) {
    params.append('viewbox', options.viewbox.join(','))
    if (options.bounded) {
      params.append('bounded', '1')
    }
  }

  try {
    const response = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: {
        'User-Agent': 'JapanDroneMapLibrary/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`)
    }

    const results = (await response.json()) as unknown
    if (!Array.isArray(results)) return []

    type NominatimSearchItem = Record<string, unknown>
    const parseNum = (v: unknown): number =>
      typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN
    const parseStr = (v: unknown): string => (typeof v === 'string' ? v : '')
    const parseBBox = (v: unknown): [number, number, number, number] | undefined => {
      if (!Array.isArray(v) || v.length !== 4) return undefined
      const nums = v.map((x) => (typeof x === 'string' || typeof x === 'number' ? Number(x) : NaN))
      return nums.every((n) => Number.isFinite(n))
        ? (nums as [number, number, number, number])
        : undefined
    }

    return (results as NominatimSearchItem[]).map((r) => ({
      displayName: parseStr(r.display_name),
      lat: parseNum(r.lat),
      lng: parseNum(r.lon),
      type: parseStr(r.type),
      importance: typeof r.importance === 'number' ? r.importance : 0,
      address:
        r.address && typeof r.address === 'object' && !Array.isArray(r.address)
          ? (r.address as GeocodingResult['address'])
          : undefined,
      boundingBox: parseBBox(r.boundingbox)
    }))
  } catch (error) {
    console.error('Geocoding error:', error)
    return []
  }
}

/**
 * 座標から住所を取得（逆ジオコーディング）
 * @param lat 緯度
 * @param lng 経度
 * @returns ジオコーディング結果
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'json',
    addressdetails: '1',
    'accept-language': 'ja'
  })

  try {
    const response = await fetch(`${NOMINATIM_URL}/reverse?${params}`, {
      headers: {
        'User-Agent': 'JapanDroneMapLibrary/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`)
    }

    const result = (await response.json()) as unknown
    if (!result || typeof result !== 'object' || Array.isArray(result)) return null

    const r = result as Record<string, unknown>
    if (r.error) {
      return null
    }

    return {
      displayName: typeof r.display_name === 'string' ? r.display_name : '',
      lat:
        typeof r.lat === 'string'
          ? Number.parseFloat(r.lat)
          : typeof r.lat === 'number'
            ? r.lat
            : NaN,
      lng:
        typeof r.lon === 'string'
          ? Number.parseFloat(r.lon)
          : typeof r.lon === 'number'
            ? r.lon
            : NaN,
      type: typeof r.type === 'string' ? r.type : '',
      importance: typeof r.importance === 'number' ? r.importance : 0,
      address:
        r.address && typeof r.address === 'object' && !Array.isArray(r.address)
          ? (r.address as GeocodingResult['address'])
          : undefined,
      boundingBox:
        Array.isArray(r.boundingbox) && r.boundingbox.length === 4
          ? (r.boundingbox.map((x) =>
              typeof x === 'string' || typeof x === 'number' ? Number(x) : NaN
            ) as [number, number, number, number])
          : undefined
    }
  } catch (error) {
    console.error('Reverse geocoding error:', error)
    return null
  }
}

/**
 * デバウンスヘルパー
 * 連続した呼び出しを遅延させ、最後の呼び出しのみ実行
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * 住所をフォーマット表示用に整形
 */
export function formatAddress(address: GeocodingResult['address']): string {
  if (!address) return ''

  const parts: string[] = []

  // 日本式住所フォーマット: 都道府県 > 市区町村 > 町名 > 詳細
  if (address.state) parts.push(address.state)
  if (address.city) parts.push(address.city)
  if (address.town) parts.push(address.town)
  if (address.suburb) parts.push(address.suburb)
  if (address.road) parts.push(address.road)
  if (address.house_number) parts.push(address.house_number)

  return parts.join(' ')
}

/**
 * 検索結果から地図をズームする範囲を計算
 */
export function getZoomBounds(result: GeocodingResult): {
  center: [number, number]
  zoom: number
  bounds?: [[number, number], [number, number]]
} {
  const center: [number, number] = [result.lng, result.lat]

  // バウンディングボックスがある場合はそれを使用
  if (result.boundingBox && result.boundingBox.length === 4) {
    const [minLat, maxLat, minLng, maxLng] = result.boundingBox
    return {
      center,
      zoom: 15, // フォールバック
      bounds: [
        [minLng, minLat],
        [maxLng, maxLat]
      ]
    }
  }

  // タイプに基づいてズームレベルを決定
  let zoom = 15

  switch (result.type) {
    case 'country':
      zoom = 5
      break
    case 'state':
    case 'region':
      zoom = 8
      break
    case 'city':
    case 'town':
      zoom = 12
      break
    case 'village':
    case 'suburb':
      zoom = 14
      break
    case 'neighbourhood':
    case 'quarter':
      zoom = 15
      break
    case 'building':
    case 'house':
    case 'address':
      zoom = 17
      break
    default:
      zoom = 15
  }

  return { center, zoom }
}

/**
 * 日本国内の主要都市の座標（ショートカット検索用）
 */
export const MAJOR_CITIES: Record<string, { lat: number; lng: number; zoom: number }> = {
  東京: { lat: 35.6812, lng: 139.7671, zoom: 11 },
  大阪: { lat: 34.6937, lng: 135.5023, zoom: 11 },
  名古屋: { lat: 35.1815, lng: 136.9066, zoom: 11 },
  福岡: { lat: 33.5904, lng: 130.4017, zoom: 11 },
  札幌: { lat: 43.0618, lng: 141.3545, zoom: 11 },
  横浜: { lat: 35.4437, lng: 139.638, zoom: 11 },
  神戸: { lat: 34.6901, lng: 135.1956, zoom: 11 },
  京都: { lat: 35.0116, lng: 135.7681, zoom: 11 },
  広島: { lat: 34.3853, lng: 132.4553, zoom: 11 },
  仙台: { lat: 38.2682, lng: 140.8694, zoom: 11 },
  沖縄: { lat: 26.2124, lng: 127.6809, zoom: 10 },
  那覇: { lat: 26.2124, lng: 127.6809, zoom: 12 }
}

/**
 * クイック検索: 主要都市名やショートカットで即座に検索
 */
export function quickSearch(query: string): { lat: number; lng: number; zoom: number } | null {
  const normalized = query.trim()
  return MAJOR_CITIES[normalized] || null
}

export const GeocodingService = {
  search: searchAddress,
  reverse: reverseGeocode,
  format: formatAddress,
  getZoomBounds,
  quickSearch,
  debounce,
  MAJOR_CITIES
}
