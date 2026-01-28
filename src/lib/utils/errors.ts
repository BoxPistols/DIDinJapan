/**
 * Custom Error Classes for Unified Error Handling
 */

export type ErrorCode =
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'UNKNOWN'

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details
    }
  }
}

/**
 * API-specific error with status code and endpoint
 */
export class ApiError extends AppError {
  constructor(
    public statusCode: number,
    message: string,
    public endpoint: string
  ) {
    super('API_ERROR', message, { statusCode, endpoint })
    this.name = 'ApiError'
  }
}

/**
 * Network error (connection failed, timeout, etc.)
 */
export class NetworkError extends AppError {
  constructor(message: string, public endpoint?: string) {
    super('NETWORK_ERROR', message, { endpoint })
    this.name = 'NetworkError'
  }
}

/**
 * Parse error (JSON parse failed, etc.)
 */
export class ParseError extends AppError {
  constructor(message: string, public rawData?: unknown) {
    super('PARSE_ERROR', message, { rawData: String(rawData).slice(0, 100) })
    this.name = 'ParseError'
  }
}

/**
 * Validation error (invalid input, etc.)
 */
export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super('VALIDATION_ERROR', message, { field })
    this.name = 'ValidationError'
  }
}

/**
 * Normalize any error to AppError
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    // Handle fetch errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new NetworkError(error.message)
    }

    // Handle abort errors (DOMException)
    if (error.name === 'AbortError' ||
        (error instanceof DOMException && error.name === 'AbortError')) {
      return new AppError('TIMEOUT', 'Request was aborted')
    }

    return new AppError('UNKNOWN', error.message, { originalError: { name: error.name, stack: error.stack } })
  }

  // Handle non-Error objects
  if (typeof error === 'string') {
    return new AppError('UNKNOWN', error)
  }

  return new AppError('UNKNOWN', 'An unknown error occurred', { originalError: error })
}

/**
 * Check if error is a specific type
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}
