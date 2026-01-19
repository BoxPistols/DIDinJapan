/**
 * Weather API Service using Open-Meteo (free, no API key required)
 * https://open-meteo.com/
 *
 * Features:
 * - Current weather for all 47 prefectures
 * - Hourly forecast (48 hours)
 * - Daily forecast (7 days)
 */

export interface WeatherData {
  temperature: number
  weatherCode: number
  windSpeed: number
  humidity: number
  precipitation: number
}

export interface HourlyForecast {
  time: string
  temperature: number
  weatherCode: number
  windSpeed: number
  humidity: number
  precipitation: number
}

export interface DailyForecast {
  date: string
  weatherCode: number
  temperatureMax: number
  temperatureMin: number
  precipitationSum: number
  windSpeedMax: number
}

export interface PrefectureWeather {
  current: WeatherData
  hourly: HourlyForecast[]
  daily: DailyForecast[]
}

export interface CityWeather {
  id: string
  name: string
  coordinates: [number, number]
  weather: WeatherData | null
  loading: boolean
  error: string | null
}

// WMO Weather interpretation codes
// https://open-meteo.com/en/docs
export function getWeatherDescription(code: number): {
  type: 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'snowy' | 'stormy'
  icon: string
  label: string
} {
  if (code === 0) return { type: 'sunny', icon: '☀️', label: '快晴' }
  if (code === 1) return { type: 'sunny', icon: '🌤️', label: '晴れ' }
  if (code === 2) return { type: 'partly_cloudy', icon: '⛅', label: '一部曇り' }
  if (code === 3) return { type: 'cloudy', icon: '☁️', label: '曇り' }
  if (code >= 45 && code <= 48) return { type: 'cloudy', icon: '🌫️', label: '霧' }
  if (code >= 51 && code <= 55) return { type: 'rainy', icon: '🌦️', label: '霧雨' }
  if (code >= 56 && code <= 57) return { type: 'snowy', icon: '🌨️', label: '着氷性霧雨' }
  if (code >= 61 && code <= 65) return { type: 'rainy', icon: '🌧️', label: '雨' }
  if (code >= 66 && code <= 67) return { type: 'snowy', icon: '🌨️', label: '着氷性の雨' }
  if (code >= 71 && code <= 75) return { type: 'snowy', icon: '❄️', label: '雪' }
  if (code === 77) return { type: 'snowy', icon: '🌨️', label: '霧雪' }
  if (code >= 80 && code <= 82) return { type: 'rainy', icon: '🌧️', label: 'にわか雨' }
  if (code >= 85 && code <= 86) return { type: 'snowy', icon: '❄️', label: 'にわか雪' }
  if (code === 95) return { type: 'stormy', icon: '⛈️', label: '雷雨' }
  if (code >= 96 && code <= 99) return { type: 'stormy', icon: '⛈️', label: '雷雨（雹）' }
  return { type: 'cloudy', icon: '🌡️', label: '不明' }
}

