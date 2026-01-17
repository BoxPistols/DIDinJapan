import type { Meta, StoryObj } from '@storybook/react'
import { useState, useEffect } from 'react'
import { CoordinateInfoPanel } from '../components/CoordinateInfoPanel'
import {
  mockGetCoordinateInfo,
  mockGetRecommendedFlightAltitude
} from './helpers/mockElevationService'
import type { CoordinateInfo } from '../lib/services/elevationService'

/**
 * CoordinateInfoPanel - 座標・高度情報表示パネル
 *
 * マップのクリック位置の座標、海抜高度、推奨飛行高度を表示します。
 * 国土地理院の標高データ（GSI DEM）から高度情報を取得し、
 * ドローンの推奨飛行高度を計算して表示します。
 *
 * ## 機能
 * - WGS84座標の表示
 * - 海抜高度（ASL）の表示
 * - 推奨飛行高度（AGL）の計算と表示
 * - 座標のクリップボードコピー
 * - 非同期データ取得中の「ローディング」状態
 */
const meta: Meta<typeof CoordinateInfoPanel> = {
  title: 'Components/CoordinateInfoPanel',
  component: CoordinateInfoPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
座標・高度情報パネルは、ユーザーが地図上でクリックした位置の座標と高度情報をリアルタイムで表示するコンポーネントです。

## 技術仕様

### API インターフェース

\`\`\`typescript
interface CoordinatePanelProps {
  isVisible: boolean                          // パネルの表示・非表示
  lngLat?: { lng: number; lat: number }      // WGS84座標 (E180...W180, N90...S90)
  onClose?: () => void                        // クローズ時のコールバック
}

// 内部型
interface CoordinateInfo {
  lng: number
  lat: number
  elevation?: number                          // メートル単位、海面基準（ASL）
  formatted: {
    coordinates: string                       // "35.681236°, 139.767125°" 形式
    elevation: string                         // "12.5 m" or "取得中..." 形式
  }
}
\`\`\`

### データ取得フロー

1. \`isVisible\` が true + \`lngLat\` が指定される
2. \`useEffect\` が 300ms 遅延で高度データ取得を開始
3. GSI DEM API へリクエスト送信（並行処理、Abort 可能）
4. 高度データ取得完了 → 推奨飛行高度計算（高度 + 30m 安全マージン）
5. 状態更新 → UI 再レンダリング

### 座標系と単位

| 項目 | 値域 | 説明 |
|------|------|------|
| **経度（lng）** | -180 ～ +180 | 東経正、西経負 |
| **緯度（lat）** | -90 ～ +90 | 北緯正、南緯負 |
| **海抜高度（ASL）** | -500 ～ +3776 | メートル、海面基準（富士山: 3776m） |
| **推奨飛行高度（AGL）** | ASL + 30m | メートル、地形回避マージン30m |

### 外部依存

#### GSI DEM API（国土地理院）

**エンドポイント:**
\`\`\`
GET https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=139.767&lat=35.681&outtype=JSON
\`\`\`

**レスポンス例:**
\`\`\`json
{
  "elevation": 12.5,
  "hsrc": "DEM5B"
}
\`\`\`

**レート制限**: 公式ドキュメント上は無制限
**キャッシュ戦略**: コンポーネント内で小数第5位でキャッシュ（精度 ≈ 1.1m）
**タイムアウト**: 5秒（設定可能）

#### セキュリティ考慮事項
- CORS: GSI は CORS ヘッダー許可
- TLS: HTTPS 必須（http はリダイレクト可能）
- GDPR: 位置情報は個人情報（ただしGSIは公式APIなので問題なし）

### ネットワーク処理の詳細

**遅延時間の構成:**
- DNS 解決: 0-100ms
- TLS ハンドシェイク: 0-200ms（キープアライブ時はスキップ）
- HTTP リクエスト往復: 100-300ms
- JSON パース: < 1ms
- **合計: 約 300-500ms**

**キャッシュ実装:**
\`\`\`typescript
// lib/services/elevationService.ts
const elevationCache = new Map<string, ElevationData>()
function getCacheKey(lng: number, lat: number, precision: number = 5): string {
  const rounded = Math.round(value * precision) / precision
  return \`\${roundedLng},\${roundedLat}\`  // 例: "139.76700,35.68100"
}
\`\`\`

精度 5 = 小数第5位 = 誤差 ≈ 1.1m（赤道 1度 ≈ 111km の場合）

### 使用例

\`\`\`tsx
import { CoordinateInfoPanel } from 'japan-drone-map/components'
import { useState } from 'react'
import maplibregl from 'maplibre-gl'

function App() {
  const [coordInfo, setCoordInfo] = useState<{ lng: number; lat: number } | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)

  const handleMapClick = (e: maplibregl.MapMouseEvent) => {
    setCoordInfo({
      lng: e.lngLat.lng,
      lat: e.lngLat.lat
    })
  }

  return (
    <>
      <div
        id="map"
        style={{ width: '100%', height: '100vh' }}
        onClick={handleMapClick}
      />
      <CoordinateInfoPanel
        isVisible={!!coordInfo}
        lngLat={coordInfo}
        onClose={() => setCoordInfo(null)}
      />
    </>
  )
}
\`\`\`

### パフォーマンス最適化

**Storybook でのモック実装:**
- リアルタイム API 呼び出しをモック化
- 予め定義された座標の高度データを返却
- ネットワーク遅延を 300ms でシミュレート

\`\`\`typescript
// src/stories/helpers/mockElevationService.ts
export async function mockGetCoordinateInfo(
  lngLat: { lng: number; lat: number }
): Promise<CoordinateInfo> {
  await new Promise(resolve => setTimeout(resolve, 300))  // 遅延シミュレート

  const elevation = getMockElevation(lngLat.lng, lngLat.lat)
  return {
    lng: lngLat.lng,
    lat: lngLat.lat,
    elevation: elevation.elevation,
    formatted: {
      coordinates: \`\${lngLat.lat.toFixed(6)}°, \${lngLat.lng.toFixed(6)}°\`,
      elevation: \`\${elevation.elevation.toFixed(1)} m\`
    }
  }
}
\`\`\`

### エラーハンドリング

**ネットワークエラー時:**
- Toast 通知でユーザーに通知
- コンポーネントは座標のみ表示（高度データなし）
- コンソールに詳細ログ出力

\`\`\`typescript
try {
  const info = await getCoordinateInfo(lngLat)
  setCoordInfo(info)
} catch (error) {
  console.error('Failed to fetch coordinate info:', error)
  // 部分的な表示を継続
}
\`\`\`

### ブラウザ互換性

| ブラウザ | 対応状況 | 注記 |
|---------|--------|------|
| Chrome/Edge | ✅ 完全対応 | Fetch API, Clipboard API |
| Firefox | ✅ 完全対応 | |
| Safari | ✅ 完全対応 | iOS 13.4+ で Clipboard API |
| IE 11 | ❌ 非対応 | Fetch API なし |

### 既知の制限事項

1. **日本国外の高度データ**: GSI DEM は日本のみカバー
2. **高周波の座標変更**: キャッシュ戦略により、1.1m 未満の移動は検出されない
3. **オフライン環境**: ネットワーク必須
4. **CORS**: GSI API は CORS 対応だが、企業ファイアウォール配下では失敗の可能性
        `
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    isVisible: {
      description: 'パネルの表示状態',
      control: { type: 'boolean' }
    },
    lngLat: {
      description: '表示する座標 {lng: number, lat: number}',
      control: false
    },
    onClose: {
      description: 'クローズボタン押下時のコールバック',
      action: 'close'
    }
  },
  args: {
    isVisible: true,
    lngLat: { lng: 139.767, lat: 35.681 },
    onClose: () => {}
  }
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * Loading 状態
 * 座標取得直後の「高度データ取得中」状態
 */
