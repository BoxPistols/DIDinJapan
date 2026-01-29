import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  STORAGE_KEYS,
  loadFromStorage,
  saveToStorage,
  removeFromStorage,
  loadFromSession,
  saveToSession,
  loadMapFromStorage,
  saveMapToStorage,
  loadSetFromStorage,
  saveSetToStorage,
  loadWithExpiration,
  saveWithTimestamp,
  createParser,
  parseStringArray,
  parseNumberInRange,
  parseBoolean,
  isStorageAvailable,
  getStorageKeys,
  clearStorageByPattern
} from './storage'

describe('Storage Utilities', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('STORAGE_KEYS', () => {
    it('should have all required keys', () => {
      expect(STORAGE_KEYS.UI_SETTINGS).toBe('ui-settings')
      expect(STORAGE_KEYS.COORD_FORMAT).toBe('coord-format')
      expect(STORAGE_KEYS.DID_EXPANDED_GROUPS).toBe('did-expanded-groups')
      expect(STORAGE_KEYS.MAP_VIEW_STATE).toBe('map-view-state-once')
    })
  })

  describe('loadFromStorage', () => {
    it('should return default value when key does not exist', () => {
      const result = loadFromStorage('nonexistent', (v) => v as string, 'default')
      expect(result).toBe('default')
    })

    it('should parse and return stored value', () => {
      localStorage.setItem('test-key', JSON.stringify({ name: 'test' }))
      const result = loadFromStorage(
        'test-key',
        (v) => (v && typeof v === 'object' ? (v as { name: string }) : null),
        { name: 'default' }
      )
      expect(result).toEqual({ name: 'test' })
    })

    it('should return default value when parser returns null', () => {
      localStorage.setItem('test-key', JSON.stringify('invalid'))
      const result = loadFromStorage(
        'test-key',
        (v) => (typeof v === 'number' ? v : null),
        42
      )
      expect(result).toBe(42)
    })

    it('should return default value on JSON parse error', () => {
      localStorage.setItem('test-key', 'not-valid-json')
      const result = loadFromStorage('test-key', (v) => v as string, 'default')
      expect(result).toBe('default')
    })
  })

  describe('saveToStorage', () => {
    it('should save value to localStorage', () => {
      const result = saveToStorage('test-key', { value: 123 })
      expect(result).toBe(true)
      expect(localStorage.getItem('test-key')).toBe('{"value":123}')
    })

    // Note: Error handling test skipped - happy-dom localStorage doesn't support error simulation
    it.skip('should handle save errors gracefully', () => {
      // This test would require a different environment setup
    })
  })

  describe('removeFromStorage', () => {
    it('should remove item from localStorage', () => {
      localStorage.setItem('test-key', 'value')
      const result = removeFromStorage('test-key')
      expect(result).toBe(true)
      expect(localStorage.getItem('test-key')).toBeNull()
    })
  })

  describe('Session storage functions', () => {
    it('loadFromSession should work like loadFromStorage', () => {
      sessionStorage.setItem('session-key', JSON.stringify('session-value'))
      const result = loadFromSession('session-key', (v) => v as string, 'default')
      expect(result).toBe('session-value')
    })

    it('saveToSession should save to sessionStorage', () => {
      const result = saveToSession('session-key', { data: 'test' })
      expect(result).toBe(true)
      expect(sessionStorage.getItem('session-key')).toBe('{"data":"test"}')
    })
  })

  describe('Map helpers', () => {
    it('loadMapFromStorage should return Map from stored array', () => {
      localStorage.setItem(
        'map-key',
        JSON.stringify([
          ['a', 1],
          ['b', 2]
        ])
      )
      const result = loadMapFromStorage<string, number>('map-key')
      expect(result.get('a')).toBe(1)
      expect(result.get('b')).toBe(2)
    })

    it('loadMapFromStorage should return default Map on invalid data', () => {
      localStorage.setItem('map-key', JSON.stringify('not-an-array'))
      const defaultMap = new Map([['default', true]])
      const result = loadMapFromStorage<string, boolean>('map-key', defaultMap)
      expect(result).toBe(defaultMap)
    })

    it('saveMapToStorage should save Map as array', () => {
      const map = new Map([
        ['x', 10],
        ['y', 20]
      ])
      saveMapToStorage('map-key', map)
      const stored = JSON.parse(localStorage.getItem('map-key') ?? '[]')
      expect(stored).toEqual([
        ['x', 10],
        ['y', 20]
      ])
    })
  })

  describe('Set helpers', () => {
    it('loadSetFromStorage should return Set from stored array', () => {
      localStorage.setItem('set-key', JSON.stringify(['a', 'b', 'c']))
      const result = loadSetFromStorage<string>('set-key')
      expect(result.has('a')).toBe(true)
      expect(result.has('b')).toBe(true)
      expect(result.size).toBe(3)
    })

    it('saveSetToStorage should save Set as array', () => {
      const set = new Set(['x', 'y', 'z'])
      saveSetToStorage('set-key', set)
      const stored = JSON.parse(localStorage.getItem('set-key') ?? '[]')
      expect(stored).toEqual(['x', 'y', 'z'])
    })
  })

  describe('Expiration support', () => {
    it('loadWithExpiration should return value within expiration', () => {
      const stored = {
        value: 'test-value',
        timestamp: Date.now()
      }
      localStorage.setItem('exp-key', JSON.stringify(stored))

      const result = loadWithExpiration<string>(
        'exp-key',
        60000, // 1 minute
        'default'
      )
      expect(result).toBe('test-value')
    })

    it('loadWithExpiration should return default for expired value', () => {
      const stored = {
        value: 'old-value',
        timestamp: Date.now() - 120000 // 2 minutes ago
      }
      localStorage.setItem('exp-key', JSON.stringify(stored))

      const result = loadWithExpiration<string>(
        'exp-key',
        60000, // 1 minute expiration
        'default'
      )
      expect(result).toBe('default')
    })

    it('saveWithTimestamp should save with timestamp', () => {
      saveWithTimestamp('ts-key', { data: 'test' })
      const stored = JSON.parse(localStorage.getItem('ts-key') ?? '{}')
      expect(stored.value).toEqual({ data: 'test' })
      expect(stored.timestamp).toBeDefined()
      expect(typeof stored.timestamp).toBe('number')
    })
  })

  describe('Parsers', () => {
    describe('createParser', () => {
      it('should create working parser', () => {
        const parsePositive = createParser<number>((v) => typeof v === 'number' && v > 0)
        expect(parsePositive(5)).toBe(5)
        expect(parsePositive(-1)).toBeNull()
        expect(parsePositive('string')).toBeNull()
      })
    })

    describe('parseStringArray', () => {
      it('should parse valid string array', () => {
        expect(parseStringArray(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
      })

      it('should filter non-strings', () => {
        expect(parseStringArray(['a', 1, 'b', null])).toEqual(['a', 'b'])
      })

      it('should return null for non-array', () => {
        expect(parseStringArray('not-array')).toBeNull()
      })

      it('should return null for empty result', () => {
        expect(parseStringArray([1, 2, 3])).toBeNull()
      })
    })

    describe('parseNumberInRange', () => {
      it('should return number within range', () => {
        const parse = parseNumberInRange(0, 100)
        expect(parse(50)).toBe(50)
        expect(parse(0)).toBe(0)
        expect(parse(100)).toBe(100)
      })

      it('should return null for out of range', () => {
        const parse = parseNumberInRange(0, 100)
        expect(parse(-1)).toBeNull()
        expect(parse(101)).toBeNull()
      })

      it('should return null for non-number', () => {
        const parse = parseNumberInRange(0, 100)
        expect(parse('50')).toBeNull()
        expect(parse(NaN)).toBeNull()
      })
    })

    describe('parseBoolean', () => {
      it('should parse boolean values', () => {
        expect(parseBoolean(true)).toBe(true)
        expect(parseBoolean(false)).toBe(false)
      })

      it('should return null for non-boolean', () => {
        expect(parseBoolean('true')).toBeNull()
        expect(parseBoolean(1)).toBeNull()
      })
    })
  })

  describe('Utility functions', () => {
    describe('isStorageAvailable', () => {
      it('should return true when storage is available', () => {
        expect(isStorageAvailable()).toBe(true)
      })
    })

    describe('getStorageKeys', () => {
      it('should return all keys', () => {
        localStorage.setItem('key1', 'v1')
        localStorage.setItem('key2', 'v2')
        localStorage.setItem('other', 'v3')

        const keys = getStorageKeys()
        expect(keys).toContain('key1')
        expect(keys).toContain('key2')
        expect(keys).toContain('other')
      })

      it('should filter by pattern', () => {
        localStorage.setItem('prefix-a', 'v1')
        localStorage.setItem('prefix-b', 'v2')
        localStorage.setItem('other', 'v3')

        const keys = getStorageKeys(/^prefix-/)
        expect(keys).toContain('prefix-a')
        expect(keys).toContain('prefix-b')
        expect(keys).not.toContain('other')
      })
    })

    describe('clearStorageByPattern', () => {
      it('should clear matching keys', () => {
        localStorage.setItem('temp-1', 'v1')
        localStorage.setItem('temp-2', 'v2')
        localStorage.setItem('keep', 'v3')

        const cleared = clearStorageByPattern(/^temp-/)
        expect(cleared).toBe(2)
        expect(localStorage.getItem('temp-1')).toBeNull()
        expect(localStorage.getItem('temp-2')).toBeNull()
        expect(localStorage.getItem('keep')).toBe('v3')
      })
    })
  })
})
