/**
 * Confirm Dialog Component
 */

import { useEffect, useState } from 'react'
import {
  subscribeToDialogs,
  confirmDialog,
  cancelDialog,
  type ConfirmDialog
} from '../utils/dialog'
import styles from './Dialog.module.css'

export function DialogContainer() {
  const [dialogs, setDialogs] = useState<ConfirmDialog[]>([])

  useEffect(() => {
    const unsubscribe = subscribeToDialogs(setDialogs)
    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <>
      {dialogs.map((dialog) => (
        <div
          key={dialog.id}
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              cancelDialog(dialog.id)
            }
          }}
        >
          <div className={styles.dialog}>
            <h2 className={styles.title}>{dialog.title}</h2>
            <p className={styles.message}>{dialog.message}</p>
            <div className={styles.buttonContainer}>
              <button
                onClick={() => cancelDialog(dialog.id)}
                className={styles.cancelButton}
              >
                {dialog.cancelText || 'キャンセル'}
              </button>
              <button
                onClick={() => confirmDialog(dialog.id)}
                className={styles.confirmButton}
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
