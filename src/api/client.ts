import type {
  BedConfig,
  BedConfigInput,
  BloodStock,
  CarePackage,
  FacilityProfile,
  InviteInput,
  MyClaim,
  OtpRequest,
  OtpVerify,
  PackageInput,
  Permission,
  ProfileUpdate,
  RegistryHit,
  Roster,
  RosterEntry,
  Session,
  StaffMember,
  ClaimSubmission,
} from './types';

/**
 * Everything the facility console asks of the server. Two implementations:
 * `live` (HTTP against server/) and `mock` (in-browser, example data). Pages only
 * see this interface. The platform-admin console's client follows the same pattern.
 */
export interface ApiClient {
  auth: {
    /** Always resolves the same way, whether or not the account exists (no enumeration). */
    requestOtp(input: OtpRequest): Promise<void>;
    verifyOtp(input: OtpVerify): Promise<Session>;
    /**
     * Switch to another account linked to the same email (2-3). Live: the server has
     * no switch, so this signs out and opens the sign-in page for that account instead.
     */
    switchAccount(facilityCode: string): Promise<Session>;
    logout(): Promise<void>;
  };
  registry: {
    search(q: string): Promise<RegistryHit[]>;
    /** Submits a claim with its documents (multipart). Any signed-in account may claim. */
    submitClaim(input: ClaimSubmission): Promise<MyClaim>;
    myClaims(): Promise<MyClaim[]>;
  };
  facility: {
    get(): Promise<FacilityProfile>;
    update(input: ProfileUpdate): Promise<FacilityProfile>;
  };
  beds: {
    config(): Promise<BedConfig[]>;
    saveConfig(input: BedConfigInput[]): Promise<BedConfig[]>;
  };
  staff: {
    list(): Promise<StaffMember[]>;
    invite(input: InviteInput): Promise<StaffMember>;
    setPermissions(staffId: string, permissions: Permission[]): Promise<StaffMember>;
    setStatus(staffId: string, status: StaffMember['status']): Promise<StaffMember>;
  };
  roster: {
    /** Active staff, for building the roster. Needs only roster.manage (a Matron may lack staff.manage). */
    staff(): Promise<StaffMember[]>;
    /** null when no roster is set for that week (everyone counts as on duty). */
    get(weekStart: string): Promise<Roster | null>;
    save(weekStart: string, entries: RosterEntry[]): Promise<Roster>;
  };
  pricing: {
    list(): Promise<CarePackage[]>;
    create(input: PackageInput): Promise<CarePackage>;
    update(id: string, input: PackageInput): Promise<CarePackage>;
    /** Approving a revision archives the version it replaces. */
    approve(id: string): Promise<CarePackage>;
    /** A new draft copied from an approved package, version + 1. */
    revise(id: string): Promise<CarePackage>;
    archive(id: string): Promise<CarePackage>;
    removeDraft(id: string): Promise<void>;
  };
  blood: {
    stock(): Promise<BloodStock[]>;
    update(id: string, input: Pick<BloodStock, 'units' | 'minTarget'>): Promise<BloodStock>;
  };
  /** Mock only: demo helpers. Undefined against a live server. */
  demo?: DemoControls;
  /**
   * What this adapter cannot do yet. Pages read it to show an honest state
   * instead of failing or pretending. Undefined for the mock (it can do everything).
   */
  limits?: ApiLimits;
}

/** Gaps between the console and server/ (live mode). Listed in facility-client/README.md. */
export interface ApiLimits {
  /** Modules with no server routes (or flagged off): the page shows this message instead. */
  unavailable: Partial<Record<ApiModule, string>>;
  /** Modules answered by the in-browser mock while live (VITE_MOCK_MODULES): pages say it is example data. */
  example: ApiModule[];
  /** Why claim documents are not uploaded, or null when they are. */
  claimDocuments: string | null;
  /** Why "Your claims" cannot be listed, or null when it can. */
  myClaims: string | null;
  /** Profile fields the server does not store yet; the page shows them read-only. */
  profileReadOnly: ('address' | 'oxygenReserve' | 'bloodDesignation')[];
  /** Only the current week's roster can be read and saved. */
  rosterCurrentWeekOnly: boolean;
  /** The server has no account switch: each account needs its own sign-in code. */
  switchNeedsSignIn: boolean;
}

export interface DemoControls {
  personas(): { name: string; email: string; facilityCode?: string; note: string }[];
  reset(): void;
}

export type ApiModule = Exclude<keyof ApiClient, 'demo' | 'limits'>;
