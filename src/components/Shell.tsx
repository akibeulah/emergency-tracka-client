// Shared with facility-client/src/components/Shell.tsx. Keep the two files identical.
//
// The console frame from the mockups: sticky top bar, left sidebar, main column.
// Below 900px the sidebar becomes a scrolling tab strip under the top bar.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { config } from '../config';
import { PLATFORM_FACILITY, PUBLIC_FACILITY, ROLE_LABEL, type Account } from '../api/identity';
import { Icon, Logo, type IconName } from './Icon';
import { useAuth, useSession } from './auth';
import { useToast } from './ui';
import { errorMessage } from '../api/errors';

export type NavItem = { to: string; icon: IconName; label: string } | { section: string };

function accountTitle(a: Account): string {
  if (a.facilityCode === PUBLIC_FACILITY) return 'Public account';
  if (a.facilityCode === PLATFORM_FACILITY) return 'Emergency Tracka platform';
  return a.facilityName ?? `Facility ${a.facilityCode}`;
}

function AccountMenu() {
  const session = useSession();
  const { switchAccount, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = session.account;
  const others = session.accounts.filter((a) => a.facilityCode !== active.facilityCode);

  async function choose(code: string) {
    setOpen(false);
    try {
      await switchAccount(code);
      navigate('/');
      toast('Switched account', 'refresh');
    } catch (e) {
      toast(errorMessage(e), 'alert');
    }
  }

  return (
    <div className="acct-menu" ref={ref}>
      <button
        type="button"
        className="acct-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="acct-menu__text">
          <span className="acct-menu__name">{accountTitle(active)}</span>
          <span className="acct-menu__sub">
            {active.displayCode ? <strong className="mono">{active.displayCode}</strong> : ROLE_LABEL[active.role]}
          </span>
        </span>
        <Icon name="chevronRight" size={14} />
      </button>
      {open && (
        <div className="menu-popover acct-menu__pop open" role="menu">
          <div className="acct-menu__who">
            <div className="bold">{session.user.name}</div>
            <div className="tiny faint">{session.user.email}</div>
          </div>
          <div className="acct-menu__label">Signed in as</div>
          <div className="acct-row acct-row--current">
            <Icon name="checkCircle" size={16} />
            <div className="acct-row__main">
              <span className="acct-row__title">{accountTitle(active)}</span>
              <span className="tiny faint">{ROLE_LABEL[active.role]}</span>
            </div>
          </div>
          {others.length > 0 && <div className="acct-menu__label">Switch to</div>}
          {others.map((a) => (
            <button type="button" role="menuitem" key={a.facilityCode} onClick={() => choose(a.facilityCode)}>
              <Icon name={a.facilityCode === PUBLIC_FACILITY ? 'user' : 'building'} size={15} />
              <span className="acct-row__main">
                <span className="acct-row__title">{accountTitle(a)}</span>
                <span className="tiny faint">
                  {ROLE_LABEL[a.role]}
                  {a.displayCode ? ` · ${a.displayCode}` : ''}
                </span>
              </span>
            </button>
          ))}
          <button type="button" role="menuitem" className="danger" onClick={() => void logout()}>
            <Icon name="logout" size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Shell({ consoleName, nav, children }: { consoleName: string; nav: NavItem[]; children: ReactNode }) {
  const link = (item: Extract<NavItem, { to: string }>) => (
    <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  );
  const links = nav.map((item) =>
    'section' in item ? (
      <div className="web-side__group" key={item.section}>
        {item.section}
      </div>
    ) : (
      link(item)
    ),
  );
  const tabs = nav.flatMap((item) => ('section' in item ? [] : [link(item)]));

  return (
    <div className="web-shell">
      <header className="web-topbar">
        <div className="web-topbar__brand">
          <span className="web-topbar__mark">
            <Logo size={28} />
          </span>
          <span>
            Emergency Tracka <span className="web-topbar__console">{consoleName}</span>
          </span>
          {config.apiMode === 'mock' && (
            <span className="pill pill-muted" title="Running against the in-browser mock adapter with example data">
              <Icon name="monitor" size={13} /> Mock mode
            </span>
          )}
        </div>
        <AccountMenu />
      </header>
      <nav className="web-tabs" aria-label="Sections">
        {tabs}
      </nav>
      <div className="web-layout">
        <nav className="web-side" aria-label="Sections">
          {links}
        </nav>
        <main className="web-main">{children}</main>
      </div>
    </div>
  );
}
