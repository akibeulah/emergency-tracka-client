// Shared with facility-client/src/api/session.ts. Keep the two files identical.
//
// One session holder for the API layer and the auth provider. Persisted in
// localStorage so a refresh keeps you signed in; the storage key is per app.

import { config } from '../config';
import type { Session } from './types';

export interface SessionStore {
  get(): Session | null;
  set(session: Session | null): void;
  subscribe(listener: (s: Session | null) => void): () => void;
}

const KEY = `et.${config.appId}.session`;

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let current: Session | null = load();
const listeners = new Set<(s: Session | null) => void>();

export const sessionStore: SessionStore = {
  get: () => current,
  set(session) {
    current = session;
    try {
      if (session) localStorage.setItem(KEY, JSON.stringify(session));
      else localStorage.removeItem(KEY);
    } catch {
      // private window or storage blocked: the session lives in memory only
    }
    listeners.forEach((l) => l(session));
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
