/**
 * Noto uplift quick toggle (minimal option)
 * 能登半島「隆起エリア」表示のミニマムUI（標準マップ限定）
 */

export interface IsikawaNotoComparisonPanelProps {
  onLayerToggle: (layerId: string, visible: boolean) => void
  onOpacityChange: (layerId: string, opacity: number) => void
  visibleLayers: Set<string>
  opacityLayers: Map<string, number>
  darkMode?: boolean
  isSupported?: boolean
  unsupportedMessage?: string
}

const NOTO_UPLIFT_LAYER_ID = 'terrain-2024-noto'

export function IsikawaNotoComparisonPanel({
  onLayerToggle,
  visibleLayers,
  darkMode = false,
  isSupported = true,
  unsupportedMessage = '簡易モード：地形比較は「標準」ベースマップのみ対応です（航空写真/地理院系ではOFFになります）。'
}: IsikawaNotoComparisonPanelProps) {
  const isVisible = visibleLayers.has(NOTO_UPLIFT_LAYER_ID)
  const buttonLabel = isSupported ? '能登半島隆起エリア' : '能登半島隆起エリア（標準マップ限定）'

  return (
    <button
      type="button"
      onClick={() => {
        if (!isSupported) return
        onLayerToggle(NOTO_UPLIFT_LAYER_ID, !isVisible)
      }}
      disabled={!isSupported}
      title={isSupported ? '能登半島の隆起エリアを表示/非表示' : unsupportedMessage}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        padding: '10px 14px',
        borderRadius: '10px',
        border: darkMode ? '1px solid #444' : '1px solid #e0e0e0',
        backgroundColor: !isSupported
          ? (darkMode ? '#2a2a2a' : '#f3f3f3')
          : (isVisible ? '#d63031' : '#ffffff'),
        color: !isSupported
          ? (darkMode ? '#888' : '#777')
          : (isVisible ? '#fff' : (darkMode ? '#fff' : '#222')),
        cursor: !isSupported ? 'not-allowed' : 'pointer',
        boxShadow: darkMode ? '0 6px 18px rgba(0,0,0,0.35)' : '0 6px 18px rgba(0,0,0,0.18)',
        zIndex: 999,
        fontWeight: 700,
        fontSize: '13px',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        opacity: !isSupported ? 0.85 : 1
      }}
    >
      {buttonLabel}
    </button>
  )
}

export default IsikawaNotoComparisonPanel
