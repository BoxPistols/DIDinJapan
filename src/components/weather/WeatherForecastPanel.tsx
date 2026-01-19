import { useState, useEffect } from 'react'
import {
  getPrefectureForecast,
  getWeatherDescription,
  formatHourlyTime,
  formatDailyDate,
  JAPAN_PREFECTURES,
  getAllRegions,
  getPrefecturesByRegion,
  type PrefectureWeather
} from '../../lib/services/weatherApi'

interface WeatherForecastPanelProps {
  selectedPrefectureId?: string
  onClose?: () => void
  darkMode?: boolean
}

export function WeatherForecastPanel({ selectedPrefectureId, onClose, darkMode = false }: WeatherForecastPanelProps) {
  const [prefectureId, setPrefectureId] = useState(selectedPrefectureId || 'tokyo')
  const [weather, setWeather] = useState<PrefectureWeather | null>(null)
  const [prefecture, setPrefecture] = useState<typeof JAPAN_PREFECTURES[0] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const regions = getAllRegions()

  // Dark mode color scheme - Glassmorphism style
  const colors = {
    bg: darkMode ? 'rgba(20, 20, 30, 0.75)' : 'rgba(255, 255, 255, 0.75)',
    glassBorder: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.5)',
    text: darkMode ? '#e5e5e5' : '#1f2937',
    textMuted: darkMode ? '#9ca3af' : '#6b7280',
    border: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    cardBg: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    cardBgAlt: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    todayBg: darkMode ? 'rgba(30, 58, 95, 0.7)' : 'rgba(239, 246, 255, 0.8)',
    selectBg: darkMode ? 'rgba(45, 45, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    selectBorder: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
    header: darkMode ? 'rgba(30, 64, 175, 0.9)' : 'rgba(59, 130, 246, 0.95)'
  }

  useEffect(() => {
    if (selectedPrefectureId) {
      setPrefectureId(selectedPrefectureId)
    }
  }, [selectedPrefectureId])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const result = await getPrefectureForecast(prefectureId)
        if (result) {
          setWeather(result.weather)
          setPrefecture(result.prefecture)
        } else {
          setError('データの取得に失敗しました')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '不明なエラー')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [prefectureId])

  const currentWeatherInfo = weather ? getWeatherDescription(weather.current.weatherCode) : null

  return (
    <div style={{
      position: 'absolute',
      top: '60px',
      right: '320px',
      width: '380px',
      maxHeight: 'calc(100vh - 100px)',
      backgroundColor: colors.bg,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      color: colors.text,
      borderRadius: '16px',
      border: `1px solid ${colors.glassBorder}`,
      boxShadow: darkMode
        ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
        : '0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5)',
      overflow: 'hidden',
      zIndex: 1000,
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 4px 8px 16px',
        backgroundColor: colors.header,
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>天気予報</span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '28px',
              padding: '0 8px',
              lineHeight: 1
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Prefecture Selector */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
        <select
          value={prefectureId}
          onChange={(e) => setPrefectureId(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: `1px solid ${colors.selectBorder}`,
            fontSize: '14px',
            backgroundColor: colors.selectBg,
            color: colors.text
          }}
        >
          {regions.map(region => (
            <optgroup key={region} label={region}>
              {getPrefecturesByRegion(region).map(pref => (
                <option key={pref.id} value={pref.id}>
                  {pref.name} ({pref.capital})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: colors.textMuted }}>
            読み込み中...
          </div>
        )}

        {error && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {!loading && !error && weather && prefecture && (
          <>
            {/* Current Weather */}
            <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '8px' }}>
                現在の天気 - {prefecture.capital}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '48px' }}>{currentWeatherInfo?.icon}</span>
                <div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                    {weather.current.temperature}°C
                  </div>
                  <div style={{ color: colors.textMuted }}>{currentWeatherInfo?.label}</div>
                </div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginTop: '12px',
                fontSize: '13px'
              }}>
                <div style={{ textAlign: 'center', padding: '8px', backgroundColor: colors.cardBgAlt, borderRadius: '4px' }}>
                  <div style={{ color: colors.textMuted }}>湿度</div>
                  <div style={{ fontWeight: 'bold' }}>{weather.current.humidity}%</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px', backgroundColor: colors.cardBgAlt, borderRadius: '4px' }}>
                  <div style={{ color: colors.textMuted }}>風速</div>
                  <div style={{ fontWeight: 'bold' }}>{weather.current.windSpeed} km/h</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px', backgroundColor: colors.cardBgAlt, borderRadius: '4px' }}>
                  <div style={{ color: colors.textMuted }}>降水量</div>
                  <div style={{ fontWeight: 'bold' }}>{weather.current.precipitation} mm</div>
                </div>
              </div>
            </div>

            {/* Hourly Forecast */}
            <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
                時間ごとの予報（48時間）
              </div>
              <div style={{
                display: 'flex',
                overflowX: 'auto',
                gap: '8px',
                paddingBottom: '8px'
              }}>
                {weather.hourly.slice(0, 24).map((hour, i) => {
                  const info = getWeatherDescription(hour.weatherCode)
                  return (
                    <div
                      key={i}
                      style={{
                        minWidth: '60px',
                        textAlign: 'center',
                        padding: '8px 4px',
                        backgroundColor: colors.cardBg,
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ color: colors.textMuted }}>{formatHourlyTime(hour.time)}</div>
                      <div style={{ fontSize: '20px', margin: '4px 0' }}>{info.icon}</div>
                      <div style={{ fontWeight: 'bold' }}>{hour.temperature}°</div>
                      {hour.precipitation > 0 && (
                        <div style={{ color: '#3b82f6', fontSize: '10px' }}>
                          {hour.precipitation}mm
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Daily Forecast */}
            <div style={{ padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
                週間予報
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {weather.daily.map((day, i) => {
                  const info = getWeatherDescription(day.weatherCode)
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '10px 12px',
                        backgroundColor: i === 0 ? colors.todayBg : colors.cardBg,
                        borderRadius: '6px',
                        gap: '12px'
                      }}
                    >
                      <div style={{ width: '80px', fontSize: '13px', fontWeight: i === 0 ? 'bold' : 'normal' }}>
                        {i === 0 ? '今日' : formatDailyDate(day.date)}
                      </div>
                      <div style={{ fontSize: '24px' }}>{info.icon}</div>
                      <div style={{ flex: 1, fontSize: '13px', color: colors.textMuted }}>
                        {info.label}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '13px' }}>
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{day.temperatureMax}°</span>
                        <span style={{ color: colors.textMuted }}> / </span>
                        <span style={{ color: '#3b82f6' }}>{day.temperatureMin}°</span>
                      </div>
                      {day.precipitationSum > 0 && (
                        <div style={{ width: '45px', textAlign: 'right', fontSize: '11px', color: '#3b82f6' }}>
                          {day.precipitationSum}mm
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: `1px solid ${colors.border}`,
        fontSize: '11px',
        color: colors.textMuted,
        textAlign: 'center'
      }}>
        データ提供: Open-Meteo.com (無料API)
      </div>
    </div>
  )
}

export default WeatherForecastPanel
