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
      try {
        const parsed = JSON.parse(text);
        serverMessage = parsed?.error || parsed?.message || parsed?.detail || "";
      } catch {}
      const bodyPreview = text ? text.slice(0, 1200) : "<empty response>";
      throw new Error(
        `YouTube API HTTP ${response.status} ${response.statusText} — ${serverMessage || bodyPreview} — URL=${url}`,
      );
    }
    return response;
  } catch (error: any) {
    const message = error?.message || String(error);
    if (message.startsWith("YouTube API HTTP ")) throw error;
    const origin = typeof window !== "undefined" ? window.location.origin : "unknown-origin";
    throw new Error(
      `YouTube publish network error: ${message} | URL=${url} | FRONTEND_ORIGIN=${origin} | This means the browser did not receive a readable HTTP response from Render.`,
    );
  }
}
`;

      s = s.replace(
        'const queryClient = new QueryClient();',
        `${diagnosticHelper}\nconst queryClient = new QueryClient();`,
      );

      s = s.replace(
        'const res = await fetch(path, {',
        'const res = await fetch(apiUrl(path), {',
      );

      // Cover both source forms used by the production branches: direct
      // relative fetches and the already-routed apiUrl(...) form.
      s = s.replace(
        'const res = await fetch("/api/connectors/youtube/publish", {',
        'const res = await oneOfficeFetchWithDiagnostics(apiUrl("/api/connectors/youtube/publish"), {',
      );
      s = s.replace(
        'const res = await fetch(apiUrl("/api/connectors/youtube/publish"), {',
        'const res = await oneOfficeFetchWithDiagnostics(apiUrl("/api/connectors/youtube/publish"), {',
      );
      s = s.replace(
        'const res = await fetch("/api/connectors/youtube/metadata", {',
        'const res = await oneOfficeFetchWithDiagnostics(apiUrl("/api/connectors/youtube/metadata"), {',
      );
      s = s.replace(
        'const res = await fetch(apiUrl("/api/connectors/youtube/metadata"), {',
        'const res = await oneOfficeFetchWithDiagnostics(apiUrl("/api/connectors/youtube/metadata"), {',
      );

      // Video rendering uses product DB images on the backend; do not send
      // large browser-side base64 image payloads with the publish request.
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
