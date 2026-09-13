// ---------------------------------------------------------------------------
// Resolves a `/api/...` path to an absolute URL against the backend origin.
//
// Frontend (Cloudflare Pages) and backend (Render) are deployed on
// different origins in production. A relative fetch("/api/me") resolves
// against whatever origin the page itself is served from — the frontend's
// own Cloudflare Pages domain — never reaching the Render backend at all.
// That's the exact cause of "Profilni yuklab bo'lmadi": the request never
// leaves Cloudflare Pages.
//
// Set VITE_API_BASE_URL (e.g. https://oneofficeai-1.onrender.com) at build
// time so every API call is routed to the real backend instead. Left unset,
// this resolves to "" — plain relative paths — which is exactly right for
// local dev, where Vite proxies /api to the local api-server on the same
// origin.
//
// This is the single source of truth for the base URL. The generated API
// client (@workspace/api-client-react, used by hooks like
// useListTelegramChannels/usePublishPost/etc.) is configured with the very
// same env var via setBaseUrl() in main.tsx — so there is one env var and
// two call sites reading it, not two separate base-URL systems.
// ---------------------------------------------------------------------------

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`apiUrl() expects a path starting with "/", got: ${path}`);
  }
  return `${API_BASE_URL}${path}`;
}
