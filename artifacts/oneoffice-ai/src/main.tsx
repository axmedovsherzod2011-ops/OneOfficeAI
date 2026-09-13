import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { apiUrl } from './lib/api-url';

import './index.css';

// Frontend (Cloudflare Pages) and backend (Render) are separate origins in
// production. Without this, every generated-hook API call (useListProducts,
// usePublishPost, etc.) would resolve against the frontend's own origin
// instead of the backend. Unset in local dev, this is "", i.e. unchanged
// relative paths, which Vite proxies to the local api-server. See
// src/lib/api-url.ts for the equivalent used by the handful of raw
// fetch("/api/...") calls in App.tsx — both read the same env var.
setBaseUrl(import.meta.env.VITE_API_BASE_URL || null);

// Some legacy raw fetch calls inside the YouTube review component still use
// a relative /api URL. In production the UI is on Cloudflare Pages while the
// API is on Render, so those calls otherwise hit the wrong origin and make a
// perfectly connected YouTube channel appear disconnected. Keep the fix
// narrowly scoped to YouTube connector requests; all other fetch behaviour is
// left untouched.
const nativeFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof Request
      ? input.url
      : input.toString();
  const pathname = (() => {
    try { return new URL(rawUrl, window.location.origin).pathname; }
    catch { return rawUrl; }
  })();

  if (pathname.startsWith('/api/connectors/youtube')) {
    const target = apiUrl(pathname);
    return nativeFetch(target, init);
  }
  return nativeFetch(input, init);
}) as typeof window.fetch;

createRoot(document.getElementById('root')!).render(<App />);
