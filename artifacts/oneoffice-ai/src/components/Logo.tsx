// Reusable OneOffice AI logo. Single source of truth for every place the
// brand mark is shown (sidebar, navbar, auth pages, etc.) — swap the asset
// here instead of touching each call site.
//
// The source PNG (public/oneoffice-logo.png) is a white glyph on a fully
// transparent background, used exactly as supplied — no redraw, recolor,
// crop, or background added.
//
// Theme note: this app has no functioning light/dark toggle today — every
// screen hardcodes a dark background (bg-slate-950 etc.) directly, and the
// "Dark Mode" switch in Settings is decorative local state that isn't
// wired to anything. shadcn's `.dark` CSS-variable block and Tailwind
// `dark:` variant exist in index.css but are never applied anywhere in the
// app. Given that, the logo is rendered in its natural white form here,
// which is the correct/visible choice against the app's actual always-dark
// UI. If a real theme toggle is added later, this is the one place that
// would need a color-inverting filter for a light background — every call
// site below just uses this component, so nothing else would change.
export function Logo({
  className = "",
  alt = "OneOffice AI",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img src="/oneoffice-logo.png" alt={alt} className={`object-contain ${className}`} />
  );
}
