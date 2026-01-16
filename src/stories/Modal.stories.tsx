import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { useState } from 'react'
import { Modal } from '../components/Modal'

/**
 * Modal - 汎用的なモーダルダイアログコンポーネント
 *
 * ユーザーへの情報表示、確認ダイアログ、フォーム入力など、
 * 様々な用途で使用できる汎用的なモーダルコンポーネント。
 * ESCキーまたは背景をクリックで閉じることができます。
 *
 * ## 機能
 * - ESCキーで閉じる
 * - 背景クリックで閉じる
 * - タイトル、コンテンツ、フッター（オプション）をサポート
 * - ダークモード対応
 * - カスタム幅と高さ設定可能
 * - アクセシビリティ対応（ARIA属性）
 */
const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
## 概要

Modal コンポーネントは、汎用的なダイアログボックスです。情報表示、確認ダイアログ、フォーム入力、データプレビューなど、様々な用途で使用可能。ESC キーと背景クリックで閉じるUX、ARIA属性対応、ダークモード完全サポート。

## 技術仕様

### Props インターフェース

\`\`\`typescript
export interface ModalProps {
  isOpen: boolean                           // 表示・非表示状態
  onClose: () => void                       // 閉じるコールバック（必須）
  title: string                             // ヘッダータイトル
  children: ReactNode                       // コンテンツ
  footer?: ReactNode                        // フッター（オプション）
  darkMode?: boolean                        // ダークモード（デフォルト: false）
  width?: string                            // CSS width 値（デフォルト: '600px'）
  maxHeight?: string                        // CSS maxHeight 値（デフォルト: '80vh'）
}
\`\`\`

### DOM 構造と CSS クラス

\`\`\`html
<div style="position: fixed; top: 0; left: 0; ... z-index: 2000;">
  <!-- 背景オーバーレイ -->
  <div onClick={onClose} style="rgba(0,0,0,0.5)"></div>

  <!-- モーダルダイアログ -->
  <div role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
    <!-- ヘッダー -->
    <div>
      <h3 id="modal-title">{title}</h3>
      <button onClick={onClose} aria-label="閉じる">×</button>
    </div>

    <!-- コンテンツ -->
    <div style="flex: 1; overflow: auto; padding: 16px;">
      {children}
    </div>

    <!-- フッター（オプション） -->
    {footer && <div>{footer}</div>}
  </div>
</div>
\`\`\`

### スタイリング

**レイアウト:**
- ポジション: \`position: fixed\` (ビューポート固定)
- Z-index: 2000 (ダイアログ上位層)
- フレックスレイアウト: カラム方向

**カラースキーム:**
| 状態 | ライトモード | ダークモード |
|------|-----------|-----------|
| 背景 | #ffffff | #1e1e1e |
| テキスト | #333333 | #ffffff |
| ボーダー | #dddddd | #444444 |
| オーバーレイ | rgba(0,0,0,0.5) | rgba(0,0,0,0.5) |

**ボックス モデル:**
- ボーダーラジアス: 8px
- パディング: 16px（ヘッダー・フッター）
- ボックスシャドウ: 0 8px 32px rgba(0,0,0,0.3)
- 最大幅: 90vw (レスポンシブ)
- 最大高さ: 80vh（デフォルト）

### イベントハンドリング

**ESC キー対応:**
\`\`\`typescript
useEffect(() => {
  if (!isOpen) return

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
}, [isOpen, onClose])
\`\`\`

**背景クリック対応:**
\`\`\`tsx
<div onClick={onClose}>
  {/* オーバーレイ */}
  <div onClick={(e) => e.stopPropagation()}>
    {/* モーダル内部 - クリック伝播を停止 */}
  </div>
</div>
\`\`\`

### アクセシビリティ（A11y）

**ARIA 属性:**
- \`role="dialog"\` - ダイアログロール
- \`aria-modal="true"\` - モーダルであることを明示
- \`aria-labelledby={modalTitleId}\` - タイトルをラベルに指定
- \`aria-label="閉じる"\` - クローズボタンのラベル

**フォーカス管理:**
- モーダル表示時: フォーカスをモーダル内に閉じ込め
- ESC 時: 前のフォーカス位置に戻す（推奨実装）

**スクリーンリーダー対応:**
- タイトルが正しく読み上げられる
- クローズボタンの意図が明確
- 背景コンテンツは \`aria-hidden="true"\` で隠す（推奨）

### パフォーマンス考慮事項

**条件付きレンダリング:**
\`\`\`typescript
if (!isOpen) return null  // 非表示時は DOM から削除
\`\`\`

**メモ化の推奨:**
\`\`\`tsx
export const Modal = memo(function Modal(props: ModalProps) {
  // コンポーネント実装
})
\`\`\`

### レスポンシブ対応

**モバイル対応:**
\`\`\`css
/* 小画面 */
maxWidth: 90vw    /* ビューポート幅の90% */
maxHeight: 80vh   /* ビューポート高さの80% */
padding: 12px     /* 適度なパディング */

/* 大画面 */
width: 600px      /* 固定幅（デフォルト） */
maxHeight: 80vh   /* スクロール可能 */
\`\`\`

### 使用例

**基本的なモーダル:**
\`\`\`tsx
import { Modal } from 'japan-drone-map/components'
import { useState } from 'react'

function App() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)}>モーダルを開く</button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="確認"
      >
        <p>このアクションを実行してもよろしいですか？</p>
      </Modal>
    </>
  )
}
\`\`\`

**フッター付き（ボタン配置）:**
\`\`\`tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="データエクスポート"
  footer={
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
      <button onClick={() => setIsOpen(false)}>キャンセル</button>
      <button
        onClick={() => {
          handleExport()
          setIsOpen(false)
        }}
        style={{ backgroundColor: '#2196F3', color: '#fff' }}
      >
        エクスポート
      </button>
    </div>
  }
>
  <p>次の形式でエクスポートできます: GeoJSON, KML, CSV</p>
</Modal>
\`\`\`

**ダークモード:**
\`\`\`tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="設定"
  darkMode={true}
>
  <p>ダークモード対応のモーダル</p>
</Modal>
\`\`\`

### 主な機能と動作

| 機能 | 詳細 | 実装方式 |
|------|------|--------|
| **ESC キー対応** | ESC で即座に閉じる | \`keydown\` イベントリスナー |
| **背景クリック** | 背景をクリックして閉じる | \`onClick\` + \`stopPropagation\` |
| **スクロール** | コンテンツが長い場合スクロール可能 | \`overflow: auto\` |
| **アニメーション** | 表示・非表示のトランジション | CSS トランジション（要カスタマイズ） |
| **ダークモード** | テーマ切り替え対応 | インラインスタイル条件分岐 |

### ブラウザ互換性

| ブラウザ | 対応状況 | 注記 |
|---------|--------|------|
| Chrome 60+ | ✅ 完全 | |
| Firefox 55+ | ✅ 完全 | |
| Safari 12+ | ✅ 完全 | |
| Edge 79+ | ✅ 完全 | Chromium ベース |
| IE 11 | ❌ 非対応 | fixed position 挙動差 |

### 既知の制限事項

1. **複数モーダル**: 一度に1つのみ表示（積み重ねサポートなし）
2. **フォーカストラップ**: 実装されていない（推奨：外部ライブラリ使用）
3. **アニメーション**: なし（CSS 追加で実装可能）
4. **印刷対応**: 未対応（メディアクエリで非表示推奨）
        `
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    isOpen: {
      description: 'モーダルの表示状態',
      control: { type: 'boolean' }
    },
    onClose: {
      description: 'モーダルを閉じるコールバック',
      action: 'close'
    },
    title: {
      description: 'モーダルのタイトル',
      control: { type: 'text' }
    },
    children: {
      description: 'モーダルのコンテンツ',
      control: { type: 'text' }
    },
    footer: {
      description: 'フッターのコンテンツ（ボタンなど）',
      control: false
    },
    darkMode: {
      description: 'ダークモード',
      control: { type: 'boolean' }
    },
    width: {
      description: 'モーダルの幅',
      control: { type: 'text' }
    },
    maxHeight: {
      description: 'モーダルの最大高さ',
      control: { type: 'text' }
    }
  },
  args: {
    isOpen: true,
    onClose: fn(),
    title: 'モーダルのタイトル',
    children: 'モーダルのコンテンツがここに表示されます。',
    darkMode: false,
    width: '600px',
    maxHeight: '80vh'
  }
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * デフォルト状態
 * 基本的なモーダルの表示例
 */
