import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;
if (!rawPort) throw new Error('PORT environment variable is required but was not provided.');
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);
const basePath = process.env.BASE_PATH;
if (!basePath) throw new Error('BASE_PATH environment variable is required but was not provided.');

function newPostDestinationTransform() {
  return {
    name: 'oneoffice-new-post-destination',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('/src/App.tsx')) return null;
      let s = code;
      const destination = `function PostDestinationPicker({ onPick }: { onPick: (destination: "telegram" | "youtube") => void }) {
  return (<div className="p-6 md:p-10 max-w-2xl"><Glass className="p-8"><div className="flex items-center gap-2 text-violet-400 text-sm font-medium mb-2"><Send className="h-4 w-4" /> New Post</div><h3 className="text-white text-xl font-semibold mb-1">Qayerga post tayyorlaymiz?</h3><p className="text-slate-400 text-sm mb-6">Avval platformani tanlang. Keyin mahsulotni tanlaysiz va AI faqat shu platforma uchun kontent tayyorlaydi.</p><div className="grid sm:grid-cols-2 gap-3"><button onClick={() => onPick("telegram")} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-400/40 transition p-5 text-left"><div className="h-11 w-11 rounded-xl bg-blue-500/10 flex items-center justify-center"><Send className="h-5 w-5 text-blue-400" /></div><div><p className="text-white font-semibold">Telegram</p><p className="text-slate-500 text-xs mt-0.5">Telegram uchun post</p></div></button><button onClick={() => onPick("youtube")} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-red-400/40 transition p-5 text-left"><div className="h-11 w-11 rounded-xl bg-red-500/10 flex items-center justify-center"><Youtube className="h-5 w-5 text-red-400" /></div><div><p className="text-white font-semibold">YouTube</p><p className="text-slate-500 text-xs mt-0.5">YouTube metadata va video publish</p></div></button></div></Glass></div>);
}

`;
      const marker = '// First screen of Create Post: pick which inventory product this post is';
      if (!s.includes('function PostDestinationPicker')) s = s.replace(marker, destination + marker);
      s = s.replace('  onPick: (p: ProductItem) => void;\n  onSkip: () => void;\n  onAddProduct: () => void;', '  onPick: (p: ProductItem) => void;\n  onAddProduct: () => void;');
      s = s.replace(/\n        <button\n          onClick=\{onSkip\}[\s\S]*?<\/button>/, '');
      const oldState = `  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(\n    null,\n  );`;
      const newState = `  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(\n    null,\n  );\n  const [postDestination, setPostDestination] = useState<"telegram" | "youtube" | null>(null);`;
      if (!s.includes('const [postDestination, setPostDestination]')) s = s.replace(oldState, newState);
      s = s.replace('    setFlow("product");\n    setSelectedProduct(null);', '    setFlow("destination");\n    setPostDestination(null);\n    setSelectedProduct(null);');
      s = s.replace('    setFlow("form");\n  }\n\n  function toggleImage', '    setFlow(postDestination === "youtube" ? "yt-metadata" : "form");\n  }\n\n  function toggleImage');
      const oldRender = `            {flow === "product" && (\n              <ProductPicker\n                onPick={pickProductForPost}\n                onSkip={() => {\n                  setSelectedProduct(null);\n                  setFlow("form");\n                }}\n                onAddProduct={() => {\n                  setNavView("inventory");\n                  setEditingProduct(null);\n                  setProductFormOpen(true);\n                }}\n              />\n            )}`;
      const newRender = `            {flow === "destination" && (\n              <PostDestinationPicker onPick={(destination) => { setPostDestination(destination); setFlow("product"); }} />\n            )}\n            {flow === "product" && (\n              <ProductPicker\n                onPick={pickProductForPost}\n                onAddProduct={() => {\n                  setNavView("inventory");\n                  setEditingProduct(null);\n                  setProductFormOpen(true);\n                }}\n              />\n            )}`;
      if (s.includes(oldRender)) s = s.replace(oldRender, newRender);
      s = s.replace('                onYtApprove={selectedProduct?.id ? handleYtApprove : undefined}', '                onYtApprove={undefined}');
      s = s.replace('                  setFlow("results");\n                }}\n              />\n            )}\n            {flow === "yt-publishing"', '                  setFlow("product");\n                }}\n              />\n            )}\n            {flow === "yt-publishing"');
      s = s.replace('const res = await fetch(path, {', 'const res = await fetch(apiUrl(path), {');
      s = s.replace('        const imageUrls = (selectedImages ?? []).map((img: any) => img.url).filter(Boolean);', '        const imageUrls: string[] = [];');
      s = s.replace('            imageUrls,\n', '');
      return { code: s, map: null };
    },
  };
}

