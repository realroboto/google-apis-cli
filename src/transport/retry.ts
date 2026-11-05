// Retry policy shared by Transport and the resumable upload (Google client idioms, #194).
import { GapiError } from '../errors.ts';
import type { FetchResponse } from '../types.ts';

export type Sleep = (ms: number) => Promise<unknown>;

// The request never got an HTTP answer (DNS, reset, timeout): exit 1, like a Google error.
export class NetworkError extends GapiError {}

// Google's retry rule: 408, 429, 5xx, and a 403 for a rate limit (google-api-python-client).
export const RETRIES = 3;
export const retryable = (status: number, text = ''): boolean =>
  status === 408 ||
  status === 429 ||
  status >= 500 ||
  (status === 403 && /"reason":\s*"(user)?[rR]ateLimitExceeded"/.test(text));
// Truncated exponential backoff with jitter: min(32 s, 1 s × 2^n + 0–1 s), Google's docs.
export const backoff = (attempt: number): number =>
  Math.min(32_000, 1000 * 2 ** attempt + Math.random() * 1000);
// Our choice, no Google client reads it: `Retry-After` (seconds or HTTP date) is a floor.
export const retryAfter = (res: FetchResponse): number => {
  const v = res.headers.get('Retry-After');
  if (!v) return 0;
  const ms = /^\d+$/.test(v) ? Number(v) * 1000 : Date.parse(v) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
};
