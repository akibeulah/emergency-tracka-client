// Example data for the mock adapter. Every facility, person and email here is
// fictional. Codes, names and staff match mobile/src/api/mock/seed.ts and the
// admin-client mock so the demo reads as one network. No real facility is named.

import { DEFAULT_ROLE_PERMISSIONS } from '../../domain';
import type {
  BedConfig,
  BloodComponent,
  BloodGroup,
  BloodStock,
  CarePackage,
  FacilityProfile,
  MyClaim,
  Permission,
  RegistryHit,
  Role,
  Roster,
  StaffMember,
} from '../types';

export interface MockAccount {
  facilityCode: string;
  role: Role;
  permissions: Permission[];
  status: StaffMember['status'];
  createdAt: string;
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  accounts: MockAccount[];
}

export interface MockClaim extends MyClaim {
  facilityId: string;
  email: string;
}

export interface MockDb {
  users: MockUser[];
  registry: RegistryHit[];
  facilities: Record<string, FacilityProfile>;
  beds: Record<string, BedConfig[]>;
  packages: Record<string, CarePackage[]>;
  rosters: Record<string, Roster[]>;
  blood: Record<string, BloodStock[]>;
  claims: MockClaim[];
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const acct = (facilityCode: string, role: Role, extra: Partial<MockAccount> = {}): MockAccount => ({
  facilityCode,
  role,
  permissions: [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])],
  status: 'active',
  createdAt: daysAgo(30),
  ...extra,
});

function bloodStock(): BloodStock[] {
  const groups: [BloodGroup, 'pos' | 'neg'][] = [
    ['O', 'pos'], ['O', 'neg'], ['A', 'pos'], ['A', 'neg'], ['B', 'pos'], ['B', 'neg'], ['AB', 'pos'], ['AB', 'neg'],
  ];
  const components: BloodComponent[] = ['whole', 'prbc', 'ffp', 'platelets'];
  let n = 0;
  return groups.flatMap(([group, rh]) =>
    components.map((component) => {
      n += 1;
      const common = rh === 'pos' && (group === 'O' || group === 'A' || group === 'B');
      const minTarget = common ? 6 : 2;
      return {
        id: `bs-${n}`,
        group,
        rh,
        component,
        units: (n * 7) % (minTarget * 2 + 1),
        minTarget,
        updatedAt: daysAgo(0.1),
        updatedBy: 'Example officer',
      };
    }),
  );
}

