/**
 * GeoJSONデータのキャッシュ管理
 * Cache APIを使用してネットワークリクエストを削減
 */

const CACHE_NAME = 'didj-geojson-v1'
const CACHE_EXPIRATION_DAYS = 7 // 7日間キャッシュ

interface CachedData<T = unknown> {
  data: T
  timestamp: number
}

/**
 * Cache APIが利用可能かチェック
 */
const isCacheAvailable = (): boolean => {
  return 'caches' in window
}

/**
 * GeoJSONデータをキャッシュから取得
 */
export const getCachedGeoJSON = async <T = GeoJSON.FeatureCollection>(
  url: string
): Promise<T | null> => {
  if (!isCacheAvailable()) return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(url)

    if (!response) return null

    const cachedData: CachedData<T> = await response.json()
    const now = Date.now()
    const expirationMs = CACHE_EXPIRATION_DAYS * 24 * 60 * 60 * 1000

    // キャッシュが期限切れの場合は削除して null を返す
    if (now - cachedData.timestamp > expirationMs) {
      await cache.delete(url)
      return null
    }

    return cachedData.data
  } catch (error) {
    console.warn('Failed to get cached data:', error)
    return null
  }
}

/**
 * GeoJSONデータをキャッシュに保存
 */
export const setCachedGeoJSON = async <T = GeoJSON.FeatureCollection>(
  url: string,
  data: T
): Promise<void> => {
  if (!isCacheAvailable()) return

  try {
    const cache = await caches.open(CACHE_NAME)
    const cachedData: CachedData<T> = {
      data,
      timestamp: Date.now()
    }

    const response = new Response(JSON.stringify(cachedData), {
      headers: { 'Content-Type': 'application/json' }
    })

    await cache.put(url, response)
  } catch (error) {
    console.warn('Failed to cache data:', error)
  }
}

/**
 * GeoJSONデータをfetchし、キャッシュを活用
 */
export const fetchGeoJSONWithCache = async <T = GeoJSON.FeatureCollection>(
  url: string
): Promise<T> => {
  // まずキャッシュを確認
  const cached = await getCachedGeoJSON<T>(url)
  if (cached) {
    return cached
  }

  // キャッシュにない場合はfetch
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as T

  // 取得したデータをキャッシュに保存
  await setCachedGeoJSON(url, data)

  return data
}

/**
 * 古いキャッシュをクリア
 */
export const clearOldCaches = async (): Promise<void> => {
  if (!isCacheAvailable()) return

  try {
    const cacheNames = await caches.keys()
    const deletePromises = cacheNames
      .filter((name) => name !== CACHE_NAME && name.startsWith('didj-geojson'))
      .map((name) => caches.delete(name))

    await Promise.all(deletePromises)
  } catch (error) {
    console.warn('Failed to clear old caches:', error)
  }
}
