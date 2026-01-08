import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const INITIAL_CENTER: [number, number] = [137.0, 36.5]
const INITIAL_ZOOM = 5

// ベースマップ設定
const BASE_MAPS = {
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
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
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
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
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
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
        }
      },
      layers: [{ id: 'photo-layer', type: 'raster' as const, source: 'photo' }]
    }
  }
}

type BaseMapKey = keyof typeof BASE_MAPS

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
    name: '北海道・東北',
    layers: [
      { id: 'did-01', name: '北海道', path: '/GeoJSON/h22_did_01_hokkaido.geojson', color: '#74b9ff' },
      { id: 'did-02', name: '青森県', path: '/GeoJSON/h22_did_02_aomori.geojson', color: '#0984e3' },
      { id: 'did-03', name: '岩手県', path: '/GeoJSON/h22_did_03_iwate.geojson', color: '#00cec9' },
      { id: 'did-04', name: '宮城県', path: '/GeoJSON/h22_did_04_miyagi.geojson', color: '#00b894' },
      { id: 'did-05', name: '秋田県', path: '/GeoJSON/h22_did_05_akita.geojson', color: '#55efc4' },
      { id: 'did-06', name: '山形県', path: '/GeoJSON/h22_did_06_yamagata.geojson', color: '#81ecec' },
      { id: 'did-07', name: '福島県', path: '/GeoJSON/h22_did_07_fukushima.geojson', color: '#a29bfe' },
    ]
  },
  {
    name: '関東',
    layers: [
      { id: 'did-08', name: '茨城県', path: '/GeoJSON/h22_did_08_ibaragi.geojson', color: '#ffeaa7' },
      { id: 'did-09', name: '栃木県', path: '/GeoJSON/h22_did_09_tochigi.geojson', color: '#fdcb6e' },
      { id: 'did-10', name: '群馬県', path: '/GeoJSON/h22_did_10_gunma.geojson', color: '#fd79a8' },
      { id: 'did-11', name: '埼玉県', path: '/GeoJSON/h22_did_11_saitama.geojson', color: '#45b7d1' },
      { id: 'did-12', name: '千葉県', path: '/GeoJSON/h22_did_12_chiba.geojson', color: '#96ceb4' },
      { id: 'did-13', name: '東京都', path: '/GeoJSON/h22_did_13_tokyo.geojson', color: '#ff6b6b' },
      { id: 'did-14', name: '神奈川県', path: '/GeoJSON/h22_did_14_kanagawa.geojson', color: '#4ecdc4' },
    ]
  },
  {
    name: '中部',
    layers: [
      { id: 'did-15', name: '新潟県', path: '/GeoJSON/h22_did_15_niigata.geojson', color: '#dfe6e9' },
      { id: 'did-16', name: '富山県', path: '/GeoJSON/h22_did_16_toyama.geojson', color: '#b2bec3' },
      { id: 'did-17', name: '石川県', path: '/GeoJSON/h22_did_17_kanazawa.geojson', color: '#636e72' },
      { id: 'did-18', name: '福井県', path: '/GeoJSON/h22_did_18_fukui.geojson', color: '#2d3436' },
      { id: 'did-19', name: '山梨県', path: '/GeoJSON/h22_did_19_yamanashi.geojson', color: '#e17055' },
      { id: 'did-20', name: '長野県', path: '/GeoJSON/h22_did_20_nagano.geojson', color: '#d63031' },
      { id: 'did-21', name: '岐阜県', path: '/GeoJSON/h22_did_21_gifu.geojson', color: '#e84393' },
      { id: 'did-22', name: '静岡県', path: '/GeoJSON/h22_did_22_shizuoka.geojson', color: '#6c5ce7' },
      { id: 'did-23', name: '愛知県', path: '/GeoJSON/h22_did_23_aichi.geojson', color: '#fdcb6e' },
    ]
  },
  {
    name: '近畿',
    layers: [
      { id: 'did-24', name: '三重県', path: '/GeoJSON/h22_did_24_mie.geojson', color: '#fab1a0' },
      { id: 'did-25', name: '滋賀県', path: '/GeoJSON/h22_did_25_shiga.geojson', color: '#74b9ff' },
      { id: 'did-26', name: '京都府', path: '/GeoJSON/h22_did_26_kyoto.geojson', color: '#00b894' },
      { id: 'did-27', name: '大阪府', path: '/GeoJSON/h22_did_27_osaka.geojson', color: '#e17055' },
      { id: 'did-28', name: '兵庫県', path: '/GeoJSON/h22_did_28_hyogo.geojson', color: '#0984e3' },
      { id: 'did-29', name: '奈良県', path: '/GeoJSON/h22_did_29_nara.geojson', color: '#6c5ce7' },
      { id: 'did-30', name: '和歌山県', path: '/GeoJSON/h22_did_30_wakayama.geojson', color: '#fd79a8' },
    ]
  },
  {
    name: '中国',
    layers: [
      { id: 'did-31', name: '鳥取県', path: '/GeoJSON/h22_did_31_tottori.geojson', color: '#00cec9' },
      { id: 'did-32', name: '島根県', path: '/GeoJSON/h22_did_32_shimane.geojson', color: '#55efc4' },
      { id: 'did-33', name: '岡山県', path: '/GeoJSON/h22_did_33_okayama.geojson', color: '#ffeaa7' },
      { id: 'did-34', name: '広島県', path: '/GeoJSON/h22_did_34_hiroshima.geojson', color: '#ff7675' },
      { id: 'did-35', name: '山口県', path: '/GeoJSON/h22_did_35_yamaguchi.geojson', color: '#a29bfe' },
    ]
  },
  {
    name: '四国',
    layers: [
      { id: 'did-36', name: '徳島県', path: '/GeoJSON/h22_did_36_tokushima.geojson', color: '#81ecec' },
      { id: 'did-37', name: '香川県', path: '/GeoJSON/h22_did_37_kagawa.geojson', color: '#fab1a0' },
      { id: 'did-38', name: '愛媛県', path: '/GeoJSON/h22_did_38_ehime.geojson', color: '#fdcb6e' },
      { id: 'did-39', name: '高知県', path: '/GeoJSON/h22_did_39_kochi.geojson', color: '#e84393' },
    ]
  },
  {
    name: '九州・沖縄',
    layers: [
      { id: 'did-40', name: '福岡県', path: '/GeoJSON/h22_did_40_fukuoka.geojson', color: '#00cec9' },
      { id: 'did-41', name: '佐賀県', path: '/GeoJSON/h22_did_41_saga.geojson', color: '#74b9ff' },
      { id: 'did-42', name: '長崎県', path: '/GeoJSON/h22_did_42_nagasaki.geojson', color: '#a29bfe' },
      { id: 'did-43', name: '熊本県', path: '/GeoJSON/h22_did_43_kumamoto.geojson', color: '#ff7675' },
      { id: 'did-44', name: '大分県', path: '/GeoJSON/h22_did_44_oita.geojson', color: '#fd79a8' },
      { id: 'did-45', name: '宮崎県', path: '/GeoJSON/h22_did_45_miyazaki.geojson', color: '#00b894' },
      { id: 'did-46', name: '鹿児島県', path: '/GeoJSON/h22_did_46_kagoshima.geojson', color: '#e17055' },
      { id: 'did-47', name: '沖縄県', path: '/GeoJSON/h22_did_47_okinawa.geojson', color: '#0984e3' },
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
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [layerStates, setLayerStates] = useState<Map<string, LayerState>>(new Map())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['関東']))
  const [mapLoaded, setMapLoaded] = useState(false)
  const [opacity, setOpacity] = useState(0.5)
  const [baseMap, setBaseMap] = useState<BaseMapKey>('osm')

  // Map layer IDs to prefecture names for easier lookup
  const LAYER_ID_TO_NAME = new Map<string, string>()
  LAYER_GROUPS.forEach(group => {
    group.layers.forEach(layer => {
      LAYER_ID_TO_NAME.set(layer.id, layer.name)
    })
  })

  useEffect(() => {
    if (!mapContainer.current) return

    // 既存のマップがあれば削除
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
      setMapLoaded(false)
    }

    const styleConfig = BASE_MAPS[baseMap].style
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleConfig as maplibregl.StyleSpecification | string,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '300px'
    })

    map.on('load', () => {
      setMapLoaded(true)
    })

    map.on('mousemove', (e) => {
      const features = map.queryRenderedFeatures(e.point)
      const didFeature = features.find(f => f.layer.id.startsWith('did-') && f.layer.type === 'fill')

      if (didFeature && popupRef.current) {
        map.getCanvas().style.cursor = 'pointer'

        const props = didFeature.properties
        if (!props) return

        const layerId = didFeature.layer.id
        const prefName = LAYER_ID_TO_NAME.get(layerId) || ''
        const cityName = props.CITYNAME || ''
        const population = props.JINKO || 0
        const area = props.MENSEKI || 0
        const density = area > 0 ? (population / area) : 0

        const content = `
          <div class="did-popup">
            <div class="popup-header">
              <span class="pref-name">${prefName}</span>
              <span class="city-name">${cityName}</span>
            </div>
            <div class="popup-stats">
              <div class="stat-row">
                <span class="stat-label">人口</span>
                <span class="stat-value">${population.toLocaleString()}人</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">面積</span>
                <span class="stat-value">${area.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}km²</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">人口密度</span>
                <span class="stat-value">${density.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}人/km²</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">コード</span>
                <span class="stat-value">${props.KEN || '-'}-${props.CITY || '-'}</span>
              </div>
            </div>
          </div>
        `

        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(content)
          .addTo(map)
      } else if (popupRef.current) {
        map.getCanvas().style.cursor = ''
        popupRef.current.remove()
      }
    })

    map.on('mouseleave', () => {
      if (popupRef.current) {
        map.getCanvas().style.cursor = ''
        popupRef.current.remove()
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [baseMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    layerStates.forEach((state) => {
      if (state.visible && map.getLayer(state.id)) {
        map.setPaintProperty(state.id, 'fill-opacity', opacity)
      }
    })
  }, [opacity, layerStates, mapLoaded])

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
          'fill-opacity': opacity
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

  const enableAllInGroup = (group: LayerGroup) => {
    group.layers.forEach(layer => {
      if (!isLayerVisible(layer.id)) {
        addLayer(layer)
      }
    })
  }

  const disableAllInGroup = (group: LayerGroup) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    group.layers.forEach(layer => {
      const state = layerStates.get(layer.id)
      if (state?.visible) {
        map.setLayoutProperty(layer.id, 'visibility', 'none')
        map.setLayoutProperty(`${layer.id}-outline`, 'visibility', 'none')
        setLayerStates(prev => {
          const next = new Map(prev)
          next.set(layer.id, { ...state, visible: false })
          return next
        })
      }
    })
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{
        width: '300px',
        padding: '16px',
        backgroundColor: '#1a1a2e',
        color: '#eee',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600 }}>
          Japan Overlay Map
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#888' }}>
          日本の地理データオーバーレイ
        </p>

        {/* ベースマップ選択 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', color: '#aaa', display: 'block', marginBottom: '8px' }}>
            ベースマップ
          </label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {(Object.keys(BASE_MAPS) as BaseMapKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setBaseMap(key)}
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  backgroundColor: baseMap === key ? '#4a5568' : '#2d3748',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                {BASE_MAPS[key].name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', color: '#aaa' }}>
            DID透明度: {Math.round(opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
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
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <button
                      onClick={() => enableAllInGroup(group)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: '11px',
                        backgroundColor: '#2d3748',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      全て表示
                    </button>
                    <button
                      onClick={() => disableAllInGroup(group)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: '11px',
                        backgroundColor: '#2d3748',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      全て非表示
                    </button>
                  </div>
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
