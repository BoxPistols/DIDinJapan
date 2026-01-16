import type maplibregl from 'maplibre-gl'

export type KokuareaSurfaceKind = 'approach' | 'transitional' | 'horizontal' | 'conical' | 'other'

export type KokuareaFeatureProperties = Record<string, unknown> & {
  __koku_kind?: KokuareaSurfaceKind
  __koku_label?: string
}

export const KOKUAREA_STYLE: Record<
  KokuareaSurfaceKind,
  { fillColor: string; lineColor: string; fillOpacity: number; lineWidth: number; label: string }
> = {
  approach: {
    fillColor: '#4CAF50',
    lineColor: '#2E7D32',
    fillOpacity: 0.25,
    lineWidth: 1.2,
    label: '進入表面'
  },
  transitional: {
    fillColor: '#FFC107',
    lineColor: '#FF8F00',
    fillOpacity: 0.22,
    lineWidth: 1.1,
    label: '転移表面'
  },
  horizontal: {
    fillColor: '#9C27B0',
    lineColor: '#6A1B9A',
    fillOpacity: 0.2,
    lineWidth: 1.1,
    label: '水平表面'
  },
  conical: {
    fillColor: '#2196F3',
    lineColor: '#1565C0',
    fillOpacity: 0.18,
    lineWidth: 1.0,
    label: '円錐表面'
  },
  other: {
    fillColor: '#90EE90',
    lineColor: '#2E7D32',
    fillOpacity: 0.15,
    lineWidth: 0.9,
    label: '空港周辺空域'
  }
}

export function fillKokuareaTileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

function toTileX(lon: number, z: number): number {
  const n = 2 ** z
  return Math.floor(((lon + 180) / 360) * n)
}

function toTileY(lat: number, z: number): number {
  const n = 2 ** z
  const latRad = (lat * Math.PI) / 180
  const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2
  return Math.floor(y * n)
}

export function getVisibleTileXYZs(
  bounds: maplibregl.LngLatBounds,
  z: number
): Array<{ z: number; x: number; y: number }> {
  const west = bounds.getWest()
  const east = bounds.getEast()
  const south = bounds.getSouth()
  const north = bounds.getNorth()

  // NOTE: 日本周辺想定。日付変更線跨ぎはひとまず非対応（必要なら分割する）
  const xMin = toTileX(west, z)
  const xMax = toTileX(east, z)
  const yMin = toTileY(north, z)
  const yMax = toTileY(south, z)

  const tiles: Array<{ z: number; x: number; y: number }> = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y })
    }
  }
  return tiles
}

function getAllStringValues(obj: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim().length > 0) out.push(v)
  }
  return out
}

export function classifyKokuareaSurface(props: Record<string, unknown>): {
  kind: KokuareaSurfaceKind
  label: string
} {
  // NOTE: GSI kokuarea タイルの主要な識別キーは properties.name
  // 例: "成田国際空港－Ｂ’-水平表面" / "成田国際空港-B'-外側水平表面" / "…-円錐表面"
  const name = typeof props.name === 'string' ? props.name : ''
  const strings = [name, ...getAllStringValues(props)].join(' ')

  const has = (needle: string): boolean => strings.includes(needle)
  const hasI = (needle: string): boolean => strings.toLowerCase().includes(needle.toLowerCase())

  // 日本語優先、英語も一応拾う
  // 外側水平表面は水平表面扱い（表示上のカテゴリ統一）
  if (has('進入表面') || has('延長進入表面') || hasI('approach'))
    return { kind: 'approach', label: KOKUAREA_STYLE.approach.label }
  if (has('転移表面') || hasI('transitional'))
    return { kind: 'transitional', label: KOKUAREA_STYLE.transitional.label }
  if (has('外側水平表面') || has('水平表面') || hasI('horizontal'))
    return { kind: 'horizontal', label: KOKUAREA_STYLE.horizontal.label }
  if (has('円錐表面') || hasI('conical'))
    return { kind: 'conical', label: KOKUAREA_STYLE.conical.label }

  return { kind: 'other', label: KOKUAREA_STYLE.other.label }
}
