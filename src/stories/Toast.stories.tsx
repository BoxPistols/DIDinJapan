import type { Meta, StoryObj } from '@storybook/react'
import { ToastContainer } from '../components/Toast'
import { showToast, toast, clearToasts } from '../utils/toast'

/**
 * Toast - トースト通知コンポーネント
 *
 * ユーザーアクションの結果をフローティング通知で表示します。
 * 成功、エラー、警告、情報の4つのタイプをサポートしています。
 * 3秒後に自動的に非表示になります。
 *
 * ## 機能
 * - 4つのタイプ（success, error, warning, info）
 * - 自動クローズ（デフォルト3秒）
 * - 手動クローズボタン
 * - 複数の通知を同時表示
 * - アニメーション付きスライドイン
 */
const meta: Meta<typeof ToastContainer> = {
  title: 'Feedback/Toast',
  component: ToastContainer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
## 概要

Toast 通知システムは、ユーザーのアクション結果（成功・エラー・警告・情報）をリアルタイムで画面右上に表示します。自動クローズ、複数同時表示、スライドインアニメーション対応。

## 技術仕様

### API インターフェース

\`\`\`typescript
// 基本関数
export function showToast(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info',
  duration: number = 3000
): string  // トースト ID を返す

// 便利メソッド（自動型指定）
export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration)
}

// ユーティリティ
export function removeToast(id: string): void
export function subscribeToToasts(listener: (toasts: Toast[]) => void): () => void
export function clearToasts(): void

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}
\`\`\`

### アーキテクチャ

**Pub-Sub パターンを採用:**

\`\`\`
showToast() → toasts.push(toast) → notifyListeners()
                ↓
            各リスナーに通知 → ToastContainer が再レンダリング
                ↓
            自動タイマー → removeToast() → notifyListeners() → 消える
\`\`\`

**状態管理（グローバル）:**
\`\`\`typescript
let toastId = 0
const listeners: Set<(toasts: Toast[]) => void> = new Set()
const toasts: Toast[] = []  // 真実の源（React state ではなし）
\`\`\`

### UI コンポーネント（ToastContainer）

**DOM 構造:**
\`\`\`html
<div style="position: fixed; top: 20px; right: 20px; z-index: 9999; ...">
  {toasts.map(toast => (
    <div key={toast.id} role="status" aria-live="polite" aria-atomic="true">
      <span>{toast.message}</span>
      <button onClick={() => removeToast(toast.id)}>✕</button>
    </div>
  ))}
  <style>
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  </style>
</div>
\`\`\`

**カラースキーム:**
\`\`\`typescript
function getBackgroundColor(type: string): string {
  switch (type) {
    case 'success': return '#4CAF50'   // Green
    case 'error': return '#F44336'     // Red
    case 'warning': return '#FF9800'   // Orange
    case 'info': return '#2196F3'      // Blue
    default: return '#2196F3'
  }
}
\`\`\`

| タイプ | 背景色 | RGB | 用途 |
|--------|--------|-----|------|
| **success** | #4CAF50 | (76, 175, 80) | 操作成功、保存完了 |
| **error** | #F44336 | (244, 67, 54) | エラー、失敗 |
| **warning** | #FF9800 | (255, 152, 0) | 警告、注意 |
| **info** | #2196F3 | (33, 150, 243) | 情報、通知 |

### ライフサイクル

**トースト表示の流れ:**

1. \`toast.success('メッセージ')\` 呼び出し
2. toasts 配列に追加 → リスナー通知 → UI 更新
3. スライドイン アニメーション開始（CSS）
4. \`duration\` ミリ秒後に自動削除タイマー発動
5. removeToast(id) → 配列から削除 → リスナー通知
6. スライドアウト アニメーション（設定時）

\`\`\`typescript
// 自動クローズ実装
if (duration > 0) {
  setTimeout(() => {
    removeToast(id)
  }, duration)
}
\`\`\`

### 使用パターン

**基本的な使用：**
\`\`\`tsx
import { ToastContainer } from 'japan-drone-map/components'
import { toast } from 'japan-drone-map/utils/toast'

function App() {
  return (
    <>
      <ToastContainer />
      <button onClick={() => toast.success('保存されました！')}>保存</button>
    </>
  )
}
\`\`\`

**カスタム duration：**
\`\`\`tsx
// 表示時間を 5 秒に設定
toast.error('エラーが発生しました', 5000)

// 手動クローズ のみ（自動閉じなし）
toast.info('この通知は手動で消す必要があります', 0)
\`\`\`

**手動クローズ：**
\`\`\`tsx
const toastId = toast.warning('処理中...')
// 後で...
removeToast(toastId)
\`\`\`

**複数同時表示：**
\`\`\`tsx
toast.info('情報')
setTimeout(() => toast.success('成功'), 500)
setTimeout(() => toast.warning('警告'), 1000)
setTimeout(() => toast.error('エラー'), 1500)
// → 4 つのトーストが同時に表示
\`\`\`

### アクセシビリティ（A11y）

**ARIA 属性:**
\`\`\`tsx
<div
  role="status"
  aria-live="polite"      // 非割り込み型ライブリージョン
  aria-atomic="true"      // 全体を読み上げ
>
  {message}
</div>
\`\`\`

- \`role="status"\`: ステータス更新を示す
- \`aria-live="polite"\`: 重要度は中（割り込みなし）
- \`aria-atomic="true"\`: 変更内容全体を読み上げ

### パフォーマンス最適化

**メモ化（ToastContainer）:**
\`\`\`typescript
// 不要な再レンダリング防止
export const ToastContainer = memo(function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])
  // ...
})
\`\`\`

**効率的なリスナー管理:**
\`\`\`typescript
function subscribeToToasts(listener: (toasts: Toast[]) => void) {
  listeners.add(listener)
  listener(toasts)  // 即座に現在の状態を通知
  return () => listeners.delete(listener)  // アンサブスクライブ
}
\`\`\`

### ブラウザ互換性

| ブラウザ | 対応状況 | 注記 |
|---------|--------|------|
| Chrome 60+ | ✅ 完全 | CSS animation 完全対応 |
| Firefox 55+ | ✅ 完全 | |
| Safari 12+ | ✅ 完全 | |
| Edge 79+ | ✅ 完全 | Chromium ベース |
| IE 11 | ⚠️ 部分 | CSS animation 未対応（フォールバック） |

### 既知の制限事項

1. **Toast ID**: 同じメッセージで複数表示時に ID 競合の可能性
   - 対策: 別途グローバルカウンターで ID 生成

2. **Z-index**: 値 9999 固定（他のオーバーレイと競合可能性）
   - 対策: 必要に応じて変更

3. **メッセージ長**: 長いテキストは右上で折り返される
   - 対策: テンプレートリテラルで改行を入れる

\`\`\`tsx
toast.info(\`操作が完了しました。
詳細は画面下部をご確認ください\`)
\`\`\`

4. **同時表示制限**: なし（1000+個表示時は UI 低下）
   - 対策: 古いトーストから自動削除するラッピング関数を実装
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
 * Success トースト
 * 操作成功時のトースト表示例
 */
export const Success: Story = {
  render: () => {
    // Clear any existing toasts when story mounts
    clearToasts()
    
    return (
      <div style={{ padding: '20px' }}>
        <ToastContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Success トースト</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            以下のボタンをクリックすると、成功メッセージのトースト通知が表示されます。
          </p>
          <button
            onClick={() => toast.success('データが正常に保存されました！')}
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
            Success 通知を表示
          </button>
        </div>
      </div>
    )
  }
}

/**
 * Error トースト
 * エラー発生時のトースト表示例
 */
export const Error: Story = {
  render: () => {
    clearToasts()
    
    return (
      <div style={{ padding: '20px' }}>
        <ToastContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Error トースト</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            以下のボタンをクリックすると、エラーメッセージのトースト通知が表示されます。
          </p>
          <button
            onClick={() => toast.error('ファイルのアップロードに失敗しました')}
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
            Error 通知を表示
          </button>
        </div>
      </div>
    )
  }
}

/**
 * Warning トースト
 * 警告メッセージのトースト表示例
 */
export const Warning: Story = {
  render: () => {
    clearToasts()
    
    return (
      <div style={{ padding: '20px' }}>
        <ToastContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Warning トースト</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            以下のボタンをクリックすると、警告メッセージのトースト通知が表示されます。
          </p>
          <button
            onClick={() => toast.warning('接続が不安定です')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#FF9800',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Warning 通知を表示
          </button>
        </div>
      </div>
    )
  }
}

/**
 * Info トースト
 * 情報通知のトースト表示例
 */
export const Info: Story = {
  render: () => {
    clearToasts()
    
    return (
      <div style={{ padding: '20px' }}>
        <ToastContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Info トースト</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            以下のボタンをクリックすると、情報メッセージのトースト通知が表示されます。
          </p>
          <button
            onClick={() => toast.info('新しいデータが利用可能です')}
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
            Info 通知を表示
          </button>
        </div>
      </div>
    )
  }
}

/**
 * 複数通知
 * 同時に複数のトースト通知を表示する例
 */
export const Multiple: Story = {
  render: () => {
    clearToasts()
    
    return (
      <div style={{ padding: '20px' }}>
        <ToastContainer />
        <div style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '600px'
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>複数通知</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
            以下のボタンをクリックすると、複数のトースト通知が順に表示されます。
          </p>
          <button
            onClick={() => {
              clearToasts()
              setTimeout(() => toast.success('操作1が完了しました'), 0)
              setTimeout(() => toast.info('次に進んでください'), 500)
              setTimeout(() => toast.warning('接続が遅い可能性があります'), 1000)
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
            複数通知を表示
          </button>
        </div>
      </div>
    )
  }
}
