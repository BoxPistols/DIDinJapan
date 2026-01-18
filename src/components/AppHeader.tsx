/**
 * App Header Component
 * Displays app title and subtitle
 */

import React from 'react'
import styles from './AppHeader.module.css'

export interface AppHeaderProps {}

/**
 * Application header with title and subtitle
 */
export const AppHeader: React.FC<AppHeaderProps> = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>DID-J26</h1>
      <p className={styles.subtitle}>ドローン飛行計画ツール</p>
    </div>
  )
}

export default AppHeader
