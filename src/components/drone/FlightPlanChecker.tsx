/**
 * FlightPlanChecker Component
 * Displays comprehensive flight safety status for a selected point
 */

import React, { useMemo } from 'react'
import { useOperationSafety } from '../../lib/hooks'
import { latLngToMeshCode } from '../../lib/utils/meshCodeConverter'
import { SafetyIndicator } from './SafetyIndicator'
import styles from './FlightPlanChecker.module.css'

export interface FlightPlanCheckerProps {
  /** Latitude in decimal degrees */
  lat: number
  /** Longitude in decimal degrees */
  lng: number
}

/**
 * Flight Plan Checker Component
 * Uses useOperationSafety hook to evaluate flight safety conditions
 * Also uses useWeatherMesh to access raw weather data for display
 *
 * @example
 * ```tsx
 * <FlightPlanChecker lat={35.6595} lng={139.7004} />
 * ```
 */
export const FlightPlanChecker: React.FC<FlightPlanCheckerProps> = ({
  lat,
  lng
}) => {
  const meshCode = useMemo(() => latLngToMeshCode(lat, lng), [lat, lng])
  const safety = useOperationSafety(lat, lng, meshCode)

  if (safety.loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>安全性チェック中...</div>
      </div>
    )
  }

  if (safety.error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          エラー: {safety.error}
        </div>
      </div>
    )
  }

  // Extract specific data from reasons
  // Note: Currently parsing from reason messages due to hook design.
  // Future improvement: Hook should provide structured numeric data.
  const windReason = safety.reasons.find(r => r.category === 'wind')
  const precipReason = safety.reasons.find(r => r.category === 'precipitation')
  const networkReason = safety.reasons.find(r => r.category === 'network')
  const daylightReason = safety.reasons.find(r => r.category === 'daylight')

  // Determine safety level for each indicator
  const getWindLevel = (): 'safe' | 'caution' | 'warning' | 'danger' => {
    if (!windReason) return 'safe'
    if (windReason.severity === 'critical') return 'danger'
    if (windReason.severity === 'warning') return 'warning'
    return 'caution'
  }

  const getPrecipLevel = (): 'safe' | 'caution' | 'warning' | 'danger' => {
    if (!precipReason) return 'safe'
    if (precipReason.severity === 'critical') return 'danger'
    if (precipReason.severity === 'warning') return 'warning'
    return 'caution'
  }

  const getNetworkLevel = (): 'safe' | 'caution' | 'warning' | 'danger' => {
    if (!networkReason) return 'safe'
    if (networkReason.severity === 'critical') return 'danger'
    if (networkReason.severity === 'warning') return 'warning'
    return 'caution'
  }

  const getDaylightLevel = (): 'safe' | 'caution' | 'warning' | 'danger' => {
    if (!daylightReason) return 'safe'
    if (daylightReason.severity === 'critical') return 'danger'
    if (daylightReason.severity === 'warning') return 'warning'
    return 'caution'
  }

  return (
    <div className={styles.container}>
      {/* Overall Safety Status */}
      <div className={`${styles.overallStatus} ${safety.canFly ? styles.safe : styles.unsafe}`}>
        <div className={styles.statusIcon}>
          {safety.canFly ? '✓' : '✗'}
        </div>
        <div className={styles.statusText}>
          <div className={styles.statusTitle}>
            {safety.canFly ? '飛行可能' : '飛行不可'}
          </div>
          <div className={styles.statusSubtitle}>
            {safety.safetyLevel === 'safe' && '全ての条件がクリア'}
            {safety.safetyLevel === 'caution' && '注意が必要'}
            {safety.safetyLevel === 'warning' && '警告レベル'}
            {safety.safetyLevel === 'danger' && '危険レベル'}
            {safety.safetyLevel === 'prohibited' && '飛行禁止'}
          </div>
        </div>
      </div>

      {/* Safety Indicators */}
      <div className={styles.indicators}>
        <SafetyIndicator
          level={getWindLevel()}
          label="風速"
          value={
            safety.weatherData?.windSpeed != null
              ? `${safety.weatherData.windSpeed.toFixed(1)} m/s`
              : 'データなし'
          }
        />
        <SafetyIndicator
          level={getPrecipLevel()}
          label="降水確率"
          value={
            safety.weatherData?.precipitationProbability != null
              ? `${safety.weatherData.precipitationProbability}%`
              : 'データなし'
          }
        />
        <SafetyIndicator
          level={getNetworkLevel()}
          label="LTE通信"
          value={safety.networkData?.hasLTE ? 'カバレッジあり' : 'カバレッジなし'}
        />
        <SafetyIndicator
          level={getDaylightLevel()}
          label="飛行可能時間"
          value={
            safety.flightWindowData?.minutesRemaining 
              ? `${safety.flightWindowData.minutesRemaining}分` 
              : safety.flightWindowData?.flightAllowedNow 
                ? '十分'
                : '不可'
          }
        />
      </div>

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

      {/* Next Safe Window */}
      {!safety.canFly && safety.nextSafeWindow && (
        <div className={styles.nextWindow}>
          <span className={styles.nextWindowLabel}>次回飛行可能時刻:</span>
          <span className={styles.nextWindowValue}>
            {safety.nextSafeWindow.toLocaleString('ja-JP')}
          </span>
        </div>
      )}
    </div>
  )
}

export default FlightPlanChecker
