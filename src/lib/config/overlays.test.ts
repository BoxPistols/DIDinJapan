import { describe, it, expect } from 'vitest'
import {
  RESTRICTION_ZONES,
  NO_FLY_ZONES,
  getAllRestrictionZones,
  RESTRICTION_COLORS
} from './overlays'
import { FACILITY_LAYERS, getFacilityLayerById } from './facilities'

describe('Overlay Configuration', () => {
  describe('RESTRICTION_ZONES', () => {
    it('should include authentic data layers', () => {
      const airport = RESTRICTION_ZONES.find((z) => z.id === 'airport-airspace')
      const did = RESTRICTION_ZONES.find((z) => z.id === 'did-area')

      expect(airport).toBeDefined()
      expect(did).toBeDefined()
    })

    it('should NOT include mock/temporary data layers', () => {
      // These should have been removed or commented out in the refactor
      const emergency = RESTRICTION_ZONES.find((z) => z.id === 'emergency-airspace')
      const manned = RESTRICTION_ZONES.find((z) => z.id === 'manned-aircraft')
      const remote = RESTRICTION_ZONES.find((z) => z.id === 'remote-id-zone')

      expect(emergency).toBeUndefined()
      expect(manned).toBeUndefined()
      expect(remote).toBeUndefined()
    })

    it('should have correct color mappings', () => {
      const airport = RESTRICTION_ZONES.find((z) => z.id === 'airport-airspace')
      expect(airport?.color).toBe(RESTRICTION_COLORS.airport)
    })
  })

  describe('NO_FLY_ZONES', () => {
    it('should include Law-based no fly zones', () => {
      const red = NO_FLY_ZONES.find((z) => z.id === 'no-fly-red')
      const yellow = NO_FLY_ZONES.find((z) => z.id === 'no-fly-yellow')

      expect(red).toBeDefined()
      expect(yellow).toBeDefined()
    })
  })

  describe('getAllRestrictionZones', () => {
    it('should combine restriction zones and no-fly zones', () => {
      const all = getAllRestrictionZones()
      expect(all.length).toBe(RESTRICTION_ZONES.length + NO_FLY_ZONES.length)

      const hasAirport = all.some((z) => z.id === 'airport-airspace')
      const hasRed = all.some((z) => z.id === 'no-fly-red')

      expect(hasAirport).toBe(true)
      expect(hasRed).toBe(true)
    })
  })
})

describe('Facility Configuration', () => {
  describe('FACILITY_LAYERS', () => {
    it('should define the 4 core facility types', () => {
      expect(FACILITY_LAYERS).toHaveLength(4)

      const ids = FACILITY_LAYERS.map((l) => l.id)
      expect(ids).toContain('facility-landing')
      expect(ids).toContain('facility-military')
      expect(ids).toContain('facility-fire')
      expect(ids).toContain('facility-medical')
    })

    it('should have valid path definitions for GeoJSON', () => {
      FACILITY_LAYERS.forEach((layer) => {
        expect(layer.path).toMatch(/^\/data\/facilities\/.*\.geojson$/)
      })
    })
  })

  describe('getFacilityLayerById', () => {
    it('should retrieve layer config by correct ID', () => {
      const layer = getFacilityLayerById('facility-landing')
      expect(layer).toBeDefined()
      expect(layer?.name).toContain('空港・ヘリポート')
    })

    it('should return undefined for invalid ID', () => {
      const layer = getFacilityLayerById('invalid-id')
      expect(layer).toBeUndefined()
    })
  })
})
