/**
 * App Header Component
 * Displays app title and subtitle
 */

import React from 'react'
import styles from './AppHeader.module.css'

export interface AppHeaderProps {
  darkMode: boolean
}

/**
 * Application header with title and subtitle
 */
export const AppHeader: React.FC<AppHeaderProps> = ({ darkMode }) => {
  return (
    <div className={styles.container}>
      <h1 
        className={styles.title}
        style={{ color: darkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.87)' }}
      >
        DID-J26
      </h1>
      <p 
        className={styles.subtitle}
        style={{ color: darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.54)' }}
      >
        ドローン飛行計画ツール
      </p>
    </div>
  )
}

export default AppHeader
