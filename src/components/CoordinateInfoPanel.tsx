/**
 * CoordinateInfoPanel - 座標・高度情報表示パネル
 * 
 * マップのクリック位置の座標、海抜高度、推奨飛行高度を表示します。
 */

import React, { useState, useEffect } from 'react'
import { getCoordinateInfo, getRecommendedFlightAltitude, CoordinateInfo } from '../lib/services/elevationService'
import styles from './CoordinateInfoPanel.module.css'

interface CoordinatePanelProps {
  isVisible: boolean
  lngLat?: { lng: number; lat: number }
  onClose?: () => void
}

export const CoordinateInfoPanel: React.FC<CoordinatePanelProps> = ({
  isVisible,
  lngLat,
  onClose
}) => {
  const [coordInfo, setCoordInfo] = useState<CoordinateInfo | null>(null)
  const [recommendedAltitude, setRecommendedAltitude] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isVisible || !lngLat) {
      setCoordInfo(null)
      setRecommendedAltitude(null)
      return
    }

    const fetchInfo = async () => {
      setLoading(true)
      try {
        const info = await getCoordinateInfo(lngLat)
        setCoordInfo(info)

        if (info.elevation) {
          const altitude = await getRecommendedFlightAltitude(
            lngLat.lng,
            lngLat.lat,
            30 // 安全マージン30m
          )
          setRecommendedAltitude(altitude)
        }
      } catch (error) {
        console.error('Failed to fetch coordinate info:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchInfo()
  }, [isVisible, lngLat])

  if (!isVisible || !coordInfo) {
    return null
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>📍 座標・高度情報</h3>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className={styles.content}>
        {/* 座標情報 */}
        <div className={styles.section}>
          <h4>座標（WGS84）</h4>
          <div className={styles.coordBox}>
            <div className={styles.row}>
              <span className={styles.label}>緯度:</span>
              <code className={styles.value}>{coordInfo.lat.toFixed(6)}°N</code>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>経度:</span>
              <code className={styles.value}>{coordInfo.lng.toFixed(6)}°E</code>
            </div>
          </div>
          <button
            className={styles.copyBtn}
            onClick={() => {
              const text = `${coordInfo.lat.toFixed(6)},${coordInfo.lng.toFixed(6)}`
              navigator.clipboard.writeText(text)
              alert('座標をコピーしました')
            }}
          >
            📋 座標をコピー
          </button>
        </div>

        {/* 高度情報 */}
        {loading ? (
          <div className={styles.loading}>高度データを取得中...</div>
        ) : coordInfo.elevation !== undefined ? (
          <div className={styles.section}>
            <h4>海抜高度</h4>
            <div className={styles.elevationBox}>
              <div className={styles.elevation}>
                <span className={styles.value}>{coordInfo.elevation.toFixed(1)}</span>
                <span className={styles.unit}>m ASL</span>
              </div>
              <p className={styles.note}>* ASL = Above Sea Level（海上レベル）</p>
            </div>
          </div>
        ) : (
          <div className={styles.section}>
            <div className={styles.noData}>高度データは取得できません</div>
          </div>
        )}

        {/* ドローン飛行推奨高度 */}
        {recommendedAltitude !== null && (
          <div className={styles.section}>
            <h4>🚁 推奨飛行高度</h4>
            <div className={styles.altitudeBox}>
              <div className={styles.altitude}>
                <span className={styles.value}>{recommendedAltitude.toFixed(1)}</span>
                <span className={styles.unit}>m AGL</span>
              </div>
              <p className={styles.note}>
                * AGL = Above Ground Level（地上レベル）<br/>
                * 安全マージン: 30m
              </p>
            </div>
          </div>
        )}

        {/* ドローン操作ガイド */}
        <div className={styles.section}>
          <h4>💡 ドローン操作</h4>
          <ul className={styles.guideList}>
            <li>座標をメモして飛行計画に使用</li>
            <li>推奨高度を参考に安全な高度で飛行</li>
            <li>地形変化に注意（2024年地震による隆起）</li>
            <li>DID（人口集中地区）表示を確認</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default CoordinateInfoPanel
