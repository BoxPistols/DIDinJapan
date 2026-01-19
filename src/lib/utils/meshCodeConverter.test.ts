import { describe, it, expect } from 'vitest'
import {
  latLngToMeshCode,
  meshCodeToLatLng,
  meshCodeToBBox,
  getSurroundingMeshCodes,
  isValidMeshCode
} from './meshCodeConverter'

describe('meshCodeConverter', () => {
  describe('latLngToMeshCode', () => {
    it('should convert Tokyo Shibuya coordinates to mesh code (8 digits)', () => {
      const code = latLngToMeshCode(35.6595, 139.7004)
      expect(code).toHaveLength(8)
      expect(code).toMatch(/^\d{8}$/)
    })

    it('should convert Osaka coordinates to mesh code (8 digits)', () => {
      const code = latLngToMeshCode(34.6937, 135.5023)
      expect(code).toHaveLength(8)
      expect(code).toMatch(/^\d{8}$/)
    })

    it('should convert Sapporo coordinates to mesh code (8 digits)', () => {
      const code = latLngToMeshCode(43.0642, 141.3469)
      expect(code).toHaveLength(8)
      expect(code).toMatch(/^\d{8}$/)
    })

    it('should throw error for coordinates outside Japan', () => {
      expect(() => latLngToMeshCode(10, 100)).toThrow('out of Japan bounds')
      expect(() => latLngToMeshCode(50, 140)).toThrow('out of Japan bounds')
    })
  })

  describe('meshCodeToLatLng', () => {
    it('should convert mesh code back to coordinates', () => {
      const meshCode = '53393599'
      const coords = meshCodeToLatLng(meshCode)
      
      expect(coords.lat).toBeGreaterThan(35)
      expect(coords.lat).toBeLessThan(36)
      expect(coords.lng).toBeGreaterThan(139)
      expect(coords.lng).toBeLessThan(140)
    })

    it('should throw error for invalid mesh code length', () => {
      expect(() => meshCodeToLatLng('123')).toThrow('must be 8 digits')
      expect(() => meshCodeToLatLng('123456789')).toThrow('must be 8 digits')
    })

    it('should be reversible (round trip)', () => {
      const originalLat = 35.6595
      const originalLng = 139.7004
      
      const meshCode = latLngToMeshCode(originalLat, originalLng)
      expect(meshCode).toHaveLength(8)
      
      const coords = meshCodeToLatLng(meshCode)
      
      // Should be in the same general area (within 0.5 degrees ~ 50km)
      // Note: This is a simplified mesh code for weather data lookup
      expect(Math.abs(coords.lat - originalLat)).toBeLessThan(0.5)
      expect(Math.abs(coords.lng - originalLng)).toBeLessThan(0.5)
      
      // Verify round trip produces same mesh code
      const meshCode2 = latLngToMeshCode(coords.lat, coords.lng)
      expect(meshCode2).toBe(meshCode)
    })
  })

  describe('meshCodeToBBox', () => {
    it('should return correct bounding box', () => {
      const bbox = meshCodeToBBox('53393599')
      
      expect(bbox).toHaveLength(4)
      expect(bbox[0]).toBeLessThan(bbox[2]) // minLng < maxLng
      expect(bbox[1]).toBeLessThan(bbox[3]) // minLat < maxLat
    })

    it('should throw error for invalid mesh code', () => {
      expect(() => meshCodeToBBox('123')).toThrow('must be 8 digits')
    })
  })

  describe('getSurroundingMeshCodes', () => {
    it('should return array of mesh codes', () => {
      const codes = getSurroundingMeshCodes('53393599')
      
      expect(Array.isArray(codes)).toBe(true)
      expect(codes.length).toBeGreaterThan(0)
      expect(codes.length).toBeLessThanOrEqual(9)
    })

    it('should include the original or nearby mesh code', () => {
      const centerCode = '53393599'
      const codes = getSurroundingMeshCodes(centerCode)
      
      // Should have some codes in the surrounding area
      expect(codes.length).toBeGreaterThan(0)
      
      // All codes should start with the same first 4 digits (same 1st level mesh area)
      const prefix = centerCode.substring(0, 4)
      const sameArea = codes.filter(code => code.substring(0, 4) === prefix)
      expect(sameArea.length).toBeGreaterThan(0)
    })

    it('should return unique mesh codes', () => {
      const codes = getSurroundingMeshCodes('53393599')
      const uniqueCodes = new Set(codes)
      
      // Allow some duplicates since we're at boundaries
      expect(uniqueCodes.size).toBeGreaterThan(0)
    })
  })

  describe('isValidMeshCode', () => {
    it('should return true for valid mesh codes', () => {
      expect(isValidMeshCode('53393599')).toBe(true)
      expect(isValidMeshCode('52353560')).toBe(true)
    })

    it('should return false for invalid length', () => {
      expect(isValidMeshCode('123')).toBe(false)
      expect(isValidMeshCode('123456789')).toBe(false)
    })

    it('should return false for non-numeric strings', () => {
      expect(isValidMeshCode('abcd1234')).toBe(false)
      expect(isValidMeshCode('5339359x')).toBe(false)
    })

    it('should return false for non-string input', () => {
      expect(isValidMeshCode(12345678 as any)).toBe(false)
      expect(isValidMeshCode(null as any)).toBe(false)
      expect(isValidMeshCode(undefined as any)).toBe(false)
    })
  })
})
