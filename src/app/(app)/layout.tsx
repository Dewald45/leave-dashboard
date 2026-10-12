import Sidebar from "@/components/Sidebar";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireProfile();

  return (
    <div className="min-h-screen md:p-3">
      {/* The app sits in one rounded shell on a slightly darker page. */}
      <div className="min-h-screen bg-sand-100 md:flex md:min-h-[calc(100vh-1.5rem)] md:rounded-[28px]">
        <Sidebar profile={profile} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-6 md:py-7 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
