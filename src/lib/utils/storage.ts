/**
 * localStorage/sessionStorage Utilities
 *
 * Centralized storage utilities with type safety, error handling,
 * and support for Map/Set data structures.
 */

// Simple internal logger to avoid circular dependencies
const storageLogger = {
  warn: (message: string, details?: unknown) => {
    // Use optional chaining to safely access import.meta.env for library builds
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      console.warn(`[Storage] ${message}`, details ?? '')
    }
  },
  error: (message: string, error?: unknown) => {
    console.error(`[Storage] ${message}`, error ?? '')
  }
}

// ============================================
// Storage Keys
// ============================================
export const STORAGE_KEYS = {
  // UI Settings
  UI_SETTINGS: 'ui-settings',
  COORD_FORMAT: 'coord-format',

  // Layer State
  DID_EXPANDED_GROUPS: 'did-expanded-groups',
  COMPARISON_SETTINGS: 'comparison-settings',

  // Session State (sessionStorage)
  MAP_VIEW_STATE: 'map-view-state-once',
  RESTRICTION_VISIBILITY: 'restriction-visible-ids'
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

// ============================================
// Core Functions
// ============================================

/**
 * Load value from localStorage with type-safe parsing
 *
 * @example
 * ```typescript
 * const settings = loadFromStorage(
 *   STORAGE_KEYS.UI_SETTINGS,
 *   (v) => isUISettings(v) ? v : null,
 *   defaultSettings
 * )
 * ```
 */
export function loadFromStorage<T>(
  key: StorageKey | string,
  parser: (value: unknown) => T | null,
  defaultValue: T
): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue

    const parsed = JSON.parse(raw) as unknown
    const result = parser(parsed)
    return result ?? defaultValue
  } catch (error) {
    storageLogger.warn(`Failed to load ${key} from storage`, error)
    return defaultValue
  }
}

/**
 * Save value to localStorage
 *
 * @returns true if save was successful, false otherwise
 */
export function saveToStorage<T>(key: StorageKey | string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    storageLogger.error(`Failed to save ${key} to storage`, error)
    return false
  }
}

/**
 * Remove value from localStorage
 */
export function removeFromStorage(key: StorageKey | string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    storageLogger.error(`Failed to remove ${key} from storage`, error)
    return false
  }
}

// ============================================
// Session Storage Functions
// ============================================

/**
 * Load value from sessionStorage with type-safe parsing
 */
export function loadFromSession<T>(
  key: StorageKey | string,
  parser: (value: unknown) => T | null,
  defaultValue: T
): T {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return defaultValue

    const parsed = JSON.parse(raw) as unknown
    const result = parser(parsed)
    return result ?? defaultValue
  } catch (error) {
    storageLogger.warn(`Failed to load ${key} from session storage`, error)
    return defaultValue
  }
}

/**
 * Save value to sessionStorage
 */
export function saveToSession<T>(key: StorageKey | string, value: T): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    storageLogger.error(`Failed to save ${key} to session storage`, error)
    return false
  }
}

/**
 * Remove value from sessionStorage
 */
export function removeFromSession(key: StorageKey | string): boolean {
  try {
    sessionStorage.removeItem(key)
    return true
  } catch (error) {
    storageLogger.error(`Failed to remove ${key} from session storage`, error)
    return false
  }
}

// ============================================
// Map/Set Helpers
// ============================================

/**
 * Load Map from localStorage
 *
 * @example
 * ```typescript
 * const layerStates = loadMapFromStorage<string, boolean>(
 *   'layer-states',
 *   new Map()
 * )
 * ```
 */
export function loadMapFromStorage<K, V>(
  key: StorageKey | string,
  defaultValue: Map<K, V> = new Map()
): Map<K, V> {
  return loadFromStorage(
    key,
    (v) => {
      if (!Array.isArray(v)) return null
      try {
        return new Map(v as [K, V][])
      } catch {
        return null
      }
    },
    defaultValue
  )
}

/**
 * Save Map to localStorage
 */
export function saveMapToStorage<K, V>(key: StorageKey | string, map: Map<K, V>): boolean {
  return saveToStorage(key, Array.from(map.entries()))
}

