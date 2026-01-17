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
        pageBg: '#111',
        panelBg: 'rgba(30,30,40,0.95)',
        panelBgMuted: '#222',
        modalBg: '#2a2a2a',
        overlayBg: 'rgba(0,0,0,0.5)',
        buttonBg: '#333',
        buttonBgActive: '#3388ff',
        text: '#fff',
        textMuted: '#aaa',
        textSubtle: '#888',
        border: '#444',
        borderStrong: '#555',
        outline: 'rgba(0,0,0,0.1)'
      },
      shadows: {
        outline: '0 0 0 2px rgba(0,0,0,0.1)',
        panel: '2px 0 8px rgba(0,0,0,0.1)'
      },
      radii: {
        sm: 4,
        md: 8
      }
    }
  }

  return {
    colors: {
      pageBg: '#fff',
      panelBg: 'rgba(255,255,255,0.95)',
      panelBgMuted: '#f8f8f8',
      modalBg: '#fff',
      overlayBg: 'rgba(0,0,0,0.5)',
      buttonBg: '#fff',
      buttonBgActive: '#3388ff',
      text: '#333',
      textMuted: '#666',
      textSubtle: '#777',
      border: '#ddd',
      borderStrong: '#ccc',
      outline: 'rgba(0,0,0,0.1)'
    },
    shadows: {
      outline: '0 0 0 2px rgba(0,0,0,0.1)',
      panel: '2px 0 8px rgba(0,0,0,0.1)'
    },
    radii: {
      sm: 4,
      md: 8
    }
  }
}

export const css = (style: React.CSSProperties): React.CSSProperties => style
