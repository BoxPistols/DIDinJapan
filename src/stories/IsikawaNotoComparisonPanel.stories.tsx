import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { IsikawaNotoComparisonPanel } from '../components/IsikawaNotoComparisonPanel'
import { useState } from 'react'

/**
 * IsikawaNotoComparisonPanel - 能登半島隆起エリア表示パネル
 *
 * 2024年能登半島地震による地形変化（隆起エリア）の表示/非表示を切り替えるトグルボタン。
 * 標準ベースマップのみ対応し、航空写真や地理院系の背景では使用できません。
 *
 * ## 機能
 * - ワンクリックで隆起エリア表示切り替え
 * - 標準マップ限定対応
 * - ダークモード対応
 * - ツールチップ表示
 */
const meta: Meta<typeof IsikawaNotoComparisonPanel> = {
  title: 'Components/IsikawaNotoComparisonPanel',
  component: IsikawaNotoComparisonPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
能登半島隆起エリア表示パネルは、2024年能登半島地震による地形変化を
インタラクティブに表示するトグルボタンです。

### 使用例

\`\`\`tsx
import { IsikawaNotoComparisonPanel } from 'japan-drone-map/components'
import { useState } from 'react'

function App() {
  const [visibleLayers, setVisibleLayers] = useState(new Set<string>())
  const [opacityLayers, setOpacityLayers] = useState(new Map<string, number>())

  const handleLayerToggle = (layerId: string, visible: boolean) => {
    setVisibleLayers(prev => {
      const next = new Set(prev)
      visible ? next.add(layerId) : next.delete(layerId)
      return next
    })
  }

  const handleOpacityChange = (layerId: string, opacity: number) => {
    setOpacityLayers(prev => new Map(prev).set(layerId, opacity))
  }

  return (
    <IsikawaNotoComparisonPanel
      onLayerToggle={handleLayerToggle}
      onOpacityChange={handleOpacityChange}
      visibleLayers={visibleLayers}
      opacityLayers={opacityLayers}
      darkMode={false}
    />
  )
}
\`\`\`

### 対応ベースマップ

| ベースマップ | サポート | 理由 |
|------------|---------|------|
| **標準** | ✅ 対応 | 地形比較に最適 |
| 航空写真 | ❌ 非対応 | レイヤーレンダリング形式の制約 |
| 地理院系 | ❌ 非対応 | レイヤーレンダリング形式の制約 |

### 表示状態

- **有効・非表示**: 白いボタン
- **有効・表示中**: 赤いボタン（隆起エリア表示中）
- **無効**: グレーアウト（未対応ベースマップ）
        `
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    onLayerToggle: {
      description: 'レイヤーの表示/非表示が切り替えられたときのコールバック',
      action: 'layer-toggled'
    },
    onOpacityChange: {
      description: 'レイヤーの不透明度が変更されたときのコールバック',
      action: 'opacity-changed'
    },
    visibleLayers: {
      description: '現在表示中のレイヤーIDのSet',
      control: false
    },
    opacityLayers: {
      description: 'レイヤーの不透明度マップ',
      control: false
    },
    darkMode: {
      description: 'ダークモード',
      control: { type: 'boolean' }
    },
    isSupported: {
      description: 'このベースマップでサポートされているか',
      control: { type: 'boolean' }
    },
    unsupportedMessage: {
      description: '非対応の場合に表示するメッセージ',
      control: { type: 'text' }
    }
  },
  args: {
    onLayerToggle: fn(),
    onOpacityChange: fn(),
    visibleLayers: new Set<string>(),
    opacityLayers: new Map<string, number>(),
    darkMode: false,
    isSupported: true,
    unsupportedMessage: '簡易モード：地形比較は「標準」ベースマップのみ対応です'
  }
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * デフォルト状態
 * 標準マップで隆起エリアが非表示の状態
 */
