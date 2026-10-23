export type UserRole = "employee" | "manager" | "admin";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type Gender = "male" | "female";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  manager_id: string | null;
  department: string | null;
  job_title: string | null;
  gender: Gender | null;
  employment_start_date: string;
  created_at: string;
  /** When they finished the first-run walkthrough; null = still to show. */
  onboarded_at?: string | null;
  /** Stand-in who approves this person's reports while they're away. */
  backup_approver_id?: string | null;
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  default_days: number | null;
  default_reserved: number;
  deducts_balance: boolean;
  accrues: boolean;
  /** False for auto-granted leave (e.g. year-end closure) that can't be applied for. */
  bookable: boolean;
  cycle_months: number;
  min_service_months: number;
  /** Which gender this type is offered to: "all", "male" or "female". */
  applies_to: "all" | Gender;
  color: string;
  sort_order: number;
}

export interface LeaveRequest {
  id: string;
  profile_id: string;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  days: number;
  /** Set for single-day half-day requests. */
  half_day: "am" | "pm" | null;
  reason: string | null;
  status: RequestStatus;
  approver_id: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface BalanceSummary {
  id: string;
  profile_id: string;
  leave_type_id: number;
  leave_code: string;
  leave_name: string;
  leave_color: string;
  deducts_balance: boolean;
  accrues: boolean;
  /** False for auto-granted leave (e.g. year-end closure) — shown, not applied for. */
  bookable: boolean;
  /** 12 for annual-style types, 36 for sick leave (BCEA s22). */
  cycle_months: number;
  /** "start" = cycle runs from the employee's start date; "calendar" = Jan–Dec. */
  cycle_anchor: "start" | "calendar";
  /** True when today falls inside this balance's cycle. */
  is_current: boolean;
  /** Months of service required before this type may be taken (BCEA s27). */
  min_service_months: number;
  /** True once the employee has served long enough to use this type. */
  service_met: boolean;
  /** Start of the cycle this balance belongs to (ISO date). */
  cycle_start: string;
  /** Last day of that cycle (ISO date). */
  cycle_end: string;
  year: number;
  /** What may be used right now (sick leave is capped in the first six months). */
  entitled_days: number;
  /** The cycle's full allocation, before that cap. */
  full_entitled_days: number;
  reserved_days: number;
  accrued_days: number;
  used_days: number;
  pending_days: number;
  /** Bookable before pending requests; includes carried-over days until they expire. */
  available_days: number;
  /** Months unused days stay usable into the next cycle (0 = never carries over). */
  carry_months: number;
  /** Days brought in from the previous cycle. */
  carried_days: number;
  /** Last day carried-over leave may start on (ISO date); null if the type never carries over. */
  carry_expires: string | null;
  /** Carried-over days still unbooked and due to expire. */
  carry_left: number;
}

/** Request joined with the requester profile and leave type — used in tables. */
export interface RequestWithRelations extends LeaveRequest {
  profiles: Pick<Profile, "id" | "full_name" | "email" | "department" | "manager_id"> | null;
  leave_types: Pick<LeaveType, "id" | "code" | "name" | "color"> | null;
  approver: Pick<Profile, "id" | "full_name"> | null;
}

/** Message/attachment counts for a request, from the viewer's point of view. */
export interface ThreadStats {
  messages: number;
  unread: number;
  attachments: number;
}

export interface RequestMessage {
  id: string;
  request_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface AttachmentMeta {
  id: string;
  request_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface PublicHoliday {
  holiday_date: string;
  name: string;
  /** "auto" = calculated from the Public Holidays Act; "manual" = added by an admin. */
  source: "auto" | "manual";
}
