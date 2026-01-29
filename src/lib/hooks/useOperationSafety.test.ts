import { describe, it, expect } from 'vitest'
import { getSafetyLevelColor, getSafetyLevelText } from './useOperationSafety'

describe('useOperationSafety utilities', () => {
  describe('getSafetyLevelColor', () => {
    it('should return green for safe', () => {
      expect(getSafetyLevelColor('safe')).toBe('#22c55e')
    })

    it('should return yellow for caution', () => {
      expect(getSafetyLevelColor('caution')).toBe('#eab308')
    })

    it('should return orange for warning', () => {
      expect(getSafetyLevelColor('warning')).toBe('#f97316')
    })

    it('should return red for danger', () => {
      expect(getSafetyLevelColor('danger')).toBe('#ef4444')
    })

    it('should return dark red for prohibited', () => {
      expect(getSafetyLevelColor('prohibited')).toBe('#991b1b')
    })

    it('should return gray for unknown level', () => {
      // @ts-expect-error testing invalid input
      expect(getSafetyLevelColor('unknown')).toBe('#6b7280')
    })
  })

  describe('getSafetyLevelText', () => {
    it('should return Japanese text for safe', () => {
      expect(getSafetyLevelText('safe')).toBe('安全')
    })

    it('should return Japanese text for caution', () => {
      expect(getSafetyLevelText('caution')).toBe('注意')
    })

    it('should return Japanese text for warning', () => {
      expect(getSafetyLevelText('warning')).toBe('警告')
    })

    it('should return Japanese text for danger', () => {
      expect(getSafetyLevelText('danger')).toBe('危険')
    })

    it('should return Japanese text for prohibited', () => {
      expect(getSafetyLevelText('prohibited')).toBe('飛行禁止')
    })

    it('should return unknown for invalid level', () => {
      // @ts-expect-error testing invalid input
      expect(getSafetyLevelText('invalid')).toBe('不明')
    })
  })
})
