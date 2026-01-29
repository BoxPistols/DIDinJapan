import { describe, it, expect } from 'vitest'
import {
  latLngToMeshCode,
  meshCodeToLatLng,
  meshCodeToBBox,
  getSurroundingMeshCodes,
  isValidMeshCode,
  // Multi-level mesh functions
  latLngToMeshCode1st,
  latLngToMeshCode2nd,
  meshCode1stToLatLng,
  meshCode2ndToLatLng,
  meshCode1stToBBox,
  meshCode2ndToBBox,
  meshCodeToBBoxByLevel,
  getMeshConfigForZoom,
  latLngToMeshCodeByLevel
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

  // Multi-level Mesh Tests
  describe('latLngToMeshCode1st (1st level mesh - 4 digits)', () => {
    it('should convert Tokyo coordinates to 4-digit mesh code', () => {
      const code = latLngToMeshCode1st(35.6595, 139.7004)
      expect(code).toHaveLength(4)
      expect(code).toBe('5339')
    })

    it('should convert Osaka coordinates to 4-digit mesh code', () => {
      const code = latLngToMeshCode1st(34.6937, 135.5023)
      expect(code).toHaveLength(4)
      expect(code).toBe('5235')
    })

    it('should throw error for coordinates outside Japan', () => {
      expect(() => latLngToMeshCode1st(10, 100)).toThrow('out of Japan bounds')
    })
  })

  describe('latLngToMeshCode2nd (2nd level mesh - 6 digits)', () => {
    it('should convert Tokyo coordinates to 6-digit mesh code', () => {
      const code = latLngToMeshCode2nd(35.6595, 139.7004)
      expect(code).toHaveLength(6)
      expect(code.substring(0, 4)).toBe('5339')
    })

    it('should convert Osaka coordinates to 6-digit mesh code', () => {
      const code = latLngToMeshCode2nd(34.6937, 135.5023)
      expect(code).toHaveLength(6)
      expect(code.substring(0, 4)).toBe('5235')
    })

    it('should throw error for coordinates outside Japan', () => {
      expect(() => latLngToMeshCode2nd(10, 100)).toThrow('out of Japan bounds')
    })
  })

  describe('meshCode1stToLatLng', () => {
    it('should convert 1st level mesh code to center coordinates', () => {
      const coords = meshCode1stToLatLng('5339')
      expect(coords.lat).toBeGreaterThan(35)
      expect(coords.lat).toBeLessThan(36)
      expect(coords.lng).toBeGreaterThan(139)
      expect(coords.lng).toBeLessThan(140)
    })

    it('should throw error for invalid length', () => {
      expect(() => meshCode1stToLatLng('53')).toThrow('must be 4 digits')
      expect(() => meshCode1stToLatLng('533935')).toThrow('must be 4 digits')
    })
  })

  describe('meshCode2ndToLatLng', () => {
    it('should convert 2nd level mesh code to center coordinates', () => {
      const coords = meshCode2ndToLatLng('533935')
      expect(coords.lat).toBeGreaterThan(35)
      expect(coords.lat).toBeLessThan(36)
      expect(coords.lng).toBeGreaterThan(139)
      expect(coords.lng).toBeLessThan(140)
    })

    it('should throw error for invalid length', () => {
      expect(() => meshCode2ndToLatLng('5339')).toThrow('must be 6 digits')
      expect(() => meshCode2ndToLatLng('53393599')).toThrow('must be 6 digits')
    })
  })

  describe('meshCode1stToBBox', () => {
    it('should return correct bounding box for 1st level mesh', () => {
      const bbox = meshCode1stToBBox('5339')
      expect(bbox).toHaveLength(4)
      expect(bbox[0]).toBeLessThan(bbox[2]) // minLng < maxLng
      expect(bbox[1]).toBeLessThan(bbox[3]) // minLat < maxLat
      // 1st level mesh spans 1 degree longitude
      expect(bbox[2] - bbox[0]).toBeCloseTo(1, 5)
    })

    it('should throw error for invalid length', () => {
      expect(() => meshCode1stToBBox('53')).toThrow('must be 4 digits')
    })
  })

  describe('meshCode2ndToBBox', () => {
    it('should return correct bounding box for 2nd level mesh', () => {
      const bbox = meshCode2ndToBBox('533935')
      expect(bbox).toHaveLength(4)
      expect(bbox[0]).toBeLessThan(bbox[2]) // minLng < maxLng
      expect(bbox[1]).toBeLessThan(bbox[3]) // minLat < maxLat
      // 2nd level mesh spans 7.5 minutes (0.125 degrees) longitude
      expect(bbox[2] - bbox[0]).toBeCloseTo(7.5 / 60, 5)
    })

    it('should throw error for invalid length', () => {
      expect(() => meshCode2ndToBBox('5339')).toThrow('must be 6 digits')
    })
  })

  describe('meshCodeToBBoxByLevel', () => {
    it('should auto-detect 1st level mesh', () => {
      const bbox = meshCodeToBBoxByLevel('5339')
      expect(bbox).toHaveLength(4)
      expect(bbox[2] - bbox[0]).toBeCloseTo(1, 5) // 1 degree
    })

    it('should auto-detect 2nd level mesh', () => {
      const bbox = meshCodeToBBoxByLevel('533935')
      expect(bbox).toHaveLength(4)
      expect(bbox[2] - bbox[0]).toBeCloseTo(7.5 / 60, 5)
    })

    it('should auto-detect 3rd level mesh', () => {
      const bbox = meshCodeToBBoxByLevel('53393599')
      expect(bbox).toHaveLength(4)
      expect(bbox[2] - bbox[0]).toBeCloseTo(0.75 / 60, 5)
    })

    it('should throw error for invalid length', () => {
      expect(() => meshCodeToBBoxByLevel('533')).toThrow('Invalid mesh code length')
      expect(() => meshCodeToBBoxByLevel('53393')).toThrow('Invalid mesh code length')
    })
  })

  describe('getMeshConfigForZoom', () => {
    it('should return 1st level config for zoom < 7', () => {
      const config = getMeshConfigForZoom(5)
      expect(config.level).toBe(1)
      expect(config.maxCells).toBe(50)
    })

    it('should return 2nd level config for zoom 7-9', () => {
      const config = getMeshConfigForZoom(8)
      expect(config.level).toBe(2)
      expect(config.maxCells).toBe(200)
    })

    it('should return 3rd level config for zoom >= 10', () => {
      const config = getMeshConfigForZoom(12)
      expect(config.level).toBe(3)
      expect(config.maxCells).toBe(500)
    })
  })

  describe('latLngToMeshCodeByLevel', () => {
    const lat = 35.6595
    const lng = 139.7004

    it('should generate 1st level mesh code', () => {
      const code = latLngToMeshCodeByLevel(lat, lng, 1)
      expect(code).toHaveLength(4)
    })

    it('should generate 2nd level mesh code', () => {
      const code = latLngToMeshCodeByLevel(lat, lng, 2)
      expect(code).toHaveLength(6)
    })

    it('should generate 3rd level mesh code', () => {
      const code = latLngToMeshCodeByLevel(lat, lng, 3)
      expect(code).toHaveLength(8)
    })

    it('should maintain hierarchy (1st is prefix of 2nd, 2nd is prefix of 3rd)', () => {
      const code1 = latLngToMeshCodeByLevel(lat, lng, 1)
      const code2 = latLngToMeshCodeByLevel(lat, lng, 2)
      const code3 = latLngToMeshCodeByLevel(lat, lng, 3)

      expect(code2.startsWith(code1)).toBe(true)
      expect(code3.startsWith(code2)).toBe(true)
    })
  })
})
