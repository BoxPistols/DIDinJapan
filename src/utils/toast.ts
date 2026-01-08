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

let toastId = 0
const listeners: Set<(toasts: Toast[]) => void> = new Set()
const toasts: Toast[] = []

/**
 * Show a toast notification
 */
export function showToast(message: string, type: ToastType = 'info', duration: number = 3000) {
  const id = `toast-${toastId++}`
  const toast: Toast = { id, message, type, duration }

  toasts.push(toast)
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
  notifyListeners()
}

// Convenience methods
export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration)
}
