/**
 * Simple Toast Notification System
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

const DUPLICATE_TOAST_SUPPRESSION_MS = 1500

let toastId = 0
const listeners: Set<(toasts: Toast[]) => void> = new Set()
const toasts: Toast[] = []
const lastToastByKey = new Map<string, { id: string; shownAt: number }>()
const toastKeyById = new Map<string, string>()

const buildToastKey = (message: string, type: ToastType): string => `${type}::${message}`

/**
 * Show a toast notification
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration: number = 3000
): string {
  const now = Date.now()
  const key = buildToastKey(message, type)
  const last = lastToastByKey.get(key)
  if (last && now - last.shownAt < DUPLICATE_TOAST_SUPPRESSION_MS) {
    return last.id
  }

  const id = `toast-${toastId++}`
  const toast: Toast = { id, message, type, duration }

  toasts.push(toast)
  lastToastByKey.set(key, { id, shownAt: now })
  toastKeyById.set(id, key)
  notifyListeners()

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  return id
}

/**
 * Remove a toast notification
 */
export function removeToast(id: string) {
  const index = toasts.findIndex(t => t.id === id)
  if (index > -1) {
    toasts.splice(index, 1)
    notifyListeners()
  }
  const key = toastKeyById.get(id)
  if (key) {
    const last = lastToastByKey.get(key)
    if (last && last.id === id) lastToastByKey.delete(key)
    toastKeyById.delete(id)
  }
}

/**
 * Subscribe to toast updates
 */
export function subscribeToToasts(listener: (toasts: Toast[]) => void) {
  listeners.add(listener)
  // Immediately notify with current toasts
  listener(toasts)
  return () => listeners.delete(listener)
}

/**
 * Notify all listeners of toast changes
 */
function notifyListeners() {
  listeners.forEach(listener => listener([...toasts]))
}

/**
 * Clear all toasts
 */
export function clearToasts() {
  toasts.length = 0
  lastToastByKey.clear()
  toastKeyById.clear()
  notifyListeners()
}

// Convenience methods
export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration)
}
