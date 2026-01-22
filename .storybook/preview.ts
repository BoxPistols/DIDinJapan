import React from 'react'
import { DocsContainer } from '@storybook/blocks'
import { SET_GLOBALS, GLOBALS_UPDATED } from '@storybook/core-events'
import { addons } from '@storybook/preview-api'
import { themes } from '@storybook/theming'

/** @typedef {'light' | 'dark'} ThemeName */

const THEME_STORAGE_KEY = 'storybook-docs-theme'

const isRecord = (value) => typeof value === 'object' && value !== null

const isThemeName = (value) => value === 'light' || value === 'dark'

const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeName(stored) ? stored : 'light'
  } catch (error) {
    return 'light'
  }
}

const persistTheme = (themeName) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeName)
  } catch (error) {
    // ignore
  }
}

let lastThemeName = readStoredTheme()

const getThemeName = (globals) => {
  if (!isRecord(globals)) {
    return lastThemeName
  }
  const themeValue = globals.theme
  if (isThemeName(themeValue)) {
    lastThemeName = themeValue
    persistTheme(themeValue)
    return themeValue
  }
  return lastThemeName
}

const ThemedDocsContainer = (props) => {
  const initialTheme = getThemeName(props?.context?.globals)
  const [themeName, setThemeName] = React.useState(initialTheme)

  React.useEffect(() => {
    const nextTheme = getThemeName(props?.context?.globals)
    setThemeName(nextTheme)
  }, [props?.context?.globals])

  React.useEffect(() => {
    let channel
    try {
      channel = addons.getChannel()
    } catch (error) {
      return undefined
    }

    const handleGlobals = (payload) => {
      const globals = payload?.globals
      const nextTheme = getThemeName(globals)
      setThemeName(nextTheme)
    }

    channel.on(SET_GLOBALS, handleGlobals)
    channel.on(GLOBALS_UPDATED, handleGlobals)

    return () => {
      channel.off(SET_GLOBALS, handleGlobals)
      channel.off(GLOBALS_UPDATED, handleGlobals)
    }
  }, [])

  const theme = themeName === 'dark' ? themes.dark : themes.light
  return React.createElement(DocsContainer, { ...props, theme })
}

const withThemeDecorator = (Story, context) => {
  const theme = getThemeName(context.globals)
  const isDark = theme === 'dark'
  
  return React.createElement('div', {
    style: {
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      color: isDark ? '#ffffff' : '#1a1a1a',
      minHeight: '100vh', // Ensure full background coverage
      padding: '1rem',
      boxSizing: 'border-box',
      transition: 'background-color 0.3s, color 0.3s'
    }
  }, React.createElement(Story))
}

const preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Storybook UI theme',
      defaultValue: lastThemeName,
      toolbar: {
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' }
        ],
        showName: true
      }
    }
  },
  decorators: [withThemeDecorator],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      },
      sort: 'requiredFirst'
    },
    options: {
      storySort: (a, b) => {
        const toComparable = (entry) => {
          const value = Array.isArray(entry) ? entry[1] : entry
          return {
            title: typeof value.title === 'string' ? value.title : '',
            name: typeof value.name === 'string' ? value.name : ''
          }
        }
        const left = toComparable(a)
        const right = toComparable(b)
        const titleComparison = left.title.localeCompare(right.title, 'ja', { numeric: true })
        if (titleComparison !== 0) {
          return titleComparison
        }
        return left.name.localeCompare(right.name, 'ja', { numeric: true })
      }
    },
    docs: {
      toc: {
        headingSelector: 'h2, h3',
        title: 'Contents'
      },
      container: ThemedDocsContainer
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0f172a' }
      ]
    }
  }
}

export default preview