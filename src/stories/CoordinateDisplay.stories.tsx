import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { CoordinateDisplay } from '../components/CoordinateDisplay'

/**
 * CoordinateDisplay - 座標表示コンポーネント
 *
 * クリックされた地点の座標を、10進数形式とDMS形式（度分秒）で表示します。
 * DMS形式はNOTAM申請に対応した形式です。
 * 5秒後に自動的に非表示になります。
 *
 * ## 機能
 * - 10進数形式と DMS形式の同時表示
 * - クリップボードへのコピー機能
 * - 5秒後の自動閉じ
 * - ダークモード対応
 * - 右下固定表示
 */
const meta: Meta<typeof CoordinateDisplay> = {
  title: 'Components/CoordinateDisplay',
  component: CoordinateDisplay,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
座標表示コンポーネントは、地図上のクリック位置に対応する座標を表示します。
NOTAM申請用の度分秒形式にも対応しており、航空機運用に必要な座標情報を提供できます。

### 使用例

\`\`\`tsx
import { CoordinateDisplay } from 'japan-drone-map/components'
import { useState } from 'react'
import maplibregl from 'maplibre-gl'

function App() {
  const [clickCoords, setClickCoords] = useState<[number, number] | null>(null)

  const handleMapClick = (e: maplibregl.MapMouseEvent) => {
    setClickCoords([e.lngLat.lng, e.lngLat.lat])
  }

  return (
    <>
      <div id="map" onClick={handleMapClick} style={{ width: '100vw', height: '100vh' }} />
      {clickCoords && (
        <CoordinateDisplay
          lng={clickCoords[0]}
          lat={clickCoords[1]}
          darkMode={false}
          onClose={() => setClickCoords(null)}
        />
      )}
    </>
  )
}
\`\`\`

### 座標形式

| 形式 | 例 | 用途 |
|------|-----|------|
| **10進数** | 35.681234°N, 139.767890°E | 一般的な使用、プログラミング |
| **DMS** | 35°40\'52.04\"N 139°46\'04.40\"E | NOTAM申請、航空機運用 |

### 自動クローズ動作

- 表示から5秒後に自動的に非表示になります
- ユーザーが「閉じる」ボタンを押すと即座に非表示になります
- \`onClose\` コールバックで親コンポーネントの状態を同期できます
        `
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    lng: {
      description: '経度（Longitude）',
      control: { type: 'number', min: -180, max: 180, step: 0.001 }
    },
    lat: {
      description: '緯度（Latitude）',
      control: { type: 'number', min: -90, max: 90, step: 0.001 }
    },
    darkMode: {
      description: 'ダークモード',
      control: { type: 'boolean' }
    },
    onClose: {
      description: 'モーダルを閉じるコールバック',
      action: 'close'
    }
  },
  args: {
    lng: 139.767,
    lat: 35.681,
    darkMode: false,
    onClose: fn()
  }
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * デフォルト状態
 * 東京駅の座標を表示
 */
export const Default: Story = {
  args: {
    lng: 139.767,
    lat: 35.681,
    darkMode: false
  }
}

/**
 * ダークモード
 * 夜間モードでの表示例
 */
export const DarkMode: Story = {
  args: {
    lng: 139.767,
    lat: 35.681,
    darkMode: true
  },
  parameters: {
    backgrounds: { default: 'dark' }
  }
}

/**
 * 自動クローズ動作
 * 5秒後に自動的に消える動作を確認できます
 */
export const WithAutoClose: Story = {
  args: {
    lng: 135.500,
    lat: 34.732,
    darkMode: false,
    onClose: fn()
  },
  parameters: {
    docs: {
      description: {
        story: `
このストーリーでは、5秒後に自動的にコンポーネントが非表示になる動作を確認できます。
ただしStorybookではコンポーネント再マウント時に状態がリセットされるため、
実際のアプリケーションで動作を確認することをお勧めします。

**操作ガイド**:
1. コンポーネントが表示されます
2. 5秒待つと自動的に非表示になります
3. または「閉じる」ボタンをクリックして即座に非表示にできます
        `
      }
    }
  }
}

/**
 * 異なる座標パターン
 * 様々な座標位置での表示例
 */
export const DifferentCoordinates: Story = {
  render: () => {
    const coordinates = [
      { name: '東京駅', lng: 139.767125, lat: 35.681236 },
      { name: '大阪駅', lng: 135.499616, lat: 34.732490 },
      { name: '那覇空港', lng: 127.648, lat: 26.197 },
      { name: '能登半島', lng: 137.35, lat: 37.55 }
    ]

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
          padding: '20px',
          backgroundColor: '#f5f5f5',
          minHeight: '100vh'
        }}
      >
        {coordinates.map((coord) => (
          <div
            key={coord.name}
            style={{
              backgroundColor: '#fff',
              padding: '16px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>{coord.name}</h3>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
              経度: {coord.lng.toFixed(6)}°
            </p>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#666' }}>
              緯度: {coord.lat.toFixed(6)}°
            </p>
            <CoordinateDisplay
              lng={coord.lng}
              lat={coord.lat}
              darkMode={false}
            />
          </div>
        ))}
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: `
日本の主要都市/地点の座標を表示します。
各地点の座標表示から、コピー機能を使用して座標をクリップボードにコピーできます。
        `
      }
    }
  }
}
