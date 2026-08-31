/**
 * Errors that carry the HTTP status the API should return, so services can
 * reject work without knowing anything about Next or Response objects.
 */
export type ApiErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'service_unavailable'

const STATUS: Record<ApiErrorCode, number> = {
  validation_failed: 422,
  not_found: 404,
  conflict: 409,
  forbidden: 403,
  service_unavailable: 503,
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  /** The headline, shown to a user on its own line. */
  readonly summary: string
  /** Specific causes, shown beneath the summary and used for form display. */
  readonly details: string[]

  constructor(code: ApiErrorCode, summary: string, details: string[] = []) {
    // The Error message carries the causes too. An error that reaches a log
    // saying only "That update could not be saved." has thrown away the one
    // thing the reader needs.
    super(details.length > 0 ? `${summary} ${details.join(' ')}` : summary)
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS[code]
    this.summary = summary
    this.details = details
  }
}

export const validationError = (message: string, details: string[] = []) =>
  new ApiError('validation_failed', message, details)

export const notFound = (message = 'Not found.') => new ApiError('not_found', message)

export const conflict = (message: string, details: string[] = []) =>
  new ApiError('conflict', message, details)
