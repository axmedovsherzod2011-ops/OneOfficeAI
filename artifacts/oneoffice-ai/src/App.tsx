import React, { useState, useEffect, useRef } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithApple,
  resetPassword,
} from "@/lib/firebase";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  Sparkles,
  Home,
  PlusCircle,
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
  Trash2,
  Link2,
  Radio,
  Pencil,
  Instagram,
} from "lucide-react";

import {
  useCreateProfile,
  useListTelegramChannels,
  useGetTelegramConfig,
  useGetTelegramLink,
  useDisconnectTelegramChannel,
  getListTelegramChannelsQueryKey,
  useGetInstagramConfig,
  useListInstagramAccounts,
  useExchangeInstagramCode,
  useDisconnectInstagramAccount,
  getListInstagramAccountsQueryKey,
  usePublishPost,
  useEnrichProduct,
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
  type ProductItem,
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

const CURRENCIES = [
  { key: "UZS", label: "UZS" },
  { key: "USD", label: "USD" },
  { key: "RUB", label: "RUB" },
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
// FIREBASE AUTH CONFIG
// ---------------------------------------------------------------------------
// Identity (sign up / sign in via email+password, Google, and Apple) is now
// fully owned by Firebase Authentication — no more Clerk. The app-specific
// business profile (telegram channel, bot, etc.) is fetched separately from
// /api/me once the person is signed in, using the Firebase ID token as the
// bearer credential.

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Translates common Firebase Auth error codes into user-facing Uzbek copy.
function mapFirebaseError(err: any): string {
  const code = err?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "Bu email allaqachon ro'yxatdan o'tgan.";
    case "auth/invalid-email":
      return "Email manzil noto'g'ri.";
    case "auth/weak-password":
      return "Parol juda oddiy. Kamida 6 belgidan foydalaning.";
    case "auth/missing-password":
      return "Iltimos, parolni kiriting.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email yoki parol noto'g'ri.";
    case "auth/too-many-requests":
      return "Urinishlar juda ko'p. Birozdan so'ng qayta urinib ko'ring.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Oyna yopildi. Qayta urinib ko'ring.";
    case "auth/account-exists-with-different-credential":
      return "Bu email boshqa usulda (masalan, parol bilan) ro'yxatdan o'tgan.";
    default:
      return err?.message || "Xatolik yuz berdi. Qayta urinib ko'ring.";
  }
}

// Routes an external (possibly hotlink-protected) image URL through our own
// backend so it reliably renders in <img> tags. No-ops for data: URLs
// (already-generated images) since those need no proxying.
function proxyImage(url: string): string {
  if (!url || url.startsWith("data:")) return url;
  return `/api/images/proxy?url=${encodeURIComponent(url)}`;
}

// Reads an uploaded photo, downsizes it (long edge capped at 1600px) and
// re-encodes as JPEG before turning it into a base64 data URL. Phone
// camera photos are routinely 3-8MB — without this, selecting a handful of
// them for a product would blow past the request body limit and take
// forever to upload on a slow connection.
function resizeImageFile(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Canvas unsupported for some reason — fall back to the
          // original, un-resized data URL rather than failing outright.
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
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
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl shadow-black/30 ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHANNEL PERFORMANCE CHART
// ---------------------------------------------------------------------------

const METRIC_CONFIG = {
  views: {
    label: "Ko'rishlar",
    title: "Kanal faolligi — ko'rishlar",
    color: "#a78bfa",
    dash: undefined as string | undefined,
  },
  orders: {
    label: "Sotuvlar",
    title: "Kanal faolligi — sotuvlar",
    color: "#22d3ee",
    dash: "5 4",
  },
} as const;

function ChartTooltip({ active, payload, label, metricLabel }: any) {
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
          {metricLabel}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function ChannelPerformanceChart({
  metric = "views",
}: {
  metric?: "views" | "orders";
}) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [pickerOpen, setPickerOpen] = useState(false);
  const data = PERFORMANCE_DATA[period];
  const currentLabel =
    PERIOD_OPTIONS.find((o) => o.key === period)?.label || "";
  const cfg = METRIC_CONFIG[metric];

  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-white font-semibold">{cfg.title}</h3>
        <div className="relative shrink-0">
          <button
            data-testid={`button-performance-period-${metric}`}
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
          <span
            className="h-0.5 w-4 rounded-full inline-block"
            style={{ backgroundColor: cfg.color }}
          />
          {cfg.label}
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
            <RechartsTooltip
              content={<ChartTooltip metricLabel={cfg.label} />}
            />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={cfg.color}
              strokeWidth={2.5}
              strokeDasharray={cfg.dash}
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
          <img
            src="/brand-logo.png"
            alt="OneOffice AI"
            className="h-9 w-9 rounded-xl object-cover shrink-0"
          />
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

// ---------------------------------------------------------------------------
// WELCOME SCREEN — the very first thing a person sees on a device that has
// never had an account created on it. Once an account is created (or the
// person signs in) on this device, ONBOARDING_KEY is persisted to
// localStorage and this screen is skipped on every future visit — see
// AppRoutes below. If the person navigates away without finishing sign-up
// (e.g. refreshes), nothing is persisted, so Welcome shows again.
// ---------------------------------------------------------------------------

const WELCOME_FEATURES = [
  { icon: Wand2, text: "Mahsulot nomi va narxini kiriting — AI qolganini bajaradi" },
  { icon: ImageIcon, text: "Professional rasm va dizayn avtomatik tayyorlanadi" },
  { icon: Send, text: "Bir tegining bilan Telegram kanal(lar)ingizga post qiling" },
];

function WelcomeScreen({
  onGetStarted,
  onSignIn,
}: {
  onGetStarted: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center px-6 py-10">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-32 -left-20" />
      <GradientBlob className="h-96 w-96 bg-blue-600 top-1/3 -right-32" />
      <GradientBlob className="h-72 w-72 bg-cyan-500 bottom-0 left-1/3" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full">
        <img
          src="/brand-logo.png"
          alt="OneOffice AI"
          className="h-16 w-16 rounded-2xl object-cover shrink-0 mb-6 shadow-lg shadow-violet-900/40"
        />
        <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">
          OneOffice AI'ga xush kelibsiz
        </h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Telegram do'koningiz uchun sun'iy intellekt yordamida bir necha
          soniyada professional postlar yarating.
        </p>

        <Glass className="w-full p-6 mb-8 text-left">
          <div className="space-y-4">
            {WELCOME_FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-violet-300" />
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed mt-1.5">
                    {f.text}
                  </p>
                </div>
              );
            })}
          </div>
        </Glass>

        <button
          data-testid="button-welcome-get-started"
          onClick={onGetStarted}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-violet-900/40 hover:shadow-violet-700/40 transition mb-3"
        >
          Boshlash <ArrowRight className="h-4 w-4" />
        </button>
        <button
          data-testid="button-welcome-signin"
          onClick={onSignIn}
          className="text-sm text-slate-400 hover:text-white transition"
        >
          Hisobingiz bormi? Kirish
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIGN IN / SIGN UP (Firebase Authentication) — email/password, Google, and
// Apple. Firebase has no drop-in hosted UI like Clerk, so the forms and the
// "Google" / "Apple" buttons are hand-built here and call the Firebase Auth
// SDK directly (see src/lib/firebase.ts).
// ---------------------------------------------------------------------------

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-[440px] overflow-hidden shadow-2xl shadow-black/30 p-5 sm:p-8">
      {children}
    </div>
  );
}

function AuthBrand() {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/brand-logo.png"
        alt="OneOffice AI"
        className="h-9 w-9 rounded-xl object-cover shrink-0"
      />
      <span className="text-white font-semibold text-lg tracking-tight">
        OneOffice AI
      </span>
    </div>
  );
}

function SocialButtons({
  onGoogle,
  onApple,
  disabled,
}: {
  onGoogle: () => void;
  onApple: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onGoogle}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-xl py-2.5 text-white font-medium disabled:opacity-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Google bilan davom etish
      </button>
      <button
        type="button"
        onClick={onApple}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-xl py-2.5 text-white font-medium disabled:opacity-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 384 512" fill="currentColor">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
        Apple bilan davom etish
      </button>
    </div>
  );
}

function SignInPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      setLocation(basePath || "/");
    } catch (err: any) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      setLocation(basePath || "/");
    } catch (err: any) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError("");
    setLoading(true);
    try {
      await signInWithApple();
      setLocation(basePath || "/");
    } catch (err: any) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!email) {
      setError("Parolni tiklash uchun avval email manzilingizni kiriting.");
      return;
    }
    setError("");
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err: any) {
      setError(mapFirebaseError(err));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-x-hidden flex items-center justify-center px-4 py-6 sm:py-10">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-32 -left-20" />
      <GradientBlob className="h-72 w-72 bg-cyan-500 bottom-0 right-1/4" />
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-[440px]">
        <AuthBrand />

        <AuthCard>
          <h1 className="text-white font-semibold text-xl mb-1">
            Xush kelibsiz
          </h1>
          <p className="text-slate-400 text-sm mb-6">Hisobingizga kiring</p>

          <SocialButtons
            onGoogle={handleGoogle}
            onApple={handleApple}
            disabled={loading}
          />

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-slate-500 text-xs">yoki</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300 text-sm">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
                placeholder="siz@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 text-sm">Parol</label>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-violet-400 hover:text-violet-300 text-xs font-medium"
                >
                  Parolni unutdingizmi?
                </button>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
                placeholder="••••••••"
              />
            </div>

            {resetSent && (
              <p className="text-emerald-400 text-sm">
                Parolni tiklash havolasi emailingizga yuborildi.
              </p>
            )}
            {error && <p className="text-rose-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 transition rounded-xl py-2.5 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Kirish
            </button>
          </form>

          <p className="text-slate-500 text-sm text-center mt-6">
            Hisobingiz yo'qmi?{" "}
            <button
              onClick={() => setLocation("/sign-up")}
              className="text-violet-400 hover:text-violet-300 font-medium"
            >
              Ro'yxatdan o'tish
            </button>
          </p>
        </AuthCard>
      </div>
    </div>
  );
}