export function seed(): MockDb {
  const users: MockUser[] = [
    {
      id: 'u-ogun',
      name: 'Folasade Ogun',
      email: 'f.ogun@example.ng',
      phone: '0800 000 1001',
      accounts: [acct('0142', 'facility_admin'), acct('PUBLIC', 'donor')],
    },
    {
      id: 'u-fashola',
      name: 'Dr. Adeleke Fashola',
      email: 'a.fashola@example.ng',
      phone: '0800 000 1002',
      accounts: [acct('0142', 'ae_doctor'), acct('0187', 'ae_doctor'), acct('PUBLIC', 'donor')],
    },
    { id: 'u-okoro', name: 'Nurse Grace Okoro', email: 'g.okoro@example.ng', phone: null, accounts: [acct('0142', 'nurse')] },
    { id: 's-lawal', name: 'Nurse Bisi Lawal', email: 'b.lawal@example.ng', phone: null, accounts: [acct('0142', 'nurse')] },
    {
      id: 's-adesanya',
      name: 'Nurse Kemi Adesanya',
      email: 'k.adesanya@example.ng',
      phone: null,
      accounts: [acct('0142', 'nurse', { permissions: ['referral.incoming', 'beds.update'] })],
    },
    {
      id: 'u-adeyinka',
      name: 'Matron Folake Adeyinka',
      email: 'f.adeyinka@example.ng',
      phone: null,
      accounts: [acct('0142', 'matron')],
    },
    {
      id: 's-bello',
      name: 'Tunde Bello',
      email: 't.bello@example.ng',
      phone: null,
      accounts: [acct('0142', 'records_officer', { status: 'deactivated' })],
    },
    { id: 'u-eze', name: 'Chidi Eze', email: 'c.eze@example.ng', phone: null, accounts: [acct('PUBLIC', 'donor')] },
  ];

  const registry: RegistryHit[] = [
    { id: 'reg-0142', name: 'Harbourview General', type: 'hospital', area: 'Idi-Araba', lga: 'Mushin', address: 'Idi-Araba (example)' },
    { id: 'reg-0187', name: 'Marina Teaching Hospital', type: 'hospital', area: 'Ikeja', lga: 'Ikeja', address: 'Ikeja (example)' },
    { id: 'reg-1001', name: 'Harbour Point Clinic', type: 'clinic', area: 'Apapa', lga: 'Apapa', address: '14 Wharf Rd, Apapa (example)' },
    { id: 'reg-1004', name: 'Northgate Community Hospital', type: 'hospital', area: 'Agege', lga: 'Agege', address: 'Old Toll Rd, Agege (example)' },
    { id: 'reg-1006', name: 'Palmgrove Cottage Clinic', type: 'clinic', area: 'Surulere', lga: 'Surulere', address: 'Palm Ave, Surulere (example)' },
    { id: 'reg-1007', name: 'Lagoonside Township Hospital', type: 'hospital', area: 'Epe', lga: 'Epe', address: 'Marina Rd, Epe (example)' },
    { id: 'reg-1009', name: 'Eastside Community Blood Centre', type: 'blood_bank', area: 'Mushin', lga: 'Mushin', address: 'Market St, Mushin (example)' },
    { id: 'reg-1010', name: 'Swift Response Ambulance Services', type: 'ambulance_operator', area: 'Oshodi', lga: 'Oshodi-Isolo', address: 'Oshodi (example)' },
    { id: 'reg-1012', name: 'Victoria Bay Clinics', type: 'clinic', area: 'Victoria Island', lga: 'Eti-Osa', address: '3 Bayview St, VI (example)' },
  ];

  const harbourview: FacilityProfile = {
    facilityCode: '0142',
    displayCode: 'ET-HOS-LAG-0142-9',
    name: 'Harbourview General',
    type: 'hospital',
    ownership: 'general',
    address: 'Idi-Araba (example)',
    lga: 'Mushin',
    location: { lat: 6.5109, lng: 3.354 },
    dutyPhone: '0800 000 0142',
    profile: {
      departments: ['Emergency (A&E)', 'Intensive care', 'Surgery', 'Obstetrics', 'Paediatrics'],
      oxygen: { source: 'Piped', reserveHrs: 12 },
      specialists: ['General surgeon', 'Obstetrician', 'Anaesthetist'],
      bloodDesignation: 'Hospital blood bank',
    },
    updatedAt: daysAgo(3),
  };
  const marina: FacilityProfile = {
    ...harbourview,
    facilityCode: '0187',
    displayCode: 'ET-HOS-LAG-0187-0',
    name: 'Marina Teaching Hospital',
    address: 'Ikeja (example)',
    lga: 'Ikeja',
    location: { lat: 6.6018, lng: 3.3515 },
    dutyPhone: '0800 000 0187',
  };

  const bed = (category: BedConfig['category'], maxSpaces: number, limitedThreshold: number, occupied: number): BedConfig => ({
    category,
    maxSpaces,
    limitedThreshold,
    occupied,
    updatedAt: daysAgo(0.05),
  });

  const pkg = (id: string, name: string, price: number, status: CarePackage['status'], inclusions: string, exclusions: string): CarePackage => ({
    id,
    name,
    inclusions,
    exclusions,
    price,
    version: 1,
    status,
    revisionOf: null,
    createdAt: daysAgo(12),
    updatedAt: daysAgo(status === 'draft' ? 1 : 10),
    approvedBy: status === 'approved' ? 'Folasade Ogun' : null,
    approvedAt: status === 'approved' ? daysAgo(10) : null,
  });

  return {
    users,
    registry,
    facilities: { '0142': harbourview, '0187': marina },
    beds: {
      '0142': [bed('icu', 8, 2, 6), bed('hdu', 6, 2, 3), bed('ae', 20, 5, 14), bed('paeds', 10, 3, 4), bed('maternity', 12, 3, 9)],
      '0187': [bed('icu', 10, 2, 7), bed('hdu', 8, 2, 5), bed('ae', 24, 6, 18), bed('paeds', 12, 3, 6), bed('maternity', 14, 3, 10)],
    },
    packages: {
      '0142': [
        pkg(
          'pk-1',
          'Emergency stabilisation (first 24 hours)',
          15_000_000,
          'approved',
          'A&E assessment and resuscitation\nOxygen and IV fluids\nBasic bloods and one X-ray\nObservation bed for up to 24 hours',
          'Surgery or theatre time\nBlood products\nICU admission',
        ),
        pkg(
          'pk-2',
          'ICU admission (first 48 hours)',
          45_000_000,
          'approved',
          'ICU bed and nursing for 48 hours\nVentilator if needed\nRoutine ICU drugs and monitoring',
          'Specialist surgery\nBlood products\nDays after the first 48 hours',
        ),
        pkg(
          'pk-3',
          'Emergency caesarean section',
          35_000_000,
          'draft',
          'Theatre, anaesthesia and surgeon\nPost-op ward bed for 3 days\nNewborn check',
          'Neonatal ICU\nBlood products',
        ),
      ],
      '0187': [],
    },
    rosters: { '0142': [], '0187': [] },
    blood: { '0142': bloodStock(), '0187': bloodStock() },
    claims: [],
  };
}
