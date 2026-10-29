import { bedRowError, PERMISSION_CATALOG } from '../../domain';
import type { ApiClient } from '../client';
import { ApiError } from '../errors';
import type { SessionStore } from '../session';
import {
  PUBLIC_FACILITY,
  type Account,
  type CarePackage,
  type MyClaim,
  type PackageInput,
  type Permission,
  type Session,
  type StaffMember,
} from '../types';
import { checkOtpShape, createDb, nowIso, requireFound, rid } from './db';
import { seed, type MockDb, type MockUser } from './seed';

const VALID_PERMISSIONS = new Set(PERMISSION_CATALOG.map((p) => p.key));
const NEUTRAL_OTP_ERROR = 'That code is not valid or has expired. Request a new one.';

export function createMockApi(sessions: SessionStore): ApiClient {
  const db = createDb<MockDb>('et.facility.mockdb.v1', seed);

  function toAccount(d: MockDb, a: MockUser['accounts'][number]): Account {
    const f = d.facilities[a.facilityCode];
    return {
      facilityCode: a.facilityCode,
      displayCode: f?.displayCode ?? null,
      facilityName: f?.name ?? null,
      role: a.role,
      permissions: a.permissions,
    };
  }

  function sessionFor(d: MockDb, user: MockUser, code: string): Session {
    const active = user.accounts.filter((a) => a.status === 'active');
    const account = requireFound(
      active.find((a) => a.facilityCode === code),
      'Account',
    );
    return {
      accessToken: `mock.${user.id}.${code}`,
      refreshToken: `mock-refresh.${user.id}`,
      user: { id: user.id, name: user.name, email: user.email },
      account: toAccount(d, account),
      accounts: active.map((a) => toAccount(d, a)),
    };
  }

  /** The signed-in user and active facility, checked like the server's guards. */
  function ctx(d: MockDb, need?: Permission) {
    const s = sessions.get();
    if (!s) throw new ApiError('unauthorised', 'Sign in again.');
    const user = requireFound(
      d.users.find((u) => u.id === s.user.id),
      'User',
    );
    const account = user.accounts.find((a) => a.facilityCode === s.account.facilityCode && a.status === 'active');
    if (!account) throw new ApiError('unauthorised', 'This account is no longer active. Sign in again.');
    if (need && !account.permissions.includes(need)) {
      throw new ApiError('forbidden', 'You do not have permission to do this. Ask your facility administrator.');
    }
    return { user, code: account.facilityCode, account };
  }

  function facilityOnly(d: MockDb, need: Permission) {
    const c = ctx(d, need);
    if (c.code === PUBLIC_FACILITY) throw new ApiError('forbidden', 'This is for verified facility accounts.');
    return c;
  }

  function toStaff(u: MockUser, code: string): StaffMember {
    const a = u.accounts.find((x) => x.facilityCode === code)!;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: a.role,
      permissions: a.permissions,
      status: a.status,
      createdAt: a.createdAt,
    };
  }

  function checkPackage(input: PackageInput) {
    if (input.name.trim().length < 3) throw new ApiError('validation', 'Give the package a name.');
    if (!input.inclusions.trim()) throw new ApiError('validation', "Say what's included.");
    if (!Number.isInteger(input.price) || input.price <= 0) throw new ApiError('validation', 'Enter a price above ₦0.');
  }

  function findPackage(d: MockDb, code: string, id: string): CarePackage {
    return requireFound(
      (d.packages[code] ?? []).find((p) => p.id === id),
      'Package',
    );
  }

  return {
    auth: {
      requestOtp: () => db.call(() => undefined),
      verifyOtp: ({ email, facilityCode, code }) =>
        db.call((d) => {
          checkOtpShape(code);
          const key = email.trim().toLowerCase();
          const target = facilityCode?.trim() || PUBLIC_FACILITY;
          let user = d.users.find((u) => u.email === key);
          if (!user && target === PUBLIC_FACILITY) {
            // No account for this email yet: a public account, as in mobile (C3).
            user = { id: rid('u'), name: key.split('@')[0], email: key, phone: null, accounts: [] };
            d.users.push(user);
          }
          if (!user) throw new ApiError('unauthorised', NEUTRAL_OTP_ERROR);
          if (target === PUBLIC_FACILITY && !user.accounts.some((a) => a.facilityCode === PUBLIC_FACILITY)) {
            user.accounts.push({ facilityCode: PUBLIC_FACILITY, role: 'donor', permissions: [], status: 'active', createdAt: nowIso() });
          }
          if (!user.accounts.some((a) => a.facilityCode === target && a.status === 'active')) {
            throw new ApiError('unauthorised', NEUTRAL_OTP_ERROR);
          }
          return sessionFor(d, user, target);
        }),
      switchAccount: (code) =>
        db.call((d) => {
          const { user } = ctx(d);
          return sessionFor(d, user, code);
        }),
      logout: () => db.call(() => undefined),
    },

    registry: {
      search: (q) =>
        db.call((d) => {
          ctx(d);
          const s = q.trim().toLowerCase();
          if (s.length < 2) return [];
          return d.registry.filter((r) => `${r.name} ${r.area} ${r.lga}`.toLowerCase().includes(s)).slice(0, 20);
        }),
      submitClaim: (input) =>
        db.call((d) => {
          const { user } = ctx(d);
          const reg = requireFound(
            d.registry.find((r) => r.id === input.facilityId),
            'Registry record',
          );
          for (const k of ['licence', 'staff_id'] as const) {
            if (!input.documents.some((x) => x.key === k)) throw new ApiError('validation', 'Attach every required document.');
          }
          const claim: MyClaim = {
            reference: `CLM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            facilityName: reg.name,
            submittedAt: nowIso(),
            status: 'pending',
            reason: null,
          };
          d.claims.push({ ...claim, facilityId: reg.id, email: user.email });
          return claim;
        }),
      myClaims: () =>
        db.call((d) => {
          const { user } = ctx(d);
          return d.claims
            .filter((c) => c.email === user.email)
            .map(({ facilityId: _f, email: _e, ...c }) => c)
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
        }),
    },

    facility: {
      get: () =>
        db.call((d) => {
          const { code } = ctx(d);
          return requireFound(d.facilities[code], 'Facility');
        }),
      update: (input) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'facility.manage');
          const f = requireFound(d.facilities[code], 'Facility');
          if (input.profile.oxygen.reserveHrs !== null && input.profile.oxygen.reserveHrs < 0) {
            throw new ApiError('validation', 'Oxygen reserve cannot be negative.');
          }
          Object.assign(f, input, { updatedAt: nowIso() });
          return f;
        }),
    },

    beds: {
      config: () =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'beds.configure');
          return d.beds[code] ?? [];
        }),
      saveConfig: (rows) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'beds.configure');
          const current = d.beds[code] ?? [];
          for (const row of rows) {
            const existing = current.find((b) => b.category === row.category);
            const err = bedRowError(row, existing?.occupied ?? 0);
            if (err) throw new ApiError('validation', err);
          }
          d.beds[code] = rows.map((row) => {
            const existing = current.find((b) => b.category === row.category);
            return {
              category: row.category,
              maxSpaces: row.maxSpaces,
              limitedThreshold: row.limitedThreshold,
              occupied: existing?.occupied ?? 0,
              updatedAt: nowIso(),
            };
          });
          return d.beds[code];
        }),
    },

    staff: {
      list: () =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'staff.manage');
          return d.users
            .filter((u) => u.accounts.some((a) => a.facilityCode === code))
            .map((u) => toStaff(u, code))
            .sort((a, b) => a.name.localeCompare(b.name));
        }),
      invite: (input) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'staff.manage');
          const email = input.email.trim().toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('validation', 'Enter a valid email address.');
          if (!input.name.trim()) throw new ApiError('validation', 'Enter their name.');
          if (input.role === 'platform_admin' || input.role === 'donor') throw new ApiError('validation', 'Choose a staff role.');
          let user = d.users.find((u) => u.email === email);
          if (user?.accounts.some((a) => a.facilityCode === code)) {
            throw new ApiError('conflict', 'This email already has an account at this facility.');
          }
          if (!user) {
            user = { id: rid('u'), name: input.name.trim(), email, phone: input.phone.trim() || null, accounts: [] };
            d.users.push(user);
          }
          user.accounts.push({
            facilityCode: code,
            role: input.role,
            permissions: input.permissions.filter((p) => VALID_PERMISSIONS.has(p)),
            status: 'active',
            createdAt: nowIso(),
          });
          return toStaff(user, code);
        }),
      setPermissions: (id, permissions) =>
        db.call((d) => {
          const { code, user: me } = facilityOnly(d, 'staff.manage');
          const u = requireFound(
            d.users.find((x) => x.id === id && x.accounts.some((a) => a.facilityCode === code)),
            'Staff member',
          );
          if (u.id === me.id && !permissions.includes('staff.manage')) {
            throw new ApiError('validation', 'You cannot remove your own staff-management permission.');
          }
          const a = u.accounts.find((x) => x.facilityCode === code)!;
          a.permissions = permissions.filter((p) => VALID_PERMISSIONS.has(p));
          return toStaff(u, code);
        }),
      setStatus: (id, status) =>
        db.call((d) => {
          const { code, user: me } = facilityOnly(d, 'staff.manage');
          if (id === me.id) throw new ApiError('validation', 'You cannot deactivate your own account.');
          const u = requireFound(
            d.users.find((x) => x.id === id && x.accounts.some((a) => a.facilityCode === code)),
            'Staff member',
          );
          u.accounts.find((x) => x.facilityCode === code)!.status = status;
          return toStaff(u, code);
        }),
    },

    roster: {
      staff: () =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'roster.manage');
          return d.users
            .filter((u) => u.accounts.some((a) => a.facilityCode === code && a.status === 'active'))
            .map((u) => toStaff(u, code))
            .sort((a, b) => a.name.localeCompare(b.name));
        }),
      get: (weekStart) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'roster.manage');
          return (d.rosters[code] ?? []).find((r) => r.weekStart === weekStart) ?? null;
        }),
      save: (weekStart, entries) =>
        db.call((d) => {
          const { code, user } = facilityOnly(d, 'roster.manage');
          for (const e of entries) {
            if (new Date(e.onDutyTo) <= new Date(e.onDutyFrom)) throw new ApiError('validation', 'A shift must end after it starts.');
          }
          const list = (d.rosters[code] ??= []);
          const roster = { weekStart, entries, setBy: user.name, updatedAt: nowIso() };
          const i = list.findIndex((r) => r.weekStart === weekStart);
          if (i >= 0) list[i] = roster;
          else list.push(roster);
          return roster;
        }),
    },

    pricing: {
      list: () =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'pricing.manage');
          return d.packages[code] ?? [];
        }),
      create: (input) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'pricing.manage');
          checkPackage(input);
          const p: CarePackage = {
            id: rid('pk'),
            name: input.name.trim(),
            inclusions: input.inclusions.trim(),
            exclusions: input.exclusions.trim(),
            price: input.price,
            version: 1,
            status: 'draft',
            revisionOf: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            approvedBy: null,
            approvedAt: null,
          };
          (d.packages[code] ??= []).push(p);
          return p;
        }),
      update: (id, input) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'pricing.manage');
          checkPackage(input);
          const p = findPackage(d, code, id);
          if (p.status !== 'draft') throw new ApiError('conflict', 'Only drafts can be edited. Revise the approved package instead.');
          Object.assign(p, {
            name: input.name.trim(),
            inclusions: input.inclusions.trim(),
            exclusions: input.exclusions.trim(),
            price: input.price,
            updatedAt: nowIso(),
          });
          return p;
        }),
      approve: (id) =>
        db.call((d) => {
          const { code, user } = facilityOnly(d, 'facility.manage');
          const p = findPackage(d, code, id);
          if (p.status !== 'draft') throw new ApiError('conflict', 'Only drafts can be approved.');
          if (p.revisionOf) {
            const old = (d.packages[code] ?? []).find((x) => x.id === p.revisionOf);
            if (old && old.status === 'approved') Object.assign(old, { status: 'archived', updatedAt: nowIso() });
          }
          Object.assign(p, { status: 'approved', approvedBy: user.name, approvedAt: nowIso(), updatedAt: nowIso() });
          return p;
        }),
      revise: (id) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'pricing.manage');
          const p = findPackage(d, code, id);
          if (p.status !== 'approved') throw new ApiError('conflict', 'Only an approved package can be revised.');
          const open = (d.packages[code] ?? []).find((x) => x.revisionOf === p.id && x.status === 'draft');
          if (open) throw new ApiError('conflict', 'A revision of this package is already in draft.');
          const draft: CarePackage = {
            ...p,
            id: rid('pk'),
            version: p.version + 1,
            status: 'draft',
            revisionOf: p.id,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            approvedBy: null,
            approvedAt: null,
          };
          d.packages[code]!.push(draft);
          return draft;
        }),
      archive: (id) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'facility.manage');
          const p = findPackage(d, code, id);
          if (p.status !== 'approved') throw new ApiError('conflict', 'Only an approved package can be withdrawn.');
          Object.assign(p, { status: 'archived', updatedAt: nowIso() });
          return p;
        }),
      removeDraft: (id) =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'pricing.manage');
          const p = findPackage(d, code, id);
          if (p.status !== 'draft') throw new ApiError('conflict', 'Only drafts can be deleted.');
          d.packages[code] = d.packages[code]!.filter((x) => x.id !== id);
        }),
    },

    blood: {
      stock: () =>
        db.call((d) => {
          const { code } = facilityOnly(d, 'blood.manage');
          return d.blood[code] ?? [];
        }),
      update: (id, input) =>
        db.call((d) => {
          const { code, user } = facilityOnly(d, 'blood.manage');
          if (!Number.isInteger(input.units) || input.units < 0) throw new ApiError('validation', 'Units must be a whole number, 0 or more.');
          if (!Number.isInteger(input.minTarget) || input.minTarget < 0) throw new ApiError('validation', 'Minimum must be a whole number, 0 or more.');
          const row = requireFound(
            (d.blood[code] ?? []).find((b) => b.id === id),
            'Stock row',
          );
          Object.assign(row, input, { updatedAt: nowIso(), updatedBy: user.name });
          return row;
        }),
    },

    demo: {
      personas: () => [
        { name: 'Folasade Ogun', email: 'f.ogun@example.ng', facilityCode: '0142', note: 'Facility admin, Harbourview General' },
        { name: 'Matron Folake Adeyinka', email: 'f.adeyinka@example.ng', facilityCode: '0142', note: 'Matron: roster only' },
        { name: 'Chidi Eze', email: 'c.eze@example.ng', note: 'Public account: claim a facility' },
      ],
      reset: () => db.reset(),
    },
  };
}
