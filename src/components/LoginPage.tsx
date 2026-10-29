// Shared with facility-client/src/components/LoginPage.tsx. Keep the two files identical.
//
// Passwordless sign-in (2-1, architecture §3): email (+ facility code where the
// console takes one) → 6-digit code. The request step always answers the same
// way, so the page never reveals whether an account exists.

import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { errorMessage } from '../api/errors';
import { sessionStore } from '../api/session';
import { config } from '../config';
import { Icon, Logo } from './Icon';
import { useAuth } from './auth';
import { Banner } from './ui';

export interface LoginProps {
  consoleName: string;
  intro: string;
  /** Fixed for the platform console ('PLATFORM'); otherwise the user may type one. */
  fixedFacilityCode?: string;
  facilityCodeHint?: string;
}

export function LoginPage({ consoleName, intro, fixedFacilityCode, facilityCodeHint }: LoginProps) {
  const { session, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // `?switch=1&facilityCode=&email=`: opened from the account menu when the server has no
  // account switch (live mode). The old session is already revoked; drop the local copy.
  const [prefill] = useState(() => new URLSearchParams(location.search));
  const switching = prefill.get('switch') === '1';
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [email, setEmail] = useState(prefill.get('email') ?? '');
  const [facilityCode, setFacilityCode] = useState(prefill.get('facilityCode') ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (switching && sessionStore.get()) sessionStore.set(null);
  }, [switching]);

  if (session && !switching) return <Navigate to="/" replace />;

  const target = fixedFacilityCode ?? (facilityCode.trim() || undefined);
  const personas = api.demo?.personas() ?? [];

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address you use for Emergency Tracka.');
      return;
    }
    setBusy(true);
    try {
      await requestOtp({ email: email.trim(), facilityCode: target });
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyOtp({ email: email.trim(), facilityCode: target, code: code.trim() });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card web-panel">
        <div className="row" style={{ gap: 10, marginBottom: 18 }}>
          <Logo size={34} />
          <div>
            <div className="login-brand">Emergency Tracka</div>
            <div className="tiny faint">{consoleName}</div>
          </div>
        </div>

        {step === 'details' ? (
          <form onSubmit={submitDetails} noValidate>
            <h1 className="login-title">Sign in</h1>
            <p className="web-panel__sub">{intro}</p>
            {switching && (
              <Banner tone="info" title="Sign in to the other account.">
                Each account needs its own one-time code. We have filled in its facility code and email.
              </Banner>
            )}
            {!fixedFacilityCode && (
              <div className="field">
                <label htmlFor="login-code">
                  Facility code <span className="faint">(optional)</span>
                </label>
                <input
                  id="login-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 0142"
                  value={facilityCode}
                  onChange={(e) => setFacilityCode(e.target.value)}
                />
                {facilityCodeHint && <div className="hint">{facilityCodeHint}</div>}
              </div>
            )}
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            {error && <Banner tone="danger">{error}</Banner>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} noValidate>
            <h1 className="login-title">Enter your code</h1>
            <p className="web-panel__sub">
              If <strong>{email.trim()}</strong> has an account{target ? ` at facility ${target}` : ''}, a 6-digit code
              is on its way. It expires in 5 minutes.
            </p>
            <div className="field">
              <label htmlFor="login-otp">6-digit code</label>
              <input
                id="login-otp"
                className="otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>
            {config.apiMode === 'mock' && (
              <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
                Mock mode: any 6 digits work, e.g. 123456.
              </div>
            )}
            {error && <Banner tone="danger">{error}</Banner>}
            <button className="btn btn-primary" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn btn-ghost mt-8"
              onClick={() => {
                setStep('details');
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>

      {personas.length > 0 && step === 'details' && (
        <div className="login-card web-panel login-demo">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong className="small">Mock mode: example accounts</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                api.demo?.reset();
                window.location.reload();
              }}
            >
              <Icon name="refresh" size={14} /> Reset example data
            </button>
          </div>
          {personas.map((p) => (
            <button
              type="button"
              key={`${p.email}-${p.facilityCode ?? ''}`}
              className="login-persona"
              onClick={() => {
                setEmail(p.email);
                setFacilityCode(p.facilityCode ?? '');
              }}
            >
              <span className="bold">{p.name}</span>
              <span className="tiny faint">
                {p.email}
                {p.facilityCode ? ` · code ${p.facilityCode}` : ''} · {p.note}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
