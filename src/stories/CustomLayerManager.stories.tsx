import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { CustomLayerManager } from '../components/CustomLayerManager'

/**
 * CustomLayerManager - カスタムレイヤー管理コンポーネント
 *
 * ユーザーが独自のGeoJSONデータをインポート/エクスポート/管理できるUIコンポーネント。
 * 公開APIがないデータでも、ユーザーが独自のレイヤーとして追加できます。
 *
 * ## 機能
 * - GeoJSONファイルのインポート
 * - カテゴリ（緊急用務空域、有人機発着エリア、リモートID特定区域、LTEエリア、風況データ）の設定
 * - カスタムカラーの設定
 * - レイヤーの表示/非表示切り替え
 * - 単一/一括エクスポート
 * - LocalStorageへのデータ永続化
 */
const meta: Meta<typeof CustomLayerManager> = {
  title: 'Components/CustomLayerManager',
  component: CustomLayerManager,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
カスタムレイヤー管理コンポーネントは、ユーザーが独自のGeoJSONデータを地図に追加・管理するためのUIを提供します。

### 使用例

\`\`\`tsx
import { CustomLayerManager } from 'japan-drone-map/components'
import { useState } from 'react'

function App() {
  const [visibleLayers, setVisibleLayers] = useState(new Set<string>())

  return (
    <CustomLayerManager
      onLayerAdded={(layer) => console.log('Added:', layer)}
      onLayerRemoved={(id) => console.log('Removed:', id)}
      onLayerToggle={(id, visible) => {
        setVisibleLayers(prev => {
          const next = new Set(prev)
          visible ? next.add(id) : next.delete(id)
          return next
        })
      }}
      visibleLayers={visibleLayers}
    />
  )
}
\`\`\`

### 対応カテゴリ

| カテゴリID | 名称 | デフォルト色 |
|-----------|------|--------------|
| emergency | 緊急用務空域 | #FFA500 |
| manned | 有人機発着エリア | #87CEEB |
| remote_id | リモートID特定区域 | #DDA0DD |
| lte | LTEエリア | #4CAF50 |
| wind | 風況データ | #2196F3 |
| custom | カスタム | #888888 |
        `
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    onLayerAdded: {
      description: '新しいレイヤーが追加されたときのコールバック',
      action: 'layer-added'
    },
    onLayerRemoved: {
      description: 'レイヤーが削除されたときのコールバック',
      action: 'layer-removed'
    },
    onLayerToggle: {
      description: 'レイヤーの表示/非表示が切り替えられたときのコールバック',
      action: 'layer-toggled'
    },
    visibleLayers: {
      description: '現在表示中のレイヤーIDのSet',
      control: { type: 'object' }
    }
  },
  args: {
    onLayerAdded: fn(),
    onLayerRemoved: fn(),
    onLayerToggle: fn(),
    visibleLayers: new Set<string>()
  }
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * デフォルト状態
 * 閉じた状態で表示され、ボタンをクリックするとパネルが開きます
 */
export const Default: Story = {
  args: {
    visibleLayers: new Set()
  }
}

/**
 * 表示レイヤーあり
 * 一部のレイヤーが表示状態の例
 */
export const WithVisibleLayers: Story = {
  args: {
    visibleLayers: new Set(['custom-layer-1', 'custom-layer-2'])
  }
}

/**
 * インタラクティブなデモ
 * 実際の操作をテストできます
 */
export const Interactive: Story = {
  args: {
    visibleLayers: new Set()
  },
  parameters: {
    docs: {
      description: {
        story: `
このストーリーでは、実際にファイルをインポートしたり、レイヤーを管理したりできます。

**注意**: Storybookではローカルストレージが永続化されるため、追加したレイヤーは次回アクセス時にも残ります。
        `
      }
    }
  }
}