export const Loading: Story = {
  render: (args) => {
    // LoadingStateWrapperを作成して、loading状態を0秒で表示
    return (
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <CoordinateInfoPanel {...args} isVisible={true} lngLat={{ lng: 139.767, lat: 35.681 }} />
        <div
          style={{
            backgroundColor: '#fff',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px',
            marginTop: '20px'
          }}
        >
          <h3 style={{ margin: '0 0 12px 0' }}>Loading 状態</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
            座標情報を取得した直後の状態です。
            パネルが表示され、「高度データを取得中...」というメッセージが表示されます。
          </p>
          <div
            style={{
              backgroundColor: '#f0f0f0',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#333'
            }}
          >
            実際のアプリケーションでは、GSI DEM
            APIから高度データを取得するまでこの状態が続きます（約300-500ms）。
          </div>
        </div>
      </div>
    )
  }
}

/**
 * 高度データあり
 * 座標と高度情報が表示される通常状態
 */
export const WithElevation: Story = {
  render: (args) => {
    const [coordInfo, setCoordInfo] = useState<CoordinateInfo | null>(null)

    useEffect(() => {
      if (!args.isVisible || !args.lngLat) return

      const loadData = async () => {
        const info = await mockGetCoordinateInfo(args.lngLat)
        setCoordInfo(info)
      }

      loadData()
    }, [args.isVisible, args.lngLat])

    // Render component styled container
    return (
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px',
            padding: '20px'
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>📍 座標・高度情報</h3>
          </div>

          {coordInfo ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>座標（WGS84）</h4>
                <div
                  style={{
                    backgroundColor: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: '#666' }}>緯度: </span>
                    <code style={{ fontFamily: 'monospace' }}>{coordInfo.lat?.toFixed(6)}°N</code>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>経度: </span>
                    <code style={{ fontFamily: 'monospace' }}>{coordInfo.lng?.toFixed(6)}°E</code>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>海抜高度</h4>
                <div
                  style={{
                    backgroundColor: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <strong>{coordInfo.elevation?.toFixed(1)}</strong>
                  <span style={{ fontSize: '12px', color: '#666', marginLeft: '4px' }}>m ASL</span>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#f0f0f0',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#333'
                }}
              >
                * ASL = Above Sea Level（海上レベル）
              </div>
            </>
          ) : (
            <div
              style={{
                backgroundColor: '#f0f0f0',
                padding: '12px',
                borderRadius: '4px',
                textAlign: 'center',
                color: '#666'
              }}
            >
              高度データを取得中...
            </div>
          )}
        </div>
      </div>
    )
  }
}

