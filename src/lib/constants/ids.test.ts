import { describe, it, expect } from 'vitest'
import {
  PREFECTURE_CODES,
  DID_LAYER_IDS,
  BASE_MAP_IDS,
  GEO_OVERLAY_IDS,
  WEATHER_OVERLAY_IDS,
  RESTRICTION_ZONE_IDS,
  RESTRICTION_CATEGORY_IDS,
  isDidLayerId,
  isBaseMapId,
  isGeoOverlayId,
  isWeatherOverlayId,
  isRestrictionZoneId,
  isRestrictionCategoryId,
  isPrefectureCode,
  prefectureCodeToDidLayerId,
  didLayerIdToPrefectureCode
} from './ids'

describe('ID Constants', () => {
  describe('PREFECTURE_CODES', () => {
    it('should have 47 prefecture codes', () => {
      expect(PREFECTURE_CODES).toHaveLength(47)
    })

    it('should start with 01 (Hokkaido)', () => {
      expect(PREFECTURE_CODES[0]).toBe('01')
    })

    it('should end with 47 (Okinawa)', () => {
      expect(PREFECTURE_CODES[46]).toBe('47')
    })
  })

  describe('DID_LAYER_IDS', () => {
    it('should have 47 DID layer IDs', () => {
      expect(Object.keys(DID_LAYER_IDS)).toHaveLength(47)
    })

    it('should follow did-XX pattern', () => {
      expect(DID_LAYER_IDS.DID_01).toBe('did-01')
      expect(DID_LAYER_IDS.DID_13).toBe('did-13')
      expect(DID_LAYER_IDS.DID_47).toBe('did-47')
    })
  })

  describe('BASE_MAP_IDS', () => {
    it('should have 4 base map options', () => {
      expect(Object.keys(BASE_MAP_IDS)).toHaveLength(4)
    })

    it('should have expected values', () => {
      expect(BASE_MAP_IDS.OSM).toBe('osm')
      expect(BASE_MAP_IDS.GSI).toBe('gsi')
      expect(BASE_MAP_IDS.PALE).toBe('pale')
      expect(BASE_MAP_IDS.PHOTO).toBe('photo')
    })
  })

  describe('GEO_OVERLAY_IDS', () => {
    it('should have expected geo overlay IDs', () => {
      expect(GEO_OVERLAY_IDS.HILLSHADE).toBe('hillshade')
      expect(GEO_OVERLAY_IDS.RELIEF).toBe('relief')
      expect(GEO_OVERLAY_IDS.SLOPE).toBe('slope')
      expect(GEO_OVERLAY_IDS.BUILDINGS).toBe('buildings')
      expect(GEO_OVERLAY_IDS.TERRAIN_2024_NOTO).toBe('terrain-2024-noto')
    })
  })

  describe('WEATHER_OVERLAY_IDS', () => {
    it('should have expected weather overlay IDs', () => {
      expect(WEATHER_OVERLAY_IDS.RAIN_RADAR).toBe('rain-radar')
      expect(WEATHER_OVERLAY_IDS.WIND).toBe('wind')
    })
  })

  describe('RESTRICTION_ZONE_IDS', () => {
    it('should have expected restriction zone IDs', () => {
      expect(RESTRICTION_ZONE_IDS.AIRPORT_AIRSPACE).toBe('airport-airspace')
      expect(RESTRICTION_ZONE_IDS.DID_AREA).toBe('did-area')
      expect(RESTRICTION_ZONE_IDS.NO_FLY_RED).toBe('no-fly-red')
      expect(RESTRICTION_ZONE_IDS.NO_FLY_YELLOW).toBe('no-fly-yellow')
    })
  })

  describe('RESTRICTION_CATEGORY_IDS', () => {
    it('should have expected category IDs', () => {
      expect(RESTRICTION_CATEGORY_IDS.NFZ_AIRPORT).toBe('nfz-airport')
      expect(RESTRICTION_CATEGORY_IDS.DID_AREA).toBe('did-area')
      expect(RESTRICTION_CATEGORY_IDS.CRITICAL_FACILITIES).toBe('critical-facilities')
    })
  })
})

