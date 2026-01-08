import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const INITIAL_CENTER: [number, number] = [139.6917, 35.6895]
const INITIAL_ZOOM = 9
const MAP_STYLE = 'https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json'

interface LayerConfig {
  id: string
  name: string
  path: string
  color: string
}

interface LayerGroup {
  name: string
  layers: LayerConfig[]
}

const LAYER_GROUPS: LayerGroup[] = [
  {
    name: '関東',
    layers: [
      { id: 'did-tokyo', name: '東京都', path: '/GeoJSON/h22_did_13_tokyo.geojson', color: '#ff6b6b' },
      { id: 'did-kanagawa', name: '神奈川県', path: '/GeoJSON/h22_did_14_kanagawa.geojson', color: '#4ecdc4' },
      { id: 'did-saitama', name: '埼玉県', path: '/GeoJSON/h22_did_11_saitama.geojson', color: '#45b7d1' },
      { id: 'did-chiba', name: '千葉県', path: '/GeoJSON/h22_did_12_chiba.geojson', color: '#96ceb4' },
      { id: 'did-ibaraki', name: '茨城県', path: '/GeoJSON/h22_did_08_ibaragi.geojson', color: '#ffeaa7' },
      { id: 'did-tochigi', name: '栃木県', path: '/GeoJSON/h22_did_09_tochigi.geojson', color: '#dfe6e9' },
      { id: 'did-gunma', name: '群馬県', path: '/GeoJSON/h22_did_10_gunma.geojson', color: '#fd79a8' },
    ]
  },
  {
    name: '近畿',
    layers: [
      { id: 'did-osaka', name: '大阪府', path: '/GeoJSON/h22_did_27_osaka.geojson', color: '#e17055' },
      { id: 'did-kyoto', name: '京都府', path: '/GeoJSON/h22_did_26_kyoto.geojson', color: '#00b894' },
      { id: 'did-hyogo', name: '兵庫県', path: '/GeoJSON/h22_did_28_hyogo.geojson', color: '#0984e3' },
      { id: 'did-nara', name: '奈良県', path: '/GeoJSON/h22_did_29_nara.geojson', color: '#6c5ce7' },
    ]
  },
  {
    name: '中部',
    layers: [
      { id: 'did-aichi', name: '愛知県', path: '/GeoJSON/h22_did_23_aichi.geojson', color: '#fdcb6e' },
      { id: 'did-shizuoka', name: '静岡県', path: '/GeoJSON/h22_did_22_shizuoka.geojson', color: '#e84393' },
    ]
  },
  {
    name: '九州',
    layers: [
      { id: 'did-fukuoka', name: '福岡県', path: '/GeoJSON/h22_did_40_fukuoka.geojson', color: '#00cec9' },
    ]
  },
  {
    name: '北海道・東北',
    layers: [
      { id: 'did-hokkaido', name: '北海道', path: '/GeoJSON/h22_did_01_hokkaido.geojson', color: '#74b9ff' },
      { id: 'did-miyagi', name: '宮城県', path: '/GeoJSON/h22_did_04_miyagi.geojson', color: '#a29bfe' },
    ]
  }
]

interface LayerState {
  id: string
  visible: boolean
}

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [layerStates, setLayerStates] = useState<Map<string, LayerState>>(new Map())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['関東']))
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.on('load', () => {
      setMapLoaded(true)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const addLayer = async (layer: LayerConfig) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    if (map.getSource(layer.id)) return

    try {
      map.addSource(layer.id, {
        type: 'geojson',
        data: layer.path
      })

      map.addLayer({
        id: layer.id,
        type: 'fill',
        source: layer.id,
        paint: {
          'fill-color': layer.color,
          'fill-opacity': 0.5
        }
      })

      map.addLayer({
        id: `${layer.id}-outline`,
        type: 'line',
        source: layer.id,
        paint: {
          'line-color': layer.color,
          'line-width': 1
        }
      })

      setLayerStates(prev => {
        const next = new Map(prev)
        next.set(layer.id, { id: layer.id, visible: true })
        return next
      })
    } catch (e) {
      console.error(`Failed to add layer ${layer.id}:`, e)
    }
  }

  const toggleLayer = (layer: LayerConfig) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const state = layerStates.get(layer.id)

    if (!state) {
      addLayer(layer)
      return
    }

    const newVisibility = !state.visible
    const visibility = newVisibility ? 'visible' : 'none'

    map.setLayoutProperty(layer.id, 'visibility', visibility)
    map.setLayoutProperty(`${layer.id}-outline`, 'visibility', visibility)

    setLayerStates(prev => {
      const next = new Map(prev)
      next.set(layer.id, { ...state, visible: newVisibility })
      return next
    })
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }

  const isLayerVisible = (layerId: string) => {
    return layerStates.get(layerId)?.visible ?? false
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{
        width: '300px',
        padding: '16px',
        backgroundColor: '#1a1a2e',
        color: '#eee',
        overflowY: 'auto'
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600 }}>
          Japan Overlay Map
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#888' }}>
          人口集中地区（DID）データ
        </p>

        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '14px', color: '#888', fontWeight: 500 }}>
            レイヤー
          </h2>

          {LAYER_GROUPS.map(group => (
            <div key={group.name} style={{ marginBottom: '8px' }}>
              <button
                onClick={() => toggleGroup(group.name)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#16213e',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{group.name}</span>
                <span style={{ fontSize: '12px' }}>
                  {expandedGroups.has(group.name) ? '▼' : '▶'}
                </span>
              </button>

              {expandedGroups.has(group.name) && (
                <div style={{ padding: '8px 0 0 8px' }}>
                  {group.layers.map(layer => (
                    <label
                      key={layer.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        backgroundColor: isLayerVisible(layer.id) ? 'rgba(255,255,255,0.1)' : 'transparent',
                        marginBottom: '2px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isLayerVisible(layer.id)}
                        onChange={() => toggleLayer(layer)}
                        style={{ accentColor: layer.color }}
                      />
                      <span
                        style={{
                          width: '14px',
                          height: '14px',
                          backgroundColor: layer.color,
                          borderRadius: '3px',
                          opacity: 0.8
                        }}
                      />
                      <span style={{ fontSize: '13px' }}>{layer.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 'auto',
          paddingTop: '16px',
          borderTop: '1px solid #333',
          fontSize: '11px',
          color: '#666'
        }}>
          <p>出典: 政府統計の総合窓口(e-Stat)</p>
          <p>平成22年国勢調査データ</p>
        </div>
      </aside>
      <div ref={mapContainer} style={{ flex: 1 }} />
    </div>
  )
}

export default App
