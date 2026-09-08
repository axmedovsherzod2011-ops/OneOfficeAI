import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

function productionApiAndYoutubePublishTransform() {
  return {
    name: 'oneoffice-production-api-and-youtube-publish',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('/src/App.tsx')) return null;
      let s = code;

      const diagnosticHelper = `
async function oneOfficeFetchWithDiagnostics(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      const text = await response.clone().text().catch(() => "");
      let serverMessage = "";
      try { serverMessage = JSON.parse(text)?.error || ""; } catch {}
      if (serverMessage) {
        throw new Error(`HTTP ${response.status} ${response.statusText} — ${serverMessage} [${url}]`);
      }
      throw new Error(`HTTP ${response.status} ${response.statusText} — server returned an error [${url}]`);
    }
    return response;
  } catch (error: any) {
    if (error?.message?.startsWith("HTTP ")) throw error;
    const browserMessage = error?.message || String(error);
    const origin = typeof window !== "undefined" ? window.location.origin : "unknown-origin";
    const likely = browserMessage === "Failed to fetch"
      ? "Browser network/CORS/preflight failure: the request did not produce a readable HTTP response. Check the Render OPTIONS response and browser Network tab."
      : "Browser fetch failed before a readable HTTP response was received.";
    throw new Error(`YouTube publish request failed: ${browserMessage} — ${likely} URL=${url} ORIGIN=${origin}`);
  }
}
`;

      // Put the diagnostic fetch wrapper before the app code.
      s = s.replace('const queryClient = new QueryClient();', `${diagnosticHelper}\nconst queryClient = new QueryClient();`);

      // The production frontend is hosted on Cloudflare Pages while the API
      // is hosted on Render. Ensure scoped fetches use the configured API origin.
      s = s.replace('const res = await fetch(path, {', 'const res = await fetch(apiUrl(path), {');
      s = s.replace('const res = await fetch("/api/connectors/youtube/publish", {', 'const res = await oneOfficeFetchWithDiagnostics(apiUrl("/api/connectors/youtube/publish"), {');
      s = s.replace('const res = await fetch("/api/connectors/youtube/metadata", {', 'const res = await oneOfficeFetchWithDiagnostics(apiUrl("/api/connectors/youtube/metadata"), {');

      // Video rendering uses product DB images on the backend; don't serialize
      // browser-side base64 image payloads into the YouTube publish request.
      s = s.replace(
        '        const imageUrls = (selectedImages ?? []).map((img: any) => img.url).filter(Boolean);',
        '        const imageUrls: string[] = [];',
      );
      s = s.replace('            imageUrls,\n', '');

      return { code: s, map: null };
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    productionApiAndYoutubePublishTransform(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
