export type UserRole = "employee" | "manager" | "admin";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  manager_id: string | null;
  department: string | null;
  job_title: string | null;
  employment_start_date: string;
  created_at: string;
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
  cycle_months: number;
  min_service_months: number;
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
  /** 12 for calendar-year types, 36 for sick leave (BCEA s22). */
  cycle_months: number;
  /** Months of service required before this type may be taken (BCEA s27). */
  min_service_months: number;
  /** True once the employee has served long enough to use this type. */
  service_met: boolean;
  /** Start of the cycle this balance belongs to (ISO date). */
  cycle_start: string;
  /** Last day of that cycle (ISO date). */
  cycle_end: string;
  year: number;
  entitled_days: number;
  reserved_days: number;
  accrued_days: number;
  used_days: number;
  pending_days: number;
  available_days: number;
}

/** Request joined with the requester profile and leave type — used in tables. */
export interface RequestWithRelations extends LeaveRequest {
  profiles: Pick<Profile, "id" | "full_name" | "email" | "department"> | null;
  leave_types: Pick<LeaveType, "id" | "code" | "name" | "color"> | null;
  approver: Pick<Profile, "id" | "full_name"> | null;
}
