/**
 * FocusCrosshair - マップ中央に表示するフォーカス十字(スコーター)UI
 *
 * 地理院地図のような赤い十字ターゲットを画面中央に表示します。
 * ユーザーはデザインの変更や表示/非表示の切り替えが可能。
 */

import React, { useCallback } from 'react'

export type CrosshairDesign = 'square' | 'circle' | 'minimal'

export interface FocusCrosshairProps {
  /** 表示/非表示 */
  visible?: boolean
  /** デザインタイプ */
  design?: CrosshairDesign
  /** 線の色 */
  color?: string
  /** 線の太さ */
  strokeWidth?: number
  /** サイズ(px) */
  size?: number
  /** ダークモード対応 */
  darkMode?: boolean
}

export const FocusCrosshair: React.FC<FocusCrosshairProps> = ({
  visible = true,
  design = 'square',
  color = '#e53935',
  strokeWidth = 2,
  size = 40,
  darkMode = false
}) => {
  if (!visible) return null

  // デザインに応じたSVGを描画
  const renderCrosshair = useCallback(() => {
    const halfSize = size / 2
    const crossLength = size * 0.25 // 十字の長さ
    const gap = size * 0.1 // 中心からのギャップ
    const cornerSize = size * 0.3 // コーナーの長さ

    // ダークモード時は少し明るい色に調整
    const finalColor = darkMode ? (color === '#e53935' ? '#ff5252' : color) : color

    switch (design) {
      case 'circle':
        return (
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            {/* 外円 */}
            <circle
              cx={halfSize}
              cy={halfSize}
              r={halfSize - strokeWidth}
              fill="none"
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            {/* 中央十字 */}
            <line
              x1={halfSize}
              y1={halfSize - crossLength}
              x2={halfSize}
              y2={halfSize - gap}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            <line
              x1={halfSize}
              y1={halfSize + gap}
              x2={halfSize}
              y2={halfSize + crossLength}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            <line
              x1={halfSize - crossLength}
              y1={halfSize}
              x2={halfSize - gap}
              y2={halfSize}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            <line
              x1={halfSize + gap}
              y1={halfSize}
              x2={halfSize + crossLength}
              y2={halfSize}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
          </svg>
        )

      case 'minimal':
        return (
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            {/* シンプルな十字のみ */}
            <line
              x1={halfSize}
              y1={0}
              x2={halfSize}
              y2={size}
              stroke={finalColor}
              strokeWidth={strokeWidth}
              opacity={0.8}
            />
            <line
              x1={0}
              y1={halfSize}
              x2={size}
              y2={halfSize}
              stroke={finalColor}
              strokeWidth={strokeWidth}
              opacity={0.8}
            />
          </svg>
        )

      case 'square':
      default:
        // 地理院地図風のスクエアデザイン
        return (
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            {/* 四隅のコーナー */}
            {/* 左上 */}
            <path
              d={`M ${strokeWidth} ${cornerSize} L ${strokeWidth} ${strokeWidth} L ${cornerSize} ${strokeWidth}`}
              fill="none"
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            {/* 右上 */}
            <path
              d={`M ${size - cornerSize} ${strokeWidth} L ${size - strokeWidth} ${strokeWidth} L ${size - strokeWidth} ${cornerSize}`}
              fill="none"
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            {/* 左下 */}
            <path
              d={`M ${strokeWidth} ${size - cornerSize} L ${strokeWidth} ${size - strokeWidth} L ${cornerSize} ${size - strokeWidth}`}
              fill="none"
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            {/* 右下 */}
            <path
              d={`M ${size - cornerSize} ${size - strokeWidth} L ${size - strokeWidth} ${size - strokeWidth} L ${size - strokeWidth} ${size - cornerSize}`}
              fill="none"
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            {/* 中央十字 */}
            <line
              x1={halfSize}
              y1={halfSize - crossLength}
              x2={halfSize}
              y2={halfSize - gap}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            <line
              x1={halfSize}
              y1={halfSize + gap}
              x2={halfSize}
              y2={halfSize + crossLength}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            <line
              x1={halfSize - crossLength}
              y1={halfSize}
              x2={halfSize - gap}
              y2={halfSize}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
            <line
              x1={halfSize + gap}
              y1={halfSize}
              x2={halfSize + crossLength}
              y2={halfSize}
              stroke={finalColor}
              strokeWidth={strokeWidth}
            />
          </svg>
        )
    }
  }, [design, size, color, strokeWidth, darkMode])

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 500,
        width: size,
        height: size
      }}
      aria-hidden="true"
    >
      {renderCrosshair()}
    </div>
  )
}

export default FocusCrosshair
