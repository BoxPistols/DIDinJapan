/**
 * SafetyIndicator Component
 * Reusable safety status indicator with colored dot and label
 */

import React from 'react'
import styles from './SafetyIndicator.module.css'

export interface SafetyIndicatorProps {
  /** Safety level */
  level: 'safe' | 'caution' | 'warning' | 'danger'
  /** Label text */
  label: string
  /** Optional value to display */
  value?: string
}

/**
 * Safety Indicator Component
 * Displays a colored dot with safety level, label, and optional value
 *
 * @example
 * ```tsx
 * <SafetyIndicator level="safe" label="Wind Speed" value="3.5 m/s" />
 * <SafetyIndicator level="danger" label="LTE Coverage" />
 * ```
 */
export const SafetyIndicator: React.FC<SafetyIndicatorProps> = ({
  level,
  label,
  value
}) => {
  return (
    <div className={styles.container}>
      <span className={`${styles.dot} ${styles[level]}`} />
      <div className={styles.content}>
        <span className={styles.label}>{label}</span>
        {value && <span className={styles.value}>{value}</span>}
      </div>
    </div>
  )
}

export default SafetyIndicator
