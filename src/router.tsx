import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { api } from './api';
import type { ApiModule } from './api/client';
import { PUBLIC_FACILITY, type Permission, type Session } from './api/types';
import { featureBlood } from './config';
import { LoginPage } from './components/LoginPage';
import { RequireSession, useSession } from './components/auth';
import { Shell, type NavItem } from './components/Shell';
import { Banner, Empty } from './components/ui';
import { BedConfigPage } from './pages/BedConfigPage';
import { BloodInventoryPage } from './pages/BloodInventoryPage';
import { CarePackagesPage } from './pages/CarePackagesPage';
import { ClaimFacilityPage } from './pages/ClaimFacilityPage';
import { DutyRosterPage } from './pages/DutyRosterPage';
import { FacilityProfilePage } from './pages/FacilityProfilePage';
import { StaffPage } from './pages/StaffPage';

interface Section {
  path: string;
  label: string;
  icon: Extract<NavItem, { to: string }>['icon'];
  permission: Permission;
  /** The API module the page reads, for live-mode gaps (api.limits). */
  module: ApiModule;
  element: JSX.Element;
  enabled?: boolean;
}

// Each permission unlocks its page (2-4). The server enforces the same rule;
// hiding a link is not the protection.
const SECTIONS: Section[] = [
  { path: 'profile', module: 'facility', label: 'Facility Profile', icon: 'building', permission: 'facility.manage', element: <FacilityProfilePage /> },
  { path: 'beds', module: 'beds', label: 'Bed Configuration', icon: 'bed', permission: 'beds.configure', element: <BedConfigPage /> },
  { path: 'staff', module: 'staff', label: 'Staff & Permissions', icon: 'users', permission: 'staff.manage', element: <StaffPage /> },
  { path: 'roster', module: 'roster', label: 'Duty Roster', icon: 'clock', permission: 'roster.manage', element: <DutyRosterPage /> },
  { path: 'packages', module: 'pricing', label: 'Care Packages', icon: 'file', permission: 'pricing.manage', element: <CarePackagesPage /> },
  {
    path: 'blood',
    label: 'Blood Inventory',
    icon: 'drop',
    permission: 'blood.manage',
    module: 'blood',
    element: <BloodInventoryPage />,
    enabled: featureBlood,
  },
];

const isPublic = (s: Session) => s.account.facilityCode === PUBLIC_FACILITY;

function sectionsFor(s: Session): Section[] {
  if (isPublic(s)) return [];
  return SECTIONS.filter((x) => x.enabled !== false && s.account.permissions.includes(x.permission));
}

function navFor(s: Session): NavItem[] {
  const items: NavItem[] = sectionsFor(s).map((x) => ({ to: `/${x.path}`, icon: x.icon, label: x.label }));
  return [
    ...(items.length ? [{ section: 'Facility' }, ...items] : []),
    { section: 'Onboarding' },
    { to: '/claim', icon: 'shield', label: 'Claim a facility' },
  ];
}

function Console() {
  return (
    <RequireSession>
      <ConsoleFrame />
    </RequireSession>
  );
}

function ConsoleFrame() {
  const session = useSession();
  return (
    <Shell consoleName="Facility Console" nav={navFor(session)}>
      <Outlet />
    </Shell>
  );
}

function Home() {
  const session = useSession();
  const first = sectionsFor(session)[0];
  return <Navigate to={first ? `/${first.path}` : '/claim'} replace />;
}

/** Renders a section only for an account holding its permission. */
function Gate({ section }: { section: Section }) {
  const session = useSession();
  if (!sectionsFor(session).includes(section)) {
    return (
      <Empty>
        {isPublic(session)
          ? 'This page is for verified facility accounts. Switch to your facility account from the menu at the top right.'
          : "Your account at this facility does not include this page. Ask your facility administrator if you need it."}
      </Empty>
    );
  }
  // Live mode: say plainly what the server cannot do yet, or that a page shows example data.
  const gap = api.limits?.unavailable[section.module];
  if (gap) return <Empty>{gap}</Empty>;
  if (api.limits?.example.includes(section.module)) {
    return (
      <>
        <Banner tone="warning" title="Example data, not your facility's.">
          The server does not serve this page yet, so it runs on in-browser example data. Nothing here is saved to
          Emergency Tracka.
        </Banner>
        {section.element}
      </>
    );
  }
  return section.element;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <LoginPage
        consoleName="Facility Console"
        intro="Sign in with your work email. We'll send you a one-time code."
        facilityCodeHint="The 4-digit code on your facility's Verified badge. Leave it empty to claim a facility."
      />
    ),
  },
  {
    path: '/',
    element: <Console />,
    children: [
      { index: true, element: <Home /> },
      { path: 'claim', element: <ClaimFacilityPage /> },
      // Every section is routed, so a flagged-off or unpermitted page explains itself instead of a blank 404.
      ...SECTIONS.map((s) => ({
        path: s.path,
        element: s.enabled === false ? <Empty>This page is not available yet.</Empty> : <Gate section={s} />,
      })),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
