// Rules the facility console shares between pages and the mock adapter. The
// server enforces each of them too; these exist so the UI can explain them first.

import type { BedConfigInput, Permission, Role } from './api/types';

// ─── Permissions (G8, server/src/common/permissions.ts) ──────────────────

export const PERMISSION_CATALOG: { key: Permission; label: string; desc: string; group: string }[] = [
  { key: 'referral.send', label: 'Send referrals', desc: 'Start and track outbound referrals.', group: 'Referrals' },
  { key: 'referral.incoming', label: 'See incoming referrals', desc: 'View referrals offered to this facility.', group: 'Referrals' },
  {
    key: 'referral.accept',
    label: 'Accept or decline referrals',
    desc: 'Respond to an incoming referral. Without final approval, an acceptance waits for a Matron.',
    group: 'Referrals',
  },
  { key: 'referral.finalApprove', label: 'Final approval', desc: "Confirm a colleague's acceptance of a referral.", group: 'Referrals' },
  { key: 'handover.accept', label: 'Accept handover', desc: 'Receive the patient on arrival.', group: 'Referrals' },
  { key: 'beds.update', label: 'Update beds and markers', desc: 'Change bed counts, oxygen and specialist status.', group: 'Capacity' },
  { key: 'beds.configure', label: 'Configure beds', desc: 'Set maximum spaces and the Limited threshold.', group: 'Capacity' },
  { key: 'roster.manage', label: 'Manage duty roster', desc: 'Set who is on duty each week.', group: 'Administration' },
  { key: 'staff.manage', label: 'Manage staff', desc: 'Invite staff and change their permissions.', group: 'Administration' },
  { key: 'facility.manage', label: 'Manage facility profile', desc: 'Edit the profile; approve care packages.', group: 'Administration' },
  { key: 'pricing.manage', label: 'Draft care packages', desc: 'Create and edit care-package drafts.', group: 'Administration' },
  { key: 'transport.manage', label: 'Manage ambulances', desc: "Register this facility's ambulances.", group: 'Administration' },
  { key: 'blood.manage', label: 'Manage blood stock', desc: 'Update blood stock and minimum targets.', group: 'Blood' },
];

/** Defaults a new invite starts from; toggled per person afterwards (2-5). Mirrors the server. */
export const DEFAULT_ROLE_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  ae_doctor: ['referral.send', 'referral.incoming', 'referral.accept', 'referral.finalApprove', 'handover.accept', 'beds.update'],
  nurse: ['referral.send', 'referral.incoming', 'referral.accept', 'beds.update'],
  matron: [
    'referral.send',
    'referral.incoming',
    'referral.accept',
    'referral.finalApprove',
    'handover.accept',
    'roster.manage',
    'beds.update',
  ],
  records_officer: ['referral.incoming'],
  blood_bank_officer: ['blood.manage'],
  dispatcher: ['transport.manage', 'referral.incoming'],
  paramedic: ['handover.accept'],
  driver: [],
  facility_admin: ['staff.manage', 'facility.manage', 'beds.configure', 'beds.update', 'roster.manage', 'pricing.manage', 'transport.manage'],
};

export const STAFF_ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[];

/** The roster gates these actions only, never sign-in or viewing (2-11, architecture §3). */
export const ROSTER_GATED: Permission[] = ['referral.send', 'referral.accept'];

// ─── Duty-roster weeks (server/src/modules/users/roster.ts) ──────────────

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // WAT, UTC+1, no DST.
const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 in Lagos for the week containing `now`, as a UTC instant. */
export function lagosWeekStart(now: Date): Date {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday);
  return new Date(mondayLocal - LAGOS_OFFSET_MS);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** "Mon 27 Oct" for a Lagos day starting at `d`. */
export function lagosDayLabel(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

// ─── Bed configuration (3-2) ─────────────────────────────────────────────

/** Why a row cannot be saved, or null. `occupied` stops a max below today's patients. */
export function bedRowError(row: BedConfigInput, occupied: number): string | null {
  const { maxSpaces: max, limitedThreshold: thr } = row;
  if (!Number.isInteger(max) || max < 0) return 'Max spaces must be a whole number, 0 or more.';
  if (!Number.isInteger(thr) || thr < 0) return 'Threshold must be a whole number, 0 or more.';
  if (max === 0 && thr !== 0) return 'With no spaces, the threshold must be 0.';
  if (max > 0 && thr >= max) return `Threshold must be below the maximum (0 to ${max - 1}).`;
  if (max < occupied) return `${occupied} beds are occupied right now. Max spaces cannot be lower.`;
  return null;
}

// ─── Phone numbers ───────────────────────────────────────────────────────

/**
 * The server takes E.164 only ('+2348012345678'): OTPs and duty calls go to it.
 * Accepts a Nigerian local number ('0801 234 5678') or one already in E.164.
 * Returns null when it cannot be read as either.
 */
export function toE164(raw: string): string | null {
  const s = raw.trim().replace(/[\s()-]/g, '');
  if (/^\+\d{10,15}$/.test(s)) return s;
  if (/^0\d{10}$/.test(s)) return `+234${s.slice(1)}`;
  if (/^234\d{10}$/.test(s)) return `+${s}`;
  return null;
}