/**
 * 高度データなし
 * 座標は表示されるが、高度データが取得できなかった場合
 */
export const NoElevation: Story = {
  render: () => {
    return (
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px',
            padding: '20px'
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>📍 座標・高度情報</h3>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>座標（WGS84）</h4>
            <div
              style={{
                backgroundColor: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#666' }}>緯度: </span>
                <code style={{ fontFamily: 'monospace' }}>130.500000°N</code>
              </div>
              <div>
                <span style={{ color: '#666' }}>経度: </span>
                <code style={{ fontFamily: 'monospace' }}>30.500000°E</code>
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#fff9e6',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#856404',
              border: '1px solid #ffc107'
            }}
          >
            高度データは取得できません
          </div>

          <div
            style={{
              backgroundColor: '#f0f0f0',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#666',
              marginTop: '12px'
            }}
          >
            外海や、GSI DEM カバー外の地域では高度データが利用できない場合があります。
          </div>
        </div>
      </div>
    )
  }
}

/**
 * 推奨飛行高度表示
 * 高度データと推奨飛行高度が表示される完全な状態
 */
export const WithRecommendedAltitude: Story = {
  render: (args) => {
    const [coordInfo, setCoordInfo] = useState<CoordinateInfo | null>(null)
    const [recommendedAltitude, setRecommendedAltitude] = useState<number | null>(null)

    useEffect(() => {
      if (!args.isVisible || !args.lngLat) return

      const loadData = async () => {
        const info = await mockGetCoordinateInfo(args.lngLat)
        setCoordInfo(info)

        if (info.elevation) {
          const altitude = await mockGetRecommendedFlightAltitude(
            args.lngLat.lng,
            args.lngLat.lat,
            30
          )
          setRecommendedAltitude(altitude)
        }
      }

      loadData()
    }, [args.isVisible, args.lngLat])

    return (
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px',
            padding: '20px'
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>📍 座標・高度情報</h3>
          </div>

          {coordInfo ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>座標（WGS84）</h4>
                <div
                  style={{
                    backgroundColor: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: '#666' }}>緯度: </span>
                    <code>{coordInfo.lat?.toFixed(6)}°N</code>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>経度: </span>
                    <code>{coordInfo.lng?.toFixed(6)}°E</code>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>海抜高度</h4>
                <div
                  style={{
                    backgroundColor: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px'
                  }}
                >
                  <strong>{coordInfo.elevation?.toFixed(1)}</strong>
                  <span style={{ fontSize: '12px', color: '#666', marginLeft: '4px' }}>m ASL</span>
                </div>
              </div>

              {recommendedAltitude !== null && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>🚁 推奨飛行高度</h4>
                  <div
                    style={{
                      backgroundColor: '#e3f2fd',
                      padding: '12px',
                      borderRadius: '4px',
                      border: '1px solid #2196F3'
                    }}
                  >
                    <strong style={{ fontSize: '14px' }}>{recommendedAltitude.toFixed(1)}</strong>
                    <span style={{ fontSize: '12px', color: '#666', marginLeft: '4px' }}>
                      m AGL
                    </span>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                      * AGL = Above Ground Level
                      <br />* 安全マージン: 30m
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{
                  backgroundColor: '#f0f0f0',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              >
                <strong>💡 ドローン操作ガイド</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  <li>座標をメモして飛行計画に使用</li>
                  <li>推奨高度を参考に安全な高度で飛行</li>
                  <li>地形変化に注意（2024年地震による隆起）</li>
                </ul>
              </div>
            </>
          ) : (
            <div
              style={{
                backgroundColor: '#f0f0f0',
                padding: '12px',
                textAlign: 'center',
                color: '#666'
              }}
            >
              読み込み中...
            </div>
          )}
        </div>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: `
推奨飛行高度が表示される完全な状態です。
GSI APIから取得した地形高度に、安全マージン（デフォルト30m）を加えた値が表示されます。
この高度はドローンの飛行計画に参考にできます。
        `
      }
    }
  }
}

