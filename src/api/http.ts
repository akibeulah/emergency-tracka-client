// Shared with facility-client/src/api/http.ts. Keep the two files identical.
//
// The HTTP half of the live adapter: bearer token, one refresh on 401, typed JSON,
// and errors mapped to ApiError. Each app's live.ts builds its endpoints on this.

import { config } from '../config';
import { ApiError, kindForStatus } from './errors';
import type { SessionStore } from './session';
import type { Session } from './types';

const TIMEOUT_MS = 15_000;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Http {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  /** multipart/form-data; the browser sets the boundary. */
  upload<T>(path: string, form: FormData): Promise<T>;
}

export function createHttp(sessions: SessionStore): Http {
  let refreshing: Promise<boolean> | null = null;

  async function raw(method: Method, path: string, body?: unknown, token?: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const isForm = body instanceof FormData;
    try {
      return await fetch(`${config.apiUrl}${path}`, {
        method,
        headers: {
          ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('network', 'No connection to Emergency Tracka. Check your network and try again.');
    } finally {
      clearTimeout(timer);
    }
  }

  async function refresh(): Promise<boolean> {
    const current = sessions.get();
    if (!current) return false;
    const res = await raw('POST', '/auth/refresh', { refreshToken: current.refreshToken });
    if (!res.ok) {
      sessions.set(null);
      return false;
    }
    const tokens = (await res.json()) as Pick<Session, 'accessToken' | 'refreshToken'>;
    sessions.set({ ...current, ...tokens });
    return true;
  }

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    let res = await raw(method, path, body, sessions.get()?.accessToken);
    if (res.status === 401 && sessions.get()) {
      refreshing ??= refresh().finally(() => (refreshing = null));
      if (await refreshing) res = await raw(method, path, body, sessions.get()?.accessToken);
    }
    if (!res.ok) {
      let message = `Request failed (${res.status}).`;
      try {
        const data = await res.json();
        if (typeof data?.message === 'string') message = data.message;
        else if (Array.isArray(data?.message)) message = data.message.join(' ');
      } catch {
        // non-JSON error body
      }
      throw new ApiError(kindForStatus(res.status), message, res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b ?? {}),
    put: (p, b) => request('PUT', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
    upload: (p, form) => request('POST', p, form),
  };
}
