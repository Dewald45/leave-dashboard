import { LogoWordmark } from "@/components/Logo";

/** Dark full-screen frame shared by the sign-in and password pages. */
export default function AuthShell({
  tagline,
  children,
  footer,
}: {
  tagline: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1>
            <LogoWordmark className="mx-auto mb-4 h-12 w-auto text-white" />
          </h1>
          <p className="mt-1 text-sm text-sand-400">{tagline}</p>
        </div>
        {children}
        {footer ? <div className="mt-4 text-center text-xs text-sand-500">{footer}</div> : null}
      </div>
    </main>
  );
}
