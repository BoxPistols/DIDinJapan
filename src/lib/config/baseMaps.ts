/**
 * Base Map Configurations
 */

import { BaseMapKey } from '../types'
import maplibregl from 'maplibre-gl'

const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>'

export const BASE_MAPS: Record<BaseMapKey, { name: string; style: string | maplibregl.StyleSpecification }> = {
  osm: {
    name: '標準',
    style: 'https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json'
  },
  gsi: {
    name: '地理院地図',
    style: {
      version: 8 as const,
      sources: {
        gsi: {
          type: 'raster' as const,
          tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: GSI_ATTRIBUTION
        }
      },
      layers: [{ id: 'gsi-layer', type: 'raster' as const, source: 'gsi' }]
    }
  },
  pale: {
    name: '淡色地図',
    style: {
      version: 8 as const,
      sources: {
        pale: {
          type: 'raster' as const,
          tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: GSI_ATTRIBUTION
        }
      },
      layers: [{ id: 'pale-layer', type: 'raster' as const, source: 'pale' }]
    }
  },
  photo: {
    name: '航空写真',
    style: {
      version: 8 as const,
      sources: {
        photo: {
          type: 'raster' as const,
          tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],
          tileSize: 256,
          attribution: GSI_ATTRIBUTION
        }
      },
      layers: [{ id: 'photo-layer', type: 'raster' as const, source: 'photo' }]
    }
  },
}

export const DEFAULT_CENTER: [number, number] = [137.0, 36.5]
export const DEFAULT_ZOOM = 5
