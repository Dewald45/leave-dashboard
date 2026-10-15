/**
 * A page that's exactly as tall as the app shell on laptop-size screens, so the
 * page itself never scrolls — the panel(s) marked `fit:flex-1 fit:min-h-0`
 * inside take the leftover height and scroll on their own. Phones and short
 * windows get a normal stacked, scrolling page. (5rem = the shell's margin
 * plus <main>'s vertical padding — same as the dashboard.)
 */
export default function ScreenPage({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 fit:h-[calc(100vh-5rem)] ${className}`}>
      {children}
    </div>
  );
}
