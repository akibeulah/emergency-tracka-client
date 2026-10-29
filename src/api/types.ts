// The shapes the facility console exchanges with server/. Field names follow
// docs/emergency-tracka-architecture.md §5 in camelCase, as the server schemas
// (server/src/modules/**/schemas) store them. Where §5 is silent the shape is a
// proposal; keep this file and the server DTOs in step.

import type { Permission, Role } from './identity';

export * from './identity';

export type FacilityType = 'hospital' | 'clinic' | 'blood_bank' | 'ambulance_operator';
export type Ownership = 'general' | 'private' | 'mission' | 'other';

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  hospital: 'Hospital',
  clinic: 'Clinic / Private EM centre',
  blood_bank: 'Blood bank',
  ambulance_operator: 'Ambulance operator',
};

// ─── Registry & claim (1-1, 1-2) ─────────────────────────────────────────

/**
 * A registry search result. Deliberately neutral: it never says whether a record
 * is already claimed or verified, so a search cannot be used to probe the network.
 */
export interface RegistryHit {
  id: string;
  name: string;
  type: FacilityType;
  area: string;
  lga: string;
  address: string;
}

export type ClaimDocKey = 'licence' | 'cac' | 'staff_id' | 'capacity';

export interface ClaimSubmission {
  facilityId: string;
  legalName: string;
  licenceNumber: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  location: { lat: number; lng: number } | null;
  documents: { key: ClaimDocKey; file: File }[];
}

export interface MyClaim {
  reference: string;
  facilityName: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  /** Shown when rejected. */
  reason: string | null;
}

// ─── Facility profile (1-6) ──────────────────────────────────────────────

export interface FacilityProfile {
  facilityCode: string;
  displayCode: string;
  name: string;
  type: FacilityType;
  ownership: Ownership;
  address: string;
  lga: string;
  location: { lat: number; lng: number } | null;
  dutyPhone: string | null;
  profile: {
    departments: string[];
    oxygen: { source: string | null; reserveHrs: number | null };
    specialists: string[];
    bloodDesignation: string | null;
  };
  updatedAt: string;
}

export type ProfileUpdate = Pick<FacilityProfile, 'address' | 'dutyPhone' | 'location' | 'profile'>;

// ─── Beds (3-2; server BedCategory) ──────────────────────────────────────

export type BedCategoryName = 'icu' | 'hdu' | 'ae' | 'paeds' | 'maternity';

export const BED_CATEGORY_LABEL: Record<BedCategoryName, string> = {
  icu: 'ICU',
  hdu: 'HDU',
  ae: 'A&E',
  paeds: 'Paediatrics',
  maternity: 'Maternity',
};

export interface BedConfig {
  category: BedCategoryName;
  maxSpaces: number;
  /** 1..threshold free = Limited. Validated 0 <= threshold < max (3-2). */
  limitedThreshold: number;
  /** Set day to day from the bedspace dashboard; read-only here. */
  occupied: number;
  updatedAt: string;
}

export type BedConfigInput = Pick<BedConfig, 'category' | 'maxSpaces' | 'limitedThreshold'>;

// ─── Staff & permissions (1-9, 2-4, 2-5) ─────────────────────────────────

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  permissions: Permission[];
  status: 'active' | 'suspended' | 'deactivated';
  createdAt: string;
}

export interface InviteInput {
  name: string;
  email: string;
  phone: string;
  role: Role;
  permissions: Permission[];
}

// ─── Duty roster (2-11; server DutyRoster) ───────────────────────────────

export interface RosterEntry {
  userId: string;
  permission: Permission;
  onDutyFrom: string; // ISO
  onDutyTo: string; // ISO
}

export interface Roster {
  /** Monday 00:00 Africa/Lagos, as an ISO instant. */
  weekStart: string;
  entries: RosterEntry[];
  setBy: string | null;
  updatedAt: string | null;
}

// ─── Care packages (Epic 6; server CarePackage) ──────────────────────────

export type PackageStatus = 'draft' | 'approved' | 'archived';

export interface CarePackage {
  id: string;
  name: string;
  /** What is included, in plain words. */
  inclusions: string;
  /** What is not included (proposal: §5 has one inclusions field; 6-1 asks for both). */
  exclusions: string;
  /** Kobo. */
  price: number;
  version: number;
  status: PackageStatus;
  /** Links a revision to the approved version it will replace. */
  revisionOf: string | null;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export type PackageInput = Pick<CarePackage, 'name' | 'inclusions' | 'exclusions' | 'price'>;

// ─── Blood (Epic 10; G2 — flagged off) ───────────────────────────────────

export type BloodGroup = 'A' | 'B' | 'AB' | 'O';
export type Rh = 'pos' | 'neg';
export type BloodComponent = 'whole' | 'prbc' | 'ffp' | 'platelets';

export const BLOOD_COMPONENT_LABEL: Record<BloodComponent, string> = {
  whole: 'Whole blood',
  prbc: 'Packed red cells',
  ffp: 'Fresh frozen plasma',
  platelets: 'Platelets',
};

export interface BloodStock {
  id: string;
  group: BloodGroup;
  rh: Rh;
  component: BloodComponent;
  units: number;
  minTarget: number;
  updatedAt: string;
  updatedBy: string | null;
}
