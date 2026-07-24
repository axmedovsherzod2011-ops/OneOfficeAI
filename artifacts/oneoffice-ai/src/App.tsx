import React, { useState, useEffect, useRef } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  Sparkles,
  Home,
  PlusCircle,
  History,
  Settings,
  User,
  Bell,
  Check,
  X,
  ChevronRight,
  Image as ImageIcon,
  Zap,
  TrendingUp,
  Search,
  Moon,
  Sun,
  Globe,
  LogOut,
  ArrowRight,
  Play,
  Loader2,
  ShieldCheck,
  Send,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Package,
  DollarSign,
  Tag,
  FileText,
  CheckCircle2,
  Wand2,
  Camera,
  PenTool,
  BarChart3,
  Clock,
  Rocket,
  ChevronDown,
  Menu,
  Bot,
  Copy,
  ExternalLink,
  KeyRound,
  AlertCircle,
  ArrowLeft,
  Hash,
  ClipboardCheck,
} from "lucide-react";

import {
  useConnectUser,
  usePublishPost,
  useListPosts,
  useGetUserStats,
  useEnrichProduct,
  getListPostsQueryKey,
  getGetUserStatsQueryKey,
} from "@workspace/api-client-react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// MOCK DATA
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  { label: "Searching product database", icon: Search },
  { label: "Gathering product information", icon: FileText },
  { label: "Collecting technical specifications", icon: Package },
  { label: "Finding best-fit product imagery", icon: Camera },
  { label: "Analyzing competitor listings", icon: BarChart3 },
  { label: "Writing marketing description", icon: PenTool },
  { label: "Composing premium designs", icon: Wand2 },
  { label: "Rendering preview variants", icon: ImageIcon },
  { label: "Finalizing post", icon: CheckCircle2 },
];

const CATEGORIES = [
  "Electronics",
  "Fashion",
  "Home & Living",
  "Beauty",
  "Sports",
  "Toys",
];

const IMAGE_STYLES = [
  {
    key: "minimal",
    name: "Minimal",
    from: "from-slate-100",
    to: "to-slate-300",
    text: "text-slate-800",
    accent: "bg-slate-800",
  },
  {
    key: "luxury",
    name: "Luxury",
    from: "from-amber-200",
    to: "to-yellow-500",
    text: "text-amber-950",
    accent: "bg-amber-950",
  },
  {
    key: "dark",
    name: "Dark Theme",
    from: "from-slate-900",
    to: "to-indigo-950",
    text: "text-white",
    accent: "bg-violet-500",
  },
];

const seedHistory = [
  {
    id: 1,
    name: "AeroSound Pro Earbuds",
    price: "349,000",
    category: "Electronics",
    status: "Published",
    date: "Jul 14",
  },
  {
    id: 2,
    name: "Velour Oversized Hoodie",
    price: "219,000",
    category: "Fashion",
    status: "Published",
    date: "Jul 12",
  },
  {
    id: 3,
    name: "Nimbus Ceramic Vase Set",
    price: "128,000",
    category: "Home & Living",
    status: "Pending",
    date: "Jul 11",
  },
  {
    id: 4,
    name: "GlowLux Serum 30ml",
    price: "97,000",
    category: "Beauty",
    status: "Rejected",
    date: "Jul 9",
  },
  {
    id: 5,
    name: "TrailBlaze Running Shoes",
    price: "412,000",
    category: "Sports",
    status: "Published",
    date: "Jul 6",
  },
];

// ---------------------------------------------------------------------------
// CHANNEL PERFORMANCE (mock) — views & orders over recent periods
// ---------------------------------------------------------------------------

const PERFORMANCE_DATA: Record<
  string,
  { label: string; views: number; orders: number }[]
> = {
  daily: [
    { label: "17/07", views: 1240, orders: 18 },
    { label: "18/07", views: 1480, orders: 22 },
    { label: "19/07", views: 2100, orders: 31 },
    { label: "20/07", views: 1860, orders: 27 },
    { label: "21/07", views: 1590, orders: 24 },
    { label: "22/07", views: 1720, orders: 29 },
    { label: "23/07", views: 1950, orders: 33 },
  ],
  weekly: [
    { label: "1-hafta", views: 8900, orders: 132 },
    { label: "2-hafta", views: 10200, orders: 151 },
    { label: "3-hafta", views: 9600, orders: 140 },
    { label: "4-hafta", views: 11800, orders: 176 },
    { label: "5-hafta", views: 12400, orders: 189 },
  ],
  monthly: [
    { label: "Mar", views: 34200, orders: 512 },
    { label: "Apr", views: 38900, orders: 588 },
    { label: "May", views: 41100, orders: 623 },
    { label: "Iyun", views: 39800, orders: 601 },
    { label: "Iyul", views: 46700, orders: 702 },
  ],
};

const PERIOD_OPTIONS = [
  { key: "daily", label: "Kunlar bo'yicha" },
  { key: "weekly", label: "Haftalar bo'yicha" },
  { key: "monthly", label: "Oylar bo'yicha" },
];

// ---------------------------------------------------------------------------
// ONBOARDING PERSISTENCE
// ---------------------------------------------------------------------------

const ONBOARDING_KEY = "oneoffice_onboarding_v1";

function loadOnboarding() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOnboarding(data: any) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable
  }
}

function clearOnboarding() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// SESSION PERSISTENCE
// ---------------------------------------------------------------------------

const SESSION_KEY = "oneoffice_session_v1";

function loadSession(): any | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(user: any) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    // storage unavailable
  }
}

function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // no-op
  }
}

