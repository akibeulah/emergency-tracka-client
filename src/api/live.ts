import { config, featureBlood } from '../config';
import { lagosWeekStart, toE164 } from '../domain';
import type { ApiClient, ApiLimits } from './client';
import { ApiError, kindForStatus } from './errors';
import { createHttp } from './http';
import type { SessionStore } from './session';
import {
  PLATFORM_FACILITY,
  PUBLIC_FACILITY,
  type Account,
  type BedCategoryName,
  type BedConfig,
  type BloodStock,
  type FacilityProfile,
  type FacilityType,
  type MyClaim,
  type Ownership,
  type Permission,
  type RegistryHit,
  type Role,
  type Roster,
  type Session,
  type StaffMember,
} from './types';

// The live adapter: every method maps onto a route in server/ (server/README.md, "API")
// and converts the server's documents into the console's types. Where the server has
// no route yet, `limits` says so and the page shows that instead of example data.
// The route list is in facility-client/README.md; keep the two in step.

// ─── What the server sends (only the fields read here) ───────────────────

interface SUser {
  id: string;
  email: string;
  name: string | null;
  facilityCode: string;
  role: Role;
  permissions: Permission[];
}

interface SVerify {
  accessToken: string;
  refreshToken: string;
  user: SUser;
}

/** GET /auth/accounts. `displayCode` and `permissions` arrived later; older servers omit them. */
interface SAccount {
  facilityCode: string;
  facilityName: string | null;
  displayCode?: string | null;
  role: Role;
  permissions?: Permission[];
  current: boolean;
}

interface SFacility {
  _id: string;
  name: string;
  address?: string;
  lga?: string;
  type: FacilityType;
  ownership?: Ownership;
  location?: { lat: number; lng: number } | null;
  facilityCode?: string;
  displayCode?: string;
  dutyPhone?: string;
  profile?: {
    departments?: string[];
    oxygen?: { source?: string; reserveHrs?: number };
    specialists?: string[];
    bloodDesignation?: string;
  };
  claim?: { submittedAt?: string };
  updatedAt?: string;
}

interface SBed {
  name: BedCategoryName;
  maxSpaces: number;
  limitedThreshold: number;
  occupied: number;
  updatedAt?: string;
}

interface SStaff {
  _id: string;
  email: string;
  name?: string;
  phone?: string;
  role: Role;
  permissions: Permission[];
  status: StaffMember['status'];
  createdAt?: string;
}

interface SRoster {
  weekStart: string;
  entries: { userId: string; permission: Permission; onDutyFrom: string; onDutyTo: string }[];
  setBy?: string;
  updatedAt?: string;
}

interface SBlood {
  _id: string;
  group: BloodStock['group'];
  rh: BloodStock['rh'];
  component: BloodStock['component'];
  units: number;
  minTarget?: number;
  updatedAt?: string;
  updatedBy?: string;
}

const BED_ORDER: BedCategoryName[] = ['ae', 'icu', 'hdu', 'paeds', 'maternity'];

const PRICING_GAP =
  'Care packages are not on the server yet. Packages and prices cannot be drafted or approved until the server adds them.';

export const LIVE_LIMITS: ApiLimits = {
  unavailable: {
    pricing: PRICING_GAP,
    ...(featureBlood ? {} : { blood: 'Blood inventory is turned off for v1.' }),
  },
  example: [],
  claimDocuments:
    'Document upload is not connected to the server yet. Send your details now; the onboarding team will ask you for your facility licence and staff ID before approving.',
  myClaims: 'The server cannot list your past claims yet.',
  profileReadOnly: ['address', 'oxygenReserve', 'bloodDesignation'],
  rosterCurrentWeekOnly: true,
  switchNeedsSignIn: true,
};

// ─── Converters ──────────────────────────────────────────────────────────

const isFacilityCode = (code: string) => code !== PUBLIC_FACILITY && code !== PLATFORM_FACILITY;

