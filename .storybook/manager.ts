import { addons } from '@storybook/manager-api'
import { GLOBALS_UPDATED, SET_GLOBALS } from '@storybook/core-events'
import { themes } from '@storybook/theming'

const channel = addons.getChannel()

const applyTheme = (themeName: string) => {
  const theme = themeName === 'dark' ? themes.dark : themes.light
  addons.setConfig({ theme })
  
  // テーマを localStorage に保存
  try {
    localStorage.setItem('storybook-theme', themeName)
  } catch {
    // localStorage が使用不可の場合は無視
  }
}

// 初期テーマを設定（preview.ts と同期）
try {
  const savedTheme = localStorage.getItem('storybook-theme') || 'dark'
  applyTheme(savedTheme)
} catch {
  applyTheme('dark')
}

// テーマ変更を監視
channel.on(SET_GLOBALS, (payload) => {
  const themeName = payload?.globals?.theme
  if (themeName) {
    applyTheme(themeName)
  }
})

channel.on(GLOBALS_UPDATED, (payload) => {
  const themeName = payload?.globals?.theme
  if (themeName) {
    applyTheme(themeName)
  }
})
