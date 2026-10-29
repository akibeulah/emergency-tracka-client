// Shared with facility-client/src/api/mock/db.ts. Keep the two files identical.
//
// The mock adapter's "database": one JSON object in localStorage, seeded on first
// run, with a small delay on every call so loading states are exercised.

import { ApiError } from '../errors';

const LATENCY_MS = 250;

export function createDb<T>(key: string, seed: () => T) {
  let data: T = load();

  function load(): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // fall through to a fresh seed
    }
    return seed();
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // storage blocked: changes last until the tab closes
    }
  }

  return {
    get data() {
      return data;
    },
    /** Run a read or a mutation after a short delay; mutations are persisted. */
    call<R>(fn: (d: T) => R): Promise<R> {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            const result = fn(data);
            save();
            // Hand back a copy so screens never mutate the mock store by accident.
            resolve(result === undefined ? result : structuredClone(result));
          } catch (e) {
            reject(e);
          }
        }, LATENCY_MS);
      });
    },
    reset() {
      data = seed();
      save();
    },
  };
}

export function rid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireFound<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new ApiError('not_found', `${what} not found.`);
  return value;
}

/** Same rule the server applies: a 6-digit code. The mock accepts any 6 digits. */
export function checkOtpShape(code: string) {
  if (!/^\d{6}$/.test(code)) throw new ApiError('validation', 'Enter the 6-digit code.');
}