export const Default: Story = {
  render: () => (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}
      >
        <h3 style={{ margin: '0 0 12px 0' }}>コンポーネント情報</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
          このコンポーネントは fixed position のボタンで、画面の右下に固定されます。 Storybook では
          fixed position の要素が正常に描画されない場合があるため、
          ドキュメントと実装例を参照してください。
        </p>
        <div
          style={{
            backgroundColor: '#f0f0f0',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#333',
            fontFamily: 'monospace'
          }}
        >
          <div style={{ marginBottom: '8px' }}>位置: 画面右下 (bottom: 20px, right: 20px)</div>
          <div style={{ marginBottom: '8px' }}>非表示状態: 白いボタン</div>
          <div style={{ marginBottom: '8px' }}>表示状態: 赤いボタン (#d63031)</div>
          <div>非対応状態: グレーアウト</div>
        </div>
      </div>
    </div>
  ),
  args: {
    visibleLayers: new Set(),
    isSupported: true,
    darkMode: false
  }
}

/**
 * 無効状態
 * 非対応ベースマップの場合
 */
export const Disabled: Story = {
  render: () => (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}
      >
        <h3 style={{ margin: '0 0 12px 0' }}>無効状態</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
          このコンポーネントは標準ベースマップのみサポートしています。
          航空写真や地理院系のベースマップが選択されている場合は、
          無効状態（グレーアウト）になります。
        </p>
        <div
          style={{
            backgroundColor: '#f3f3f3',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#777',
            border: '1px solid #ddd',
            marginBottom: '12px'
          }}
        >
          <strong>ツールチップ:</strong>
          <br />
          簡易モード：地形比較は「標準」ベースマップのみ対応です（航空写真/地理院系ではOFFになります）。
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
          ボタンは cursor: not-allowed で、クリック時に何も実行されません。
        </p>
      </div>
    </div>
  ),
  args: {
    visibleLayers: new Set(),
    isSupported: false,
    darkMode: false,
    unsupportedMessage:
      '簡易モード：地形比較は「標準」ベースマップのみ対応です（航空写真/地理院系ではOFFになります）。'
  }
}

/**
 * ダークモード
 * 夜間モードでの表示例
 */
export const DarkMode: Story = {
  render: () => (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#1e1e1e',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e0e0e0'
      }}
    >
      <div
        style={{
          backgroundColor: '#2d2d2d',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          maxWidth: '600px',
          border: '1px solid #444'
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', color: '#fff' }}>ダークモード</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaa' }}>
          ダークモードではボタンの背景色が調整され、 より暗い配色でユーザーの目に優しくなります。
        </p>
        <div
          style={{
            backgroundColor: '#1a1a1a',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#ccc',
            border: '1px solid #444',
            marginBottom: '12px'
          }}
        >
          <div style={{ marginBottom: '8px' }}>背景: #1e1e1e</div>
          <div style={{ marginBottom: '8px' }}>非表示状態: 白いボタン（#ffffff）</div>
          <div style={{ marginBottom: '8px' }}>表示状態: 赤いボタン（#d63031）</div>
          <div>ボーダー: #444（暗めのグレー）</div>
        </div>
      </div>
    </div>
  ),
  args: {
    visibleLayers: new Set(),
    isSupported: true,
    darkMode: true
  },
  parameters: {
    backgrounds: { default: 'dark' }
  }
}

/**
 * アクティブ状態
 * 隆起エリアが表示されている状態
 */
export const Active: Story = {
  render: () => (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}
      >
        <h3 style={{ margin: '0 0 12px 0' }}>アクティブ状態</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
          隆起エリアが表示されている状態です。
          ボタンが赤色（#d63031）になり、ユーザーが現在レイヤーが
          アクティブであることを視認できます。
        </p>
        <div
          style={{
            backgroundColor: '#fef2f2',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#333',
            border: '1px solid #fecaca',
            marginBottom: '12px'
          }}
        >
          <strong style={{ color: '#d63031' }}>ボタンの外観:</strong>
          <br />
          背景色: #d63031（赤）
          <br />
          テキスト色: #fff（白）
          <br />
          fontWeight: 700（太字）
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
          ボタンをクリックすると、隆起エリアが非表示になり、 ボタンが白色に戻ります。
        </p>
      </div>
    </div>
  ),
  args: {
    isSupported: true,
    darkMode: false
  }
}
