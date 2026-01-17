import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCoordinates, formatCoordinatesDMS } from '../lib/utils/geo'

export interface CoordinateDisplayProps {
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
  const panelRef = useRef<HTMLDivElement | null>(null)
  const autoCloseTimerRef = useRef<number | null>(null)
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(true)

  type PanelPos = { left: number; top: number }
  const [pos, setPos] = useState<PanelPos | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current)
      autoCloseTimerRef.current = null
    }
  }, [])

  const disableAutoClose = useCallback(() => {
    setAutoCloseEnabled(false)
  }, [])

  useEffect(() => {
    if (!autoCloseEnabled) {
      clearAutoCloseTimer()
      return
    }
    clearAutoCloseTimer()
    // Auto-close after 5 seconds
    autoCloseTimerRef.current = window.setTimeout(() => {
      setShowModal(false)
      onClose?.()
    }, 5000)
    return () => clearAutoCloseTimer()
  }, [autoCloseEnabled, clearAutoCloseTimer, onClose, lng, lat])

  if (!showModal) {
    return null
  }

  const decimalFormat = useMemo(() => formatCoordinates(lng, lat), [lng, lat])
  const dmsFormat = useMemo(() => formatCoordinatesDMS(lng, lat), [lng, lat])

  // 初回表示時に右下付近へ配置（計測できない場合は固定bottom/rightのまま）
  useEffect(() => {
    if (pos) return
    const el = panelRef.current
    if (!el) return

    const place = () => {
      const rect = el.getBoundingClientRect()
      const margin = 20
      const left = Math.max(margin, window.innerWidth - rect.width - margin)
      const top = Math.max(margin, window.innerHeight - rect.height - margin)
      setPos({ left, top })
    }

    // 次フレームでDOMサイズが安定してから配置
    const raf = window.requestAnimationFrame(place)
    return () => window.cancelAnimationFrame(raf)
  }, [pos])

  // ドラッグ中の移動（Pointer Events）
  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: PointerEvent) => {
      const el = panelRef.current
      const off = dragOffsetRef.current
      if (!el || !off) return

      const rect = el.getBoundingClientRect()
      const margin = 8
      const nextLeft = e.clientX - off.dx
      const nextTop = e.clientY - off.dy

      const clampedLeft = Math.min(
        Math.max(margin, nextLeft),
        Math.max(margin, window.innerWidth - rect.width - margin)
      )
      const clampedTop = Math.min(
        Math.max(margin, nextTop),
        Math.max(margin, window.innerHeight - rect.height - margin)
      )

      setPos({ left: clampedLeft, top: clampedTop })
    }

    const onUp = () => {
      dragOffsetRef.current = null
      setIsDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isDragging])

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        ...(pos
          ? { left: `${pos.left}px`, top: `${pos.top}px` }
          : { bottom: '20px', right: '20px' }),
        backgroundColor: darkMode ? 'rgba(45,45,45,0.85)' : 'rgba(255,255,255,0.88)',
        border: `2px solid ${darkMode ? '#444' : '#ccc'}`,
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        maxWidth: '360px',
        color: darkMode ? '#e0e0e0' : '#333',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={(e) => {
          // クリック/タップでの選択は許可しつつ、ドラッグ開始
          disableAutoClose()
          const el = panelRef.current
          if (!el) return
          const rect = el.getBoundingClientRect()
          dragOffsetRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
          try {
            ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          } catch {
            // ignore
          }
          setIsDragging(true)
        }}
        title="ドラッグして移動"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '10px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          paddingBottom: '6px',
          borderBottom: `1px solid ${darkMode ? '#444' : '#ddd'}`
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 800, color: darkMode ? '#ddd' : '#333' }}>
          座標情報
        </div>
        <div style={{ fontSize: '11px', color: darkMode ? '#aaa' : '#666' }}>Drag</div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: darkMode ? '#aaa' : '#999', marginBottom: '2px' }}>
            <span style={{ fontWeight: 700 }}>10進数表記</span>（Decimal）
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
            <span style={{ fontWeight: 700 }}>度分秒表記</span>（DMS）- NOTAM申請用
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
        <button
          onClick={() => {
            navigator.clipboard.writeText(decimalFormat)
          }}
          style={{
            flex: '1 1 140px',
            padding: '6px 8px',
            backgroundColor: darkMode ? '#444' : '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: darkMode ? '#e0e0e0' : '#333',
            fontSize: '12px',
            transition: 'background-color 0.2s',
            whiteSpace: 'nowrap',
            minWidth: 0
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
            flex: '1 1 120px',
            padding: '6px 8px',
            backgroundColor: darkMode ? '#444' : '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: darkMode ? '#e0e0e0' : '#333',
            fontSize: '12px',
            transition: 'background-color 0.2s',
            whiteSpace: 'nowrap',
            minWidth: 0
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#555' : '#d0d0d0'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#e0e0e0'
          }}
        >
          DMSコピー
        </button>
        <button
          onClick={() => {
            setShowModal(false)
            onClose?.()
          }}
          style={{
            flex: '1 1 90px',
            padding: '6px 8px',
            backgroundColor: darkMode ? '#444' : '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: darkMode ? '#e0e0e0' : '#333',
            fontSize: '12px',
            transition: 'background-color 0.2s',
            whiteSpace: 'nowrap',
            minWidth: 0
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
