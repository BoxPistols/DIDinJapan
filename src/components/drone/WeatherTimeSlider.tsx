/**
 * WeatherTimeSlider Component
 * Time slider for weather forecast selection (5-minute intervals up to 72 hours)
 */

import React, { useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
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

  const FIVE_MINUTES_MS = 5 * 60 * 1000
  const totalSteps = Math.floor((maxTime - minTime) / FIVE_MINUTES_MS)
  const currentStep = Math.max(0, Math.min(totalSteps, Math.floor((currentTime - minTime) / FIVE_MINUTES_MS)))

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const step = parseInt(e.target.value, 10)
      const newTime = minTime + step * FIVE_MINUTES_MS
      onChange(newTime)
    },
    [minTime, onChange, FIVE_MINUTES_MS]
  )

  const handlePrevious = useCallback(() => {
    const newTime = Math.max(minTime, currentTime - FIVE_MINUTES_MS)
    onChange(newTime)
  }, [currentTime, minTime, onChange, FIVE_MINUTES_MS])

  const handleNext = useCallback(() => {
    const newTime = Math.min(maxTime, currentTime + FIVE_MINUTES_MS)
    onChange(newTime)
  }, [currentTime, maxTime, onChange, FIVE_MINUTES_MS])

  const handleReset = useCallback(() => {
    onChange(Date.now())
  }, [onChange])

  // Calculate slider percentage
  const percentage = (currentStep / totalSteps) * 100

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.timeDisplay}>
          <div className={styles.currentTime} id="weather-time-display">{formatTime(currentTime)}</div>
          <div className={styles.relativeTime}>{formatRelativeTime(currentTime)}</div>
        </div>
        <button
          className={styles.resetButton}
          onClick={handleReset}
          title="現在時刻に戻る"
          aria-label="現在時刻にリセット"
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
          aria-label="5分前の予報を表示"
        >
          <ChevronLeftIcon size={20} />
        </button>

        <div className={styles.sliderWrapper}>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={totalSteps}
            step={1}
            value={currentStep}
            onChange={handleSliderChange}
            aria-label="予報時刻の選択"
            aria-labelledby="weather-time-display"
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
          aria-label="5分後の予報を表示"
        >
          <ChevronRightIcon size={20} />
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
