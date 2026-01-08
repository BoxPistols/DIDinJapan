/**
 * RainViewer API Service - Rain Radar Data
 * https://www.rainviewer.com/api.html
 */

interface RainViewerTimestamp {
  time: number
  path: string
}

interface RainViewerData {
  version: string
  generated: number
  host: string
  radar: {
    past: RainViewerTimestamp[]
    nowcast: RainViewerTimestamp[]
  }
  satellite?: {
    infrared: RainViewerTimestamp[]
  }
}

const API_URL = 'https://api.rainviewer.com/public/weather-maps.json'
const TILE_BASE_URL = 'https://tilecache.rainviewer.com'

/**
 * Fetch the latest rain radar timestamp from RainViewer API
 * Returns a mock path prefixed with "(見本)" on API failure
 */
export async function fetchRainRadarTimestamp(): Promise<string | null> {
  try {
    const response = await fetch(API_URL)
    const data: RainViewerData = await response.json()

    if (data.radar?.past?.length > 0) {
      // Get the latest timestamp
      const latest = data.radar.past[data.radar.past.length - 1]
      return latest.path
    }
    return null
  } catch (error) {
    console.error('Failed to fetch rain radar timestamp:', error)
    // Return mock path with sample marker on API failure
    const mockDate = new Date()
    const mockTimestamp = Math.floor(mockDate.getTime() / 1000)
    return `(見本)/radar/${mockTimestamp}/256`
  }
}

/**
 * Get all available radar timestamps (for animation)
 */
export async function fetchAllRadarTimestamps(): Promise<RainViewerTimestamp[]> {
  try {
    const response = await fetch(API_URL)
    const data: RainViewerData = await response.json()

    return [...(data.radar?.past || []), ...(data.radar?.nowcast || [])]
  } catch (error) {
    console.error('Failed to fetch radar timestamps:', error)
    return []
  }
}

/**
 * Build tile URL from path
 * @param path Path from API (e.g., "/radar/1234567890/256")
 * @param options Tile options
 */
export function buildRainTileUrl(
  path: string,
  options: {
    size?: 256 | 512
    colorScheme?: number // 0-8
    smoothing?: 0 | 1
    snow?: 0 | 1
  } = {}
): string {
  const { size = 256, colorScheme = 2, smoothing = 1, snow = 1 } = options
  return `${TILE_BASE_URL}${path}/${size}/{z}/{x}/{y}/${colorScheme}/${smoothing}_${snow}.png`
}

/**
 * Get formatted timestamp from path
 */
export function getTimestampFromPath(path: string): Date | null {
  const match = path.match(/\/(\d+)\//)
  if (match) {
    return new Date(parseInt(match[1]) * 1000)
  }
  return null
}

/**
 * Format timestamp for display
 * Includes "(見本)" prefix if this is a mock path
 */
export function formatRadarTimestamp(path: string): string {
  const isMock = path.includes('(見本)')
  const date = getTimestampFromPath(path)
  if (date) {
    const timeStr = date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    })
    return isMock ? `(見本)${timeStr}` : timeStr
  }
  return ''
}

export const RainViewerService = {
  fetchTimestamp: fetchRainRadarTimestamp,
  fetchAllTimestamps: fetchAllRadarTimestamps,
  buildTileUrl: buildRainTileUrl,
  formatTimestamp: formatRadarTimestamp
}
