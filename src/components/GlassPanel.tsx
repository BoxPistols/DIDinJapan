/**
 * GlassPanel Component
 * Reusable glassmorphism panel base for all UI panels
 * Provides consistent styling and behavior across the application
 */

import React, { ReactNode } from 'react'
import styles from './GlassPanel.module.css'

export interface GlassPanelProps {
  /** Panel title */
  title: string
  /** Panel content */
  children: ReactNode
  /** Callback when close button is clicked */
  onClose?: () => void
  /** Panel width (default: auto) */
  width?: string | number
  /** Panel max height (default: 80vh) */
  maxHeight?: string | number
  /** Position from bottom (default: 20px) */
  bottom?: string | number
  /** Position from right (default: 20px) */
  right?: string | number
  /** Footer content (optional) */
  footer?: ReactNode
  /** Additional CSS class */
  className?: string
  /** Additional inline styles */
  style?: React.CSSProperties
  /** Custom header actions (appears before close button) */
  headerActions?: ReactNode
}

/**
 * Glassmorphism Panel Component
 *
 * @example
 * ```tsx
 * <GlassPanel
 *   title="Map Information"
 *   onClose={() => setIsOpen(false)}
 *   width="360px"
 *   bottom={20}
 *   right={20}
 *   footer={<p>Data is stored locally</p>}
 * >
 *   <div>Panel content here</div>
 * </GlassPanel>
 * ```
 */
export const GlassPanel: React.FC<GlassPanelProps> = ({
  title,
  children,
  onClose,
  width = 'auto',
  maxHeight = '80vh',
  bottom = 20,
  right = 20,
  footer,
  className,
  style,
  headerActions
}) => {
  const parseSize = (value: string | number | undefined): string => {
    if (typeof value === 'number') return `${value}px`
    return String(value)
  }

  return (
    <div
      className={`${styles.container} ${className || ''}`}
      style={{
        width: parseSize(width),
        maxHeight: parseSize(maxHeight),
        bottom: parseSize(bottom),
        right: parseSize(right),
        ...style
      }}
    >
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {headerActions}
          {onClose && (
            <button
              onClick={onClose}
              className={styles.closeButton}
              aria-label="Close panel"
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>{children}</div>

      {/* Footer */}
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}

export default GlassPanel
