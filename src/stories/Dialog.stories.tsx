import type { Meta, StoryObj } from '@storybook/react'
import { DialogContainer } from '../components/Dialog'
import { showConfirm } from '../utils/dialog'

/**
 * Dialog - 確認ダイアログコンポーネント
 *
 * ユーザーに対して確認が必要な操作を実行する際に、
 * 確認メッセージを表示します。
 * 「キャンセル」または「OK」ボタンで結果を返します。
 *
 * ## 機能
 * - 確認メッセージの表示
 * - カスタムボタンテキスト
 * - キャンセル時の値は false、確認時は true を返す Promise
 * - 背景クリックでキャンセル
 */
const meta: Meta<typeof DialogContainer> = {
  title: 'Feedback/Dialog',
  component: DialogContainer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
確認ダイアログは、ユーザーの重要な操作を確認する際に使用します。
例えば、データの削除や大きな変更を実行する前に確認を求める場合に活躍します。

### 使用例

\`\`\`tsx
import { DialogContainer } from 'japan-drone-map/components'
import { showConfirm } from 'japan-drone-map/utils/dialog'

function App() {
  const handleDelete = async () => {
    const confirmed = await showConfirm('このアイテムを削除してもよろしいですか？', {
      title: '削除確認',
      confirmText: '削除する',
      cancelText: 'キャンセル'
    })
    
    if (confirmed) {
      // 削除処理を実行
      console.log('削除されました')
    }
  }

  return (
    <>
      <DialogContainer />
      <button onClick={handleDelete}>削除</button>
    </>
  )
}
\`\`\`

### API リファレンス

\`\`\`typescript
showConfirm(
  message: string,
  options?: {
    title?: string
    confirmText?: string
    cancelText?: string
  }
): Promise<boolean>
\`\`\`

**戻り値**:
- \`true\`: ユーザーが「OK」をクリック
- \`false\`: ユーザーが「キャンセル」をクリックまたは背景をクリック

### デフォルト値

- **title**: \"確認\"
- **confirmText**: \"OK\"
- **cancelText**: \"キャンセル\"
        `
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {},
  args: {}
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * 基本的な確認ダイアログ
 * シンプルな確認メッセージ
 */
export const Default: Story = {
  render: () => {
    return (
      <div style={{ padding: '20px' }}>
        <DialogContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>基本的な確認ダイアログ</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            以下のボタンをクリックすると、確認ダイアログが表示されます。
          </p>
          <button
            onClick={async () => {
              const result = await showConfirm('このアクションを実行してもよろしいですか？')
              alert(`ユーザーの選択: ${result ? 'OK' : 'キャンセル'}`)
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ダイアログを表示
          </button>
        </div>
      </div>
    )
  }
}

/**
 * カスタムボタンテキスト
 * ボタンのテキストをカスタマイズした例
 */
export const CustomButtons: Story = {
  render: () => {
    return (
      <div style={{ padding: '20px' }}>
        <DialogContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>カスタムボタンテキスト</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            ボタンテキストをカスタマイズすることで、
            ユースケースに合わせた確認メッセージが作成できます。
          </p>
          <button
            onClick={async () => {
              const result = await showConfirm(
                'この変更を保存しますか？',
                {
                  title: '確認',
                  confirmText: '保存する',
                  cancelText: '保存しない'
                }
              )
              alert(`ユーザーの選択: ${result ? '保存する' : '保存しない'}`)
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4CAF50',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            カスタムボタンで表示
          </button>
        </div>
      </div>
    )
  }
}

/**
 * 破壊的アクション警告
 * 削除などの破壊的な操作時の警告ダイアログ
 */
export const Destructive: Story = {
  render: () => {
    return (
      <div style={{ padding: '20px' }}>
        <DialogContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>破壊的アクション警告</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            削除など、元に戻せないアクションの場合は、
            より明確なボタンテキストを使用します。
          </p>
          <button
            onClick={async () => {
              const result = await showConfirm(
                'この操作は取り消せません。本当に削除しますか？',
                {
                  title: '警告',
                  confirmText: '削除する',
                  cancelText: 'キャンセル'
                }
              )
              alert(`ユーザーの選択: ${result ? '削除する' : 'キャンセル'}`)
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#F44336',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            削除確認ダイアログを表示
          </button>
        </div>
      </div>
    )
  }
}

/**
 * 長いメッセージ
 * 長い説明文を含むダイアログの例
 */
export const LongMessage: Story = {
  render: () => {
    return (
      <div style={{ padding: '20px' }}>
        <DialogContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>長いメッセージ</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            ダイアログは長めのメッセージにも対応しています。
          </p>
          <button
            onClick={async () => {
              const result = await showConfirm(
                'このアプリケーションは位置情報データを使用して、正確な地図表示とドローン飛行制限エリアの情報提供を行います。位置情報の使用を許可されますか？',
                {
                  title: 'アクセス許可',
                  confirmText: '許可',
                  cancelText: '許可しない'
                }
              )
              alert(`ユーザーの選択: ${result ? '許可' : '許可しない'}`)
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            長いメッセージを表示
          </button>
        </div>
      </div>
    )
  }
}