// All 47 prefectures with their capital cities
export const JAPAN_PREFECTURES = [
  // 北海道
  { id: 'hokkaido', name: '北海道', capital: '札幌', lat: 43.06, lng: 141.35, region: '北海道' },
  // 東北
  { id: 'aomori', name: '青森県', capital: '青森', lat: 40.82, lng: 140.74, region: '東北' },
  { id: 'iwate', name: '岩手県', capital: '盛岡', lat: 39.70, lng: 141.15, region: '東北' },
  { id: 'miyagi', name: '宮城県', capital: '仙台', lat: 38.27, lng: 140.87, region: '東北' },
  { id: 'akita', name: '秋田県', capital: '秋田', lat: 39.72, lng: 140.10, region: '東北' },
  { id: 'yamagata', name: '山形県', capital: '山形', lat: 38.24, lng: 140.33, region: '東北' },
  { id: 'fukushima', name: '福島県', capital: '福島', lat: 37.75, lng: 140.47, region: '東北' },
  // 関東
  { id: 'ibaraki', name: '茨城県', capital: '水戸', lat: 36.34, lng: 140.45, region: '関東' },
  { id: 'tochigi', name: '栃木県', capital: '宇都宮', lat: 36.57, lng: 139.88, region: '関東' },
  { id: 'gunma', name: '群馬県', capital: '前橋', lat: 36.39, lng: 139.06, region: '関東' },
  { id: 'saitama', name: '埼玉県', capital: 'さいたま', lat: 35.86, lng: 139.65, region: '関東' },
  { id: 'chiba', name: '千葉県', capital: '千葉', lat: 35.61, lng: 140.12, region: '関東' },
  { id: 'tokyo', name: '東京都', capital: '東京', lat: 35.68, lng: 139.75, region: '関東' },
  { id: 'kanagawa', name: '神奈川県', capital: '横浜', lat: 35.44, lng: 139.64, region: '関東' },
  // 中部
  { id: 'niigata', name: '新潟県', capital: '新潟', lat: 37.90, lng: 139.02, region: '中部' },
  { id: 'toyama', name: '富山県', capital: '富山', lat: 36.70, lng: 137.21, region: '中部' },
  { id: 'ishikawa', name: '石川県', capital: '金沢', lat: 36.59, lng: 136.63, region: '中部' },
  { id: 'fukui', name: '福井県', capital: '福井', lat: 36.07, lng: 136.22, region: '中部' },
  { id: 'yamanashi', name: '山梨県', capital: '甲府', lat: 35.66, lng: 138.57, region: '中部' },
  { id: 'nagano', name: '長野県', capital: '長野', lat: 36.65, lng: 138.18, region: '中部' },
  { id: 'gifu', name: '岐阜県', capital: '岐阜', lat: 35.39, lng: 136.72, region: '中部' },
  { id: 'shizuoka', name: '静岡県', capital: '静岡', lat: 34.98, lng: 138.38, region: '中部' },
  { id: 'aichi', name: '愛知県', capital: '名古屋', lat: 35.18, lng: 136.91, region: '中部' },
  // 近畿
  { id: 'mie', name: '三重県', capital: '津', lat: 34.73, lng: 136.51, region: '近畿' },
  { id: 'shiga', name: '滋賀県', capital: '大津', lat: 35.00, lng: 135.87, region: '近畿' },
  { id: 'kyoto', name: '京都府', capital: '京都', lat: 35.01, lng: 135.77, region: '近畿' },
  { id: 'osaka', name: '大阪府', capital: '大阪', lat: 34.69, lng: 135.50, region: '近畿' },
  { id: 'hyogo', name: '兵庫県', capital: '神戸', lat: 34.69, lng: 135.19, region: '近畿' },
  { id: 'nara', name: '奈良県', capital: '奈良', lat: 34.69, lng: 135.83, region: '近畿' },
  { id: 'wakayama', name: '和歌山県', capital: '和歌山', lat: 34.23, lng: 135.17, region: '近畿' },
  // 中国
  { id: 'tottori', name: '鳥取県', capital: '鳥取', lat: 35.50, lng: 134.24, region: '中国' },
  { id: 'shimane', name: '島根県', capital: '松江', lat: 35.47, lng: 133.05, region: '中国' },
  { id: 'okayama', name: '岡山県', capital: '岡山', lat: 34.66, lng: 133.93, region: '中国' },
  { id: 'hiroshima', name: '広島県', capital: '広島', lat: 34.40, lng: 132.46, region: '中国' },
  { id: 'yamaguchi', name: '山口県', capital: '山口', lat: 34.19, lng: 131.47, region: '中国' },
  // 四国
  { id: 'tokushima', name: '徳島県', capital: '徳島', lat: 34.07, lng: 134.56, region: '四国' },
  { id: 'kagawa', name: '香川県', capital: '高松', lat: 34.34, lng: 134.05, region: '四国' },
  { id: 'ehime', name: '愛媛県', capital: '松山', lat: 33.84, lng: 132.77, region: '四国' },
  { id: 'kochi', name: '高知県', capital: '高知', lat: 33.56, lng: 133.53, region: '四国' },
  // 九州
  { id: 'fukuoka', name: '福岡県', capital: '福岡', lat: 33.60, lng: 130.42, region: '九州' },
  { id: 'saga', name: '佐賀県', capital: '佐賀', lat: 33.25, lng: 130.30, region: '九州' },
  { id: 'nagasaki', name: '長崎県', capital: '長崎', lat: 32.75, lng: 129.87, region: '九州' },
  { id: 'kumamoto', name: '熊本県', capital: '熊本', lat: 32.79, lng: 130.74, region: '九州' },
  { id: 'oita', name: '大分県', capital: '大分', lat: 33.24, lng: 131.61, region: '九州' },
  { id: 'miyazaki', name: '宮崎県', capital: '宮崎', lat: 31.91, lng: 131.42, region: '九州' },
  { id: 'kagoshima', name: '鹿児島県', capital: '鹿児島', lat: 31.60, lng: 130.56, region: '九州' },
  // 沖縄
  { id: 'okinawa', name: '沖縄県', capital: '那覇', lat: 26.21, lng: 127.68, region: '沖縄' },
]

// Legacy: Keep JAPAN_CITIES for backward compatibility
export const JAPAN_CITIES = JAPAN_PREFECTURES.map(p => ({
  id: p.id,
  name: p.capital,
  lat: p.lat,
  lng: p.lng
}))

/**
 * Fetch current weather for a single location
 */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,precipitation&timezone=Asia/Tokyo`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`)
  }

  const data = await response.json()

  return {
    temperature: Math.round(data.current.temperature_2m),
    weatherCode: data.current.weather_code,
    windSpeed: data.current.wind_speed_10m,
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation
  }
}

/**
 * Fetch full weather data including hourly and daily forecast
 */
