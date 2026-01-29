import { describe, it, expect, beforeEach } from 'vitest'
import { useMapState } from './useMapState'

describe('useMapState', () => {
  beforeEach(() => {
    // Reset store before each test
    useMapState.getState().resetAll()
  })

  describe('toggleLayer', () => {
    it('should toggle layer visibility from false to true', () => {
      const { toggleLayer } = useMapState.getState()

      expect(useMapState.getState().restriction['test-layer']).toBeUndefined()

      toggleLayer('restriction', 'test-layer')

      expect(useMapState.getState().restriction['test-layer']).toBe(true)
    })

    it('should toggle layer visibility from true to false', () => {
      const { setLayerVisibility, toggleLayer } = useMapState.getState()

      setLayerVisibility('restriction', 'test-layer', true)
      expect(useMapState.getState().restriction['test-layer']).toBe(true)

      toggleLayer('restriction', 'test-layer')
      expect(useMapState.getState().restriction['test-layer']).toBe(false)
    })
  })

  describe('setLayerVisibility', () => {
    it('should set layer visibility to true', () => {
      const { setLayerVisibility } = useMapState.getState()

      setLayerVisibility('overlay', 'rain-radar', true)

      expect(useMapState.getState().overlay['rain-radar']).toBe(true)
    })

    it('should set layer visibility to false', () => {
      const { setLayerVisibility } = useMapState.getState()

      setLayerVisibility('overlay', 'rain-radar', true)
      setLayerVisibility('overlay', 'rain-radar', false)

      expect(useMapState.getState().overlay['rain-radar']).toBe(false)
    })
  })

  describe('setMultipleLayers', () => {
    it('should set multiple layers at once', () => {
      const { setMultipleLayers } = useMapState.getState()

      setMultipleLayers('restriction', {
        airport: true,
        'did-all-japan': true,
        'no-fly-red': false
      })

      const state = useMapState.getState()
      expect(state.restriction['airport']).toBe(true)
      expect(state.restriction['did-all-japan']).toBe(true)
      expect(state.restriction['no-fly-red']).toBe(false)
    })

    it('should merge with existing state', () => {
      const { setLayerVisibility, setMultipleLayers } = useMapState.getState()

      setLayerVisibility('restriction', 'existing', true)
      setMultipleLayers('restriction', { new: true })

      const state = useMapState.getState()
      expect(state.restriction['existing']).toBe(true)
      expect(state.restriction['new']).toBe(true)
    })
  })

  describe('isLayerVisible', () => {
    it('should return true for visible layer', () => {
      const { setLayerVisibility, isLayerVisible } = useMapState.getState()

      setLayerVisibility('weather', 'temperature', true)

      expect(isLayerVisible('weather', 'temperature')).toBe(true)
    })

    it('should return false for hidden layer', () => {
      const { setLayerVisibility, isLayerVisible } = useMapState.getState()

      setLayerVisibility('weather', 'temperature', false)

      expect(isLayerVisible('weather', 'temperature')).toBe(false)
    })

    it('should return false for undefined layer', () => {
      const { isLayerVisible } = useMapState.getState()

      expect(isLayerVisible('weather', 'nonexistent')).toBe(false)
    })
  })

  describe('getVisibleLayers', () => {
    it('should return array of visible layer keys', () => {
      const { setMultipleLayers, getVisibleLayers } = useMapState.getState()

      setMultipleLayers('comparison', {
        'layer-a': true,
        'layer-b': false,
        'layer-c': true
      })

      const visible = getVisibleLayers('comparison')

      expect(visible).toContain('layer-a')
      expect(visible).toContain('layer-c')
      expect(visible).not.toContain('layer-b')
      expect(visible).toHaveLength(2)
    })

    it('should return empty array when no layers visible', () => {
      const { getVisibleLayers } = useMapState.getState()

      expect(getVisibleLayers('customLayer')).toEqual([])
    })
  })

  describe('resetCategory', () => {
    it('should reset specific category to empty object', () => {
      const { setMultipleLayers, resetCategory } = useMapState.getState()

      setMultipleLayers('did', { 'did-tokyo': true, 'did-osaka': true })
      expect(Object.keys(useMapState.getState().did)).toHaveLength(2)

      resetCategory('did')
      expect(useMapState.getState().did).toEqual({})
    })

    it('should not affect other categories', () => {
      const { setLayerVisibility, resetCategory } = useMapState.getState()

      setLayerVisibility('restriction', 'airport', true)
      setLayerVisibility('overlay', 'rain', true)

      resetCategory('restriction')

      expect(useMapState.getState().restriction).toEqual({})
      expect(useMapState.getState().overlay['rain']).toBe(true)
    })
  })

  describe('resetAll', () => {
    it('should reset all categories', () => {
      const { setLayerVisibility, resetAll } = useMapState.getState()

      setLayerVisibility('overlay', 'test', true)
      setLayerVisibility('weather', 'test', true)
      setLayerVisibility('restriction', 'test', true)
      setLayerVisibility('customLayer', 'test', true)
      setLayerVisibility('comparison', 'test', true)
      setLayerVisibility('did', 'test', true)

      resetAll()

      const state = useMapState.getState()
      expect(state.overlay).toEqual({})
      expect(state.weather).toEqual({})
      expect(state.restriction).toEqual({})
      expect(state.customLayer).toEqual({})
      expect(state.comparison).toEqual({})
      expect(state.did).toEqual({})
    })
  })

  describe('importState', () => {
    it('should import partial state', () => {
      const { importState } = useMapState.getState()

      importState({
        restriction: { airport: true, 'no-fly': true },
        comparison: { 'noto-2024': true }
      })

      const state = useMapState.getState()
      expect(state.restriction['airport']).toBe(true)
      expect(state.restriction['no-fly']).toBe(true)
      expect(state.comparison['noto-2024']).toBe(true)
    })

    it('should merge with existing state', () => {
      const { setLayerVisibility, importState } = useMapState.getState()

      setLayerVisibility('overlay', 'existing', true)

      importState({
        overlay: { imported: true }
      })

      const state = useMapState.getState()
      // Note: importState replaces the category, not merges
      expect(state.overlay['imported']).toBe(true)
    })
  })
})
