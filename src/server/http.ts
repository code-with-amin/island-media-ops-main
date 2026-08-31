import { NextResponse } from 'next/server'
import { ApiError } from './errors'

/**
 * One place where a thrown error becomes an HTTP response, so route handlers
 * stay free of try/catch and every failure reaches the client in the same
 * shape: a summary to show, and details to list beneath it.
 */
export interface ApiErrorBody {
  error: string
  message: string
  details: string[]
}

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.code, message: error.summary, details: error.details },
      { status: error.status },
    )
  }

  // Anything unexpected is logged in full and reported without internals: a
  // stack trace is useful to us and useless, or worse, to a client.
  console.error('Unhandled API error', error)
  return NextResponse.json(
    {
      error: 'internal_error',
      message: 'Something went wrong on our side. Please try again.',
      details: [],
    },
    { status: 500 },
  )
}

/**
 * Wraps a route handler so thrown ApiErrors become their proper responses.
 *
 * Typed as Response rather than NextResponse so handlers that stream bytes —
 * serving a proof file, for instance — can use the same error handling.
 */
export function route<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('Idempotency-Key')?.trim()
  if (!key) {
    throw new ApiError('validation_failed', 'This request needs an Idempotency-Key header.', [
      'Repeating a submission without a key could create duplicate records.',
    ])
  }
  return key
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new ApiError('validation_failed', 'The request body could not be read as JSON.')
  }
}

/** Reads the required half-open date range from a query string. */
export function readRange(url: URL): { startDate: string; endDate: string } {
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')
  if (!startDate || !endDate) {
    throw new ApiError('validation_failed', 'Choose the dates you need.', [
      'Both a start date and an end date are required.',
    ])
  }
  return { startDate, endDate }
}
