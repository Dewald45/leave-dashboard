import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Returns the signed-in user's profile, or redirects to /login. */
export async function requireProfile(): Promise<{
  profile: Profile;
  userId: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Auth user exists but no profile row yet (rare race) — sign out to reset.
    redirect("/login");
  }

  return { profile: profile as Profile, userId: user.id };
}

export function isManagerOrAdmin(role: string) {
  return role === "manager" || role === "admin";
}