export const Default: Story = {
  args: {
    isOpen: true,
    title: '使い方ガイド',
    children: (
      <div>
        <p>このアプリケーションは、日本の人口集中地区（DID）データを地図上に表示するツールです。</p>
        <p>右側のサイドバーから、表示するレイヤーを選択できます。</p>
      </div>
    )
  }
}

/**
 * フッター付き
 * ボタンなどのアクションを含むモーダル例
 */
export const WithFooter: Story = {
  render: (args) => {
    const [isOpen, setIsOpen] = useState(true)
    return (
      <Modal
        {...args}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="データのエクスポート"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#e0e0e0',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              キャンセル
            </button>
            <button
              onClick={() => {
                alert('エクスポートしました！')
                setIsOpen(false)
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3388ff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              エクスポート
            </button>
          </div>
        }
      >
        <p>次の形式でデータをエクスポートできます：</p>
        <ul>
          <li>GeoJSON形式</li>
          <li>CSV形式</li>
          <li>KML形式（Google Earth）</li>
        </ul>
      </Modal>
    )
  }
}

/**
 * ダークモード
 * ダークモード対応のモーダル表示例
 */
export const DarkMode: Story = {
  args: {
    isOpen: true,
    title: '夜間モード',
    darkMode: true,
    children: (
      <div style={{ color: '#e0e0e0' }}>
        <p>このモーダルはダークモードで表示されています。</p>
        <p>背景が暗く設定され、テキストが明るい色で表示されます。</p>
      </div>
    )
  },
  parameters: {
    backgrounds: { default: 'dark' }
  }
}

/**
 * 長いコンテンツ
 * スクロール可能な長いコンテンツを含むモーダル例
 */
export const LongContent: Story = {
  args: {
    isOpen: true,
    title: '詳細なヘルプ',
    children: (
      <div>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>
              セクション {i + 1}
            </h4>
            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
              これはダミーのコンテンツです。実際のアプリケーションでは、ここに詳細なヘルプテキストが表示されます。
              コンテンツが多い場合、モーダルのコンテンツ領域内でスクロールできます。
            </p>
          </div>
        ))}
      </div>
    )
  }
}

/**
 * カスタム幅
 * 異なるサイズのモーダル表示例
 */
export const CustomWidth: Story = {
  render: (args) => {
    return (
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ marginTop: 0, fontSize: '12px', fontWeight: 600 }}>小（400px）</p>
          <Modal
            isOpen={true}
            onClose={() => {}}
            width="400px"
            title="小さいモーダル"
            darkMode={args.darkMode}
          >
            このモーダルは400pxの幅です。
          </Modal>
        </div>
        <div>
          <p style={{ marginTop: 0, fontSize: '12px', fontWeight: 600 }}>中（600px）- デフォルト</p>
          <Modal
            isOpen={true}
            onClose={() => {}}
            width="600px"
            title="標準サイズ"
            darkMode={args.darkMode}
          >
            このモーダルは600pxの幅です。
          </Modal>
        </div>
        <div>
          <p style={{ marginTop: 0, fontSize: '12px', fontWeight: 600 }}>大（900px）</p>
          <Modal
            isOpen={true}
            onClose={() => {}}
            width="900px"
            title="大きいモーダル"
            darkMode={args.darkMode}
          >
            このモーダルは900pxの幅です。複数列のレイアウトに向いています。
          </Modal>
        </div>
      </div>
    )
  }
}
