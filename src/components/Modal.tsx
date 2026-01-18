/**
 * Modal Component
 * 汎用的なモーダルダイアログコンポーネント
 * ESCキーで閉じることができます
 */

import { useEffect, type ReactNode } from 'react'
import styles from './Modal.module.css'

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
      className={styles.overlay}
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        className={styles.modal}
        style={{ width, maxWidth: '90vw', maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className={styles.header}>
          <h3 id={modalTitleId} className={styles.title}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className={styles.closeButton}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* コンテンツ */}
        <div className={styles.content}>{children}</div>

        {/* フッター */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
