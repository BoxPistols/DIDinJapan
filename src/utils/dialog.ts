/**
 * Dialog/Modal Utility System
 */

export interface ConfirmDialog {
  id: string
  title: string
  message: string
  confirmText?: string
  cancelText?: string
}

let dialogId = 0
const listeners: Set<(dialogs: ConfirmDialog[]) => void> = new Set()
const dialogs: ConfirmDialog[] = []
const resolvers: Map<string, (result: boolean) => void> = new Map()

/**
 * Show a confirmation dialog
 */
export function showConfirm(
  message: string,
  options?: {
    title?: string
    confirmText?: string
    cancelText?: string
  }
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `dialog-${dialogId++}`
    const dialog: ConfirmDialog = {
      id,
      title: options?.title || '確認',
      message,
      confirmText: options?.confirmText || 'OK',
      cancelText: options?.cancelText || 'キャンセル'
    }

    dialogs.push(dialog)
    resolvers.set(id, resolve)
    notifyListeners()
  })
}

/**
 * Confirm a dialog action
 */
export function confirmDialog(id: string) {
  const resolver = resolvers.get(id)
  if (resolver) {
    resolver(true)
    resolvers.delete(id)
  }
  removeDialog(id)
}

/**
 * Cancel a dialog action
 */
export function cancelDialog(id: string) {
  const resolver = resolvers.get(id)
  if (resolver) {
    resolver(false)
    resolvers.delete(id)
  }
  removeDialog(id)
}

/**
 * Remove a dialog
 */
function removeDialog(id: string) {
  const index = dialogs.findIndex(d => d.id === id)
  if (index > -1) {
    dialogs.splice(index, 1)
    notifyListeners()
  }
}

/**
 * Subscribe to dialog updates
 */
export function subscribeToDialogs(listener: (dialogs: ConfirmDialog[]) => void) {
  listeners.add(listener)
  // Immediately notify with current dialogs
  listener(dialogs)
  return () => listeners.delete(listener)
}

/**
 * Notify all listeners of dialog changes
 */
function notifyListeners() {
  listeners.forEach(listener => listener([...dialogs]))
}
