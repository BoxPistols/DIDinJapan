/**
 * Toast Notification Component
 */

import { useEffect, useState } from 'react'
import { subscribeToToasts, removeToast, type Toast } from '../utils/toast'

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const unsubscribe = subscribeToToasts(setToasts)
    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '400px'
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            animation: 'slideIn 0.3s ease-in-out',
            backgroundColor: getBackgroundColor(toast.type, true),
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
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

function getBackgroundColor(type: string, transparent: boolean = false): string {
  const opacity = transparent ? 0.85 : 1.0
  switch (type) {
    case 'success':
      return `rgba(76, 175, 80, ${opacity})`
    case 'error':
      return `rgba(244, 67, 54, ${opacity})`
    case 'warning':
      return `rgba(255, 152, 0, ${opacity})`
    case 'info':
    default:
      return `rgba(33, 150, 243, ${opacity})`
  }
}
