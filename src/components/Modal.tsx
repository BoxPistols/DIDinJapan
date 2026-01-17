/**
 * Modal Component
 * 汎用的なモーダルダイアログコンポーネント
 * ESCキーで閉じることができます
 */

import { useEffect, type ReactNode } from 'react'

export interface ModalProps {
  /** モーダルの表示状態 */
  isOpen: boolean
  /** モーダルを閉じるコールバック */
  onClose: () => void
  /** モーダルのタイトル */
  title: string
  /** モーダルのコンテンツ */
  children: ReactNode
  /** フッターのコンテンツ（ボタンなど） */
  footer?: ReactNode
  /** ダークモード */
  darkMode?: boolean
  /** モーダルの幅 */
  width?: string
  /** モーダルの最大高さ */
  maxHeight?: string
  /** 背景の透過度 */
  overlayOpacity?: number
  /** z-index */
  zIndex?: number
}

/**
 * Modal Component
 *
 * @example
 * ```tsx
 * <Modal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   title="エクスポートプレビュー"
 *   footer={
 *     <div>
 *       <button onClick={handleCopy}>コピー</button>
 *       <button onClick={handleDownload}>ダウンロード</button>
 *     </div>
 *   }
 * >
 *   <pre>{previewData}</pre>
 * </Modal>
 * ```
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  darkMode = false,
  width = '600px',
  maxHeight = '80vh',
  overlayOpacity = 0.5,
  zIndex = 2000
}: ModalProps) {
  // ESCキーで閉じる
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

  if (!isOpen) return null

  const modalTitleId = 'modal-title'

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: `rgba(0,0,0,${overlayOpacity})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        style={{
          backgroundColor: darkMode ? '#1e1e1e' : '#fff',
          borderRadius: '8px',
          width,
          maxWidth: '90vw',
          maxHeight,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: darkMode ? '1px solid #444' : 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div
          style={{
            padding: '16px',
            borderBottom: darkMode ? '1px solid #444' : '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <h3
            id={modalTitleId}
            style={{ margin: 0, fontSize: '16px', color: darkMode ? '#fff' : '#333' }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: darkMode ? '#ccc' : '#666',
              padding: '0 8px',
              lineHeight: 1
            }}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* コンテンツ */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px'
          }}
        >
          {children}
        </div>

        {/* フッター */}
        {footer && (
          <div
            style={{
              padding: '16px',
              borderTop: darkMode ? '1px solid #444' : '1px solid #ddd',
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end'
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