/**
 * Load Set from localStorage
 *
 * @example
 * ```typescript
 * const expandedGroups = loadSetFromStorage<string>(
 *   STORAGE_KEYS.DID_EXPANDED_GROUPS,
 *   new Set(['関東'])
 * )
 * ```
 */
export function loadSetFromStorage<T>(
  key: StorageKey | string,
  defaultValue: Set<T> = new Set()
): Set<T> {
  return loadFromStorage(
    key,
    (v) => {
      if (!Array.isArray(v)) return null
      try {
        return new Set(v as T[])
      } catch {
        return null
      }
    },
    defaultValue
  )
}

/**
 * Save Set to localStorage
 */
export function saveSetToStorage<T>(key: StorageKey | string, set: Set<T>): boolean {
  return saveToStorage(key, Array.from(set))
}

// ============================================
// Expiration Support
// ============================================

interface StoredWithExpiration<T> {
  value: T
  timestamp: number
  expiresAt?: number
}

/**
 * Load value with expiration check
 *
 * @example
 * ```typescript
 * const settings = loadWithExpiration<UISettings>(
 *   STORAGE_KEYS.UI_SETTINGS,
 *   30 * 24 * 60 * 60 * 1000, // 30 days
 *   defaultSettings
 * )
 * ```
 */
export function loadWithExpiration<T>(
  key: StorageKey | string,
  expirationMs: number,
  defaultValue: T,
  parser?: (value: unknown) => T | null
): T {
  return loadFromStorage(
    key,
    (v) => {
      if (!v || typeof v !== 'object') return null

      const stored = v as StoredWithExpiration<T>
      const { value, timestamp, expiresAt } = stored

      // Check expiration
      const now = Date.now()

      // If explicit expiresAt was set by saveWithTimestamp, use that exclusively
      if (expiresAt !== undefined) {
        if (now > expiresAt) {
          removeFromStorage(key)
          return null
        }
        // expiresAt is set and not expired, skip timestamp-based check
      } else if (timestamp && now - timestamp > expirationMs) {
        // No expiresAt set, use timestamp-based expiration from loadWithExpiration
        removeFromStorage(key)
        return null
      }

      // Apply custom parser if provided
      if (parser) {
        return parser(value)
      }

      return value
    },
    defaultValue
  )
}

/**
 * Save value with timestamp (for expiration tracking)
 */
export function saveWithTimestamp<T>(
  key: StorageKey | string,
  value: T,
  expiresInMs?: number
): boolean {
  const stored: StoredWithExpiration<T> = {
    value,
    timestamp: Date.now(),
    expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined
  }
  return saveToStorage(key, stored)
}

// ============================================
// Type Guards / Parsers
// ============================================

/**
 * Create a simple type guard parser
 *
 * @example
 * ```typescript
 * const parseNumber = createParser<number>(
 *   (v) => typeof v === 'number' && Number.isFinite(v)
 * )
 * const opacity = loadFromStorage('opacity', parseNumber, 0.5)
 * ```
 */
export function createParser<T>(
  predicate: (value: unknown) => boolean
): (value: unknown) => T | null {
  return (value: unknown) => (predicate(value) ? (value as T) : null)
}

/**
 * Parse string array
 */
export const parseStringArray = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null
  const strings = v.filter((item): item is string => typeof item === 'string')
  return strings.length > 0 ? strings : null
}

/**
 * Parse number within range
 */
export function parseNumberInRange(
  min: number,
  max: number
): (v: unknown) => number | null {
  return (v: unknown) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    if (v < min || v > max) return null
    return v
  }
}

/**
 * Parse boolean
 */
export const parseBoolean = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v
  return null
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if localStorage is available
 */
export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch {
    return false
  }
}

/**
 * Get all storage keys matching a pattern
 */
export function getStorageKeys(pattern?: RegExp): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (!pattern || pattern.test(key))) {
      keys.push(key)
    }
  }
  return keys
}

/**
 * Clear all storage items matching a pattern
 */
export function clearStorageByPattern(pattern: RegExp): number {
  const keys = getStorageKeys(pattern)
  keys.forEach((key) => localStorage.removeItem(key))
  return keys.length
}
