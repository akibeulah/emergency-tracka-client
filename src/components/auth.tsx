// Shared with facility-client/src/components/auth.tsx. Keep the two files identical.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { sessionStore } from '../api/session';
import { deviceId, type OtpRequest, type Session } from '../api/identity';

interface AuthValue {
  session: Session | null;
  requestOtp(input: OtpRequest): Promise<void>;
  verifyOtp(input: OtpRequest & { code: string }): Promise<Session>;
  switchAccount(facilityCode: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(sessionStore.get());
  useEffect(() => sessionStore.subscribe(setSession), []);

  const value: AuthValue = {
    session,
    requestOtp: (input) => api.auth.requestOtp(input),
    async verifyOtp(input) {
      const s = await api.auth.verifyOtp({ ...input, deviceId: deviceId() });
      sessionStore.set(s);
      return s;
    },
    async switchAccount(facilityCode) {
      sessionStore.set(await api.auth.switchAccount(facilityCode));
    },
    async logout() {
      try {
        await api.auth.logout();
      } finally {
        sessionStore.set(null);
      }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The session, asserted present. Only use under <RequireSession>. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('useSession without a session');
  return session;
}

export function RequireSession({ children, allow }: { children: ReactNode; allow?: (s: Session) => boolean }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (allow && !allow(session)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
