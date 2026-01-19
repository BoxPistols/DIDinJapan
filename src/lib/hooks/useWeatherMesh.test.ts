import { describe, it, expect } from 'vitest'
import { classifyWindLevel } from './useWeatherMesh'

describe('useWeatherMesh', () => {
  describe('classifyWindLevel', () => {
    it('should categorize wind speeds correctly', () => {
      // safe: 0-2 m/s
      expect(classifyWindLevel(0)).toBe('safe')
      expect(classifyWindLevel(1.5)).toBe('safe')
      expect(classifyWindLevel(1.9)).toBe('safe')

      // caution: 2-5 m/s
      expect(classifyWindLevel(2)).toBe('caution')
      expect(classifyWindLevel(3.5)).toBe('caution')
      expect(classifyWindLevel(4.9)).toBe('caution')

      // warning: 5-10 m/s
      expect(classifyWindLevel(5)).toBe('warning')
      expect(classifyWindLevel(7.5)).toBe('warning')
      expect(classifyWindLevel(9.9)).toBe('warning')

      // danger: 10+ m/s
      expect(classifyWindLevel(10)).toBe('danger')
      expect(classifyWindLevel(12)).toBe('danger')
      expect(classifyWindLevel(25)).toBe('danger')
    })
  })
})
