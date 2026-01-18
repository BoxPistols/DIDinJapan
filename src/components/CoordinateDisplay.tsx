import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCoordinates, formatCoordinatesDMS } from '../lib/utils/geo'

export interface CoordinateDisplayProps {
  lng: number
  lat: number
  darkMode: boolean
  onClose?: () => void
  /** Screen X coordinate where the click occurred (optional, for tooltip positioning) */
  screenX?: number
  /** Screen Y coordinate where the click occurred (optional, for tooltip positioning) */
  screenY?: number
  /** Auto-fade after 3 seconds (default: true) */
  autoFade?: boolean
}

/**
 * Displays coordinates in both decimal and DMS (degree/minute/second) formats
 * Useful for NOTAM applications and general navigation
 */
export const CoordinateDisplay: React.FC<CoordinateDisplayProps> = ({
  lng,
  lat,
  darkMode,
  onClose,
  screenX,
  screenY,
  autoFade = true
}) => {
  const [showModal, setShowModal] = useState(true)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const autoCloseTimerRef = useRef<number | null>(null)
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(autoFade)

  type PanelPos = { left: number; top: number }
  const [pos, setPos] = useState<PanelPos | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)

  // 座標が変わったらposをリセット（新しいクリック位置に再配置）
  const prevCoordsRef = useRef<{
    lng: number
    lat: number
    screenX?: number
    screenY?: number
  } | null>(null)
  useEffect(() => {
    const prevCoords = prevCoordsRef.current
    if (
      prevCoords &&
      (prevCoords.lng !== lng ||
        prevCoords.lat !== lat ||
        prevCoords.screenX !== screenX ||
        prevCoords.screenY !== screenY)
    ) {
      setPos(null) // リセットして再配置をトリガー
    }
    prevCoordsRef.current = { lng, lat, screenX, screenY }
  }, [lng, lat, screenX, screenY])

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
    // Auto-close after 3 seconds
    autoCloseTimerRef.current = window.setTimeout(() => {
      setShowModal(false)
      onClose?.()
    }, 3000)
    return () => clearAutoCloseTimer()
  }, [autoCloseEnabled, clearAutoCloseTimer, onClose, lng, lat])

  if (!showModal) {
    return null
  }

  const decimalFormat = useMemo(() => formatCoordinates(lng, lat), [lng, lat])
  const dmsFormat = useMemo(() => formatCoordinatesDMS(lng, lat), [lng, lat])

  // 初回表示時にクリック位置付近へ配置（screenX/Y指定時はツールチップ風）
  // 矢印の向き: 'bottom' = パネルの下に矢印（パネルがクリック位置の上）
  type ArrowDirection = 'bottom' | 'top' | 'left' | 'right' | 'none'
  const [arrowDir, setArrowDir] = useState<ArrowDirection>('none')

  useEffect(() => {
    if (pos) return
    const el = panelRef.current
    if (!el) return

    const place = () => {
      const rect = el.getBoundingClientRect()
      const margin = 16
      const arrowSize = 10

      // クリック位置が指定されている場合はその付近に配置（右横優先）
      if (screenX !== undefined && screenY !== undefined) {
        const panelWidth = rect.width || 280
        const panelHeight = rect.height || 180

        // デフォルト: クリック位置の右横に表示
        let left = screenX + arrowSize + 12
        let top = screenY - panelHeight / 2
        let dir: ArrowDirection = 'left'

        // 右に収まらない場合は左に表示
        if (left + panelWidth > window.innerWidth - margin) {
          left = screenX - panelWidth - arrowSize - 12
          dir = 'right'
        }

        // 左にも収まらない場合は下に表示
        if (left < margin) {
          left = Math.max(margin, screenX - panelWidth / 2)
          top = screenY + arrowSize + 12
          dir = 'top'
        }

        // 上下の画面外補正
        if (top < margin) {
          top = margin
        } else if (top + panelHeight > window.innerHeight - margin) {
          top = window.innerHeight - panelHeight - margin
        }

        setArrowDir(dir)
        setPos({ left, top })
      } else {
        // スクリーン座標なしの場合は右下へ
        const left = Math.max(margin, window.innerWidth - rect.width - margin)
        const top = Math.max(margin, window.innerHeight - rect.height - margin)
        setArrowDir('none')
        setPos({ left, top })
      }
    }

    // 次フレームでDOMサイズが安定してから配置
    const raf = window.requestAnimationFrame(place)
    return () => window.cancelAnimationFrame(raf)
  }, [pos, screenX, screenY])

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

  // 矢印のスタイル生成
  const getArrowStyle = (): React.CSSProperties => {
    const arrowSize = 8
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
      border: `${arrowSize}px solid transparent`
    }
    const color = darkMode ? 'rgba(35,35,35,0.75)' : 'rgba(255,255,255,0.75)'

    switch (arrowDir) {
      case 'bottom':
        return {
          ...baseStyle,
          bottom: -arrowSize * 2 + 2, // パネルに密着
          left: '50%',
          transform: 'translateX(-50%)',
          borderTopColor: color,
          borderBottomWidth: 0
        }
      case 'top':
        return {
          ...baseStyle,
          top: -arrowSize * 2 + 2,
          left: '50%',
          transform: 'translateX(-50%)',
          borderBottomColor: color,
          borderTopWidth: 0
        }
      case 'left':
        return {
          ...baseStyle,
          left: -arrowSize * 2 + 2,
          top: '50%',
          transform: 'translateY(-50%)',
          borderRightColor: color,
          borderLeftWidth: 0
        }
      case 'right':
        return {
          ...baseStyle,
          right: -arrowSize * 2 + 2,
          top: '50%',
          transform: 'translateY(-50%)',
          borderLeftColor: color,
          borderRightWidth: 0
        }
      default:
        return { display: 'none' }
    }
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        ...(pos
          ? { left: `${pos.left}px`, top: `${pos.top}px` }
          : { bottom: '20px', right: '20px' }),
        backgroundColor: darkMode ? 'rgba(35,35,35,0.75)' : 'rgba(255,255,255,0.75)',
        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        borderRadius: '8px',
        padding: '14px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 1000,
        maxWidth: '320px',
        color: darkMode ? '#e0e0e0' : '#333',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Arrow pointing to click position */}
      {arrowDir !== 'none' && <div style={getArrowStyle()} />}
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
        {/* Decimal format with inline copy button */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: darkMode ? '#aaa' : '#999', marginBottom: '2px' }}>
            <span style={{ fontWeight: 700 }}>10進数表記</span>（Decimal）
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
              borderRadius: '4px',
              padding: '6px 8px'
            }}
          >
            <code
              style={{
                flex: 1,
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: 'monospace',
                wordBreak: 'break-all'
              }}
            >
              {decimalFormat}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(decimalFormat)}
              style={{
                padding: '4px 8px',
                backgroundColor: darkMode ? '#444' : '#e0e0e0',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: darkMode ? '#e0e0e0' : '#333',
                fontSize: '11px',
                whiteSpace: 'nowrap'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = darkMode ? '#555' : '#d0d0d0'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#e0e0e0'
              }}
              title="10進数座標をコピー"
            >
              📋 コピー
            </button>
          </div>
        </div>

        {/* DMS format with inline copy button */}
        <div>
          <div style={{ fontSize: '11px', color: darkMode ? '#aaa' : '#999', marginBottom: '2px' }}>
            <span style={{ fontWeight: 700 }}>度分秒表記</span>（DMS）- NOTAM申請用
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
              borderRadius: '4px',
              padding: '6px 8px'
            }}
          >
            <code
              style={{
                flex: 1,
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: 'monospace',
                wordBreak: 'break-all'
              }}
            >
              {dmsFormat}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(dmsFormat)}
              style={{
                padding: '4px 8px',
                backgroundColor: darkMode ? '#444' : '#e0e0e0',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: darkMode ? '#e0e0e0' : '#333',
                fontSize: '11px',
                whiteSpace: 'nowrap'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = darkMode ? '#555' : '#d0d0d0'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = darkMode ? '#444' : '#e0e0e0'
              }}
              title="DMS座標をコピー"
            >
              📋 コピー
            </button>
          </div>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={() => {
          setShowModal(false)
          onClose?.()
        }}
        style={{
          width: '100%',
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
  )
}
