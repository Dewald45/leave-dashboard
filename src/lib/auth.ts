import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";
import type { Profile } from "@/lib/types";

/** Returns the signed-in user's profile, or redirects to /login. */
export async function requireProfile(): Promise<{
  profile: Profile;
  userId: string;
}> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return { profile, userId: profile.id };
}

export function isManagerOrAdmin(role: string) {
  return role === "manager" || role === "admin";
}
