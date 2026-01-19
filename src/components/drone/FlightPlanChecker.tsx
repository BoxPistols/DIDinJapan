/**
 * FlightPlanChecker Component
 * Displays comprehensive flight safety status for a selected point
 */

import React, { useMemo } from 'react'
import { useOperationSafety } from '../../lib/hooks'
import { latLngToMeshCode } from '../../lib/utils/meshCodeConverter'
import { SafetyIndicator } from './SafetyIndicator'
import { CheckIcon, XIcon, AlertTriangleIcon, ZapIcon, InfoIcon } from '../icons'
import styles from './FlightPlanChecker.module.css'

export interface FlightPlanCheckerProps {
// ... existing interface
}

// ... existing component definition

  return (
    <div className={styles.container}>
      {/* Overall Safety Status */}
      <div className={`${styles.overallStatus} ${safety.canFly ? styles.safe : styles.unsafe}`}>
        <div className={styles.statusIcon}>
          {safety.canFly ? <CheckIcon size={32} /> : <XIcon size={32} />}
        </div>
        <div className={styles.statusText}>
// ... existing code
      {/* Detailed Reasons */}
      {safety.reasons.length > 0 && (
        <div className={styles.reasonsSection}>
          <h4 className={styles.reasonsTitle}>詳細情報</h4>
          <ul className={styles.reasonsList}>
            {safety.reasons.map((reason, index) => (
              <li
                key={index}
                className={`${styles.reason} ${styles[reason.severity]}`}
              >
                <span className={styles.reasonIcon}>
                  {reason.severity === 'critical' && '⚠️'}
                  {reason.severity === 'warning' && '⚡'}
                  {reason.severity === 'info' && 'ℹ️'}
                </span>
                <span className={styles.reasonText}>{reason.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
// ... existing code


export default FlightPlanChecker