function toProfile(f: SFacility): FacilityProfile {
  return {
    facilityCode: f.facilityCode ?? '',
    displayCode: f.displayCode ?? '',
    name: f.name,
    type: f.type,
    ownership: f.ownership ?? 'other',
    address: f.address ?? '',
    lga: f.lga ?? '',
    location: f.location ?? null,
    dutyPhone: f.dutyPhone ?? null,
    profile: {
      departments: f.profile?.departments ?? [],
      oxygen: { source: f.profile?.oxygen?.source ?? null, reserveHrs: f.profile?.oxygen?.reserveHrs ?? null },
      specialists: f.profile?.specialists ?? [],
      bloodDesignation: f.profile?.bloodDesignation ?? null,
    },
    updatedAt: f.updatedAt ?? '',
  };
}

function toStaff(s: SStaff): StaffMember {
  return {
    id: String(s._id),
    name: s.name || s.email,
    email: s.email,
    phone: s.phone ?? null,
    role: s.role,
    permissions: s.permissions ?? [],
    status: s.status,
    createdAt: s.createdAt ?? '',
  };
}

function toBlood(b: SBlood): BloodStock {
  return {
    id: String(b._id),
    group: b.group,
    rh: b.rh,
    component: b.component,
    units: b.units,
    minTarget: b.minTarget ?? 0,
    updatedAt: b.updatedAt ?? '',
    updatedBy: b.updatedBy ?? null,
  };
}

const invalid = (message: string) => new ApiError('validation', message, 400);

/** E.164 or a clear message: the server rejects anything else with a 400. */
function phoneOrThrow(raw: string, what: string): string {
  const phone = toE164(raw);
  if (!phone) throw invalid(`Enter ${what} in international format, e.g. +2348012345678 (or 08012345678).`);
  return phone;
}

const currentWeekIso = () => lagosWeekStart(new Date()).toISOString();

const ROSTER_WEEK_GAP =
  "The server keeps this week's roster only. Earlier and later weeks cannot be viewed or planned yet.";

