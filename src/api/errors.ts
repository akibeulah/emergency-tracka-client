// Shared with facility-client/src/api/errors.ts and mobile/src/api/errors.ts. Keep in step.

export type ApiErrorKind =
  | 'network' // no connection / timed out
  | 'unauthorised'
  | 'forbidden'
  | 'conflict' // e.g. this admin already approved; a second admin must
  | 'validation'
  | 'not_found'
  | 'server';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Try again.';
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorised';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  return 'server';
}