export async function fetchPrefectureWeather(lat: number, lng: number): Promise<PrefectureWeather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,precipitation` +
    `&hourly=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,precipitation` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&timezone=Asia/Tokyo&forecast_days=7`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`)
  }

  const data = await response.json()

  // Current weather
  const current: WeatherData = {
    temperature: Math.round(data.current.temperature_2m),
    weatherCode: data.current.weather_code,
    windSpeed: data.current.wind_speed_10m,
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation
  }

  // Hourly forecast (next 48 hours)
  const hourly: HourlyForecast[] = data.hourly.time.slice(0, 48).map((time: string, i: number) => ({
    time,
    temperature: Math.round(data.hourly.temperature_2m[i]),
    weatherCode: data.hourly.weather_code[i],
    windSpeed: data.hourly.wind_speed_10m[i],
    humidity: data.hourly.relative_humidity_2m[i],
    precipitation: data.hourly.precipitation[i]
  }))

  // Daily forecast (7 days)
  const daily: DailyForecast[] = data.daily.time.map((date: string, i: number) => ({
    date,
    weatherCode: data.daily.weather_code[i],
    temperatureMax: Math.round(data.daily.temperature_2m_max[i]),
    temperatureMin: Math.round(data.daily.temperature_2m_min[i]),
    precipitationSum: data.daily.precipitation_sum[i],
    windSpeedMax: data.daily.wind_speed_10m_max[i]
  }))

  return { current, hourly, daily }
}

/**
 * Fetch weather for all Japanese prefectures (current only for map display)
 * Uses parallel requests for speed
 */
export async function fetchAllPrefecturesWeather(): Promise<Map<string, WeatherData>> {
  const results = new Map<string, WeatherData>()

  // Fetch all prefectures in parallel
  const promises = JAPAN_PREFECTURES.map(async (pref) => {
    try {
      const weather = await fetchWeather(pref.lat, pref.lng)
      return { id: pref.id, weather }
    } catch (error) {
      console.error(`Failed to fetch weather for ${pref.name}:`, error)
      return { id: pref.id, weather: null }
    }
  })

  const responses = await Promise.all(promises)

  for (const { id, weather } of responses) {
    if (weather) {
      results.set(id, weather)
    }
  }

  return results
}

// Legacy alias
export const fetchAllCitiesWeather = fetchAllPrefecturesWeather

/**
 * Generate GeoJSON with real weather data for all prefectures
 */
export async function generateRealWeatherGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  const weatherData = await fetchAllPrefecturesWeather()

  const features: GeoJSON.Feature[] = JAPAN_PREFECTURES.map((pref) => {
    const weather = weatherData.get(pref.id)
    const weatherInfo = weather
      ? getWeatherDescription(weather.weatherCode)
      : { type: 'cloudy' as const, icon: '❓', label: '取得中' }

    return {
      type: 'Feature',
      properties: {
        id: pref.id,
        name: pref.name,
        capital: pref.capital,
        region: pref.region,
        weather: weatherInfo.type,
        temperature: weather?.temperature ?? null,
        humidity: weather?.humidity ?? null,
        windSpeed: weather?.windSpeed ?? null,
        precipitation: weather?.precipitation ?? null,
        weatherLabel: weatherInfo.label,
        icon: weatherInfo.icon,
        label: weather ? `${weather.temperature}°` : '...'
      },
      geometry: {
        type: 'Point',
        coordinates: [pref.lng, pref.lat]
      }
    }
  })

  return { type: 'FeatureCollection', features }
}

/**
 * Get forecast data for a specific prefecture
 */
export async function getPrefectureForecast(prefectureId: string): Promise<{
  prefecture: typeof JAPAN_PREFECTURES[0]
  weather: PrefectureWeather
} | null> {
  const prefecture = JAPAN_PREFECTURES.find(p => p.id === prefectureId)
  if (!prefecture) return null

  try {
    const weather = await fetchPrefectureWeather(prefecture.lat, prefecture.lng)
    return { prefecture, weather }
  } catch (error) {
    console.error(`Failed to fetch forecast for ${prefecture.name}:`, error)
    return null
  }
}

/**
 * Get prefectures by region
 */
export function getPrefecturesByRegion(region: string) {
  return JAPAN_PREFECTURES.filter(p => p.region === region)
}

/**
 * Get all unique regions
 */
export function getAllRegions(): string[] {
  return [...new Set(JAPAN_PREFECTURES.map(p => p.region))]
}

/**
 * Format hourly time for display
 */
export function formatHourlyTime(isoTime: string): string {
  const date = new Date(isoTime)
  return `${date.getHours()}時`
}

/**
 * Format daily date for display
 */
export function formatDailyDate(isoDate: string): string {
  const date = new Date(isoDate)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
}

/**
 * Find the nearest prefecture from given coordinates
 */
export function findNearestPrefecture(lat: number, lng: number): typeof JAPAN_PREFECTURES[0] | null {
  // Check if coordinates are roughly in Japan's bounding box
  if (lat < 24 || lat > 46 || lng < 122 || lng > 154) {
    return null
  }

  let nearest = JAPAN_PREFECTURES[0]
  let minDistance = Infinity

  for (const pref of JAPAN_PREFECTURES) {
    // Simple Euclidean distance (good enough for this use case)
    const distance = Math.sqrt(
      Math.pow(lat - pref.lat, 2) + Math.pow(lng - pref.lng, 2)
    )
    if (distance < minDistance) {
      minDistance = distance
      nearest = pref
    }
  }

  return nearest
}
