import type React from 'react'

export type AppTheme = {
  colors: {
    // Surfaces
    pageBg: string
    panelBg: string
    panelBgMuted: string
    modalBg: string
    overlayBg: string
    buttonBg: string
    buttonBgActive: string

    // Text
    text: string
    textMuted: string
    textSubtle: string

    // Borders / outlines
    border: string
    borderStrong: string
    outline: string
  }
  shadows: {
    outline: string
    panel: string
  }
  radii: {
    sm: number
    md: number
  }
}

export const getAppTheme = (darkMode: boolean): AppTheme => {
  if (darkMode) {
    return {
      colors: {
        // Surfaces
        pageBg: '#0f1419',
        panelBg: 'rgba(26, 31, 46, 0.95)',
        panelBgMuted: '#1a1f2e',
        modalBg: 'rgba(26, 31, 46, 0.8)',
        overlayBg: 'rgba(0, 0, 0, 0.4)',
        buttonBg: 'rgba(74, 158, 255, 0.2)',
        buttonBgActive: '#4a9eff',

        // Text
        text: '#ffffff',
        textMuted: '#b0b8cc',
        textSubtle: '#7a8299',

        // Borders / outlines
        border: 'rgba(255, 255, 255, 0.1)',
        borderStrong: 'rgba(255, 255, 255, 0.2)',
        outline: 'rgba(74, 158, 255, 0.2)'
      },
      shadows: {
        outline: '0 0 0 2px rgba(74, 158, 255, 0.2)',
        panel: '0 8px 32px rgba(0, 0, 0, 0.3)'
      },
      radii: {
        sm: 4,
        md: 8
      }
    }
  }

  return {
    colors: {
      pageBg: '#ffffff',
      panelBg: 'rgba(255, 255, 255, 0.95)',
      panelBgMuted: '#f8f8f8',
      modalBg: 'rgba(255, 255, 255, 0.8)',
      overlayBg: 'rgba(0, 0, 0, 0.4)',
      buttonBg: 'rgba(74, 158, 255, 0.2)',
      buttonBgActive: '#4a9eff',
      text: '#1a1a1a',
      textMuted: '#6b7280',
      textSubtle: '#9ca3af',
      border: 'rgba(0, 0, 0, 0.1)',
      borderStrong: 'rgba(0, 0, 0, 0.15)',
      outline: 'rgba(74, 158, 255, 0.2)'
    },
    shadows: {
      outline: '0 0 0 2px rgba(74, 158, 255, 0.2)',
      panel: '0 8px 32px rgba(0, 0, 0, 0.1)'
    },
    radii: {
      sm: 4,
      md: 8
    }
  }
}

export const css = (style: React.CSSProperties): React.CSSProperties => style
