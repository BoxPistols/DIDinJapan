import React from 'react'
import { DocsContainer } from '@storybook/blocks'
import { themes } from '@storybook/theming'

// localStorage からテーマを取得（ブラウザ環境でのみ）
let initialTheme = 'dark'
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  try {
    initialTheme = localStorage.getItem('storybook-theme') || 'dark'
  } catch {
    initialTheme = 'dark'
  }
}

const preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Storybook docs theme',
      defaultValue: initialTheme,
      toolbar: {
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' }
        ],
        showName: true
      }
    }
  },
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
            title: value?.title ?? '',
            name: value?.name ?? ''
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
      container: (props) => {
        const globals = props?.context?.globals ?? {}
        const themeName = globals.theme ?? 'dark'
        const theme = themeName === 'dark' ? themes.dark : themes.light
        return React.createElement(DocsContainer, { ...props, theme })
      }
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0f172a' },
        { name: 'light', value: '#ffffff' }
      ]
    }
  }
}

// テーマに応じてバックグラウンドを動的に設定し、localStorage に保存
const withThemeBackground = (StoryFn, context) => {
  const themeName = context.globals.theme ?? 'dark'
  const bgColor = themeName === 'dark' ? '#0f172a' : '#ffffff'
  
  // テーマが変更されたときに localStorage に保存
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('storybook-theme', themeName)
      // ドキュメントの背景色も更新
      document.documentElement.style.colorScheme = themeName
    }
  }, [themeName])
  
  return React.createElement(
    'div',
    { style: { backgroundColor: bgColor, padding: '1rem', minHeight: '100vh' } },
    React.createElement(StoryFn)
  )
}

preview.decorators = [withThemeBackground]

export default preview