export function createLiveApi(sessions: SessionStore): ApiClient {
  const http = createHttp(sessions);
  const enc = encodeURIComponent;

  // Last values read, so writes can send only what changed and errors can be explained.
  let beds = new Map<BedCategoryName, SBed>();
  let profile: FacilityProfile | null = null;
  let staffNames = new Map<string, string>();
  let blood = new Map<string, BloodStock>();

  /** A GET with a token that is not in the session store yet (building the session). */
  async function withToken<T>(token: string, path: string): Promise<T> {
    const res = await fetch(`${config.apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new ApiError(kindForStatus(res.status), `Request failed (${res.status}).`, res.status);
    return (await res.json()) as T;
  }

  async function buildSession(v: SVerify): Promise<Session> {
    const code = v.user.facilityCode;
    const [accounts, facility] = await Promise.all([
      withToken<SAccount[]>(v.accessToken, '/auth/accounts').catch(() => [] as SAccount[]),
      isFacilityCode(code) ? withToken<SFacility>(v.accessToken, '/facilities/me').catch(() => null) : Promise.resolve(null),
    ]);
    const account: Account = {
      facilityCode: code,
      displayCode: facility?.displayCode ?? accounts.find((a) => a.current)?.displayCode ?? null,
      facilityName: facility?.name ?? accounts.find((a) => a.current)?.facilityName ?? null,
      role: v.user.role,
      permissions: v.user.permissions,
    };
    const others: Account[] = accounts
      .filter((a) => a.facilityCode !== code)
      .map((a) => ({
        facilityCode: a.facilityCode,
        displayCode: a.displayCode ?? null,
        facilityName: a.facilityName,
        role: a.role,
        permissions: a.permissions ?? [],
      }));
    return {
      accessToken: v.accessToken,
      refreshToken: v.refreshToken,
      user: { id: v.user.id, name: v.user.name ?? v.user.email, email: v.user.email },
      account,
      accounts: [account, ...others],
    };
  }

  async function loadBeds(): Promise<BedConfig[]> {
    const rows = await http.get<SBed[]>('/capacity/beds');
    beds = new Map(rows.map((r) => [r.name, r]));
    // The server lists configured categories only; the rest show as "not offered" (0).
    return BED_ORDER.map((category) => {
      const r = beds.get(category);
      return {
        category,
        maxSpaces: r?.maxSpaces ?? 0,
        limitedThreshold: r?.limitedThreshold ?? 0,
        occupied: r?.occupied ?? 0,
        updatedAt: r?.updatedAt ?? '',
      };
    });
  }

  async function loadStaff(): Promise<StaffMember[]> {
    const rows = (await http.get<SStaff[]>('/staff')).map(toStaff);
    staffNames = new Map(rows.map((s) => [s.id, s.name]));
    return rows;
  }

  function toRoster(r: SRoster | null | undefined): Roster | null {
    if (!r) return null;
    return {
      weekStart: new Date(r.weekStart).toISOString(),
      entries: r.entries.map((e) => ({
        userId: String(e.userId),
        permission: e.permission,
        onDutyFrom: new Date(e.onDutyFrom).toISOString(),
        onDutyTo: new Date(e.onDutyTo).toISOString(),
      })),
      setBy: r.setBy ? staffNames.get(String(r.setBy)) ?? 'a colleague' : null,
      updatedAt: r.updatedAt ?? null,
    };
  }

  const notOnServer = (message: string) => () => Promise.reject(new ApiError('not_found', message, 404));

  return {
    limits: LIVE_LIMITS,

    auth: {
      async requestOtp(input) {
        const res = await http.post<{ message: string; devCode?: string }>('/auth/otp/request', input);
        // Only when the server runs with OTP_DEV_ECHO (local development; never in production).
        if (res?.devCode) console.info(`[dev] sign-in code for ${input.email}: ${res.devCode}`);
      },
      async verifyOtp(input) {
        return buildSession(await http.post<SVerify>('/auth/otp/verify', input));
      },
      async switchAccount(facilityCode) {
        // No server-side switch: every account needs its own code. Sign out, then open the
        // sign-in page with the account's code and email filled in.
        const email = sessions.get()?.user.email ?? '';
        try {
          await http.post('/auth/logout');
        } catch {
          // the session is being replaced either way
        }
        const params = new URLSearchParams({ switch: '1', facilityCode, email });
        window.location.assign(`/login?${params.toString()}`);
        return new Promise<Session>(() => undefined); // the page is unloading
      },
      logout: () => http.post('/auth/logout'),
    },

    registry: {
      async search(q) {
        const query = q.trim();
        if (query.length < 3) return []; // the server needs 3 characters
        const rows = await http.get<SFacility[]>(`/facilities/registry?q=${enc(query)}`);
        return rows.map(
          (r): RegistryHit => ({
            id: String(r._id),
            name: r.name,
            type: r.type,
            area: '', // the registry has no separate area; the address carries it
            lga: r.lga ?? '',
            address: r.address ?? '',
          }),
        );
      },
      async submitClaim({ facilityId, legalName, licenceNumber, contactEmail, contactPhone, location }) {
        // contactName / contactRole and the documents are not accepted by the server yet
        // (SubmitClaimDto). The claimant is the signed-in account, which the server records.
        const updated = await http.post<SFacility>(`/facilities/${enc(facilityId)}/claim`, {
          legalName: legalName.trim(),
          licenceNumber: licenceNumber.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: phoneOrThrow(contactPhone, 'the phone number'),
          ...(location ? { location } : {}),
        });
        const claim: MyClaim = {
          reference: String(updated._id),
          facilityName: updated.name,
          submittedAt: updated.claim?.submittedAt ?? new Date().toISOString(),
          status: 'pending',
          reason: null,
        };
        return claim;
      },
      // No route lists a person's claims yet (LIVE_LIMITS.myClaims).
      myClaims: async () => [],
    },

    facility: {
      async get() {
        profile = toProfile(await http.get<SFacility>('/facilities/me'));
        return profile;
      },
      async update(input) {
        const before = profile;
        const body: Record<string, unknown> = {
          departments: input.profile.departments,
          specialists: input.profile.specialists,
        };
        if (input.profile.oxygen.source) body.oxygenSource = input.profile.oxygen.source;
        if (input.dutyPhone?.trim()) body.dutyPhone = phoneOrThrow(input.dutyPhone, 'the duty phone');
        else if (before?.dutyPhone) throw invalid('The duty phone cannot be cleared. Enter the number senders should call.');
        if (input.location) body.location = input.location;
        const saved = toProfile(await http.patch<SFacility>('/facilities/me/profile', body));
        profile = saved;
        return saved;
      },
    },

    beds: {
      config: loadBeds,
      async saveConfig(input) {
        if (!beds.size) await loadBeds();
        const changed = input.filter((row) => {
          const prev = beds.get(row.category);
          return (prev?.maxSpaces ?? 0) !== row.maxSpaces || (prev?.limitedThreshold ?? 0) !== row.limitedThreshold;
        });
        // Checked before any write, so a save is all or nothing.
        for (const row of changed) {
          if (row.maxSpaces === 0 && beds.has(row.category)) {
            throw invalid('A bed category cannot be turned off yet. Keep at least 1 space, or ask the platform team to remove it.');
          }
        }
        for (const row of changed) {
          if (row.maxSpaces === 0) continue; // was never offered: nothing to save
          await http.put(`/capacity/beds/${enc(row.category)}`, {
            maxSpaces: row.maxSpaces,
            limitedThreshold: row.limitedThreshold,
          });
        }
        return loadBeds();
      },
    },

    staff: {
      list: loadStaff,
      async invite({ name, email, phone, role, permissions }) {
        if (!phone.trim()) throw invalid('Enter a mobile number: sign-in codes are sent to it by SMS.');
        const created = await http.post<SStaff>('/staff', {
          email: email.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
          role,
          phone: phoneOrThrow(phone, 'the mobile number'),
          permissions,
        });
        return toStaff(created);
      },
      async setPermissions(id, permissions) {
        return toStaff(await http.patch<SStaff>(`/staff/${enc(id)}/permissions`, { permissions }));
      },
      async setStatus(id, status) {
        return toStaff(await http.patch<SStaff>(`/staff/${enc(id)}/status`, { status }));
      },
    },

    roster: {
      // The server lists staff under staff.manage only; a Matron with roster.manage alone gets a 403.
      async staff() {
        try {
          return await loadStaff();
        } catch (e) {
          if (e instanceof ApiError && e.kind === 'forbidden') {
            throw new ApiError(
              'forbidden',
              'Building the roster needs the staff list, which the server only shows to accounts that can manage staff. Ask your facility administrator.',
              403,
            );
          }
          throw e;
        }
      },
      async get(weekStart) {
        if (weekStart !== currentWeekIso()) throw invalid(ROSTER_WEEK_GAP);
        const roster = await http.get<SRoster | undefined>('/rosters/current');
        // For "Saved by <name>": setBy is a user id. Best effort; a Matron may not see the staff list.
        if (roster?.setBy && !staffNames.has(String(roster.setBy))) await loadStaff().catch(() => undefined);
        return toRoster(roster);
      },
      async save(weekStart, entries) {
        if (weekStart !== currentWeekIso()) throw invalid(ROSTER_WEEK_GAP);
        const saved = toRoster(await http.put<SRoster>('/rosters/current', { entries }));
        if (!saved) throw new ApiError('server', 'The roster was not saved. Try again.');
        return saved;
      },
    },

    // No routes on the server (care-package schema only). LIVE_LIMITS hides the page.
    pricing: {
      list: notOnServer(PRICING_GAP),
      create: notOnServer(PRICING_GAP),
      update: notOnServer(PRICING_GAP),
      approve: notOnServer(PRICING_GAP),
      revise: notOnServer(PRICING_GAP),
      archive: notOnServer(PRICING_GAP),
      removeDraft: notOnServer(PRICING_GAP),
    },

    // 404 while the server's FEATURE_BLOOD is off.
    blood: {
      async stock() {
        const rows = (await http.get<SBlood[]>('/blood/stock')).map(toBlood);
        blood = new Map(rows.map((r) => [r.id, r]));
        return rows;
      },
      async update(id, { units, minTarget }) {
        const row = blood.get(id);
        if (!row) throw new ApiError('not_found', 'Reload the page: that stock row is no longer listed.', 404);
        const saved = await http.put<SBlood>('/blood/stock', {
          group: row.group,
          rh: row.rh,
          component: row.component,
          units,
          minTarget,
        });
        const out = toBlood(saved);
        blood.set(out.id, out);
        return out;
      },
    },
  };
}