function SignUpPage() {
  const [, setLocation] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const createProfile = useCreateProfile();

  // After Firebase creates the account, save the app-specific profile
  // (first/last name + business name) right away so the person lands
  // straight on the dashboard — no separate Telegram-gated wizard anymore.
  // If this call fails (e.g. dropped connection), AppShell's lightweight
  // fallback form on next load asks for the same three fields again.
  async function finishSignUp(fName: string, lName: string, biz: string) {
    if (!fName && !lName && !biz) return;
    try {
      await createProfile.mutateAsync({
        data: { firstName: fName, lastName: lName, company: biz },
      });
    } catch {
      // Non-fatal — AppShell will show the fallback "finish setup" form.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Parollar bir xil emas.");
      return;
    }
    setLoading(true);
    try {
      await signUpWithEmail(email, password, firstName, lastName);
      await finishSignUp(firstName, lastName, company);
      setLocation(basePath || "/");
    } catch (err: any) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      const credential = await signInWithGoogle();
      const displayName = credential.user?.displayName || "";
      const [firstGuess, ...restGuess] = displayName.split(" ").filter(Boolean);
      await finishSignUp(firstGuess || "", restGuess.join(" ") || "", company);
      setLocation(basePath || "/");
    } catch (err: any) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError("");
    setLoading(true);
    try {
      const credential = await signInWithApple();
      const displayName = credential.user?.displayName || "";
      const [firstGuess, ...restGuess] = displayName.split(" ").filter(Boolean);
      await finishSignUp(firstGuess || "", restGuess.join(" ") || "", company);
      setLocation(basePath || "/");
    } catch (err: any) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-x-hidden flex items-center justify-center px-4 py-6 sm:py-10">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-20 -left-20" />
      <GradientBlob className="h-96 w-96 bg-blue-600 bottom-0 -right-20" />
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-[440px]">
        <AuthBrand />

        <AuthCard>
          <h1 className="text-white font-semibold text-xl mb-1">
            Hisob yarating
          </h1>
          <p className="text-slate-400 text-sm mb-6">
            Bir necha soniyada boshlang
          </p>

          <div className="flex flex-col gap-1.5 mb-5">
            <label className="text-slate-300 text-sm">Biznes nomi</label>
            <input
              data-testid="input-signup-company"
              type="text"
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="OneStore LLC"
              className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
            />
          </div>

          <SocialButtons
            onGoogle={handleGoogle}
            onApple={handleApple}
            disabled={loading}
          />

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-slate-500 text-xs">yoki</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-300 text-sm">Ism</label>
                <input
                  type="text"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-300 text-sm">Familiya</label>
                <input
                  type="text"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300 text-sm">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
                placeholder="siz@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300 text-sm">Parol</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
                placeholder="Kamida 6 belgi"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300 text-sm">
                Parolni tasdiqlang
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 outline-none focus:border-violet-500"
              />
            </div>

            {error && <p className="text-rose-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 transition rounded-xl py-2.5 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Ro'yxatdan o'tish
            </button>
          </form>

          <p className="text-slate-500 text-sm text-center mt-6">
            Hisobingiz bormi?{" "}
            <button
              onClick={() => setLocation("/sign-in")}
              className="text-violet-400 hover:text-violet-300 font-medium"
            >
              Kirish
            </button>
          </p>
        </AuthCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROFILE FALLBACK — sign-up now creates the business profile immediately
// (see SignUpPage), so this only ever shows up in the rare case where that
// call failed (e.g. the connection dropped right after Firebase created the
// account). It asks for the same three fields and nothing else — no
// Telegram required to reach the dashboard.
// ---------------------------------------------------------------------------

function ProfileFallbackForm({
  firebaseUser,
  onDone,
}: {
  firebaseUser: any;
  onDone: (data: any) => void;
}) {
  const displayName = firebaseUser?.displayName || "";
  const [firstGuess, ...restGuess] = displayName.split(" ").filter(Boolean);
  const [first, setFirst] = useState(firstGuess || "");
  const [last, setLast] = useState(restGuess.join(" ") || "");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const createProfile = useCreateProfile();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!first || !last || !company) {
      setError("Iltimos, barcha maydonlarni to'ldiring.");
      return;
    }
    setError("");
    try {
      const profile = await createProfile.mutateAsync({
        data: { firstName: first, lastName: last, company },
      });
      onDone(profile);
    } catch (err: any) {
      setError(
        (err as any)?.data?.error ||
          err?.message ||
          "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-x-hidden flex items-center justify-center px-4 py-6 sm:py-10">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-20 -left-20" />
      <GradientBlob className="h-96 w-96 bg-blue-600 bottom-0 -right-20" />

      <Glass className="relative z-10 w-full max-w-md p-5 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <img
            src="/brand-logo.png"
            alt="OneOffice AI"
            className="h-9 w-9 rounded-xl object-cover shrink-0"
          />
          <span className="text-white font-semibold text-lg">OneOffice AI</span>
        </div>
        <h2 className="text-2xl font-semibold text-white mb-1">
          Hisobingizni yakunlang
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Bir necha ma'lumot qoldi — Telegram keyinroq, xohlagan vaqtingizda
          ulanadi.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              data-testid="input-fallback-first-name"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="Ism"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
            />
            <input
              data-testid="input-fallback-last-name"
              value={last}
              onChange={(e) => setLast(e.target.value)}
              placeholder="Familiya"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
            />
          </div>
          <input
            data-testid="input-fallback-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Biznes nomi"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
          />
          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-xs">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          <button
            data-testid="button-fallback-continue"
            type="submit"
            disabled={createProfile.isPending}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-violet-900/30 hover:shadow-violet-700/30 transition disabled:opacity-60"
          >
            {createProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Davom etish <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SHARED STEP-BY-STEP UI — used by the Telegram connect modal below.
// ---------------------------------------------------------------------------

function StepRail({
  step,
  steps,
}: {
  step: number;
  steps: { key: string; label: string }[];
}) {
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, i) => (
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
          {i < steps.length - 1 && (
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

// ---------------------------------------------------------------------------
// CONNECTORS — Settings-adjacent screen where a person connects (or
// disconnects) social accounts. Sign-up no longer requires this; it's
// entirely opt-in, whenever they're ready.
// ---------------------------------------------------------------------------

// Telegram runs through ONE shared OneOffice bot for every user — nobody
// creates their own bot or types in a token/chat id. Connecting a channel
// is two taps, both inside Telegram itself:
//   1) Open the bot via a one-time deep link and press Start — this links
//      the person's Telegram account to their OneOffice account.
//   2) Add the bot as administrator to any channel they own — Telegram
//      notifies the bot the moment that happens, and the backend attaches
//      the channel automatically. No limit on how many.
function TelegramConnectorCard() {
  const queryClient = useQueryClient();
  const { data: config } = useGetTelegramConfig();
  const {
    data: channels,
    isLoading,
  } = useListTelegramChannels({
    // Connecting a channel happens asynchronously (the person does it
    // inside the Telegram app, then comes back) — a light poll picks it up
    // without needing a manual refresh.
    query: { refetchInterval: 5000 },
  });
  const { refetch: fetchLink, isFetching: linking } = useGetTelegramLink();
  const disconnectChannel = useDisconnectTelegramChannel();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [linkError, setLinkError] = useState("");

  const list = channels || [];

  async function handleConnect() {
    setLinkError("");
    const result = await fetchLink();
    if (result.data?.deepLink) {
      window.open(result.data.deepLink, "_blank", "noopener,noreferrer");
    } else {
      setLinkError(
        (result.error as any)?.data?.error ||
          "Telegram hozircha ulanmayapti. Birozdan so'ng qayta urinib ko'ring.",
      );
    }
  }

  async function handleDisconnect(id: number) {
    setRemovingId(id);
    try {
      await disconnectChannel.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: getListTelegramChannelsQueryKey(),
      });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Glass className="p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
            <Send className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Telegram</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {list.length} ta kanal ulangan
            </p>
          </div>
        </div>
        <button
          data-testid="button-connect-telegram"
          onClick={handleConnect}
          disabled={linking || !config?.configured}
          title={!config?.configured ? "Telegram hali serverda sozlanmagan" : ""}
          className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-violet-900/30 transition"
        >
          {linking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Ulash
        </button>
      </div>

      {config && !config.configured && (
        <p className="text-amber-300/80 text-xs mt-3">
          Telegram ulanishi hali serverda sozlanmagan (TELEGRAM_BOT_TOKEN
          kerak).
        </p>
      )}
      {linkError && (
        <p className="text-rose-300 text-xs mt-3">{linkError}</p>
      )}

      <p className="text-slate-500 text-xs mt-3 leading-relaxed">
        "Ulash"ni bosib botni Telegram'da ishga tushiring (Start), so'ng
        istalgan kanalingizga botni <strong className="text-slate-300">administrator</strong> sifatida
        qo'shing — kanal shu yerda avtomatik paydo bo'ladi.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-slate-500 text-sm mt-5">
          Hali Telegram kanal ulanmagan.
        </p>
      ) : (
        <div className="mt-5 divide-y divide-white/5">
          {list.map((c: any) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Radio className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {c.channelTitle || "Nomsiz kanal"}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">
                    {c.channelUsername ? `@${c.channelUsername}` : "Shaxsiy kanal"}
                  </p>
                </div>
              </div>
              <button
                data-testid={`button-disconnect-${c.id}`}
                onClick={() => handleDisconnect(c.id)}
                disabled={removingId === c.id}
                className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-40"
              >
                {removingId === c.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </Glass>
  );
}

function ConnectorsPage({
  instagramNotice,
  onDismissInstagramNotice,
  vkNotice,
  onDismissVkNotice,
}: {
  instagramNotice?: { type: "success" | "error"; message: string } | null;
  onDismissInstagramNotice?: () => void;
  vkNotice?: { type: "success" | "error"; message: string } | null;
  onDismissVkNotice?: () => void;
}) {
  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-6">
      {instagramNotice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            instagramNotice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          <span>{instagramNotice.message}</span>
          <button
            onClick={onDismissInstagramNotice}
            className="shrink-0 opacity-70 hover:opacity-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {vkNotice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            vkNotice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          <span>{vkNotice.message}</span>
          <button
            onClick={onDismissVkNotice}
            className="shrink-0 opacity-70 hover:opacity-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <TelegramConnectorCard />

      <InstagramConnectorCard />

      <VkConnectorCard />

      <StoreConnectorCard />
    </div>
  );
}

// Instagram is connect-only for now (no posting yet) — OAuth via Meta's
// "Instagram API with Instagram Login". Connecting just redirects the
// whole page to Instagram and back; there's no in-app form since the
// person authenticates on Instagram's own screen.
function InstagramConnectorCard() {
  const queryClient = useQueryClient();
  const { data: config } = useGetInstagramConfig();
  const {
    data: accounts,
    isLoading,
  } = useListInstagramAccounts({
    query: { queryKey: getListInstagramAccountsQueryKey() },
  });
  const disconnectAccount = useDisconnectInstagramAccount();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  const list = accounts || [];
  const atLimit = list.length >= 3;

  function handleConnect() {
    if (!config?.appId) return;
    setConnecting(true);
    sessionStorage.setItem("ig_oauth_pending", "1");
    const redirectUri = `${window.location.origin}/`;
    const authUrl =
      "https://www.instagram.com/oauth/authorize?" +
      new URLSearchParams({
        client_id: config.appId,
        redirect_uri: redirectUri,
        scope: config.scope,
        response_type: "code",
      }).toString();
    window.location.href = authUrl;
  }

  async function handleDisconnect(id: number) {
    setRemovingId(id);
    try {
      await disconnectAccount.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: getListInstagramAccountsQueryKey(),
      });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Glass className="p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
            <Instagram className="h-5 w-5 text-pink-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Instagram</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {list.length}/3 akkaunt ulangan
            </p>
          </div>
        </div>
        <button
          data-testid="button-connect-instagram"
          onClick={handleConnect}
          disabled={true}
          title="Hozircha bu xizmat profilaktikada"
          className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-pink-500 to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-pink-900/30 transition"
        >
          {connecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Ulash
        </button>
      </div>

      <p className="text-amber-300/80 text-xs mt-3">Hozircha bu xizmat profilaktikada</p>

      {false && config && !config.configured && (
        <p className="text-amber-300/80 text-xs mt-3">
          Instagram ulanishi hali serverda sozlanmagan (INSTAGRAM_APP_ID /
          INSTAGRAM_APP_SECRET kerak).
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
        </div>
      ) : list.length === 0 ? null : (
        <div className="mt-5 divide-y divide-white/5">
          {list.map((a: any) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                {a.profilePictureUrl ? (
                  <img
                    src={a.profilePictureUrl}
                    alt={a.username}
                    className="h-9 w-9 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center shrink-0">
                    <Instagram className="h-4 w-4 text-pink-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    @{a.username || "instagram_user"}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">
                    {a.name || a.accountType || "Ulangan"}
                  </p>
                </div>
              </div>
              <button
                data-testid={`button-disconnect-ig-${a.id}`}
                onClick={() => handleDisconnect(a.id)}
                disabled={removingId === a.id}
                className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-40"
              >
                {removingId === a.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </Glass>
  );
}

// VK (VKontakte) connector — full OAuth connect flow, mirroring
// InstagramConnectorCard. Posting to a VK wall isn't implemented yet;
// this only connects the account and stores it.
function VkConnectorCard() {
  const { user: firebaseUser } = useAuth();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  async function authedFetch(path: string, init: RequestInit = {}) {
    const token = await firebaseUser?.getIdToken();
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "So'rov muvaffaqiyatsiz tugadi.");
    }
    return res.status === 204 ? null : res.json();
  }

  const { data: config } = useQuery({
    queryKey: ["vk-config"],
    queryFn: () => authedFetch("/api/connectors/vk/config"),
    enabled: !!firebaseUser,
  });

  const {
    data: accounts,
    isLoading,
  } = useQuery({
    queryKey: ["vk-accounts"],
    queryFn: () => authedFetch("/api/connectors/vk"),
    enabled: !!firebaseUser,
  });

  const list = accounts || [];
  const atLimit = list.length >= 3;

  function base64UrlEncode(bytes: Uint8Array): string {
    let str = "";
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomToken(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  async function sha256Base64Url(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(digest));
  }

  // VK's old oauth.vk.com OAuth 2.0 flow stopped working on 2025-09-30.
  // The current flow is "VK ID" (id.vk.com), OAuth 2.1 with PKCE — no
  // client_secret needed on the browser side, just a code_verifier we
  // generate here and a matching code_challenge sent in the authorize URL.
  async function handleConnect() {
    if (!config?.appId) return;
    setConnecting(true);
    const codeVerifier = randomToken(48);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomToken(16);
    sessionStorage.setItem("vk_oauth_pending", "1");
    sessionStorage.setItem("vk_code_verifier", codeVerifier);
    sessionStorage.setItem("vk_oauth_state", state);
    const redirectUri = `${window.location.origin}/`;
    const authUrl =
      "https://id.vk.com/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: config.appId,
        redirect_uri: redirectUri,
        scope: config.scope || "",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
    window.location.href = authUrl;
  }


  async function handleDisconnect(id: number) {
    setRemovingId(id);
    try {
      await authedFetch(`/api/connectors/vk/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["vk-accounts"] });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Glass className="p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">VK</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {list.length}/3 akkaunt ulangan
            </p>
          </div>
        </div>
        <button
          data-testid="button-connect-vk"
          onClick={handleConnect}
          disabled={true}
          title="Hozircha bu xizmat profilaktikada"
          className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-sky-500 to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-sky-900/30 transition"
        >
          {connecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Ulash
        </button>
      </div>

      <p className="text-amber-300/80 text-xs mt-3">Hozircha bu xizmat profilaktikada</p>

      {false && config && !config.configured && (
        <p className="text-amber-300/80 text-xs mt-3">
          VK ulanishi hali serverda sozlanmagan (VK_APP_ID / VK_APP_SECRET
          kerak).
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
        </div>
      ) : list.length === 0 ? null : (
        <div className="mt-5 divide-y divide-white/5">
          {list.map((a: any) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                {a.photoUrl ? (
                  <img
                    src={a.photoUrl}
                    alt={a.firstName}
                    className="h-9 w-9 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0">
                    <Tag className="h-4 w-4 text-sky-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {a.firstName || a.lastName
                      ? `${a.firstName} ${a.lastName}`.trim()
                      : "VK akkaunt"}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">
                    {a.screenName ? `vk.com/${a.screenName}` : "Ulangan"}
                  </p>
                </div>
              </div>
              <button
                data-testid={`button-disconnect-vk-${a.id}`}
                onClick={() => handleDisconnect(a.id)}
                disabled={removingId === a.id}
                className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-40"
              >
                {removingId === a.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </Glass>
  );
}

// Public storefront ("vitrina") link — no external API, no third-party
// account needed. Every user gets a shareable /store/:slug page listing
// their active products; this card just surfaces that link.
function StoreConnectorCard() {
  const { user: firebaseUser } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["store-config"],
    queryFn: async () => {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch("/api/connectors/store/config", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load store config");
      return res.json();
    },
    enabled: !!firebaseUser,
  });

  const url = config?.slug ? `${window.location.origin}/store/${config.slug}` : "";

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Glass className="p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
            <Globe className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Vitrina</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              Ochiq savdo sahifangiz &mdash; hech qanday ro'yxatdan o'tish
              shart emas
            </p>
          </div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-emerald-900/30 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ochish
          </a>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
        </div>
      ) : url ? (
        <div className="mt-4 flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5">
          <p className="text-slate-300 text-sm truncate flex-1">{url}</p>
          <button
            onClick={handleCopy}
            className="shrink-0 flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium transition"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Nusxalandi" : "Nusxalash"}
          </button>
        </div>
      ) : null}

      <p className="text-slate-500 text-xs mt-3">
        Ushbu havolani mijozlaringizga (Telegram, Instagram bio, vizitka)
        ulashing &mdash; ular tizimga kirmasdan turib faol (active)
        mahsulotlaringizni ko'rishlari mumkin.
      </p>
    </Glass>
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
  const subLabel = user?.company || "Pro plan";

  const items = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "inventory", label: "Inventory", icon: Package },
    { key: "connectors", label: "Connectors", icon: Send },
    { key: "settings", label: "Settings", icon: Settings },
    { key: "profile", label: "Profile", icon: User },
  ];

  return (
    <aside className="hidden md:flex md:sticky top-0 h-screen w-64 bg-white/5 backdrop-blur-xl border-r border-white/10 flex-col py-6 px-4">
      <div className="flex items-center gap-2 px-2 mb-10">
        <img
          src="/brand-logo.png"
          alt="OneOffice AI"
          className="h-9 w-9 rounded-xl object-cover shrink-0"
        />
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
    { key: "inventory", label: "Inventory", icon: Package },
    { key: "connectors", label: "Connect", icon: Send },
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

function Topbar({ title, onNewPost, newButtonLabel = "+ New Post" }: any) {
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
          {newButtonLabel}
        </button>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// INVENTORY
// ---------------------------------------------------------------------------

// Camera/gallery multi-select image picker, reused by the New/Edit Product
// form. Mirrors the picker already used on the create-post Results screen,
// but supports selecting several gallery photos at once and keeps every
// photo (no select/deselect step — whatever's added here becomes one of the
// product's own images).
function ProductImagePicker({
  images,
  setImages,
}: {
  images: string[];
  setImages: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [busy, setBusy] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const files = Array.from(fileList);
      const resized = await Promise.all(files.map((f) => resizeImageFile(f)));
      setImages((prev) => [...prev, ...resized]);
    } catch {
      // A single bad file shouldn't block the rest — whatever resized
      // successfully above is still added; nothing else to do here.
    } finally {
      setBusy(false);
    }
  }

  function removeAt(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-4 border border-white/10 bg-white/5 hover:bg-white/10 transition text-center"
        >
          <Camera className="h-5 w-5 text-slate-300" />
          <span className="text-xs font-medium text-white">Kamera</span>
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-4 border border-white/10 bg-white/5 hover:bg-white/10 transition text-center"
        >
          <ImageIcon className="h-5 w-5 text-slate-300" />
          <span className="text-xs font-medium text-white">
            Galereya (bir nechtasini tanlash mumkin)
          </span>
        </button>
      </div>

      {busy && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5 mb-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rasmlar
          tayyorlanmoqda…
        </p>
      )}

      {images.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x scrollbar-thin">
          {images.map((src, i) => (
            <div
              key={i}
              className="shrink-0 relative rounded-2xl overflow-hidden snap-start"
              style={{ width: 110, height: 110 }}
            >
              <img
                src={src}
                alt={`Rasm ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 hover:bg-rose-500 flex items-center justify-center transition"
              >
                <X className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-500 text-sm">Hali rasm qo'shilmadi.</p>
      )}
    </div>
  );
}

function ProductForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: ProductItem | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [costPrice, setCostPrice] = useState(initial?.costPrice ?? "");
  const [sellPrice, setSellPrice] = useState(initial?.sellPrice ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "UZS");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [error, setError] = useState("");

  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const saving = createProduct.isPending || updateProduct.isPending;

  async function save(status: "draft" | "active") {
    setError("");
    if (status === "active" && !name.trim()) {
      setError("Mahsulot nomini kiriting.");
      return;
    }
    const data = {
      name: name.trim(),
      category,
      costPrice: costPrice.trim(),
      sellPrice: sellPrice.trim(),
      currency,
      description: description.trim(),
      images,
      status,
    };
    try {
      if (isEdit && initial) {
        await updateProduct.mutateAsync({ id: initial.id, data });
      } else {
        await createProduct.mutateAsync({ data });
      }
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      onSaved();
    } catch (err: any) {
      setError(
        err?.data?.error || err?.message || "Saqlashda xatolik yuz berdi.",
      );
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <Glass className="p-8">
        <h3 className="text-white text-xl font-semibold mb-1">
          {isEdit ? "Mahsulotni tahrirlash" : "Yangi mahsulot"}
        </h3>
        <p className="text-slate-400 text-sm mb-6">
          Rasm(lar), nom, narxlar va tavsifni to'ldiring.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Mahsulot rasmlari
            </label>
            <ProductImagePicker images={images} setImages={setImages} />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Package className="h-3 w-3" /> Mahsulot nomi
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="masalan: AeroSound Pro Earbuds"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Kategoriya
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-violet-400 transition"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" /> Kelish narxi
              </label>
              <input
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="masalan: 250,000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" /> Sotish narxi
              </label>
              <input
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="masalan: 349,000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" /> Valyuta
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CURRENCIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCurrency(c.key)}
                  className={`rounded-xl px-4 py-3 text-sm font-medium border transition ${
                    currency === c.key
                      ? "bg-gradient-to-r from-violet-500 to-blue-500 border-transparent text-white"
                      : "bg-white/5 border-white/10 text-slate-300 hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Qisqa tavsif
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mahsulot haqida bir necha jumla..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 mt-5">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 mt-7">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 disabled:opacity-40 text-white py-3.5 rounded-xl font-medium hover:bg-white/10 transition"
          >
            Bekor qilish
          </button>

          {!isEdit && (
            <button
              onClick={() => save("draft")}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 disabled:opacity-40 text-white py-3.5 rounded-xl font-medium hover:bg-white/10 transition"
            >
              {saving && createProduct.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Draft sifatida saqlash
            </button>
          )}

          {isEdit && initial?.status === "draft" && (
            <button
              onClick={() => save("active")}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-emerald-400/40 disabled:opacity-40 text-emerald-300 py-3.5 rounded-xl font-medium hover:bg-emerald-500/10 transition"
            >
              Nashr qilish (Faol)
            </button>
          )}

          <button
            onClick={() => save(isEdit ? (initial!.status as "draft" | "active") : "active")}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-violet-900/30 hover:shadow-violet-700/30 transition"
          >
            {saving && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {isEdit ? "O'zgarishlarni saqlash" : "Mahsulot yaratish"}
          </button>
        </div>
      </Glass>
    </div>
  );
}

function ProductCard({
  product,
  onEdit,
  onDelete,
  deleting,
}: {
  product: ProductItem;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const thumb = product.images?.[0];
  return (
    <Glass className="p-2.5 sm:p-4 flex flex-col">
      <div className="relative rounded-lg sm:rounded-xl overflow-hidden bg-white/5 aspect-square mb-2 sm:mb-3 flex items-center justify-center">
        {thumb ? (
          <img src={thumb} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="h-6 w-6 sm:h-8 sm:w-8 text-slate-600" />
        )}
        <span
          className={`absolute top-1.5 left-1.5 sm:top-2 sm:left-2 text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full ${
            product.status === "active"
              ? "bg-emerald-500/90 text-white"
              : "bg-slate-700/90 text-slate-200"
          }`}
        >
          {product.status === "active" ? "Faol" : "Draft"}
        </span>
      </div>

      <h4 className="text-white text-xs sm:text-sm font-semibold truncate">
        {product.name || "Nomsiz mahsulot"}
      </h4>
      <p className="text-violet-300 text-xs sm:text-sm font-medium mt-0.5 truncate">
        {product.sellPrice
          ? `${product.sellPrice} ${product.currency || "UZS"}`
          : "Narx kiritilmagan"}
      </p>

      <div className="flex gap-1.5 sm:gap-2 mt-2 sm:mt-3">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-medium bg-white/5 border border-white/10 text-white py-1.5 sm:py-2 rounded-lg hover:bg-white/10 transition"
        >
          <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">Tahrirlash</span>
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center justify-center gap-1.5 text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-300 py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-lg hover:bg-rose-500/20 disabled:opacity-40 transition"
        >
          {deleting ? (
            <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          )}
        </button>
      </div>
    </Glass>
  );
}

const INVENTORY_TABS: Array<{ key: "all" | "draft" | "active"; label: string }> = [
  { key: "all", label: "Hammasi" },
  { key: "active", label: "Faol" },
  { key: "draft", label: "Draftlar" },
];

function InventoryPage({
  formOpen,
  editingProduct,
  onCloseForm,
  onEditProduct,
}: {
  formOpen: boolean;
  editingProduct: ProductItem | null;
  onCloseForm: () => void;
  onEditProduct: (p: ProductItem) => void;
}) {
  const [tab, setTab] = useState<"all" | "draft" | "active">("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useListProducts();
  const deleteProduct = useDeleteProduct();

  if (formOpen) {
    return (
      <ProductForm
        initial={editingProduct}
        onCancel={onCloseForm}
        onSaved={onCloseForm}
      />
    );
  }

  const all = products ?? [];
  const counts = {
    all: all.length,
    active: all.filter((p) => p.status === "active").length,
    draft: all.filter((p) => p.status === "draft").length,
  };
  const filtered = tab === "all" ? all : all.filter((p) => p.status === tab);

  async function handleDelete(id: number) {
    if (!window.confirm("Bu mahsulotni o'chirishni tasdiqlaysizmi?")) return;
    setDeletingId(id);
    try {
      await deleteProduct.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="px-6 md:px-10 py-8">
      <div className="flex gap-2 mb-6">
        {INVENTORY_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              tab === t.key
                ? "bg-gradient-to-r from-violet-500 to-blue-500 text-white"
                : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center">
          <Package className="h-8 w-8 text-violet-400 mx-auto mb-3" />
          <p className="text-white font-medium">
            {tab === "draft"
              ? "Draftlar yo'q"
              : tab === "active"
                ? "Faol mahsulotlar yo'q"
                : "Hali mahsulot qo'shilmagan"}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Yuqoridagi "+ New Product" tugmasi orqali birinchi mahsulotingizni
            qo'shing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={() => onEditProduct(p)}
              onDelete={() => handleDelete(p.id)}
              deleting={deletingId === p.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------

function Dashboard({ goCreate, user }: any) {
  void goCreate;
  void user;

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChannelPerformanceChart metric="views" />
        <ChannelPerformanceChart metric="orders" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CREATE POST FLOW
// ---------------------------------------------------------------------------

// First screen of Create Post: pick which inventory product this post is
// for. AI writes the copy for that specific product and the post goes out
// with that product's own photos — no more re-typing name/price or
// re-uploading photos you already added in Inventory. "Mahsulotsiz davom
// etish" keeps the old freeform path available for one-off posts that
// aren't tied to any inventory item.
function ProductPicker({
  onPick,
  onSkip,
  onAddProduct,
}: {
  onPick: (p: ProductItem) => void;
  onSkip: () => void;
  onAddProduct: () => void;
}) {
  const { data: products, isLoading } = useListProducts();
  const list = products ?? [];
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  // No search yet: just the 2 most recently added products (list already
  // comes back newest-first from the API) — the common case is posting
  // about something you just added. Typing a search reveals everything
  // matching, regardless of how old it is.
  const visible = query
    ? list.filter((p) => (p.name || "").toLowerCase().includes(query))
    : list.slice(0, 2);

  function ProductTile({ p }: { p: ProductItem }) {
    const thumb = p.images?.[0];
    return (
      <button
        onClick={() => onPick(p)}
        className="text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-violet-400/40 transition p-3"
      >
        <div className="relative rounded-xl overflow-hidden bg-white/5 aspect-square mb-2.5 flex items-center justify-center">
          {thumb ? (
            <img src={thumb} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="h-7 w-7 text-slate-600" />
          )}
          {p.status === "draft" && (
            <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700/90 text-slate-200">
              Draft
            </span>
          )}
        </div>
        <p className="text-white text-sm font-medium truncate">
          {p.name || "Nomsiz mahsulot"}
        </p>
        {p.sellPrice && (
          <p className="text-violet-300 text-xs font-medium mt-0.5">
            {p.sellPrice} {p.currency || "UZS"}
          </p>
        )}
      </button>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <Glass className="p-8">
        <h3 className="text-white text-xl font-semibold mb-1">
          Qaysi mahsulot uchun post yozamiz?
        </h3>
        <p className="text-slate-400 text-sm mb-6">
          Mahsulotni tanlang — AI aynan shu mahsulot uchun matn yozadi va
          uning o'z rasmlari post bilan birga yuboriladi.
        </p>

        {!isLoading && list.length > 0 && (
          <div className="relative mb-5">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Boshqa mahsulotni qidirish…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition"
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-8 text-center mb-6">
            <Package className="h-8 w-8 text-violet-400 mx-auto mb-3" />
            <p className="text-white font-medium">Hali mahsulot qo'shilmagan</p>
            <p className="text-slate-400 text-sm mt-1 mb-4">
              Avval Inventory'ga mahsulot qo'shing, keyin undan post
              yaratishingiz mumkin bo'ladi.
            </p>
            <button
              onClick={onAddProduct}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-violet-900/30 hover:shadow-violet-700/30 transition"
            >
              <Package className="h-4 w-4" /> Mahsulot qo'shish
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-slate-500 text-sm py-6 text-center">
            "{search}" bo'yicha mahsulot topilmadi.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {visible.map((p) => (
              <ProductTile key={p.id} p={p} />
            ))}
          </div>
        )}

        <button
          onClick={onSkip}
          className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-slate-300 py-3 rounded-xl font-medium text-sm hover:bg-white/10 hover:text-white transition"
        >
          Mahsulotsiz davom etish →
        </button>
      </Glass>
    </div>
  );
}

function CreateForm({ form, setForm, product, onChangeProduct, onGenerate }: any) {
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

        {product && (
          <div className="flex items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 mb-5">
            {product.images?.[0] ? (
              <img
                src={product.images[0]}
                alt={product.name}
                className="h-10 w-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-violet-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-violet-300 font-medium">
                Tanlangan mahsulot
              </p>
              <p className="text-sm text-white truncate">{product.name}</p>
            </div>
            <button
              onClick={onChangeProduct}
              className="text-xs font-medium text-violet-300 hover:text-white shrink-0 transition"
            >
              O'zgartirish
            </button>
          </div>
        )}

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
              <DollarSign className="h-3 w-3" /> Price ({form.currency || "UZS"})
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
            {product ? (
              <div className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 flex items-center justify-between">
                <span>{form.category}</span>
                <span className="text-[11px] text-slate-500">
                  Mahsulot kategoriyasi
                </span>
              </div>
            ) : (
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
            )}
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
  productImages,
  error,
  channels,
  channelsLoading,
  selectedChannelIds,
  onToggleChannel,
  onGoConnectors,
  onPreview,
  onApprove,
  onReject,
}: any) {
  const postText: string =
    enrichData?.postText ||
    `✨ ${form.name}\n\n💰 ${form.price} ${form.currency || "UZS"}\n\n📲 Buyurtma uchun yozing!`;
  const enriched = enrichData?.enriched || {};
  const priceDiffPercent: number = enriched.priceDiffPercent ?? 0;

  const [myImages, setMyImages] = useState<any[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const seededProductImages = useRef(false);

  // Product-linked posts start with that product's own photos already
  // added and selected — the person doesn't have to re-upload anything
  // they already put in Inventory. Runs once; camera/gallery uploads below
  // can still add more on top of these.
  useEffect(() => {
    if (seededProductImages.current) return;
    if (!productImages || productImages.length === 0) return;
    seededProductImages.current = true;

    const seeded = productImages.map((url: string, i: number) => ({
      id: `product-${i}`,
      url,
      title: form.name || "Mahsulot rasmi",
      generated: false,
    }));
    setMyImages((prev) => [...seeded, ...prev]);
    seeded.forEach((entry: any) => onToggleImage(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productImages]);

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
                {form.price} {form.currency || "UZS"}
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

      {/* ── PUBLISH TO ── */}
      <Glass className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-semibold">
            📤 Qayerga post qilamiz
          </h3>
          {channels && channels.length > 0 && (
            <span className="text-xs text-slate-500">
              {selectedChannelIds.length}/{channels.length} tanlandi
            </span>
          )}
        </div>
        {channels && channels.length > 1 && (
          <p className="text-xs text-slate-400 mb-1">
            Bir nechta kanalni belgilashingiz mumkin — post barchasiga
            yuboriladi.
          </p>
        )}
        {channelsLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm mt-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Ulangan kanallar
            yuklanmoqda...
          </div>
        ) : !channels || channels.length === 0 ? (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3.5">
            <p className="text-amber-300 text-sm">
              Hali birorta ham Telegram kanal ulanmagan. Post qilish uchun avval
              kanal ulang.
            </p>
            <button
              data-testid="button-goto-connectors"
              onClick={onGoConnectors}
              className="shrink-0 flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              <Link2 className="h-3.5 w-3.5" /> Telegram ulash
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {channels.map((c: any) => {
              const checked = selectedChannelIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  data-testid={`button-select-channel-${c.id}`}
                  onClick={() => onToggleChannel(c.id)}
                  aria-pressed={checked}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    checked
                      ? "border-violet-400 bg-violet-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Send className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-white truncate">
                      {c.channelUsername ? `@${c.channelUsername}` : c.channelTitle || "Kanal"}
                    </span>
                  </span>
                  <span
                    className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                      checked
                        ? "bg-violet-500 border-violet-500"
                        : "border-white/20"
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
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
          disabled={selectedChannelIds.length === 0}
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
    `✨ ${form.name}\n\n💰 ${form.price} ${form.currency || "UZS"}\n\n📲 Buyurtma uchun yozing!`;
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
  channelIds,
  form,
  enrichData,
  selectedImages,
  onDone,
  onError,
}: any) {
  const publishPost = usePublishPost();
  const mounted = useRef(true);
  const [doneCount, setDoneCount] = useState(0);
  const ids: number[] = channelIds || [];

  useEffect(() => {
    async function run() {
      if (!ids.length) {
        onError?.("Post qilish uchun avval kamida bitta Telegram kanal tanlang.");
        return;
      }
      const postText =
        enrichData?.postText ||
        `${form.name} — ${form.price} ${form.currency || "UZS"}`;
      const imageUrls = (selectedImages || []).map((img: any) => img.url);

      // Publish to each selected channel; keep going even if one fails so a
      // problem with one channel doesn't block the others.
      const failures: string[] = [];
      for (const channelId of ids) {
        try {
          await publishPost.mutateAsync({
            data: {
              userId: user?.id || 1,
              channelId,
              text: postText,
              ...(imageUrls.length ? { imageUrls } : {}),
            },
          });
          if (mounted.current) setDoneCount((n) => n + 1);
        } catch (err: any) {
          failures.push(
            (err as any)?.data?.error || err?.message || `Kanal #${channelId}`,
          );
        }
      }

      if (!mounted.current) return;
      if (failures.length === ids.length) {
        onError?.(`Telegram'ga post qilishda xatolik: ${failures.join(", ")}`);
      } else if (failures.length > 0) {
        onError?.(
          `Ba'zi kanallarga post qilinmadi: ${failures.join(", ")}. Qolganlariga muvaffaqiyatli joylandi.`,
        );
      } else {
        onDone();
      }
    }
    run();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <p className="text-slate-400 text-sm mt-1">
          {ids.length > 1
            ? `${doneCount}/${ids.length} kanalga joylandi...`
            : "Please wait a moment."}
        </p>
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

function SettingsPage({ onOpenConnectors }: any) {
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
      <button
        data-testid="button-settings-connectors"
        onClick={onOpenConnectors}
        className="w-full"
      >
        <Glass className="p-6 flex items-center justify-between hover:border-white/20 transition">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
              <Send className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-white text-sm font-medium">Connectors</p>
              <p className="text-slate-500 text-xs mt-0.5">
                Manage connected Telegram channels
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </Glass>
      </button>
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

function ProfilePage({ user, channels, onLogout, onOpenConnectors }: any) {
  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "Aziz Karimov";
  const initial = (user?.firstName?.[0] || "A").toUpperCase();
  const subLabel = user?.company || "OneStore LLC";
  const channelList = channels || [];

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

      <button
        data-testid="button-profile-connectors"
        onClick={onOpenConnectors}
        className="w-full"
      >
        <Glass className="p-6 flex items-center justify-between gap-3 hover:border-white/20 transition">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <Send className="h-4 w-4 text-blue-400" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-white text-sm font-medium truncate">
                {channelList.length > 0
                  ? `${channelList.length} ta Telegram kanal ulangan`
                  : "Hali Telegram ulanmagan"}
              </p>
              <p className="text-slate-500 text-xs mt-0.5 truncate">
                {channelList.length > 0
                  ? channelList
                      .map((c: any) =>
                        c.channelUsername
                          ? `@${c.channelUsername}`
                          : c.channelTitle || "Kanal",
                      )
                      .join(", ")
                  : "Ulash uchun bosing"}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
        </Glass>
      </button>

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

// ---------------------------------------------------------------------------
// APP SHELL — everything the person sees once they're signed in with Firebase.
// Fetches the app-specific business profile from /api/me: if it doesn't
// exist yet (first time), shows the onboarding wizard; otherwise shows the
// normal dashboard/create/history/settings/profile app.
// ---------------------------------------------------------------------------

function FullscreenLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
    </div>
  );
}

function AppShell() {
  const { user: firebaseUser, signOut } = useAuth();

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["me", firebaseUser?.uid],
    queryFn: async () => {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch("/api/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!firebaseUser,
    retry: 2,
  });

  // Connected Telegram channels — fetched once a profile exists. Post
  // creation reads from this (via `channels` below) to let the person pick
  // which channel to publish to; Connectors/Profile/Sidebar all share the
  // same query so connecting or disconnecting a channel anywhere updates
  // everywhere at once. Scoped by firebase uid so a sign-out/sign-in with a
  // different account in the same tab can never show (or publish to) a
  // channel cached from the previous account.
  const {
    data: channels,
    isLoading: channelsLoading,
    refetch: refetchChannels,
  } = useListTelegramChannels({
    query: {
      queryKey: [...getListTelegramChannelsQueryKey(), firebaseUser?.uid],
      enabled: !!profile,
    },
  });

  const [navView, setNavView] = useState("dashboard");
  const [flow, setFlow] = useState("product");
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(
    null,
  );
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(
    null,
  );
  const [form, setForm] = useState({
    name: "",
    price: "",
    currency: "UZS",
    category: "Electronics",
    notes: "",
  });
  const [enrichData, setEnrichData] = useState<any>(null);
  const [selectedImages, setSelectedImages] = useState<any[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [generateError, setGenerateError] = useState("");

  // Instagram OAuth redirects the browser back to our own root URL with a
  // `?code=` (or `?error=`) query string — there's no separate callback
  // route, "/" already renders AppShell for a signed-in user. The
  // sessionStorage flag disambiguates this from any other query string
  // that might land on "/", and is set right before we send the browser
  // to Instagram (see ConnectorsPage below).
  const queryClient = useQueryClient();
  const exchangeInstagramCode = useExchangeInstagramCode();
  const [instagramNotice, setInstagramNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem("ig_oauth_pending") !== "1") return;
    sessionStorage.removeItem("ig_oauth_pending");

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthErrorDescription =
      params.get("error_description") || params.get("error");
    // Clean the code/error out of the URL either way, so a page refresh
    // doesn't try to redeem the same code twice.
    window.history.replaceState({}, "", window.location.pathname);
    setNavView("connectors");

    if (oauthErrorDescription) {
      setInstagramNotice({
        type: "error",
        message: oauthErrorDescription.replace(/\+/g, " "),
      });
      return;
    }
    if (!code) return;

    exchangeInstagramCode.mutate(
      { data: { code, redirectUri: `${window.location.origin}/` } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListInstagramAccountsQueryKey(),
          });
          setInstagramNotice({
            type: "success",
            message: "Instagram akkaunt muvaffaqiyatli ulandi.",
          });
        },
        onError: (err: any) => {
          setInstagramNotice({
            type: "error",
            message:
              err?.data?.error ||
              err?.message ||
              "Instagram ulanmadi. Qayta urinib ko'ring.",
          });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // VK OAuth redirects back to our own root URL with a `?code=` (or
  // `?error=`) query string, same pattern as the Instagram flow above —
  // the vk_oauth_pending flag (set in VkConnectorCard) disambiguates it.
  const [vkNotice, setVkNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem("vk_oauth_pending") !== "1") return;
    sessionStorage.removeItem("vk_oauth_pending");
    const codeVerifier = sessionStorage.getItem("vk_code_verifier") || "";
    const expectedState = sessionStorage.getItem("vk_oauth_state") || "";
    sessionStorage.removeItem("vk_code_verifier");
    sessionStorage.removeItem("vk_oauth_state");

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const deviceId = params.get("device_id");
    const state = params.get("state");
    const oauthError = params.get("error_description") || params.get("error");
    window.history.replaceState({}, "", window.location.pathname);
    setNavView("connectors");

    if (oauthError) {
      setVkNotice({ type: "error", message: oauthError.replace(/\+/g, " ") });
      return;
    }
    if (!code || !deviceId) return;
    if (expectedState && state !== expectedState) {
      setVkNotice({
        type: "error",
        message: "VK ulanmadi: xavfsizlik tekshiruvi mos kelmadi. Qayta urinib ko'ring.",
      });
      return;
    }

    (async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        const res = await fetch("/api/connectors/vk/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            code,
            deviceId,
            codeVerifier,
            redirectUri: `${window.location.origin}/`,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || "VK ulanmadi. Qayta urinib ko'ring.");
        }
        queryClient.invalidateQueries({ queryKey: ["vk-accounts"] });
        setVkNotice({
          type: "success",
          message: "VK akkaunt muvaffaqiyatli ulandi.",
        });
      } catch (err: any) {
        setVkNotice({
          type: "error",
          message: err?.message || "VK ulanmadi. Qayta urinib ko'ring.",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Default the channel picker to whichever channel is currently connected
  // (or the first one, if there are several) so the common single-channel
  // case needs zero taps. Multiple channels are supported — the person can
  // tap to add or remove any of them before publishing.
  useEffect(() => {
    if (!channels || channels.length === 0) {
      setSelectedChannelIds([]);
      return;
    }
    setSelectedChannelIds((prev) => {
      const stillValid = prev.filter((id) =>
        channels.some((c: any) => c.id === id),
      );
      if (stillValid.length > 0) return stillValid;
      return [channels[0].id];
    });
  }, [channels]);

  function toggleChannel(id: number) {
    setSelectedChannelIds((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id],
    );
  }

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    create: "Create Post",
    inventory: "Inventory",
    connectors: "Connectors",
    settings: "Settings",
    profile: "Profile",
  };

  function resetCreate() {
    setFlow("product");
    setSelectedProduct(null);
    setForm({ name: "", price: "", currency: "UZS", category: "Electronics", notes: "" });
    setEnrichData(null);
    setSelectedImages([]);
    setShowPreview(false);
    setPublishError("");
    setGenerateError("");
  }

  function pickProductForPost(p: ProductItem) {
    setSelectedProduct(p);
    setForm({
      name: p.name,
      price: p.sellPrice,
      currency: p.currency || "UZS",
      category: p.category,
      notes: p.description,
    });
    setFlow("form");
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
    if (selectedChannelIds.length === 0) {
      setShowPreview(false);
      setPublishError("Post qilishdan oldin kamida bitta Telegram kanal tanlang.");
      return;
    }
    setShowPreview(false);
    setPublishError("");
    setFlow("publishing");
  }

  function handlePublishDone() {
    setFlow("success");
  }

  function handlePublishError(message: string) {
    setPublishError(message);
    setFlow("results");
  }

  function handleLogout() {
    clearOnboarding();
    signOut();
  }

  function goToConnectors() {
    setNavView("connectors");
  }

  if (profileLoading) return <FullscreenLoader />;

  // A real server/network error (e.g. a DB hiccup) is NOT the same as "no
  // profile yet" — showing the onboarding form here would be misleading
  // for a returning user with a complete profile, and re-submitting it
  // could overwrite their real name/company with placeholder text. Show a
  // plain retry screen instead and never fall through to onboarding.
  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <AlertCircle className="h-8 w-8 text-rose-400 mx-auto mb-3" />
          <p className="text-white font-medium">
            Profilni yuklab bo'lmadi
          </p>
          <p className="text-slate-400 text-sm mt-1 mb-5">
            Serverga ulanishda muammo yuz berdi. Internetni tekshirib, qayta
            urinib ko'ring.
          </p>
          <button
            onClick={() => refetchProfile()}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-violet-900/30 hover:shadow-violet-700/30 transition"
          >
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  // Only ever happens if the POST /api/profile call right after sign-up
  // failed — a lightweight fallback, no Telegram involved.
  if (!profile) {
    return (
      <ProfileFallbackForm
        firebaseUser={firebaseUser}
        onDone={() => {
          clearOnboarding();
          refetchProfile();
        }}
      />
    );
  }

  const user = profile;
  const channelList = channels || [];

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar
        user={user}
        active={navView}
        setActive={(v: string) => {
          setNavView(v);
          if (v === "create") resetCreate();
          if (v !== "inventory") {
            setProductFormOpen(false);
            setEditingProduct(null);
          }
        }}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <Topbar
          title={titles[navView]}
          newButtonLabel={navView === "inventory" ? "+ New Product" : "+ New Post"}
          onNewPost={
            navView === "dashboard"
              ? () => {
                  setNavView("create");
                  resetCreate();
                }
              : navView === "inventory"
                ? () => {
                    setEditingProduct(null);
                    setProductFormOpen(true);
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
            {flow === "product" && (
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
            )}
            {flow === "form" && (
              <CreateForm
                form={form}
                setForm={setForm}
                product={selectedProduct}
                onChangeProduct={() => setFlow("product")}
                onGenerate={() => {
                  setGenerateError("");
                  setPublishError("");
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
                productImages={selectedProduct?.images ?? []}
                error={publishError || generateError}
                channels={channelList}
                channelsLoading={channelsLoading}
                selectedChannelIds={selectedChannelIds}
                onToggleChannel={toggleChannel}
                onGoConnectors={goToConnectors}
                onPreview={() => setShowPreview(true)}
                onApprove={handleApprove}
                onReject={resetCreate}
              />
            )}
            {flow === "publishing" && (
              <Publishing
                user={user}
                channelIds={selectedChannelIds}
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

        {navView === "inventory" && (
          <InventoryPage
            formOpen={productFormOpen}
            editingProduct={editingProduct}
            onCloseForm={() => {
              setProductFormOpen(false);
              setEditingProduct(null);
            }}
            onEditProduct={(p: ProductItem) => {
              setEditingProduct(p);
              setProductFormOpen(true);
            }}
          />
        )}

        {navView === "connectors" && (
          <ConnectorsPage
            instagramNotice={instagramNotice}
            onDismissInstagramNotice={() => setInstagramNotice(null)}
            vkNotice={vkNotice}
            onDismissVkNotice={() => setVkNotice(null)}
          />
        )}
        {navView === "settings" && (
          <SettingsPage onOpenConnectors={goToConnectors} />
        )}
        {navView === "profile" && (
          <ProfilePage
            user={user}
            channels={channelList}
            onLogout={handleLogout}
            onOpenConnectors={goToConnectors}
          />
        )}
      </div>

      <BottomNav
        active={navView}
        setActive={(v: string) => {
          setNavView(v);
          if (v === "create") resetCreate();
          if (v !== "inventory") {
            setProductFormOpen(false);
            setEditingProduct(null);
          }
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

// ---------------------------------------------------------------------------
// PUBLIC STOREFRONT ("PRO VITRINA") — /store/:slug. No sign-in required;
// anyone with the link (shared from Connectors → Vitrina) sees the
// business's active products. Deliberately outside AppShell — no
// sidebar/bottom nav — but reuses the app's own dark violet/blue brand
// language (GradientBlob, Glass, gradient badges) so it feels like part
// of OneOffice AI rather than an unrelated storefront theme.
// ---------------------------------------------------------------------------

function StorefrontPage({ slug }: { slug: string }) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery({
    queryKey: ["storefront", slug],
    queryFn: async () => {
      const res = await fetch(`/api/store/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Do'kon topilmadi.");
      }
      return res.json();
    },
  });

  const products = data?.products || [];

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    products.forEach((p: any) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  const filtered = products.filter((p: any) => {
    const matchesCategory =
      activeCategory === "all" || p.category === activeCategory;
    const matchesSearch =
      !search || (p.name || "").toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-7 w-7 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center gap-3 px-6 text-center">
        <GradientBlob className="h-96 w-96 bg-violet-600 -top-32 -left-20" />
        <GradientBlob className="h-72 w-72 bg-blue-600 bottom-0 right-0" />
        <div className="relative z-10 h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-rose-400" />
        </div>
        <p className="relative z-10 text-white font-semibold text-lg">
          Do'kon topilmadi
        </p>
        <p className="relative z-10 text-slate-500 text-sm max-w-xs">
          Havola noto'g'ri yoki bu do'kon endi mavjud emas. Havolani
          yuborgan kishidan qayta tekshirib berishini so'rang.
        </p>
      </div>
    );
  }

  const brandInitial = (data.company || data.ownerName || "V")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <GradientBlob className="h-96 w-96 bg-violet-600 -top-32 -left-20" />
      <GradientBlob className="h-96 w-96 bg-blue-600 top-0 -right-32" />

      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shrink-0 text-white text-lg font-semibold">
            {brandInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs tracking-[0.2em] uppercase text-violet-400">
                Vitrina
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold font-mono bg-gradient-to-r from-violet-500 to-blue-500 text-white">
                <Sparkles className="h-2.5 w-2.5" /> PRO
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-white truncate">
              {data.company || data.ownerName || "Do'kon"}
            </h1>
            <p className="font-mono text-xs mt-0.5 text-slate-500">
              {data.ownerName && data.company ? `${data.ownerName} · ` : ""}
              {products.length} ta mahsulot
            </p>
          </div>
        </div>

        {products.length > 0 && (
          <div className="max-w-5xl mx-auto px-6 pb-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mahsulot qidirish"
                className="w-full rounded-full border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-400/50"
              />
            </div>
            {categories.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition ${
                    activeCategory === "all"
                      ? "bg-gradient-to-r from-violet-500 to-blue-500 border-transparent text-white"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  Hammasi
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition ${
                      activeCategory === c
                        ? "bg-gradient-to-r from-violet-500 to-blue-500 border-transparent text-white"
                        : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Package className="h-6 w-6 text-violet-400" />
            </div>
            <p className="text-white font-semibold">
              Hozircha faol mahsulotlar yo'q
            </p>
            <p className="text-slate-500 text-sm max-w-xs">
              Egasi tez orada yangi mahsulotlar qo'shishi mumkin. Keyinroq
              qayta tekshiring.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Search className="h-6 w-6 text-violet-400" />
            </div>
            <p className="text-white font-semibold">Hech narsa topilmadi</p>
            <p className="text-slate-500 text-sm max-w-xs">
              Boshqa nom bilan qidirib ko'ring yoki boshqa toifani tanlang.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((p: any) => (
              <Glass
                key={p.id}
                onClick={() => setLocation(`/store/${slug}/product/${p.id}`)}
                className="!rounded-2xl overflow-hidden group hover:border-white/20 transition cursor-pointer"
              >
                <div className="relative aspect-square overflow-hidden bg-white/5">
                  {p.images?.[0] ? (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-slate-600" />
                    </div>
                  )}
                  {p.images?.length > 1 && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium font-mono bg-black/50 backdrop-blur-sm text-white">
                      <ImageIcon className="h-3 w-3" /> {p.images.length}
                    </span>
                  )}
                  {p.sellPrice && (
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full pl-2 pr-3 py-1 text-xs font-semibold font-mono bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-900/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
                      {p.sellPrice} {p.currency || "UZS"}
                    </span>
                  )}
                </div>
                <div className="p-3.5">
                  {p.category && (
                    <p className="font-mono text-xs uppercase tracking-wide mb-1 text-violet-400/80">
                      {p.category}
                    </p>
                  )}
                  <p className="text-sm font-medium text-white truncate">
                    {p.name}
                  </p>
                  {p.description && (
                    <p className="text-xs mt-1 text-slate-500 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                </div>
              </Glass>
            ))}
          </div>
        )}

        <p className="font-mono text-xs tracking-wide text-center mt-14 pb-4 text-slate-600">
          Vitrina · OneOffice AI orqali yaratilgan
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRODUCT DETAIL PAGE — its own full-screen route (like Uzum Market),
// opened when a shopper taps a product card in the Vitrina storefront.
// Shows a large image gallery (every photo, not just the cover) plus the
// product's details, with a back arrow that returns to the storefront grid.
// ---------------------------------------------------------------------------

function ProductDetailPage({
  slug,
  productId,
}: {
  slug: string;
  productId: string;
}) {
  const [, setLocation] = useLocation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["storefront", slug],
    queryFn: async () => {
      const res = await fetch(`/api/store/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Do'kon topilmadi.");
      }
      return res.json();
    },
  });

  const product = (data?.products || []).find(
    (p: any) => String(p.id) === productId,
  );

  const goBack = () => setLocation(`/store/${slug}`);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-7 w-7 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (error || !data || !product) {
    return (
      <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center gap-3 px-6 text-center">
        <GradientBlob className="h-96 w-96 bg-violet-600 -top-32 -left-20" />
        <GradientBlob className="h-72 w-72 bg-blue-600 bottom-0 right-0" />
        <div className="relative z-10 h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-rose-400" />
        </div>
        <p className="relative z-10 text-white font-semibold text-lg">
          Mahsulot topilmadi
        </p>
        <p className="relative z-10 text-slate-500 text-sm max-w-xs">
          Havola noto'g'ri yoki bu mahsulot endi mavjud emas.
        </p>
        <button
          onClick={goBack}
          className="relative z-10 mt-2 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium bg-white/5 border border-white/10 text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Vitrinaga qaytish
        </button>
      </div>
    );
  }

  const images: string[] =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : [];

  return (
    <div className="min-h-screen bg-slate-950 relative">
      <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="h-9 w-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium text-white truncate">
            {product.name}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="relative aspect-square bg-white/5">
          {images.length > 0 ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="w-full h-full cursor-zoom-in"
              aria-label="Rasmni to'liq ekranda ochish"
            >
              <img
                src={images[activeIndex]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-slate-600" />
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex items-center gap-2 px-4 pt-4 overflow-x-auto">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition ${
                  i === activeIndex
                    ? "border-violet-400"
                    : "border-white/10 opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={src}
                  alt={`${product.name} ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {product.category && (
                <p className="font-mono text-xs uppercase tracking-wide mb-1 text-violet-400/80">
                  {product.category}
                </p>
              )}
              <h1 className="text-xl font-semibold text-white">
                {product.name}
              </h1>
            </div>
            {product.sellPrice && (
              <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full pl-2 pr-3 py-1 text-xs font-semibold font-mono bg-gradient-to-r from-violet-500 to-blue-500 text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
                {product.sellPrice} {product.currency || "UZS"}
              </span>
            )}
          </div>
          {product.description && (
            <p className="text-sm mt-3 text-slate-400 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROUTES — "/" shows Landing when signed out and AppShell when signed in;
// "/sign-in" and "/sign-up" are dedicated routes so Google/Apple OAuth
// redirects and deep links land on a predictable browser path.
// ---------------------------------------------------------------------------

function AppRoutes() {
  const [, setLocation] = useLocation();
  const { user, isLoaded } = useAuth();
  // Whether an account has ever been created/signed-into on THIS device.
  // Read once from localStorage; only ever flips true (never reset here) —
  // it flips as soon as sign-up/sign-in actually succeeds, via the effect
  // below, not just from tapping "Boshlash".
  const [accountOnDevice, setAccountOnDevice] = useState<boolean>(
    () => !!loadOnboarding(),
  );
  // Local-only override so tapping "Boshlash" moves past Welcome to the
  // Landing/sign-up screen for this render; nothing is persisted until the
  // person actually finishes creating (or signing into) an account, so a
  // reload before that point shows Welcome again.
  const [pastWelcome, setPastWelcome] = useState(false);

  useEffect(() => {
    if (user) {
      saveOnboarding({ completed: true });
      setAccountOnDevice(true);
    }
  }, [user]);

  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/store/:slug/product/:productId">
        {(params) => (
          <ProductDetailPage
            slug={params.slug || ""}
            productId={params.productId || ""}
          />
        )}
      </Route>
      <Route path="/store/:slug">
        {(params) => <StorefrontPage slug={params.slug || ""} />}
      </Route>
      <Route path="/">
        {!isLoaded ? (
          <FullscreenLoader />
        ) : user ? (
          <AppShell />
        ) : accountOnDevice || pastWelcome ? (
          <Landing
            onStart={() => setLocation("/sign-up")}
            onSignIn={() => setLocation("/sign-in")}
          />
        ) : (
          <WelcomeScreen
            onGetStarted={() => {
              setPastWelcome(true);
              setLocation("/sign-up");
            }}
            onSignIn={() => {
              setPastWelcome(true);
              setLocation("/sign-in");
            }}
          />
        )}
      </Route>
    </Switch>
  );
}

// Clears the React Query cache whenever the signed-in Firebase user changes,
// so one person's cached data never leaks into the next session on the same
// device.
function AuthQueryClientCacheInvalidator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const userId = user?.uid ?? null;
    if (
      prevUserIdRef.current !== undefined &&
      prevUserIdRef.current !== userId
    ) {
      queryClient.clear();
    }
    prevUserIdRef.current = userId;
  }, [user, queryClient]);

  return null;
}

function AuthProviderWithRoutes() {
  return (
    <AuthProvider>
      <AuthQueryClientCacheInvalidator />
      <AppRoutes />
    </AuthProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <AuthProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
