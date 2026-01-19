/**
 * WeatherTimeSlider Component
 * Time slider for weather forecast selection (5-minute intervals up to 72 hours)
 */

import React, { useCallback } from 'react'
import styles from './WeatherTimeSlider.module.css'

export interface WeatherTimeSliderProps {
  /** Current selected time (Unix timestamp in milliseconds) */
  currentTime: number
  /** Callback when time changes */
  onChange: (time: number) => void
  /** Minimum time (Unix timestamp in milliseconds) */
  minTime: number
  /** Maximum time (Unix timestamp in milliseconds) */
  maxTime: number
}

/**
 * Weather Time Slider Component
 * Allows selection of forecast time in 5-minute intervals
 *
 * @example
 * ```tsx
 * <WeatherTimeSlider
 *   currentTime={Date.now()}
 *   onChange={(time) => console.log(new Date(time))}
 *   minTime={Date.now()}
 *   maxTime={Date.now() + 72 * 60 * 60 * 1000}
 * />
 * ```
 */
export const WeatherTimeSlider: React.FC<WeatherTimeSliderProps> = ({
  currentTime,
  onChange,
  minTime,
  maxTime
}) => {
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatRelativeTime = (timestamp: number): string => {
    const diffMs = timestamp - Date.now()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffHours === 0 && diffMinutes < 5) {
      return '現在'
    }

    if (diffHours === 0) {
      return `+${diffMinutes}分`
    }

    return `+${diffHours}時間`
  }

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10)
      onChange(value)
    },
    [onChange]
  )

  const handlePrevious = useCallback(() => {
    const fiveMinutes = 5 * 60 * 1000
    const newTime = Math.max(minTime, currentTime - fiveMinutes)
    onChange(newTime)
  }, [currentTime, minTime, onChange])

  const handleNext = useCallback(() => {
    const fiveMinutes = 5 * 60 * 1000
    const newTime = Math.min(maxTime, currentTime + fiveMinutes)
    onChange(newTime)
  }, [currentTime, maxTime, onChange])

  const handleReset = useCallback(() => {
    onChange(Date.now())
  }, [onChange])

  // Calculate slider percentage
  const percentage = ((currentTime - minTime) / (maxTime - minTime)) * 100

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.timeDisplay}>
          <div className={styles.currentTime}>{formatTime(currentTime)}</div>
          <div className={styles.relativeTime}>{formatRelativeTime(currentTime)}</div>
        </div>
        <button
          className={styles.resetButton}
          onClick={handleReset}
          title="現在時刻に戻る"
        >
          現在
        </button>
      </div>

      <div className={styles.controls}>
        <button
          className={styles.navButton}
          onClick={handlePrevious}
          disabled={currentTime <= minTime}
          title="5分前"
        >
          ◀
        </button>

        <div className={styles.sliderWrapper}>
          <input
            type="range"
            className={styles.slider}
            min={minTime}
            max={maxTime}
            step={5 * 60 * 1000} // 5 minutes in milliseconds
            value={currentTime}
            onChange={handleSliderChange}
          />
          <div className={styles.sliderProgress} style={{ width: `${percentage}%` }} />
          <div className={styles.sliderTicks}>
            {Array.from({ length: 73 }, (_, i) => (
              <div
                key={i}
                className={`${styles.tick} ${i % 6 === 0 ? styles.majorTick : ''}`}
                style={{ left: `${(i / 72) * 100}%` }}
              >
                {i % 12 === 0 && (
                  <span className={styles.tickLabel}>{i}h</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          className={styles.navButton}
          onClick={handleNext}
          disabled={currentTime >= maxTime}
          title="5分後"
        >
          ▶
        </button>
      </div>

      <div className={styles.range}>
        <span className={styles.rangeLabel}>{formatTime(minTime)}</span>
        <span className={styles.rangeLabel}>{formatTime(maxTime)}</span>
      </div>
    </div>
  )
}

export default WeatherTimeSlider
