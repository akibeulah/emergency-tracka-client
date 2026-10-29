// Build-time flags. Vite inlines VITE_* variables; set them in facility-client/.env.

export type ApiMode = 'mock' | 'live';

const env = import.meta.env;

export const config = {
  appId: 'facility',
  // 'mock' runs entirely in the browser against example data. 'live' talks to server/.
  apiMode: (env.VITE_API_MODE === 'live' ? 'live' : 'mock') as ApiMode,
  apiUrl: (env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api',
  // In live mode, modules the server does not serve yet can stay on the mock,
  // e.g. VITE_MOCK_MODULES=pricing,roster. Ignored in mock mode.
  mockModules: new Set(
    String(env.VITE_MOCK_MODULES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
};

// G2: blood is built but hidden from v1. The server answers 404 while FEATURE_BLOOD is off.
export const featureBlood = env.VITE_FEATURE_BLOOD === 'true';
