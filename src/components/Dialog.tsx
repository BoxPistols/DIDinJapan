/**
 * Confirm Dialog Component
 */

import { useEffect, useState } from 'react'
import { subscribeToDialogs, confirmDialog, cancelDialog, type ConfirmDialog } from '../utils/dialog'

export function DialogContainer() {
  const [dialogs, setDialogs] = useState<ConfirmDialog[]>([])

  useEffect(() => {
    const unsubscribe = subscribeToDialogs(setDialogs)
    return () => { unsubscribe() }
  }, [])

  return (
    <>
      {dialogs.map(dialog => (
        <div
          key={dialog.id}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              cancelDialog(dialog.id)
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              padding: '24px',
              maxWidth: '400px',
              minWidth: '300px'
            }}
          >
            <h2 style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#333'
            }}>
              {dialog.title}
            </h2>
            <p style={{
              margin: '0 0 24px 0',
              fontSize: '14px',
              color: '#666',
              lineHeight: 1.5
            }}>
              {dialog.message}
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => cancelDialog(dialog.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = '#e0e0e0'
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = '#f5f5f5'
                }}
              >
                {dialog.cancelText || 'キャンセル'}
              </button>
              <button
                onClick={() => confirmDialog(dialog.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = '#1976D2'
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = '#2196F3'
                }}
              >
                {dialog.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
