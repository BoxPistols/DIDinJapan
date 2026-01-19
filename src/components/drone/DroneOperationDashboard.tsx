/**
 * DroneOperationDashboard Component
 * Top-level dashboard integrating flight safety checker and time controls
 */

import React, { useState, useCallback } from 'react'
import type maplibregl from 'maplibre-gl'
import { GlassPanel } from '../GlassPanel'
import { FlightPlanChecker } from './FlightPlanChecker'
import { WeatherTimeSlider } from './WeatherTimeSlider'
import styles from './DroneOperationDashboard.module.css'

export interface DroneOperationDashboardProps {
  /** MapLibre GL map instance */
  map?: maplibregl.Map
  /** Selected point coordinates */
  selectedPoint?: { lat: number; lng: number }
  /** Callback when dashboard is closed */
  onClose?: () => void
}

/**
 * Drone Operation Dashboard Component
 * Main dashboard for drone flight safety assessment
 *
 * @example
 * ```tsx
 * <DroneOperationDashboard
 *   map={mapInstance}
 *   selectedPoint={{ lat: 35.6595, lng: 139.7004 }}
 *   onClose={() => setIsOpen(false)}
 * />
 * ```
 */
export const DroneOperationDashboard: React.FC<DroneOperationDashboardProps> = ({
  map,
  selectedPoint,
  onClose
}) => {
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [showWindOverlay, setShowWindOverlay] = useState(true)
  const [showPrecipOverlay, setShowPrecipOverlay] = useState(false)
  const [showLTEOverlay, setShowLTEOverlay] = useState(true)

  // Time range: now to 72 hours ahead
  const minTime = Date.now()
  const maxTime = Date.now() + 72 * 60 * 60 * 1000

  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time)
    // TODO: Update map overlays based on selected time
  }, [])

  const toggleOverlay = useCallback((overlay: 'wind' | 'precip' | 'lte') => {
    switch (overlay) {
      case 'wind':
        setShowWindOverlay(prev => !prev)
        // TODO: Toggle wind overlay on map
        break
      case 'precip':
        setShowPrecipOverlay(prev => !prev)
        // TODO: Toggle precipitation overlay on map
        break
      case 'lte':
        setShowLTEOverlay(prev => !prev)
        // TODO: Toggle LTE overlay on map
        break
    }
  }, [])

  return (
    <GlassPanel
      title="🚁 ドローン運用安全ダッシュボード"
      onClose={onClose}
      width={400}
      maxHeight="90vh"
      bottom={20}
      right={20}
    >
      <div className={styles.container}>
        {/* Flight Plan Checker */}
        {selectedPoint ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>📍 地点安全評価</h3>
            <FlightPlanChecker
              lat={selectedPoint.lat}
              lng={selectedPoint.lng}
            />
          </section>
        ) : (
          <div className={styles.noSelection}>
            <div className={styles.noSelectionIcon}>📍</div>
            <div className={styles.noSelectionText}>
              地図上の地点を選択してください
            </div>
            <div className={styles.noSelectionHint}>
              地点をクリックすると安全性評価が表示されます
            </div>
          </div>
        )}

        {/* Overlay Toggles */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>🗺️ レイヤー表示</h3>
          <div className={styles.toggles}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={showWindOverlay}
                onChange={() => toggleOverlay('wind')}
                className={styles.toggleInput}
              />
              <span className={styles.toggleText}>風速マップ</span>
            </label>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={showPrecipOverlay}
                onChange={() => toggleOverlay('precip')}
                className={styles.toggleInput}
              />
              <span className={styles.toggleText}>降水確率マップ</span>
            </label>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={showLTEOverlay}
                onChange={() => toggleOverlay('lte')}
                className={styles.toggleInput}
              />
              <span className={styles.toggleText}>LTEカバレッジ</span>
            </label>
          </div>
        </section>

        {/* Time Slider */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>⏰ 時刻選択</h3>
          <WeatherTimeSlider
            currentTime={currentTime}
            onChange={handleTimeChange}
            minTime={minTime}
            maxTime={maxTime}
          />
        </section>

        {/* Usage Guide */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>💡 使用方法</h3>
          <ul className={styles.guideList}>
            <li>地図上で飛行地点をクリック</li>
            <li>安全性評価を確認</li>
            <li>時刻スライダーで予報を確認</li>
            <li>必要なレイヤーを表示/非表示</li>
          </ul>
        </section>
      </div>
    </GlassPanel>
  )
}

export default DroneOperationDashboard
