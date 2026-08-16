import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Split-origin production deployment (frontend on Cloudflare Pages, backend
// on Render): point the generated API client at the backend's origin via
// VITE_API_BASE_URL. Unset/empty in local dev, so setBaseUrl(null) leaves
// relative "/api/..." requests unchanged — same as before.
setBaseUrl(import.meta.env.VITE_API_BASE_URL || null);

createRoot(document.getElementById('root')!).render(<App />);
