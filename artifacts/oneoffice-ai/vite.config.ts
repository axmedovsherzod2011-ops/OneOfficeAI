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

function newPostDestinationTransform() {
  return {
    name: 'oneoffice-new-post-destination',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('/src/App.tsx')) return null;
      let s = code;

      const destination = `function PostDestinationPicker({ onPick }: { onPick: (destination: "telegram" | "youtube") => void }) {
  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <Glass className="p-8">
        <div className="flex items-center gap-2 text-violet-400 text-sm font-medium mb-2"><Send className="h-4 w-4" /> New Post</div>
        <h3 className="text-white text-xl font-semibold mb-1">Qayerga post tayyorlaymiz?</h3>
        <p className="text-slate-400 text-sm mb-6">Avval platformani tanlang. Keyin mahsulotni tanlaysiz va AI faqat shu platforma uchun kontent tayyorlaydi.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <button onClick={() => onPick("telegram")} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-400/40 transition p-5 text-left"><div className="h-11 w-11 rounded-xl bg-blue-500/10 flex items-center justify-center"><Send className="h-5 w-5 text-blue-400" /></div><div><p className="text-white font-semibold">Telegram</p><p className="text-slate-500 text-xs mt-0.5">Telegram uchun post</p></div></button>
          <button onClick={() => onPick("youtube")} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-red-400/40 transition p-5 text-left"><div className="h-11 w-11 rounded-xl bg-red-500/10 flex items-center justify-center"><Youtube className="h-5 w-5 text-red-400" /></div><div><p className="text-white font-semibold">YouTube</p><p className="text-slate-500 text-xs mt-0.5">YouTube metadata va video publish</p></div></button>
        </div>
      </Glass>
    </div>
  );
}

`;

      const marker = '// First screen of Create Post: pick which inventory product this post is';
      if (!s.includes('function PostDestinationPicker')) {
        s = s.replace(marker, destination + marker);
      }

      s = s.replace(
        '  onPick: (p: ProductItem) => void;\n  onSkip: () => void;\n  onAddProduct: () => void;',
        '  onPick: (p: ProductItem) => void;\n  onAddProduct: () => void;',
      );

      s = s.replace(`
        <button
          onClick={onSkip}
          className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-slate-300 py-3 rounded-xl font-medium text-sm hover:bg-white/10 hover:text-white transition"
        >
          Mahsulotsiz davom etish →
        </button>`, '');

      const oldState = `  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(
    null,
  );`;
      const newState = `  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(
    null,
  );
  const [postDestination, setPostDestination] = useState<"telegram" | "youtube" | null>(null);`;
      if (!s.includes('const [postDestination, setPostDestination]')) {
        s = s.replace(oldState, newState);
      }

      s = s.replace(
        '    setFlow("product");\n    setSelectedProduct(null);',
        '    setFlow("destination");\n    setPostDestination(null);\n    setSelectedProduct(null);',
      );
      s = s.replace(
        '    setFlow("form");\n  }\n\n  function toggleImage',
        '    setFlow(postDestination === "youtube" ? "yt-metadata" : "form");\n  }\n\n  function toggleImage',
      );

      const oldRender = `            {flow === "product" && (
              <ProductPicker
                onPick={pickProductForPost}
                onSkip={() => {
                  setSelectedProduct(null);
                  setFlow("form");
                }}
                onAddProduct={() => {
                  setNavView("inventory");
                  setEditingProduct(null);
                  setProductFormOpen(true);
                }}
              />
            )}`;
      const newRender = `            {flow === "destination" && (
              <PostDestinationPicker onPick={(destination) => { setPostDestination(destination); setFlow("product"); }} />
            )}
            {flow === "product" && (
              <ProductPicker
                onPick={pickProductForPost}
                onAddProduct={() => {
                  setNavView("inventory");
                  setEditingProduct(null);
                  setProductFormOpen(true);
                }}
              />
            )}`;
      if (s.includes(oldRender)) s = s.replace(oldRender, newRender);

      s = s.replace(
        '                onYtApprove={selectedProduct?.id ? handleYtApprove : undefined}',
        '                onYtApprove={undefined}',
      );
      s = s.replace(
        '                  setFlow("results");\n                }}\n              />\n            )}\n            {flow === "yt-publishing"',
        '                  setFlow("product");\n                }}\n              />\n            )}\n            {flow === "yt-publishing"',
      );

      // Production frontend is on Cloudflare Pages and API is on Render.
      // Route the metadata account request through the shared API base URL.
      s = s.replace('const res = await fetch(path, {', 'const res = await fetch(apiUrl(path), {');

      // YouTube video rendering now uses the product's DB images directly on the backend.
      // Do not send selected base64 image payloads from the browser; large requests can fail
      // before reaching Render with the generic browser "Failed to fetch" error.
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
    newPostDestinationTransform(),
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
