/**
 * FlightPlanChecker Component
 * Displays comprehensive flight safety status for a selected point
 */

import React from 'react'
import { useOperationSafety } from '../../lib/hooks'
import { latLngToMeshCode } from '../../lib/utils/meshCodeConverter'

export interface FlightPlanCheckerProps {
  lat: number
  lng: number
  darkMode?: boolean
}

export function FlightPlanChecker({ lat, lng, darkMode = false }: FlightPlanCheckerProps) {
  const meshCode = latLngToMeshCode(lat, lng)
  const { canFly, safetyLevel, reasons, loading, error } = useOperationSafety(lat, lng, meshCode)

  const colors = {
    bg: darkMode ? '#1e1e1e' : '#ffffff',
    text: darkMode ? '#e5e5e5' : '#1f2937',
    textMuted: darkMode ? '#9ca3af' : '#6b7280',
    border: darkMode ? '#404040' : '#e5e7eb',
    safe: darkMode ? '#166534' : '#dcfce7',
    unsafe: darkMode ? '#991b1b' : '#fee2e2'
  }

  if (loading) {
    return (
      <div style={{ padding: '16px', color: colors.textMuted }}>
        読み込み中...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '16px', color: '#ef4444' }}>
        エラー: {error}
      </div>
    )
  }

  return (
    <div style={{
      padding: '16px',
      backgroundColor: colors.bg,
      color: colors.text,
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Overall Safety Status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        backgroundColor: canFly ? colors.safe : colors.unsafe,
        borderRadius: '8px',
        marginBottom: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: canFly ? '#22c55e' : '#ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '24px'
        }}>
          {canFly ? '✓' : '✕'}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {canFly ? '飛行可能' : '飛行不可'}
          </div>
          <div style={{ fontSize: '12px', color: colors.textMuted }}>
            {safetyLevel}
          </div>
        </div>
      </div>

      {/* Detailed Reasons */}
      {reasons.length > 0 && (
        <div>
          <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>詳細情報</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {reasons.map((reason: { severity: string; message: string }, index: number) => (
              <li
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  marginBottom: '4px',
                  backgroundColor: reason.severity === 'critical' ? '#fef2f2' :
                                   reason.severity === 'warning' ? '#fffbeb' : '#f0f9ff',
                  borderRadius: '4px',
                  fontSize: '13px'
                }}
              >
                <span style={{
                  color: reason.severity === 'critical' ? '#ef4444' :
                         reason.severity === 'warning' ? '#f59e0b' : '#3b82f6'
                }}>
                  {reason.severity === 'critical' && '!'}
                  {reason.severity === 'warning' && '!'}
                  {reason.severity === 'info' && 'i'}
                </span>
                <span>{reason.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default FlightPlanChecker
