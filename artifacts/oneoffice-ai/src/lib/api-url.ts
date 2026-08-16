// ---------------------------------------------------------------------------
// Centralized backend API base URL.
//
// In production the frontend (Cloudflare Pages) and backend (Render) are
// served from different origins, so a relative fetch("/api/...") resolves
// against the frontend's own origin and never reaches the backend. Set
// VITE_API_BASE_URL (a Vite build-time env var) to the backend's origin,
// e.g. "https://oneofficeai-1.onrender.com", to fix that.
//
// In local development VITE_API_BASE_URL is typically unset, in which case
// apiUrl() returns the path unchanged — relative requests keep working
// exactly as before (same-origin dev server / proxy).
// ---------------------------------------------------------------------------

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Resolves a relative backend path (e.g. "/api/me") against
 * VITE_API_BASE_URL, producing an absolute URL in production
 * (e.g. "https://oneofficeai-1.onrender.com/api/me") or leaving it
 * unchanged when VITE_API_BASE_URL is empty/unset.
 */
export function apiUrl(path: string): string {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export { API_BASE_URL };
