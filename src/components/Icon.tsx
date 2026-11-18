/**
 * The app's icon set — real SVG, not emoji or typographic glyphs.
 *
 * Emoji render as somebody else's artwork: a different picture on every
 * platform, in a colour you don't control, sitting on a different baseline to
 * the text beside it. Arrows typed as "→" inherit the font's metrics and go
 * missing when the font doesn't carry the character. These are drawn on a
 * 24×24 grid, stroked in `currentColor`, so they take the colour and size of
 * whatever they sit in and line up with the text every time.
 *
 * Usage:
 *   <Icon name="calendar" />                 // 1em, inherits colour
 *   <Icon name="arrow-right" className="h-4 w-4 text-brand-700" />
 *   <Icon name="check" title="Approved" />   // standalone, needs a label
 *
 * Decorative by default (`aria-hidden`), because an icon next to a word is
 * repeating that word. Pass `title` only when the icon is the whole message.
 */

export type IconName =
  | "calendar"
  | "calendar-check"
  | "chart"
  | "chat"
  | "paperclip"
  | "check"
  | "check-circle"
  | "cross"
  | "clock"
  | "wave"
  | "party"
  | "plus"
  | "minus"
  | "download"
  | "upload"
  | "arrow-right"
  | "arrow-left"
  | "arrow-down"
  | "chevron-right"
  | "chevron-left"
  | "info"
  | "warning"
  | "sun"
  | "moon"
  | "users"
  | "user"
  | "lock"
  | "mail"
  | "search"
  | "filter"
  | "edit"
  | "trash"
  | "external"
  | "dot";

/**
 * Each entry is the inside of a 24×24 `<svg>`. Stroked paths only (no fills),
 * so one `currentColor` and one stroke width keep the whole set consistent.
 */
const PATHS: Record<IconName, React.ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  "calendar-check": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  chat: (
    <>
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-5A8 8 0 0 1 13 4a8 8 0 0 1 8 8Z" />
    </>
  ),
  paperclip: (
    <>
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
    </>
  ),
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </>
  ),
  wave: (
    <>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 12V4.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 10.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 3 0" />
    </>
  ),
  party: (
    <>
      <path d="M3 21l6.5-16L21 16.5 3 21Z" />
      <path d="M14 3v2M19 5l-1.5 1.5M21 10h-2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  download: (
    <>
      <path d="M12 3v12M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 17V5M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  "arrow-right": <path d="M4 12h15M13 6l6 6-6 6" />,
  "arrow-left": <path d="M20 12H5M11 6l-6 6 6 6" />,
  "arrow-down": <path d="M12 4v15M6 13l6 6 6-6" />,
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M18 20a6.5 6.5 0 0 0-2.5-5.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  edit: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
      <path d="M14 6l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="3.5" />,
};

export interface IconProps {
  name: IconName;
  /** Tailwind sizing/colour. Defaults to 1em square, so it matches its text. */
  className?: string;
  /**
   * Give this ONLY when the icon carries meaning no nearby text repeats —
   * it turns the icon into an image with an accessible name.
   */
  title?: string;
  /** Stroke weight. 1.75 reads well at 16–24px; 2 for very small sizes. */
  strokeWidth?: number;
}

export default function Icon({
  name,
  className = "h-[1em] w-[1em]",
  title,
  strokeWidth = 1.75,
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
