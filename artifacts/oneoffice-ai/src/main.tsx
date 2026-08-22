import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Frontend (Cloudflare Pages) and backend (Render) are separate origins in
// production. Without this, every generated-hook API call (useListProducts,
// usePublishPost, etc.) would resolve against the frontend's own origin
// instead of the backend. Unset in local dev, this is "", i.e. unchanged
// relative paths, which Vite proxies to the local api-server. See
// src/lib/api-url.ts for the equivalent used by the handful of raw
// fetch("/api/...") calls in App.tsx — both read the same env var.
setBaseUrl(import.meta.env.VITE_API_BASE_URL || null);

createRoot(document.getElementById('root')!).render(<App />);
