// Shared with facility-client/src/api/identity.ts. Keep the two files identical.
//
// Identity and access shapes (architecture §3, §5 users/sessions). Role and
// permission names follow server/src/common/permissions.ts, the source of truth.

export type Role =
  | 'ae_doctor'
  | 'nurse'
  | 'matron'
  | 'records_officer'
  | 'blood_bank_officer'
  | 'dispatcher'
  | 'paramedic'
  | 'driver'
  | 'facility_admin'
  | 'platform_admin'
  | 'donor';

export type Permission =
  | 'referral.send'
  | 'referral.incoming'
  | 'referral.accept'
  | 'referral.finalApprove'
  | 'handover.accept'
  | 'roster.manage'
  | 'beds.update'
  | 'beds.configure'
  | 'staff.manage'
  | 'facility.manage'
  | 'pricing.manage'
  | 'transport.manage'
  | 'blood.manage'
  | 'platform.admin';

/** Reserved facility codes. Real codes are zero-padded digits ('0142'). */
export const PUBLIC_FACILITY = 'PUBLIC';
export const PLATFORM_FACILITY = 'PLATFORM';

/** One (facilityCode, email) account. A person can hold several (2-2). */
export interface Account {
  facilityCode: string;
  displayCode: string | null; // 'ET-HOS-LAG-0142-7' badge (G4); null for PUBLIC/PLATFORM
  facilityName: string | null;
  role: Role;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
  account: Account;
  /** Every account linked to this email, including the active one (2-3). */
  accounts: Account[];
}

export interface OtpRequest {
  facilityCode?: string;
  email: string;
}

export interface OtpVerify extends OtpRequest {
  code: string;
  deviceId: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  ae_doctor: 'A&E Doctor',
  nurse: 'Nurse',
  matron: 'Matron',
  records_officer: 'Records Officer',
  blood_bank_officer: 'Blood Bank Officer',
  dispatcher: 'Dispatcher',
  paramedic: 'Paramedic',
  driver: 'Driver',
  facility_admin: 'Facility Admin',
  platform_admin: 'Platform Admin',
  donor: 'Public account',
};

export function hasPermission(session: Session | null, p: Permission): boolean {
  return !!session?.account.permissions.includes(p);
}

/** A stable id for this browser, sent with OTP verify for device binding (2-12). */
export function deviceId(): string {
  const key = 'et.deviceId';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'web-ephemeral';
  }
}
