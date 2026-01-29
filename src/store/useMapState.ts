/**
 * Zustand Store for Map Layer State Management
 *
 * Centralizes all layer visibility state that was previously scattered across App.tsx:
 * - overlayStates
 * - weatherStates
 * - restrictionStates
 * - customLayerVisibility
 * - comparisonLayerVisibility
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export type LayerCategory =
  | 'overlay'
  | 'weather'
  | 'restriction'
  | 'customLayer'
  | 'comparison'
  | 'did'

export interface LayerVisibilityState {
  overlay: Record<string, boolean>
  weather: Record<string, boolean>
  restriction: Record<string, boolean>
  customLayer: Record<string, boolean>
  comparison: Record<string, boolean>
  did: Record<string, boolean>
}

export interface MapStateActions {
  // Toggle layer visibility
  toggleLayer: (category: LayerCategory, key: string) => void

  // Set specific layer visibility
  setLayerVisibility: (category: LayerCategory, key: string, visible: boolean) => void

  // Set multiple layers at once
  setMultipleLayers: (category: LayerCategory, layers: Record<string, boolean>) => void

  // Get layer visibility
  isLayerVisible: (category: LayerCategory, key: string) => boolean

  // Get all visible layers in a category
  getVisibleLayers: (category: LayerCategory) => string[]

  // Reset category to initial state
  resetCategory: (category: LayerCategory) => void

  // Reset all state
  resetAll: () => void

  // Bulk import state (for migration from existing App.tsx state)
  importState: (state: Partial<LayerVisibilityState>) => void
}

export type MapState = LayerVisibilityState & MapStateActions

const initialState: LayerVisibilityState = {
  overlay: {},
  weather: {},
  restriction: {},
  customLayer: {},
  comparison: {},
  did: {}
}

export const useMapState = create<MapState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        toggleLayer: (category, key) => {
          set(
            (state) => ({
              [category]: {
                ...state[category],
                [key]: !state[category][key]
              }
            }),
            false,
            `toggleLayer/${category}/${key}`
          )
        },

        setLayerVisibility: (category, key, visible) => {
          set(
            (state) => ({
              [category]: {
                ...state[category],
                [key]: visible
              }
            }),
            false,
            `setLayerVisibility/${category}/${key}/${visible}`
          )
        },

        setMultipleLayers: (category, layers) => {
          set(
            (state) => ({
              [category]: {
                ...state[category],
                ...layers
              }
            }),
            false,
            `setMultipleLayers/${category}`
          )
        },

        isLayerVisible: (category, key) => {
          return get()[category][key] ?? false
        },

        getVisibleLayers: (category) => {
          const categoryState = get()[category]
          return Object.entries(categoryState)
            .filter(([, visible]) => visible)
            .map(([key]) => key)
        },

        resetCategory: (category) => {
          set(
            { [category]: {} },
            false,
            `resetCategory/${category}`
          )
        },

        resetAll: () => {
          set(initialState, false, 'resetAll')
        },

        importState: (state) => {
          set(
            (current) => ({
              ...current,
              ...state
            }),
            false,
            'importState'
          )
        }
      }),
      {
        name: 'map-layer-state',
        partialize: (state) => ({
          // Only persist certain categories
          restriction: state.restriction,
          comparison: state.comparison
          // Don't persist: overlay, weather, customLayer, did (session-specific)
        })
      }
    ),
    { name: 'MapState' }
  )
)

// Selector hooks for better performance (avoid unnecessary re-renders)
export const useOverlayState = () => useMapState((state) => state.overlay)
export const useWeatherState = () => useMapState((state) => state.weather)
export const useRestrictionState = () => useMapState((state) => state.restriction)
export const useCustomLayerState = () => useMapState((state) => state.customLayer)
export const useComparisonState = () => useMapState((state) => state.comparison)
export const useDidState = () => useMapState((state) => state.did)

// Action hooks
export const useMapStateActions = () =>
  useMapState((state) => ({
    toggleLayer: state.toggleLayer,
    setLayerVisibility: state.setLayerVisibility,
    setMultipleLayers: state.setMultipleLayers,
    isLayerVisible: state.isLayerVisible,
    getVisibleLayers: state.getVisibleLayers,
    resetCategory: state.resetCategory,
    resetAll: state.resetAll,
    importState: state.importState
  }))
