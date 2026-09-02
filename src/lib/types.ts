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
  year: number;
  entitled_days: number;
  reserved_days: number;
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