function dashboardStatsTransform() {
  return {
    name: 'oneoffice-dashboard-stats',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('/src/App.tsx')) return null;
      const marker = '// ---------------------------------------------------------------------------\n// CREATE POST FLOW';
      const start = code.indexOf('function Dashboard({ goCreate, user }: any) {');
      const end = code.indexOf(marker, start);
      if (start < 0 || end < 0) return null;
      const replacement = `function DashboardRevenueChart({ period, onPeriodChange, onDetails }: { period: PeriodKey; onPeriodChange: (period: PeriodKey) => void; onDetails: () => void }) {
  const { user: firebaseUser } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data, isLoading } = useQuery<any>({ queryKey: ["dashboard-revenue", period], refetchInterval: 60000, queryFn: async () => { const token = await firebaseUser?.getIdToken(); const res = await fetch(apiUrl('/api/stats/dashboard/revenue?granularity=' + PERIOD_TO_GRANULARITY[period]), { headers: token ? { Authorization: 'Bearer ' + token } : {} }); if (!res.ok) throw new Error('Revenue statistikasi yuklanmadi'); return res.json(); } });
  const currencies = Array.from(new Set((data?.buckets ?? []).flatMap((b: any) => Object.keys(b.totals ?? {}))));
  const primaryCurrency = currencies.includes('UZS') ? 'UZS' : (currencies[0] ?? 'UZS');
  const chartData = (data?.buckets ?? []).map((b: any) => ({ label: labelForBucket(b.periodStart, period), amount: Number(b.totals?.[primaryCurrency] ?? 0) }));
  const total = Number(data?.allTime?.[primaryCurrency] ?? 0);
  const currentLabel = PERIOD_OPTIONS.find((o) => o.key === period)?.label || '';
  return <Glass className="p-6"><div className="flex items-center justify-between gap-3 mb-1"><div><h3 className="text-white font-semibold">Buyurtmalar</h3><p className="text-xs text-slate-500 mt-0.5">Umumiy ishlangan pul</p></div><div className="flex items-center gap-2 shrink-0"><button onClick={onDetails} className="text-xs text-violet-300 hover:text-white border border-violet-400/20 bg-violet-500/10 rounded-lg px-3 py-1.5 transition">Details</button><div className="relative"><button onClick={() => setPickerOpen((v) => !v)} className="flex items-center gap-1.5 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 transition">{currentLabel}<ChevronDown className="h-3 w-3" /></button>{pickerOpen && <div className="absolute right-0 mt-1.5 w-44 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-1 z-20">{PERIOD_OPTIONS.map((o) => <button key={o.key} onClick={() => { onPeriodChange(o.key); setPickerOpen(false); }} className="w-full flex items-center justify-between text-xs text-slate-300 hover:bg-white/5 rounded-lg px-3 py-2 transition">{o.label}{period === o.key && <Check className="h-3 w-3 text-violet-400" />}</button>)}</div>}</div></div></div><div className="flex items-baseline gap-2 mb-4"><span className="text-2xl font-bold text-white">{total.toLocaleString()}</span><span className="text-xs text-slate-500">{primaryCurrency}</span></div>{currencies.length > 1 && <p className="text-[11px] text-slate-500 mb-3">Valyutalar alohida hisoblanadi. Grafikda {primaryCurrency} ko'rsatilgan.</p>}<div className="h-56 -ml-2">{isLoading ? <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div> : chartData.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2"><BarChart3 className="h-8 w-8 opacity-40" /><p className="text-xs">Hozircha buyurtma daromadi yo'q.</p></div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="dashboardRevenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.45} /><stop offset="95%" stopColor="#34d399" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} /><YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} width={52} /><RechartsTooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 shadow-xl"><p className="text-xs text-slate-400 mb-1">{label}</p><p className="text-xs font-medium text-emerald-400">{payload[0].value.toLocaleString()} {primaryCurrency}</p></div> : null} /><Area type="monotone" dataKey="amount" stroke="#34d399" strokeWidth={2.5} fill="url(#dashboardRevenueGradient)" dot={false} activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer>}</div></Glass>;
}

function DashboardViewsChart({ period, onPeriodChange, onDetails }: { period: PeriodKey; onPeriodChange: (period: PeriodKey) => void; onDetails: () => void }) {
  const { data, isLoading } = useCombinedStatsDashboard(period);
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentLabel = PERIOD_OPTIONS.find((o) => o.key === period)?.label || '';
  const chartData = (data?.buckets ?? []).map((b: CombinedBucket) => ({ label: labelForBucket(b.periodStart, period), value: b.views }));
  const total = Number(data?.allTime?.views ?? 0);
  const connected = Boolean(data?.viewsConnected);
  return <Glass className="p-6"><div className="flex items-center justify-between gap-3 mb-1"><div><h3 className="text-white font-semibold">Views</h3><p className="text-xs text-slate-500 mt-0.5">Barcha mavjud connectorlar bo'yicha umumiy ko'rishlar</p></div><div className="flex items-center gap-2 shrink-0"><button onClick={onDetails} className="text-xs text-violet-300 hover:text-white border border-violet-400/20 bg-violet-500/10 rounded-lg px-3 py-1.5 transition">Details</button><div className="relative"><button onClick={() => setPickerOpen((v) => !v)} className="flex items-center gap-1.5 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 transition">{currentLabel}<ChevronDown className="h-3 w-3" /></button>{pickerOpen && <div className="absolute right-0 mt-1.5 w-44 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-1 z-20">{PERIOD_OPTIONS.map((o) => <button key={o.key} onClick={() => { onPeriodChange(o.key); setPickerOpen(false); }} className="w-full flex items-center justify-between text-xs text-slate-300 hover:bg-white/5 rounded-lg px-3 py-2 transition">{o.label}{period === o.key && <Check className="h-3 w-3 text-violet-400" />}</button>)}</div>}</div></div></div><div className="flex items-baseline gap-2 mb-4"><span className="text-2xl font-bold text-white">{connected ? total.toLocaleString() : '—'}</span><span className="text-xs text-slate-500">views</span></div><div className="h-56 -ml-2">{isLoading ? <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div> : !connected || chartData.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-500"><BarChart3 className="h-8 w-8 opacity-40" /><p className="text-xs max-w-[260px]">Real views uchun ulangan connector statistikasi kerak. Hozircha faqat API orqali tasdiqlangan ma'lumot ko'rsatiladi.</p></div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="dashboardViewsGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a78bfa" stopOpacity={0.5} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} /><YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} width={52} allowDecimals={false} /><RechartsTooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 shadow-xl"><p className="text-xs text-slate-400 mb-1">{label}</p><p className="text-xs font-medium text-violet-300">{payload[0].value.toLocaleString()} views</p></div> : null} /><Area type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2.5} fill="url(#dashboardViewsGradient)" dot={false} activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer>}</div></Glass>;
}

function DashboardStatisticsView({ onBack }: { onBack: () => void }) {
  const { user: firebaseUser } = useAuth();
  const [connector, setConnector] = useState('youtube');
  const { data: ytStats, isLoading: ytLoading } = useQuery<any>({ queryKey: ['youtube-statistics'], refetchInterval: 60000, queryFn: async () => { const token = await firebaseUser?.getIdToken(); const res = await fetch(apiUrl('/api/connectors/youtube/statistics'), { headers: token ? { Authorization: 'Bearer ' + token } : {} }); if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'YouTube statistikasi yuklanmadi'); return res.json(); } });
  const { data: telegramStats } = useCombinedStatsDashboard('daily');
  const { data: revenue } = useQuery<any>({ queryKey: ['statistics-revenue-daily'], refetchInterval: 60000, queryFn: async () => { const token = await firebaseUser?.getIdToken(); const res = await fetch(apiUrl('/api/stats/dashboard/revenue?granularity=day'), { headers: token ? { Authorization: 'Bearer ' + token } : {} }); if (!res.ok) throw new Error(''); return res.json(); } });
  const connectors = [{ key: 'youtube', label: 'YouTube', icon: Youtube }, { key: 'telegram', label: 'Telegram', icon: Send }, { key: 'instagram', label: 'Instagram', icon: Instagram }, { key: 'vk', label: 'VK', icon: Globe }];
  const ytRows = ytStats?.analytics?.rows ?? [];
  const ytChart = ytRows.map((r: any[]) => ({ label: r[0], value: Number(r[1] ?? 0) }));
  const ytCols = ytStats?.analytics?.columns ?? [];
  const ytTotal30 = ytRows.reduce((sum: number, r: any[]) => sum + Number(r[1] ?? 0), 0);
  return <div className="p-6 md:p-10 space-y-6"><div className="flex items-center justify-between gap-4 flex-wrap"><div><button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-2"><ArrowLeft className="h-4 w-4" /> Dashboard</button><h2 className="text-2xl font-semibold text-white">Statistics</h2><p className="text-sm text-slate-500 mt-1">Har bir connector uchun API orqali olingan real statistikalar.</p></div><select value={connector} onChange={(e) => setConnector(e.target.value)} className="bg-slate-900 border border-white/10 text-white rounded-xl px-3 py-2.5 text-sm outline-none">{connectors.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>{connector === 'youtube' && <Glass className="p-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div className="rounded-2xl bg-white/5 border border-white/5 p-4"><p className="text-xs text-slate-500">Channel views</p><p className="text-xl font-bold text-white mt-1">{ytStats?.channel?.views?.toLocaleString?.() ?? '—'}</p></div><div className="rounded-2xl bg-white/5 border border-white/5 p-4"><p className="text-xs text-slate-500">Subscribers</p><p className="text-xl font-bold text-white mt-1">{ytStats?.channel?.subscribers?.toLocaleString?.() ?? '—'}</p></div><div className="rounded-2xl bg-white/5 border border-white/5 p-4"><p className="text-xs text-slate-500">Videos</p><p className="text-xl font-bold text-white mt-1">{ytStats?.channel?.videos?.toLocaleString?.() ?? '—'}</p></div><div className="rounded-2xl bg-white/5 border border-white/5 p-4"><p className="text-xs text-slate-500">30d views</p><p className="text-xl font-bold text-white mt-1">{ytStats?.analytics?.available ? ytTotal30.toLocaleString() : '—'}</p></div></div>{ytLoading ? <div className="h-64 flex items-center justify-center"><Loader2 className="h-6 w-6 text-slate-500 animate-spin" /></div> : ytChart.length ? <div className="h-64 mt-6"><ResponsiveContainer width="100%" height="100%"><AreaChart data={ytChart}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} /><RechartsTooltip /><Area type="monotone" dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} strokeWidth={2.5} dot={false} /></AreaChart></ResponsiveContainer></div> : <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center"><BarChart3 className="h-8 w-8 text-slate-600 mx-auto mb-2" /><p className="text-sm text-slate-400">YouTube Analytics API bu kanal uchun hali ma'lumot qaytarmadi.</p></div>}<div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">{ytCols.map((c: string) => <span key={c} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/5">{c}</span>)}</div></Glass>}{connector === 'telegram' && <Glass className="p-6"><div className="grid grid-cols-2 md:grid-cols-3 gap-3"><div className="rounded-2xl bg-white/5 border border-white/5 p-4"><p className="text-xs text-slate-500">Views</p><p className="text-xl font-bold text-white mt-1">{telegramStats?.allTime?.views?.toLocaleString?.() ?? '—'}</p></div><div className="rounded-2xl bg-white/5 border border-white/5 p-4"><p className="text-xs text-slate-500">Subscribers</p><p className="text-xl font-bold text-white mt-1">{telegramStats?.allTime?.subscribers?.toLocaleString?.() ?? '—'}</p></div><div className="rounded-2xl bg-white/5 border border-white/5 p-4"><p className="text-xs text-slate-500">Orders</p><p className="text-xl font-bold text-white mt-1">{telegramStats?.allTime?.orders?.toLocaleString?.() ?? '—'}</p></div></div><p className="text-xs text-slate-500 mt-5">Telegram uchun mavjud real statistikalar MTProto orqali olinadi. Ulanmagan bo'lsa demo qiymat ko'rsatilmaydi.</p></Glass>}{connector === 'instagram' && <Glass className="p-8 text-center"><Instagram className="h-9 w-9 text-slate-600 mx-auto mb-3" /><p className="text-white font-medium">Instagram</p><p className="text-slate-500 text-sm mt-1">Instagram Graph API statistikasi uchun tegishli account insights endpointi hali ulanmagan. Demo ma'lumot ko'rsatilmaydi.</p></Glass>}{connector === 'vk' && <Glass className="p-8 text-center"><Globe className="h-9 w-9 text-slate-600 mx-auto mb-3" /><p className="text-white font-medium">VK</p><p className="text-slate-500 text-sm mt-1">VK statistikasi uchun API endpointi hali ulanmagan. Demo ma'lumot ko'rsatilmaydi.</p></Glass>}</div>;
}

function Dashboard({ goCreate, user }: any) {
  void goCreate; void user;
  const [ordersPeriod, setOrdersPeriod] = useState<PeriodKey>('daily');
  const [viewsPeriod, setViewsPeriod] = useState<PeriodKey>('daily');
  const [showStatistics, setShowStatistics] = useState(false);
  useEffect(() => { const sync = () => setShowStatistics(new URLSearchParams(window.location.search).get('statistics') === '1'); sync(); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync); }, []);
  const openStatistics = () => { window.history.pushState({}, '', window.location.pathname + '?statistics=1'); setShowStatistics(true); };
  const closeStatistics = () => { window.history.pushState({}, '', window.location.pathname); setShowStatistics(false); };
  if (showStatistics) return <DashboardStatisticsView onBack={closeStatistics} />;
  return <div className="p-6 md:p-10 space-y-6"><div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><DashboardRevenueChart period={ordersPeriod} onPeriodChange={setOrdersPeriod} onDetails={openStatistics} /><DashboardViewsChart period={viewsPeriod} onPeriodChange={setViewsPeriod} onDetails={openStatistics} /></div></div>;
}

`;
      return { code: code.slice(0, start) + replacement + code.slice(end), map: null };
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [newPostDestinationTransform(), dashboardStatsTransform(), react(), tailwindcss(), runtimeErrorOverlay(), ...(process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined ? [await import('@replit/vite-plugin-cartographer').then((m) => m.cartographer({ root: path.resolve(import.meta.dirname, '..') })), await import('@replit/vite-plugin-dev-banner').then((m) => m.devBanner())] : [])],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets') }, dedupe: ['react', 'react-dom'] },
  root: path.resolve(import.meta.dirname),
  build: { outDir: path.resolve(import.meta.dirname, 'dist/public'), emptyOutDir: true },
  server: { port, strictPort: true, host: '0.0.0.0', allowedHosts: true, fs: { strict: true } },
  preview: { port, host: '0.0.0.0', allowedHosts: true },
});