describe('Type Guards', () => {
  describe('isDidLayerId', () => {
    it('should return true for valid DID layer IDs', () => {
      expect(isDidLayerId('did-01')).toBe(true)
      expect(isDidLayerId('did-13')).toBe(true)
      expect(isDidLayerId('did-47')).toBe(true)
    })

    it('should return false for invalid IDs', () => {
      expect(isDidLayerId('did-00')).toBe(false)
      expect(isDidLayerId('did-48')).toBe(false)
      expect(isDidLayerId('invalid')).toBe(false)
      expect(isDidLayerId('')).toBe(false)
    })
  })

  describe('isBaseMapId', () => {
    it('should return true for valid base map IDs', () => {
      expect(isBaseMapId('osm')).toBe(true)
      expect(isBaseMapId('gsi')).toBe(true)
      expect(isBaseMapId('pale')).toBe(true)
      expect(isBaseMapId('photo')).toBe(true)
    })

    it('should return false for invalid IDs', () => {
      expect(isBaseMapId('satellite')).toBe(false)
      expect(isBaseMapId('')).toBe(false)
    })
  })

  describe('isGeoOverlayId', () => {
    it('should return true for valid geo overlay IDs', () => {
      expect(isGeoOverlayId('hillshade')).toBe(true)
      expect(isGeoOverlayId('relief')).toBe(true)
      expect(isGeoOverlayId('slope')).toBe(true)
    })

    it('should return false for invalid IDs', () => {
      expect(isGeoOverlayId('terrain')).toBe(false)
      expect(isGeoOverlayId('')).toBe(false)
    })
  })

  describe('isWeatherOverlayId', () => {
    it('should return true for valid weather overlay IDs', () => {
      expect(isWeatherOverlayId('rain-radar')).toBe(true)
      expect(isWeatherOverlayId('wind')).toBe(true)
    })

    it('should return false for invalid IDs', () => {
      expect(isWeatherOverlayId('temperature')).toBe(false)
      expect(isWeatherOverlayId('')).toBe(false)
    })
  })

  describe('isRestrictionZoneId', () => {
    it('should return true for valid restriction zone IDs', () => {
      expect(isRestrictionZoneId('airport-airspace')).toBe(true)
      expect(isRestrictionZoneId('did-area')).toBe(true)
      expect(isRestrictionZoneId('no-fly-red')).toBe(true)
      expect(isRestrictionZoneId('no-fly-yellow')).toBe(true)
    })

    it('should return false for invalid IDs', () => {
      expect(isRestrictionZoneId('military')).toBe(false)
      expect(isRestrictionZoneId('')).toBe(false)
    })
  })

  describe('isRestrictionCategoryId', () => {
    it('should return true for valid category IDs', () => {
      expect(isRestrictionCategoryId('nfz-airport')).toBe(true)
      expect(isRestrictionCategoryId('did-area')).toBe(true)
      expect(isRestrictionCategoryId('critical-facilities')).toBe(true)
    })

    it('should return false for invalid IDs', () => {
      expect(isRestrictionCategoryId('unknown')).toBe(false)
      expect(isRestrictionCategoryId('')).toBe(false)
    })
  })

  describe('isPrefectureCode', () => {
    it('should return true for valid prefecture codes', () => {
      expect(isPrefectureCode('01')).toBe(true)
      expect(isPrefectureCode('13')).toBe(true)
      expect(isPrefectureCode('47')).toBe(true)
    })

    it('should return false for invalid codes', () => {
      expect(isPrefectureCode('00')).toBe(false)
      expect(isPrefectureCode('48')).toBe(false)
      expect(isPrefectureCode('1')).toBe(false) // must be 2 digits
      expect(isPrefectureCode('')).toBe(false)
    })
  })
})

describe('Utility Functions', () => {
  describe('prefectureCodeToDidLayerId', () => {
    it('should convert prefecture code to DID layer ID', () => {
      expect(prefectureCodeToDidLayerId('01')).toBe('did-01')
      expect(prefectureCodeToDidLayerId('13')).toBe('did-13')
      expect(prefectureCodeToDidLayerId('47')).toBe('did-47')
    })
  })

  describe('didLayerIdToPrefectureCode', () => {
    it('should extract prefecture code from DID layer ID', () => {
      expect(didLayerIdToPrefectureCode('did-01')).toBe('01')
      expect(didLayerIdToPrefectureCode('did-13')).toBe('13')
      expect(didLayerIdToPrefectureCode('did-47')).toBe('47')
    })
  })
})
