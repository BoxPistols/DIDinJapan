/**
 * Toast Notification Component
 */

import { useEffect, useState } from 'react'
import { subscribeToToasts, removeToast, type Toast } from '../utils/toast'

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const unsubscribe = subscribeToToasts(setToasts)
    return () => { unsubscribe() }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '400px'
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            padding: '12px 16px',
            borderRadius: '4px',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            animation: 'slideIn 0.3s ease-in-out',
            backgroundColor: getBackgroundColor(toast.type),
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            ...getToastStyles(toast.type)
          }}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0 0 0 12px',
              marginLeft: '12px'
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

function getBackgroundColor(type: string): string {
  switch (type) {
    case 'success':
      return '#4CAF50'
    case 'error':
      return '#F44336'
    case 'warning':
      return '#FF9800'
    case 'info':
    default:
      return '#2196F3'
  }
}

function getToastStyles(type: string): React.CSSProperties {
  return {
    borderLeft: `4px solid ${getAccentColor(type)}`
  }
}

function getAccentColor(type: string): string {
  switch (type) {
    case 'success':
      return '#45a049'
    case 'error':
      return '#da190b'
    case 'warning':
      return '#e65100'
    case 'info':
    default:
      return '#0b7dda'
  }
}
