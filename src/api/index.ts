import { config } from '../config';
import type { ApiClient, ApiModule } from './client';
import { createLiveApi } from './live';
import { createMockApi } from './mock/mockApi';
import { sessionStore } from './session';

function build(): ApiClient {
  if (config.apiMode === 'mock') return createMockApi(sessionStore);
  const live = createLiveApi(sessionStore);
  if (config.mockModules.size === 0) return live;
  // Live, with the modules the server does not serve yet answered by the mock.
  // Those pages are labelled as example data (limits.example).
  const mock = createMockApi(sessionStore);
  const mixed: ApiClient = { ...live };
  const unavailable = { ...live.limits?.unavailable };
  const example: ApiModule[] = [];
  for (const m of config.mockModules) {
    if (m in mock && m !== 'demo' && m !== 'limits') {
      const mod = m as ApiModule;
      (mixed as unknown as Record<ApiModule, unknown>)[mod] = mock[mod];
      delete unavailable[mod];
      example.push(mod);
    }
  }
  if (live.limits) {
    const onMock = (m: ApiModule) => example.includes(m);
    mixed.limits = {
      ...live.limits,
      unavailable,
      example,
      ...(onMock('registry') ? { claimDocuments: null, myClaims: null } : {}),
      ...(onMock('facility') ? { profileReadOnly: [] } : {}),
      ...(onMock('roster') ? { rosterCurrentWeekOnly: false } : {}),
      ...(onMock('auth') ? { switchNeedsSignIn: false } : {}),
    };
  }
  return mixed;
}

export const api: ApiClient = build();
