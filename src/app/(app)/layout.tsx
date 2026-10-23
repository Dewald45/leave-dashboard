import Sidebar from "@/components/Sidebar";
import Onboarding from "@/components/Onboarding";
import { requireProfile } from "@/lib/auth";
import { ensureCurrentBalances, getBalances } from "@/lib/data";
import { leaveAccent } from "@/lib/leave";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, userId } = await requireProfile();

  // Leave this person can apply for — offered straight from the mobile + menu.
  await ensureCurrentBalances(userId);
  const applyTypes = (await getBalances(userId))
    .filter((b) => b.bookable !== false)
    .map((b) => ({
      id: b.leave_type_id,
      name: b.leave_name,
      color: leaveAccent(b.leave_code, b.leave_color),
    }));

  return (
    <div className="min-h-screen md:p-3">
      {/* The app sits in one rounded shell on a slightly darker page. */}
      <div className="min-h-screen bg-sand-100 md:flex md:min-h-[calc(100vh-1.5rem)] md:rounded-[28px]">
        <Sidebar profile={profile} applyTypes={applyTypes} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-6 md:py-7 lg:px-8">
          {children}
        </main>
        {profile.onboarded_at ? null : <Onboarding role={profile.role} />}
      </div>
    </div>
  );
}
