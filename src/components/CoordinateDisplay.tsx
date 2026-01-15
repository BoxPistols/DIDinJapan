import React, { useEffect, useState } from 'react'
import { formatCoordinates, formatCoordinatesDMS } from '../lib/utils/geo'

interface CoordinateDisplayProps {
  lng: number
  lat: number
  darkMode: boolean
  onClose?: () => void
}

/**
 * Displays coordinates in both decimal and DMS (degree/minute/second) formats
 * Useful for NOTAM applications and general navigation
 */
export const CoordinateDisplay: React.FC<CoordinateDisplayProps> = ({
  lng,
  lat,
  darkMode,
  onClose
}) => {
  const [showModal, setShowModal] = useState(true)

  useEffect(() => {
    // Auto-close after 5 seconds
    const timer = setTimeout(() => {
      setShowModal(false)
      onClose?.()
    }, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  if (!showModal) {
    return null
  }

  const decimalFormat = formatCoordinates(lng, lat)
  const dmsFormat = formatCoordinatesDMS(lng, lat)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: darkMode ? '#2d2d2d' : '#ffffff',
        border: `2px solid ${darkMode ? '#444' : '#ccc'}`,
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        maxWidth: '360px',
        color: darkMode ? '#e0e0e0' : '#333',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', color: darkMode ? '#888' : '#666', marginBottom: '4px' }}>
          座標情報
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: darkMode ? '#aaa' : '#999', marginBottom: '2px' }}>
            10進数表記（Decimal）
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'monospace',
              backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
              padding: '8px',
              borderRadius: '4px',
              wordBreak: 'break-all'
            }}
          >
            {decimalFormat}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: darkMode ? '#aaa' : '#999', marginBottom: '2px' }}>
            度分秒表記（DMS）- NOTAM申請用
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: 'monospace',
              backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
              padding: '8px',
              borderRadius: '4px',
              wordBreak: 'break-all'
            }}
          >
            {dmsFormat}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
        <button
          onClick={() => {
            navigator.clipboard.writeText(decimalFormat)
          }}
          style={{
            flex: 1,
            padding: '6px 8px',
            backgroundColor: darkMode ? '#444' : '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: darkMode ? '#e0e0e0' : '#333',
            fontSize: '12px',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#555' : '#d0d0d0'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#e0e0e0'
          }}
        >
          10進数コピー
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(dmsFormat)
          }}
          style={{
            flex: 1,
            padding: '6px 8px',
            backgroundColor: darkMode ? '#444' : '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: darkMode ? '#e0e0e0' : '#333',
            fontSize: '12px',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#555' : '#d0d0d0'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#e0e0e0'
          }}
        >
          DMS コピー
        </button>
        <button
          onClick={() => {
            setShowModal(false)
            onClose?.()
          }}
          style={{
            flex: 1,
            padding: '6px 8px',
            backgroundColor: darkMode ? '#444' : '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: darkMode ? '#e0e0e0' : '#333',
            fontSize: '12px',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#555' : '#d0d0d0'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#e0e0e0'
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
