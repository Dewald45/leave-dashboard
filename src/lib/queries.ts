// Shared PostgREST select for leave_requests joined to requester, type, approver.
// leave_requests has two FKs to profiles (profile_id, approver_id), so both
// embeds are disambiguated with an explicit foreign-key hint.
export const REQUEST_SELECT =
  "*, profiles:profiles!profile_id(id,full_name,email,department), " +
  "approver:profiles!approver_id(id,full_name), " +
  "leave_types(id,code,name,color)";

export const CURRENT_YEAR = new Date().getUTCFullYear();