/**
 * 能登半島（隆起エリア）
 * 2024年地震による隆起エリアの座標例
 */
export const NotoUpliftArea: Story = {
  render: (args) => {
    const [coordInfo, setCoordInfo] = useState<CoordinateInfo | null>(null)

    useEffect(() => {
      const loadData = async () => {
        // 能登半島隆起エリアの座標
        const info = await mockGetCoordinateInfo({ lng: 137.35, lat: 37.55 })
        setCoordInfo(info)
      }

      loadData()
    }, [])

    return (
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px',
            padding: '20px'
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>📍 能登半島隆起エリア</h3>
          </div>

          {coordInfo ? (
            <>
              <div
                style={{
                  backgroundColor: '#fff3cd',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginBottom: '20px',
                  border: '1px solid #ffc107',
                  color: '#856404'
                }}
              >
                <strong>⚠️ 注意:</strong> 2024年能登半島地震による隆起エリアです。
                <br />
                実際の地形が大きく変化している可能性があります。
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>座標（WGS84）</h4>
                <div
                  style={{
                    backgroundColor: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: '#666' }}>緯度: </span>
                    <code>{coordInfo.lat?.toFixed(6)}°N</code>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>経度: </span>
                    <code>{coordInfo.lng?.toFixed(6)}°E</code>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>隆起後の高度</h4>
                <div
                  style={{
                    backgroundColor: '#fff3cd',
                    padding: '12px',
                    borderRadius: '4px'
                  }}
                >
                  <strong>{coordInfo.elevation?.toFixed(1)}</strong>
                  <span style={{ fontSize: '12px', color: '#666', marginLeft: '4px' }}>m ASL</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#666' }}>読み込み中...</div>
          )}
        </div>
      </div>
    )
  }
}