// Routes an external (possibly hotlink-protected) image URL through our own
// backend so it reliably renders in <img> tags. No-ops for data: URLs
// (already-generated images) since those need no proxying.
function proxyImage(url: string): string {
  if (!url || url.startsWith("data:")) return url;
  return `/api/images/proxy?url=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------
// SMALL HELPERS
// ---------------------------------------------------------------------------

function GradientBlob({ className }: { className: string }) {
  return (
    <div
      className={`absolute rounded-full blur-3xl opacity-40 pointer-events-none ${className}`}
    />
  );
}

function Glass({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl shadow-black/30 ${className}`}
    >
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }: any) {
  return (
    <Glass className="p-6 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div
          className={`h-11 w-11 rounded-2xl flex items-center justify-center ${accent}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        {sub && (
          <span className="text-xs text-emerald-400 font-medium">{sub}</span>
        )}
      </div>
      <p className="text-2xl md:text-3xl font-semibold text-white tracking-tight truncate">
        {value}
      </p>
      <p className="text-sm text-slate-400 mt-1 truncate">{label}</p>
    </Glass>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Rejected: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full border font-medium ${map[status] || map.Pending}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CHANNEL PERFORMANCE CHART
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p
          key={p.dataKey}
          className="text-xs font-medium"
          style={{ color: p.color }}
        >
          {p.dataKey === "views" ? "Ko'rishlar" : "Buyurtmalar"}:{" "}
          {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function ChannelPerformanceChart() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [pickerOpen, setPickerOpen] = useState(false);
  const data = PERFORMANCE_DATA[period];
  const currentLabel =
    PERIOD_OPTIONS.find((o) => o.key === period)?.label || "";

  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-white font-semibold">
          Kanal faolligi — ko'rishlar va buyurtmalar
        </h3>
        <div className="relative shrink-0">
          <button
            data-testid="button-performance-period"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 transition"
          >
            {currentLabel}
            <ChevronDown className="h-3 w-3" />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 mt-1.5 w-44 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-1 z-20">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    setPeriod(o.key as any);
                    setPickerOpen(false);
                  }}
                  className="w-full flex items-center justify-between text-xs text-slate-300 hover:bg-white/5 rounded-lg px-3 py-2 transition"
                >
                  {o.label}
                  {period === o.key && (
                    <Check className="h-3 w-3 text-violet-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-0.5 w-4 rounded-full bg-violet-400 inline-block" />
          Ko'rishlar
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-0.5 w-4 rounded-full bg-cyan-400 inline-block border-dashed" />
          Buyurtmalar
        </span>
      </div>

      <div className="h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <RechartsTooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="views"
              stroke="#a78bfa"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="orders"
              stroke="#22d3ee"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Glass>
  );
}

// ---------------------------------------------------------------------------
// LANDING PAGE
// ---------------------------------------------------------------------------

function Landing({
  onStart,
  onSignIn,
}: {
  onStart: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-32 -left-20" />
      <GradientBlob className="h-96 w-96 bg-blue-600 top-1/3 -right-32" />
      <GradientBlob className="h-72 w-72 bg-cyan-500 bottom-0 left-1/3" />

      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            OneOffice AI
          </span>
        </div>
        <button
          data-testid="button-signin"
          onClick={onSignIn}
          className="text-sm text-slate-300 hover:text-white transition px-4 py-2 rounded-full border border-white/10 hover:border-white/20"
        >
          Sign in
        </button>
      </nav>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-violet-300 mb-8">
          <Zap className="h-3.5 w-3.5" />
          Powered by generative AI
        </div>
        <h1 className="text-5xl md:text-7xl font-semibold text-white tracking-tight leading-[1.05] mb-6">
          Create Telegram Posts
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">
            with AI
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mb-10 leading-relaxed">
          Just enter the product name and price. Our AI prepares professional
          product posts automatically — images, copy, and design included.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            data-testid="button-start-now"
            onClick={onStart}
            className="group flex items-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-7 py-3.5 rounded-full font-medium shadow-lg shadow-violet-900/40 hover:shadow-violet-700/40 transition"
          >
            Start Now
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition" />
          </button>
          <button
            data-testid="button-watch-demo"
            className="flex items-center gap-2 text-slate-300 hover:text-white px-7 py-3.5 rounded-full border border-white/10 hover:border-white/20 transition"
          >
            <Play className="h-4 w-4" />
            Watch Demo
          </button>
        </div>

        <div className="mt-20 grid grid-cols-3 gap-8 w-full max-w-lg text-left">
          {[
            { n: "12,400+", l: "Posts generated" },
            { n: "98.7%", l: "AI accuracy" },
            { n: "40s", l: "Avg. turnaround" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-2xl font-semibold text-white">{s.n}</p>
              <p className="text-xs text-slate-500 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="relative z-10 text-center text-xs text-slate-600 pb-6">
        OneOffice AI — MVP preview. All AI output shown is simulated for
        demonstration.
      </div>
    </div>
  );
}

function SignIn({
  onDone,
  onSwitchToSignUp,
}: {
  onDone: (data: any) => void;
  onSwitchToSignUp: () => void;
}) {
  const [telegramUsername, setTelegramUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!telegramUsername.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramUsername }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Kirib bo'lmadi");
      onDone(data);
    } catch (err: any) {
      setError(err?.message || "Kirib bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center px-6">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-32 -left-20" />
      <GradientBlob className="h-72 w-72 bg-cyan-500 bottom-0 right-1/4" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            OneOffice AI
          </span>
        </div>

        <Glass className="p-8">
          <h2 className="text-white font-semibold text-xl mb-1 text-center">
            Xush kelibsiz
          </h2>
          <p className="text-slate-400 text-sm mb-6 text-center">
            Hisobingizga kirish uchun Telegram username'ingizni kiriting
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">
                Telegram username
              </label>
              <input
                data-testid="input-signin-telegram"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                placeholder="username"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-400/50"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
              </div>
            )}

            <button
              data-testid="button-signin-submit"
              type="submit"
              disabled={loading || !telegramUsername.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Kirish
            </button>
          </form>
        </Glass>

        <p className="text-center text-sm text-slate-500 mt-6">
          Hisobingiz yo'qmi?{" "}
          <button
            onClick={onSwitchToSignUp}
            className="text-violet-400 hover:text-violet-300 font-medium"
          >
            Ro'yxatdan o'tish
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIGN UP
// ---------------------------------------------------------------------------

const SIGNUP_STEPS = [
  { key: "info", label: "Your details" },
  { key: "channel", label: "Create channel" },
  { key: "bot", label: "Create bot" },
  { key: "connect", label: "Connect" },
];

function StepRail({ step }: { step: number }) {
  return (
    <div className="flex items-center mb-8">
      {SIGNUP_STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border transition ${
                i < step
                  ? "bg-violet-500 border-violet-500 text-white"
                  : i === step
                    ? "border-violet-400 text-violet-300 bg-violet-500/10"
                    : "border-white/10 text-slate-500"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`text-[10px] whitespace-nowrap ${i <= step ? "text-slate-300" : "text-slate-600"}`}
            >
              {s.label}
            </span>
          </div>
          {i < SIGNUP_STEPS.length - 1 && (
            <div
              className={`h-px flex-1 mx-2 mb-4 ${i < step ? "bg-violet-500" : "bg-white/10"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function InstructionList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3 mb-5">
      {items.map((text, i) => (
        <li
          key={i}
          className="flex gap-3 text-sm text-slate-300 leading-relaxed"
        >
          <span className="h-5 w-5 rounded-full bg-white/5 border border-white/10 text-[11px] text-violet-300 flex items-center justify-center shrink-0 mt-0.5 font-medium">
            {i + 1}
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (navigator?.clipboard)
      navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      data-testid={`button-copy-${value.replace(/[^a-zA-Z]/g, "")}`}
      onClick={copy}
      className="w-full flex items-center justify-between bg-black/30 border border-white/10 rounded-xl px-4 py-3 mb-5 font-mono text-sm text-slate-200 hover:border-white/20 transition"
    >
      {value}
      {copied ? (
        <ClipboardCheck className="h-4 w-4 text-emerald-400 shrink-0" />
      ) : (
        <Copy className="h-4 w-4 text-slate-500 shrink-0" />
      )}
    </button>
  );
}

function SignUp({
  onDone,
  onSwitchToSignIn,
}: {
  onDone: (data: any) => void;
  onSwitchToSignIn: () => void;
}) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    first: "",
    last: "",
    tgUsername: "",
    company: "",
    channelUsername: "",
    botToken: "",
  });
  const [error, setError] = useState("");
  const restored = useRef(false);

  const connectUser = useConnectUser();

  useEffect(() => {
    const saved = loadOnboarding();
    if (saved) {
      setStep(saved.step || 0);
      setF((prev) => ({ ...prev, ...saved.data }));
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    saveOnboarding({ step, data: f });
  }, [step, f]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    setF({ ...f, [k]: e.target.value });
  };

  const canNext = [
    f.first && f.last && f.tgUsername && f.company,
    !!f.channelUsername,
    true,
    true,
  ][step];

  function goNext() {
    if (!canNext) {
      setError("Please fill in every field to continue.");
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, SIGNUP_STEPS.length - 1));
  }

  function goBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleConnect() {
    if (!f.botToken.trim()) {
      setError("Paste your bot token to finish connecting.");
      return;
    }
    setError("");
    try {
      const connected = await connectUser.mutateAsync({
        data: {
          firstName: f.first,
          lastName: f.last,
          telegramUsername: f.tgUsername,
          company: f.company,
          channelUsername: f.channelUsername,
          botToken: f.botToken,
        },
      });
      clearOnboarding();
      onDone({
        ...f,
        id: connected.id,
        channelId: connected.channelId,
        botUsername: connected.botUsername,
      });
    } catch (err: any) {
      setError(
        (err as any)?.data?.error ||
          err?.message ||
          "Something went wrong while connecting. Please try again.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex items-center justify-center px-4 py-10">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-20 -left-20" />
      <GradientBlob className="h-96 w-96 bg-blue-600 bottom-0 -right-20" />

      <Glass className="relative z-10 w-full max-w-lg p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">OneOffice AI</span>
        </div>

        <StepRail step={step} />

        {step === 0 && (
          <div>
            <h2 className="text-2xl font-semibold text-white mb-1">
              Create your account
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Tell us a bit about you and your business.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  data-testid="input-first-name"
                  value={f.first}
                  onChange={set("first")}
                  placeholder="First name"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
                />
                <input
                  data-testid="input-last-name"
                  value={f.last}
                  onChange={set("last")}
                  placeholder="Last name"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
                />
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                  @
                </span>
                <input
                  data-testid="input-tg-username"
                  value={f.tgUsername}
                  onChange={set("tgUsername")}
                  placeholder="Telegram username"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
                />
              </div>
              <input
                data-testid="input-company"
                value={f.company}
                onChange={set("company")}
                placeholder="Business name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
              />
            </div>
            <p className="text-center text-sm text-slate-500 mt-5">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onSwitchToSignIn}
                className="text-violet-400 hover:text-violet-300 font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <Send className="h-4 w-4 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                Create your Telegram channel
              </h2>
            </div>
            <p className="text-sm text-slate-400 mb-5 ml-12">
              This is where your AI-generated posts will be published.
            </p>
            <InstructionList
              items={[
                <>
                  In Telegram, tap the compose icon and choose{" "}
                  <b className="text-white">New Channel</b>.
                </>,
                <>
                  Name it after your business — e.g.{" "}
                  <span className="text-slate-100">
                    "{f.company || "Your Business"} Store"
                  </span>
                  .
                </>,
                <>
                  In channel settings, set it to{" "}
                  <b className="text-white">Public</b> and pick a channel
                  username.
                </>,
                <>
                  Enter that username below so OneOffice AI knows where to post.
                </>,
              ]}
            />
            <div className="relative mb-2">
              <Hash className="h-4 w-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                data-testid="input-channel-username"
                value={f.channelUsername}
                onChange={set("channelUsername")}
                placeholder="yourchannelname"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-violet-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                Create your posting bot
              </h2>
            </div>
            <p className="text-sm text-slate-400 mb-5 ml-12">
              Telegram bots publish on your behalf — BotFather creates one in
              seconds.
            </p>
            <InstructionList
              items={[
                <>
                  Open <b className="text-white">@BotFather</b> in Telegram.
                </>,
                <>Send the command below to start creating a bot.</>,
                <>
                  Choose a display name, then a username ending in{" "}
                  <span className="text-slate-100">"bot"</span> (e.g.{" "}
                  {(f.company || "yourstore").replace(/\s/g, "").toLowerCase()}
                  _bot).
                </>,
                <>
                  BotFather replies with an API token — keep that chat open,
                  you'll need it in the next step.
                </>,
              ]}
            />
            <CopyField value="/newbot" />
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200 transition"
            >
              Open @BotFather <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <KeyRound className="h-4 w-4 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                Add your bot as a poster
              </h2>
            </div>
            <p className="text-sm text-slate-400 mb-5 ml-12">
              Give the bot permission to post in your channel, then connect it
              here.
            </p>
            <InstructionList
              items={[
                <>
                  Open your channel →{" "}
                  <b className="text-white">
                    Settings → Administrators → Add Admin
                  </b>
                  .
                </>,
                <>Search for your bot's username and select it.</>,
                <>
                  Enable <b className="text-white">Post Messages</b> permission
                  and save.
                </>,
                <>Paste the API token BotFather gave you below.</>,
              ]}
            />
            <input
              data-testid="input-bot-token"
              value={f.botToken}
              onChange={set("botToken")}
              type="password"
              placeholder="123456789:AAExampleTokenFromBotFather"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition font-mono"
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-xs mt-4">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        <div className="flex items-center gap-3 mt-7">
          {step > 0 && (
            <button
              data-testid="button-back"
              onClick={goBack}
              disabled={connectUser.isPending}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white px-4 py-3.5 rounded-xl border border-white/10 hover:border-white/20 transition text-sm font-medium disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {step < SIGNUP_STEPS.length - 1 ? (
            <button
              data-testid="button-continue"
              onClick={goNext}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-violet-900/30 hover:shadow-violet-700/30 transition"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              data-testid="button-finish-connect"
              onClick={handleConnect}
              disabled={connectUser.isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 disabled:opacity-60 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-emerald-900/30 transition"
            >
              {connectUser.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying bot
                  token...
                </>
              ) : (
                <>
                  Connect &amp; finish <Check className="h-4 w-4" />
                </>
              )}
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-5">
          Steps saved automatically — close anytime and pick up right where you
          left off.
        </p>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// APP SHELL
// ---------------------------------------------------------------------------

function Sidebar({ user, active, setActive, onLogout }: any) {
  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "Aziz Karimov";
  const initial = (user?.firstName?.[0] || "A").toUpperCase();
  const subLabel = user?.channelUsername
    ? `@${user.channelUsername}`
    : "Pro plan";

  const items = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "create", label: "Create Post", icon: PlusCircle },
    { key: "history", label: "History", icon: History },
    { key: "settings", label: "Settings", icon: Settings },
    { key: "profile", label: "Profile", icon: User },
  ];

  return (
    <aside className="hidden md:flex md:static z-40 top-0 left-0 h-full w-64 bg-white/5 backdrop-blur-xl border-r border-white/10 flex-col py-6 px-4">
      <div className="flex items-center gap-2 px-2 mb-10">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <span className="text-white font-semibold text-lg">OneOffice AI</span>
      </div>
      <nav className="flex-1 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              data-testid={`link-sidebar-${it.key}`}
              onClick={() => setActive(it.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                isActive
                  ? "bg-gradient-to-r from-violet-500/20 to-blue-500/20 text-white border border-violet-400/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </button>
          );
        })}
      </nav>
      <div className="px-2 pt-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{subLabel}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-rose-400 px-2 py-1 transition"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// BOTTOM NAV (mobile) — fixed tab bar like professional mobile apps
// ---------------------------------------------------------------------------

function BottomNav({ active, setActive }: any) {
  const items = [
    { key: "dashboard", label: "Home", icon: Home },
    { key: "create", label: "Create", icon: PlusCircle },
    { key: "history", label: "History", icon: History },
    { key: "settings", label: "Settings", icon: Settings },
    { key: "profile", label: "Profile", icon: User },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-white/10"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around px-1 py-2">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              data-testid={`link-bottomnav-${it.key}`}
              onClick={() => setActive(it.key)}
              className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl min-w-[56px] transition"
            >
              <Icon
                className={`h-5 w-5 transition-transform ${
                  isActive ? "text-violet-400 scale-110" : "text-slate-500"
                }`}
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? "text-violet-400" : "text-slate-500"
                }`}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Topbar({ title, onNewPost }: any) {
  return (
    <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-5 border-b border-white/10">
      <h1 className="text-lg md:text-xl font-semibold text-white tracking-tight truncate">
        {title}
      </h1>
      {onNewPost && (
        <button
          data-testid="button-topbar-new-post"
          onClick={onNewPost}
          className="flex items-center gap-1 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-4 py-2 md:px-5 md:py-2.5 rounded-full font-semibold text-sm shadow-lg shadow-violet-900/50 ring-2 ring-violet-400/40 hover:shadow-violet-600/60 hover:scale-105 transition-all whitespace-nowrap shrink-0"
        >
          + New Post
        </button>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------

function Dashboard({ goCreate, user }: any) {
  const { data: stats } = useGetUserStats(
    { userId: user?.id },
    {
      query: {
        enabled: !!user?.id,
        queryKey: getGetUserStatsQueryKey({ userId: user?.id }),
      },
    },
  );

  const displayStats = stats || {
    total: 128,
    published: 109,
    pending: 4,
    rejected: 0,
  };

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="flex flex-col md:flex-row gap-4">
        <StatCard
          icon={FileText}
          label="Generated Posts"
          value={displayStats.total}
          accent="bg-violet-600"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={displayStats.pending}
          accent="bg-amber-600"
        />
        <StatCard
          icon={Rocket}
          label="Published"
          value={displayStats.published}
          accent="bg-blue-600"
        />
        <StatCard
          icon={ShieldCheck}
          label="AI Accuracy"
          value="98.7%"
          sub="+0.4%"
          accent="bg-emerald-600"
        />
      </div>

      <ChannelPerformanceChart />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CREATE POST FLOW
// ---------------------------------------------------------------------------

function CreateForm({ form, setForm, onGenerate }: any) {
  const valid = form.name.trim() && form.price.trim();
  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <Glass className="p-8">
        <h3 className="text-white text-xl font-semibold mb-1">
          Create a new post
        </h3>
        <p className="text-slate-400 text-sm mb-6">
          Tell us what you're selling — AI will do the rest.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Package className="h-3 w-3" /> Product Name
            </label>
            <input
              data-testid="input-product-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. AeroSound Pro Earbuds"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" /> Price (UZS)
            </label>
            <input
              data-testid="input-product-price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="e.g. 349,000"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Category
            </label>
            <select
              data-testid="select-product-category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-violet-400 transition"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Optional Notes
            </label>
            <textarea
              data-testid="input-product-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any details the AI should highlight..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition resize-none"
            />
          </div>
        </div>

        <button
          data-testid="button-generate-post"
          disabled={!valid}
          onClick={onGenerate}
          className="w-full mt-7 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-medium shadow-lg shadow-violet-900/30 hover:shadow-violet-700/30 transition"
        >
          <Wand2 className="h-4 w-4" /> Generate Post
        </button>
      </Glass>
    </div>
  );
}

function Generating({ form, onDone, onError }: any) {
  const [step, setStep] = useState(0);
  const total = PIPELINE_STEPS.length;
  const enrichProduct = useEnrichProduct();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    // Animate pipeline steps while API call runs
    const timer = setInterval(() => {
      setStep((s) => (s < total - 2 ? s + 1 : s));
    }, 1400);

    enrichProduct
      .mutateAsync({
        data: {
          name: form.name,
          price: form.price,
          category: form.category,
          notes: form.notes || "",
        },
      })
      .then((data) => {
        clearInterval(timer);
        setStep(total - 1);
        setTimeout(() => onDone(data), 600);
      })
      .catch((err: any) => {
        clearInterval(timer);
        onError?.(
          (err as any)?.data?.error ||
            err?.message ||
            "AI generation failed. Check your Groq API key.",
        );
      });

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.round(((step + 1) / total) * 100);

  return (
    <div className="p-6 md:p-10 max-w-xl">
      <Glass className="p-8 text-center">
        <div className="relative h-20 w-20 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 opacity-30 animate-ping" />
          <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        </div>
        <h3 className="text-white text-lg font-semibold mb-1">
          AI is working its magic
        </h3>
        <p className="text-slate-400 text-sm mb-6">
          Rasm izlanmoqda, narx tahlil qilinmoqda, post yozilmoqda…
        </p>

        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mb-6">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="space-y-2 text-left">
          {PIPELINE_STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div
                key={s.label}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition ${active ? "bg-white/5" : ""}`}
              >
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500" : active ? "bg-violet-500" : "bg-white/10"}`}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Icon
                      className={`h-3 w-3 ${active ? "text-white animate-pulse" : "text-slate-500"}`}
                    />
                  )}
                </div>
                <span
                  className={`text-sm ${done ? "text-slate-500 line-through" : active ? "text-white" : "text-slate-600"}`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </Glass>
    </div>
  );
}

function ImagePickerCard({
  img,
  selected,
  onSelect,
}: {
  img: any;
  selected: boolean;
  onSelect: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  return (
    <button
      onClick={onSelect}
      className={`shrink-0 relative rounded-2xl overflow-hidden snap-start transition-all ring-2 ${selected ? "ring-violet-400 scale-[1.03]" : "ring-transparent hover:ring-white/20"}`}
      style={{ width: 140, height: 140 }}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 bg-white/5 flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
        </div>
      )}
      {!errored ? (
        <img
          src={proxyImage(img.thumbnail || img.url)}
          alt={img.title}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setErrored(true);
            setLoaded(true);
          }}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
          <Package className="h-8 w-8 text-slate-600" />
        </div>
      )}
      {selected && (
        <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-violet-500 flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      )}
    </button>
  );
}

function Results({
  form,
  enrichData,
  selectedImages,
  onToggleImage,
  error,
  onPreview,
  onApprove,
  onReject,
}: any) {
  const postText: string =
    enrichData?.postText ||
    `✨ ${form.name}\n\n💰 ${form.price} UZS\n\n📲 Buyurtma uchun yozing!`;
  const enriched = enrichData?.enriched || {};
  const priceDiffPercent: number = enriched.priceDiffPercent ?? 0;

  const [myImages, setMyImages] = useState<any[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function triggerCamera() {
    cameraInputRef.current?.click();
  }
  function triggerGallery() {
    galleryInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const title = form.name || "Yuklangan rasm";
    const entry = { id, url: dataUrl, title, generated: false };
    setMyImages((prev) => [entry, ...prev]);
    // Newly uploaded photos are selected by default — tap again to deselect.
    onToggleImage(entry);
  }

  const UPLOAD_STYLES = [
    {
      key: "camera",
      label: "Kamera",
      icon: Camera,
      onClick: () => triggerCamera(),
    },
    {
      key: "gallery",
      label: "Galereya",
      icon: ImageIcon,
      onClick: () => triggerGallery(),
    },
  ];

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4" /> Generation complete — AI post
        tayyor
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── IMAGE PICKER ── */}
      <Glass className="p-6">
        <h3 className="text-white font-semibold mb-1">Mahsulot rasmi</h3>
        <p className="text-xs text-slate-400 mb-4">
          Rasmni kamera bilan oling yoki galereyadan tanlang — xohlagancha
          yuklab, bir nechtasini belgilashingiz mumkin (2+ rasm albom sifatida
          yuboriladi).
        </p>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelected}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {UPLOAD_STYLES.map((s) => (
            <button
              key={s.key}
              onClick={s.onClick}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-4 border border-white/10 bg-white/5 hover:bg-white/10 transition text-center"
            >
              <s.icon className="h-5 w-5 text-slate-300" />
              <span className="text-xs font-medium text-white">{s.label}</span>
            </button>
          ))}
        </div>

        {myImages.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x scrollbar-thin">
            {myImages.map((img: any) => (
              <ImagePickerCard
                key={img.id}
                img={img}
                selected={selectedImages.some((si: any) => si.id === img.id)}
                onSelect={() => onToggleImage(img)}
              />
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">
            Hali rasm yuklanmadi — nashr qilishda matn bilan yuboriladi.
          </p>
        )}
        {selectedImages.length > 0 && (
          <p className="mt-3 text-xs text-slate-400 truncate">
            Tanlangan: {selectedImages.length} ta rasm
            {selectedImages.length >= 2 ? " (albom sifatida yuboriladi)" : ""}
          </p>
        )}
      </Glass>

      {/* ── MARKET PRICE COMPARISON ── */}
      {enriched.marketPrice && (
        <Glass className="p-6">
          <h3 className="text-white font-semibold mb-4">📊 Narx tahlili</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-2xl p-4">
              <p className="text-xs text-slate-400 mb-1">Sizning narxingiz</p>
              <p className="text-white font-semibold text-lg">
                {form.price} UZS
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-4">
              <p className="text-xs text-slate-400 mb-1">
                Bozor o'rtacha narxi
              </p>
              <p className="text-white font-semibold text-lg">
                {enriched.marketPrice} UZS
              </p>
            </div>
          </div>
          <div
            className={`mt-3 flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl ${priceDiffPercent >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
          >
            <TrendingUp className="h-4 w-4 shrink-0" />
            {enriched.priceDiff}
          </div>
        </Glass>
      )}

      {/* ── PRODUCT INFO ── */}
      {(enriched.description || enriched.dimensions) && (
        <Glass className="p-6 space-y-5">
          <h3 className="text-white font-semibold">📦 Mahsulot ma'lumotlari</h3>

          {enriched.description && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                Tavsif
              </p>
              <p className="text-slate-300 text-sm leading-relaxed">
                {enriched.description}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {enriched.dimensions && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">📐 O'lchamlar</p>
                <p className="text-white text-sm font-medium">
                  {enriched.dimensions}
                </p>
              </div>
            )}
            {enriched.weight && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">⚖️ Og'irligi</p>
                <p className="text-white text-sm font-medium">
                  {enriched.weight}
                </p>
              </div>
            )}
          </div>

          {enriched.extras && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                Texnik xususiyatlar
              </p>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                {enriched.extras}
              </p>
            </div>
          )}

          {enriched.usageGuide && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                🎯 Ishlatish bo'yicha maslahat
              </p>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                {enriched.usageGuide}
              </p>
            </div>
          )}

          {enriched.lifehacks && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
              <p className="text-xs text-violet-300 mb-1.5 font-medium uppercase tracking-wider">
                💡 Lifehacklar
              </p>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                {enriched.lifehacks}
              </p>
            </div>
          )}
        </Glass>
      )}

      {/* ── GENERATED POST ── */}
      <Glass className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">✍️ Tayyor post matni</h3>
          <button
            onClick={() => navigator.clipboard?.writeText(postText)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
          >
            <Copy className="h-3 w-3" /> Nusxa olish
          </button>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
            {postText}
          </p>
        </div>
      </Glass>

      <div className="flex flex-wrap gap-3">
        <button
          data-testid="button-preview"
          onClick={() => onPreview()}
          className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-5 py-3 rounded-xl text-sm font-medium hover:border-white/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Eye className="h-4 w-4" /> Preview
        </button>
        <button
          data-testid="button-approve"
          onClick={() => onApprove()}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg shadow-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ThumbsUp className="h-4 w-4" /> Approve & Publish
        </button>
        <button
          data-testid="button-reject"
          onClick={onReject}
          className="flex items-center gap-2 bg-white/5 border border-rose-500/30 text-rose-400 px-5 py-3 rounded-xl text-sm font-medium hover:bg-rose-500/10 transition"
        >
          <ThumbsDown className="h-4 w-4" /> Rad etish
        </button>
      </div>
    </div>
  );
}

function TelegramPreviewModal({
  form,
  selectedImages,
  postText,
  onClose,
  onApprove,
}: any) {
  const preview =
    postText ||
    `✨ ${form.name}\n\n💰 ${form.price} UZS\n\n📲 Buyurtma uchun yozing!`;
  const lines = preview.split("\n").filter(Boolean);
  const images: any[] = selectedImages || [];

  function imgSrc(img: any) {
    return img.generated ? img.url : proxyImage(img.thumbnail || img.url);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm my-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-white text-sm font-medium">
            Telegram Preview
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="bg-[#0e1621] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          {/* Channel header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#17212b]">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">
              O
            </div>
            <div>
              <p className="text-white text-sm font-medium">OneOffice Store</p>
              <p className="text-slate-400 text-xs">
                channel · 24.1k subscribers
              </p>
            </div>
          </div>
          <div className="p-3">
            {/* Product image(s) — rendered as a Telegram-style album grid when
                2+ images are selected, matching how sendMediaGroup posts. */}
            {images.length === 1 ? (
              <img
                src={imgSrc(images[0])}
                alt={images[0].title}
                className="w-full aspect-square object-cover rounded-xl mb-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : images.length >= 2 ? (
              <div className="grid grid-cols-2 gap-1 mb-2">
                {images.slice(0, 4).map((img, i) => (
                  <div key={img.id} className="relative aspect-square">
                    <img
                      src={imgSrc(img)}
                      alt={img.title}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {i === 3 && images.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                        <span className="text-white text-sm font-semibold">
                          +{images.length - 4}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-violet-900 to-indigo-950 flex items-center justify-center mb-2">
                <Package className="h-14 w-14 text-violet-400" />
              </div>
            )}
            {/* Post text */}
            <div className="bg-[#182533] rounded-xl p-3">
              <div className="space-y-1 text-sm">
                {lines.slice(0, 12).map((line: string, i: number) => (
                  <p
                    key={i}
                    className={`leading-relaxed ${line.startsWith("#") ? "text-blue-400 text-xs" : line.includes("UZS") || line.includes("💰") ? "text-white font-semibold" : "text-slate-300"}`}
                  >
                    {line}
                  </p>
                ))}
                {lines.length > 12 && (
                  <p className="text-slate-500 text-xs">…</p>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                <span className="text-slate-500 text-xs">18:42</span>
                <span className="text-slate-500 text-xs">✓✓ 1.2k views</span>
              </div>
            </div>
            <button className="w-full mt-2 bg-[#2b5278] text-white text-sm py-2.5 rounded-lg font-medium">
              🛒 Buy Now
            </button>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 bg-white/5 border border-white/10 text-white py-3 rounded-xl text-sm font-medium"
          >
            Yopish
          </button>
          <button
            data-testid="button-approve-publish"
            onClick={onApprove}
            className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 rounded-xl text-sm font-medium"
          >
            ✅ Tasdiqlash
          </button>
        </div>
      </div>
    </div>
  );
}

function Publishing({
  user,
  form,
  enrichData,
  selectedImages,
  onDone,
  onError,
}: any) {
  const publishPost = usePublishPost();
  const mounted = useRef(true);

  useEffect(() => {
    async function run() {
      const postText =
        enrichData?.postText || `${form.name} — ${form.price} UZS`;
      const imageUrls = (selectedImages || []).map((img: any) => img.url);
      try {
        await publishPost.mutateAsync({
          data: {
            userId: user?.id || 1,
            text: postText,
            ...(imageUrls.length ? { imageUrls } : {}),
          },
        });
        if (mounted.current) onDone();
      } catch (err: any) {
        if (mounted.current)
          onError?.(
            (err as any)?.data?.error ||
              err?.message ||
              "Failed to publish to Telegram.",
          );
      }
    }
    run();
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-md">
      <Glass className="p-10 text-center">
        <div className="relative h-16 w-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-full bg-blue-500 opacity-30 animate-ping" />
          <div className="relative h-16 w-16 rounded-full bg-blue-500 flex items-center justify-center">
            <Send className="h-6 w-6 text-white" />
          </div>
        </div>
        <h3 className="text-white font-semibold text-lg">
          Publishing to Telegram...
        </h3>
        <p className="text-slate-400 text-sm mt-1">Please wait a moment.</p>
      </Glass>
    </div>
  );
}

function SuccessScreen({ form, onDone }: any) {
  return (
    <div className="p-6 md:p-10 max-w-md">
      <Glass className="p-10 text-center">
        <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
          <Check className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-white font-semibold text-xl">
          Post Published Successfully
        </h3>
        <p className="text-slate-400 text-sm mt-2">
          "{form.name}" is now live on your Telegram channel.
        </p>
        <button
          data-testid="button-back-to-dashboard"
          onClick={onDone}
          className="mt-7 w-full bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3 rounded-xl text-sm font-medium"
        >
          Back to Dashboard
        </button>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------

function HistoryPage({ user }: any) {
  const { data: posts } = useListPosts(
    { userId: user?.id },
    {
      query: {
        enabled: !!user?.id,
        queryKey: getListPostsQueryKey({ userId: user?.id }),
      },
    },
  );

  const displayPosts = posts || seedHistory;

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");

  const filtered = displayPosts.filter(
    (h: any) =>
      (filter === "All" || h.status === filter) &&
      h.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posts..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
          />
        </div>
        <div className="flex gap-2">
          {["All", "Published", "Pending", "Rejected"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition ${filter === f ? "bg-violet-500/20 border-violet-400/40 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((h: any) => (
          <Glass
            key={h.id}
            className="p-5 flex items-center justify-between min-w-0"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-violet-300" />
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {h.name}
                </p>
                <p className="text-slate-500 text-xs mt-0.5 truncate">
                  {h.category} · {h.createdAt || h.date}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="text-sm text-slate-300">
                {h.price} {String(h.price).includes("UZS") ? "" : "UZS"}
              </span>
              <StatusPill status={h.status} />
            </div>
          </Glass>
        ))}
        {filtered.length === 0 && (
          <p className="text-slate-500 text-sm col-span-2 text-center py-10">
            No posts match your search.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange }: any) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`h-6 w-11 rounded-full transition relative shrink-0 ${checked ? "bg-violet-500" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-5" : "left-0.5"}`}
      />
    </button>
  );
}

function SettingsPage() {
  const [s, setS] = useState({
    autoPublish: false,
    skipPreview: false,
    darkMode: true,
    notifications: true,
  });
  const rows = [
    {
      key: "autoPublish",
      icon: Rocket,
      label: "Auto Publish",
      desc: "Publish posts automatically once generated",
    },
    {
      key: "skipPreview",
      icon: Eye,
      label: "Publish without Preview",
      desc: "Skip the Telegram preview step before publishing",
    },
    {
      key: "darkMode",
      icon: Moon,
      label: "Dark Mode",
      desc: "Use a dark interface theme",
    },
    {
      key: "notifications",
      icon: Bell,
      label: "Notifications",
      desc: "Get notified about generation and publishing",
    },
  ];
  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-4">
      <Glass className="p-6 divide-y divide-white/5">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.key}
              className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-slate-300" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{r.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{r.desc}</p>
                </div>
              </div>
              <Toggle
                checked={(s as any)[r.key]}
                onChange={(v: boolean) => setS({ ...s, [r.key]: v })}
              />
            </div>
          );
        })}
      </Glass>
      <Glass className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
            <Globe className="h-4 w-4 text-slate-300" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">Language</p>
            <p className="text-slate-500 text-xs mt-0.5">Interface language</p>
          </div>
        </div>
        <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
          <option className="bg-slate-900">English</option>
          <option className="bg-slate-900">O'zbekcha</option>
          <option className="bg-slate-900">Русский</option>
        </select>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------------

function ProfilePage({ user, onLogout }: any) {
  const { data: stats } = useGetUserStats(
    { userId: user?.id },
    {
      query: {
        enabled: !!user?.id,
        queryKey: getGetUserStatsQueryKey({ userId: user?.id }),
      },
    },
  );

  const displayStats = stats || {
    total: 128,
    published: 109,
    pending: 4,
    rejected: 0,
  };
  const accuracy = "98.7%";

  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "Aziz Karimov";
  const initial = (user?.firstName?.[0] || "A").toUpperCase();
  const subLabel = user
    ? `@${user.telegramUsername} · ${user.company}`
    : "aziz@onestore.uz · OneStore LLC";

  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-6">
      <Glass className="p-8 flex items-center gap-5">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-2xl font-semibold shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <h3 className="text-white text-xl font-semibold truncate">
            {displayName}
          </h3>
          <p className="text-slate-400 text-sm truncate">{subLabel}</p>
        </div>
      </Glass>
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={FileText}
          label="Total Posts"
          value={displayStats.total}
          sub=""
          accent="bg-violet-600"
        />
        <StatCard
          icon={Rocket}
          label="Published"
          value={displayStats.published}
          sub=""
          accent="bg-blue-600"
        />
        <StatCard
          icon={ShieldCheck}
          label="Accuracy"
          value={accuracy}
          sub=""
          accent="bg-emerald-600"
        />
      </div>
      {user?.channelUsername && (
        <Glass className="p-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <Send className="h-4 w-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">
                @{user.channelUsername}
              </p>
              <p className="text-slate-500 text-xs mt-0.5 truncate">
                Ulangan Telegram kanal
              </p>
            </div>
          </div>
          <div className="h-7 w-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          </div>
        </Glass>
      )}

      <button
        data-testid="button-profile-signout"
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 bg-white/5 border border-rose-500/30 text-rose-400 py-3.5 rounded-xl text-sm font-medium hover:bg-rose-500/10 transition"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROOT APP
// ---------------------------------------------------------------------------

function OneOfficeAI() {
  const savedSession = loadSession();
  const [screen, setScreen] = useState(() => {
    if (savedSession) return "app";
    if (loadOnboarding()) return "signup";
    return "landing";
  });
  const [navView, setNavView] = useState("dashboard");
  const [flow, setFlow] = useState("form");
  const [form, setForm] = useState({
    name: "",
    price: "",
    category: "Electronics",
    notes: "",
  });
  const [enrichData, setEnrichData] = useState<any>(null);
  const [selectedImages, setSelectedImages] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [user, setUser] = useState<any>(savedSession ?? null);
  const [publishError, setPublishError] = useState("");
  const [generateError, setGenerateError] = useState("");

  const appQueryClient = useQueryClient();

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    create: "Create Post",
    history: "History",
    settings: "Settings",
    profile: "Profile",
  };

  function resetCreate() {
    setFlow("form");
    setForm({ name: "", price: "", category: "Electronics", notes: "" });
    setEnrichData(null);
    setSelectedImages([]);
    setShowPreview(false);
    setPublishError("");
    setGenerateError("");
  }

  function toggleImage(img: any) {
    setSelectedImages((prev) =>
      prev.some((im) => im.id === img.id)
        ? prev.filter((im) => im.id !== img.id)
        : [...prev, img],
    );
  }

  function handleGenerateDone(data: any) {
    setEnrichData(data);
    setFlow("results");
  }

  function handleGenerateError(msg: string) {
    setGenerateError(msg);
    setFlow("results"); // Show results even on error with fallback text
  }

  function handleApprove() {
    setShowPreview(false);
    setPublishError("");
    setFlow("publishing");
  }

  function handlePublishDone() {
    if (user?.id) {
      appQueryClient.invalidateQueries({
        queryKey: getListPostsQueryKey({ userId: user.id }),
      });
      appQueryClient.invalidateQueries({
        queryKey: getGetUserStatsQueryKey({ userId: user.id }),
      });
    }
    setFlow("success");
  }

  function handlePublishError(message: string) {
    setPublishError(message);
    setFlow("results");
  }

  function handleLogout() {
    clearSession();
    clearOnboarding();
    setUser(null);
    resetCreate();
    setNavView("dashboard");
    setScreen("landing");
  }

  if (screen === "landing")
    return (
      <Landing
        onStart={() => setScreen("signup")}
        onSignIn={() => setScreen("signin")}
      />
    );
  if (screen === "signin")
    return (
      <SignIn
        onDone={(data) => {
          saveSession(data);
          setUser(data);
          setScreen("app");
        }}
        onSwitchToSignUp={() => setScreen("signup")}
      />
    );
  if (screen === "signup")
    return (
      <SignUp
        onDone={(data) => {
          saveSession(data);
          setUser(data);
          setScreen("app");
        }}
        onSwitchToSignIn={() => setScreen("signin")}
      />
    );

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar
        user={user}
        active={navView}
        setActive={(v: string) => {
          setNavView(v);
          if (v === "create") resetCreate();
        }}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <Topbar
          title={titles[navView]}
          onNewPost={
            navView === "dashboard"
              ? () => {
                  setNavView("create");
                  resetCreate();
                }
              : undefined
          }
        />

        {navView === "dashboard" && (
          <Dashboard
            goCreate={() => {
              setNavView("create");
              resetCreate();
            }}
            user={user}
          />
        )}

        {navView === "create" && (
          <>
            {flow === "form" && (
              <CreateForm
                form={form}
                setForm={setForm}
                onGenerate={() => {
                  setGenerateError("");
                  setFlow("generating");
                }}
              />
            )}
            {flow === "generating" && (
              <Generating
                form={form}
                onDone={handleGenerateDone}
                onError={handleGenerateError}
              />
            )}
            {flow === "results" && (
              <Results
                form={form}
                enrichData={enrichData}
                selectedImages={selectedImages}
                onToggleImage={toggleImage}
                error={publishError || generateError}
                onPreview={() => setShowPreview(true)}
                onApprove={handleApprove}
                onReject={resetCreate}
              />
            )}
            {flow === "publishing" && (
              <Publishing
                user={user}
                form={form}
                enrichData={enrichData}
                selectedImages={selectedImages}
                onDone={handlePublishDone}
                onError={handlePublishError}
              />
            )}
            {flow === "success" && (
              <SuccessScreen
                form={form}
                onDone={() => {
                  setNavView("dashboard");
                  resetCreate();
                }}
              />
            )}
          </>
        )}

        {navView === "history" && <HistoryPage user={user} />}
        {navView === "settings" && <SettingsPage />}
        {navView === "profile" && (
          <ProfilePage user={user} onLogout={handleLogout} />
        )}
      </div>

      <BottomNav
        active={navView}
        setActive={(v: string) => {
          setNavView(v);
          if (v === "create") resetCreate();
        }}
      />

      {showPreview && (
        <TelegramPreviewModal
          form={form}
          selectedImages={selectedImages}
          postText={enrichData?.postText}
          onClose={() => setShowPreview(false)}
          onApprove={handleApprove}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <OneOfficeAI />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
