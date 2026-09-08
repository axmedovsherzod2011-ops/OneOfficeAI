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

      // The production frontend is hosted on Cloudflare Pages while the API
      // is hosted on Render. Ensure every scoped fetch uses the configured API
      // origin instead of accidentally targeting the Pages origin.
      s = s.replace('const res = await fetch(path, {', 'const res = await fetch(apiUrl(path), {');

      // Video rendering uses the product's database images on the backend.
      // Never serialize selected browser images (which may be base64 data URLs)
      // into the YouTube publish request: those payloads can become enormous
      // and make the browser fail before the POST reaches Render.
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