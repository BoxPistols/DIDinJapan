/**
 * Unified Logger for Application
 *
 * Provides consistent logging format across the application
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogOptions {
  context?: string
  details?: unknown
}

const formatTimestamp = () => new Date().toISOString()

const formatMessage = (level: LogLevel, message: string, options?: LogOptions): string => {
  const parts = [
    `[${formatTimestamp()}]`,
    `[${level.toUpperCase()}]`
  ]

  if (options?.context) {
    parts.push(`[${options.context}]`)
  }

  parts.push(message)

  return parts.join(' ')
}

/**
 * Logger object with consistent formatting
 */
export const logger = {
  /**
   * Debug level logging (only in development)
   */
  debug: (message: string, options?: LogOptions) => {
    // Use optional chaining to safely access import.meta.env for library builds
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      console.debug(formatMessage('debug', message, options), options?.details ?? '')
    }
  },

  /**
   * Info level logging
   */
  info: (message: string, options?: LogOptions) => {
    console.info(formatMessage('info', message, options), options?.details ?? '')
  },

  /**
   * Warning level logging
   */
  warn: (message: string, options?: LogOptions) => {
    console.warn(formatMessage('warn', message, options), options?.details ?? '')
  },

  /**
   * Error level logging
   */
  error: (message: string, error?: unknown, options?: LogOptions) => {
    const formattedMessage = formatMessage('error', message, options)

    if (error instanceof Error) {
      const errorInfo: Record<string, unknown> = {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
      if (options?.details && typeof options.details === 'object') {
        Object.assign(errorInfo, options.details)
      }
      console.error(formattedMessage, errorInfo)
    } else if (error !== undefined) {
      console.error(formattedMessage, error, options?.details ?? '')
    } else {
      console.error(formattedMessage, options?.details ?? '')
    }
  },

  /**
   * Log API request/response
   */
  api: {
    request: (method: string, url: string) => {
      logger.debug(`${method} ${url}`, { context: 'API' })
    },
    success: (method: string, url: string, duration?: number) => {
      const durationStr = duration !== undefined ? ` (${duration}ms)` : ''
      logger.debug(`${method} ${url} - OK${durationStr}`, { context: 'API' })
    },
    error: (method: string, url: string, statusCode: number, error?: unknown) => {
      logger.error(`${method} ${url} - ${statusCode}`, error, { context: 'API' })
    }
  },

  /**
   * Log with context
   */
  withContext: (context: string) => ({
    debug: (message: string, details?: unknown) =>
      logger.debug(message, { context, details }),
    info: (message: string, details?: unknown) =>
      logger.info(message, { context, details }),
    warn: (message: string, details?: unknown) =>
      logger.warn(message, { context, details }),
    error: (message: string, error?: unknown, details?: unknown) =>
      logger.error(message, error, { context, details })
  })
}

// Convenience exports for common contexts
export const mapLogger = logger.withContext('Map')
export const layerLogger = logger.withContext('Layer')
export const searchLogger = logger.withContext('Search')
export const weatherLogger = logger.withContext('Weather')
