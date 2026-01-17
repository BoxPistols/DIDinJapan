/**
 * Reusable button and interactive element hover styles
 * Glassmorphism-compatible hover effects with proper color handling
 */

import type React from 'react'
import { getAppTheme } from './theme'

interface HoverStyleConfig {
  darkMode: boolean
  intensity?: 'subtle' | 'normal' | 'strong'
}

/**
 * Get hover color for button backgrounds
 * Increases opacity slightly on hover for glassmorphism effect
 */
export const getButtonHoverBg = (
  baseColor: string,
  config: HoverStyleConfig
): { normal: string; hover: string } => {
  const { darkMode, intensity = 'normal' } = config

  // For rgba colors, increase opacity slightly
  if (baseColor.startsWith('rgba')) {
    const match = baseColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
    if (match) {
      const [, r, g, b, a] = match
      const currentAlpha = parseFloat(a)
      const opacityIncrease = intensity === 'subtle' ? 0.1 : intensity === 'strong' ? 0.3 : 0.2

      return {
        normal: baseColor,
        hover: `rgba(${r}, ${g}, ${b}, ${Math.min(currentAlpha + opacityIncrease, 1)})`
      }
    }
  }

  // For hex colors, brighten on hover
  return {
    normal: baseColor,
    hover: darkenHexColor(baseColor, -20)
  }
}

/**
 * Get text color change for hover state
 * Adjusts transparency for better visibility on hover
 */
export const getTextHoverColor = (
  baseColor: string,
  config: HoverStyleConfig
): { normal: string; hover: string } => {
  const { darkMode, intensity = 'normal' } = config

  if (baseColor.startsWith('rgba')) {
    const match = baseColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
    if (match) {
      const [, r, g, b, a] = match
      const currentAlpha = parseFloat(a)
      const opacityIncrease = intensity === 'subtle' ? 0.05 : intensity === 'strong' ? 0.15 : 0.1

      return {
        normal: baseColor,
        hover: `rgba(${r}, ${g}, ${b}, ${Math.min(currentAlpha + opacityIncrease, 1)})`
      }
    }
  }

  return {
    normal: baseColor,
    hover: baseColor
  }
}

/**
 * Darken or lighten a hex color
 * @param hex - Hex color code
 * @param percent - Negative to darken, positive to lighten
 */
function darkenHexColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = ((num >> 8) & 0x00ff) + amt
  const B = (num & 0x0000ff) + amt

  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  )
}

/**
 * Create button mouse event handlers for hover effects
 */
export const createButtonHoverHandlers = (
  element: HTMLElement | null,
  config: {
    bgColor?: string
    textColor?: string
    borderColor?: string
  }
) => {
  if (!element) return { onMouseEnter: () => {}, onMouseLeave: () => {} }

  const onMouseEnter = () => {
    if (config.bgColor) {
      element.style.backgroundColor = config.bgColor
    }
    if (config.textColor) {
      element.style.color = config.textColor
    }
    if (config.borderColor) {
      element.style.borderColor = config.borderColor
    }
  }

  const onMouseLeave = () => {
    element.style.backgroundColor = ''
    element.style.color = ''
    element.style.borderColor = ''
  }

  return { onMouseEnter, onMouseLeave }
}

/**
 * Get hover style object for inline styles
 * Used directly in JSX style props
 */
export const getHoverStyle = (
  baseStyle: React.CSSProperties,
  hoverStyle: React.CSSProperties,
  isHovered: boolean
): React.CSSProperties => {
  return isHovered ? { ...baseStyle, ...hoverStyle } : baseStyle
}

/**
 * Create transition styles for smooth hover effects
 */
export const transitionStyle: React.CSSProperties = {
  transition: 'all 0.15s ease-out'
}

/**
 * Subtle hover effect for buttons (recommended for glassmorphism)
 */
export const subtleHoverEffect = (theme: ReturnType<typeof getAppTheme>): React.CSSProperties => ({
  transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease'
})
