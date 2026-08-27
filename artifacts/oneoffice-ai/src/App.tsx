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
import { apiUrl } from "./lib/api-url";

import {
  Sparkles,
  Home,
  PlusCircle,
  Settings,
  User,
  Bell,
  Check,
  Plus,
  X,
  ShoppingCart,
  ShoppingBag,
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
  Youtube,
  RefreshCw,
  Users,
  TrendingDown,
  Layers,
} from "lucide-react";

import {
  useCreateProfile,
  useListTelegramChannels,
  useDisconnectTelegramChannel,
  useGetTelegramLiveStats,
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
  useGetTelegramMtprotoStatus,
  useListTelegramMtprotoChannels,
  useConnectTelegramMtprotoChannel,
  useGetProductResearch,
  useUpdateProductResearch,
  useTelegramMtprotoSendCode,
  useTelegramMtprotoResendCode,
  useTelegramMtprotoVerifyCode,
  useTelegramMtprotoVerifyPassword,
  useTelegramMtprotoLogout,
  useGetTelegramMtprotoLiveStats,
} from "@workspace/api-client-react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
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

// Reads an uploaded photo and re-encodes it as a JPEG at a fixed
// 1080x1440 (3:4 portrait) canvas — cropped-to-cover like a real
// marketplace listing photo, so every product image is the exact same
// size and aspect ratio everywhere it's shown (inventory grid, storefront
// grid, product detail, order line items), regardless of what the seller
// originally shot on their phone.
const PRODUCT_IMAGE_WIDTH = 1080;
const PRODUCT_IMAGE_HEIGHT = 1440;

function resizeImageFile(
  file: File,
  targetWidth = PRODUCT_IMAGE_WIDTH,
  targetHeight = PRODUCT_IMAGE_HEIGHT,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Canvas unsupported for some reason — fall back to the
          // original, un-resized data URL rather than failing outright.
          resolve(reader.result as string);
          return;
        }

        // "Cover" crop, same idea as CSS object-fit: cover — scale so the
        // source fully covers the 1080x1440 frame, then crop whichever
        // dimension overflows, centered, instead of stretching/distorting.
        const sourceRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (sourceRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else if (sourceRatio < targetRatio) {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
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
// CHANNEL STATS CHART
// Subscribers: real number + real history from
// GET /connectors/telegram/stats/{live,history} (Bot API).
// Views: real number + real history from
// GET /telegram-mtproto/stats/{live,history} — this needs an MTProto
// session (a real Telegram login), since the Bot API's only way to read
// view counts is forwarding the post into a private chat and deleting it,
// which still fires a visible notification for the channel owner (see
// telegram/liveStats.ts).
// Neither chart ever falls back to synthetic data — when there isn't yet
// enough real history for the selected period, it shows an empty state.
// Both render as a gradient "mountain" area chart with a switchable period
// (hourly / daily / weekly / monthly).
// ---------------------------------------------------------------------------

type LiveMetric = "views" | "subscribers";
type PeriodKey = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

const LIVE_METRIC_CONFIG: Record<
  LiveMetric,
  { label: string; title: string; color: string }
> = {
  views: {
    label: "Ko'rishlar",
    title: "Umumiy ko'rishlar",
    color: "#a78bfa",
  },
  subscribers: {
    label: "Obunachilar",
    title: "Obunachilar soni",
    color: "#22d3ee",
  },
};

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hourly", label: "Oxirgi 24 soat" },
  { key: "daily", label: "Oxirgi 7 kun" },
  { key: "weekly", label: "Oxirgi 5 hafta" },
  { key: "monthly", label: "Oxirgi 6 oy" },
  { key: "yearly", label: "Oxirgi 5 yil" },
];

// Frontend period key -> backend /api/stats/dashboard granularity value.
const PERIOD_TO_GRANULARITY: Record<PeriodKey, string> = {
  hourly: "hour",
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

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

const UZ_MONTH_SHORT = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyun",
  "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek",
];

// One bucket from GET /api/stats/dashboard — value is ALREADY a delta (new
// activity strictly within [periodStart, periodEnd)), never a raw
// cumulative reading. See statsAggregation.ts on the backend for why that
// distinction is the entire point of this endpoint.
interface StatsBucket {
  periodStart: string;
  periodEnd: string;
  value: number;
  cumulativeAtEnd: number;
  grounded: boolean;
}

interface StatsDashboardResponse {
  granularity: string;
  metric: string;
  source: string;
  buckets: StatsBucket[];
  todayValue: number;
  yesterdayValue: number;
  allTimeTotal: number;
  hasGroundedHistory: boolean;
  notConnected?: boolean;
}

// Fetches the period-correct bucket series + today/yesterday comparison for
// one metric. A thin custom hook (not a generated api-client-react hook)
// since this route doesn't go through openapi codegen.
function useStatsDashboard(
  metric: LiveMetric,
  period: PeriodKey,
  enabled: boolean,
) {
  const { user: firebaseUser } = useAuth();
  const granularity = PERIOD_TO_GRANULARITY[period];
  return useQuery<StatsDashboardResponse>({
    queryKey: ["stats-dashboard", metric, granularity],
    enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch(
        apiUrl(`/api/stats/dashboard?metric=${metric}&granularity=${granularity}`),
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("Statistikani yuklashda xatolik.");
      return res.json();
    },
  });
}

function labelForBucket(periodStartIso: string, period: PeriodKey): string {
  const d = new Date(periodStartIso);
  if (period === "hourly") return `${String(d.getHours()).padStart(2, "0")}:00`;
  if (period === "yearly") return String(d.getFullYear());
  if (period === "monthly") return UZ_MONTH_SHORT[d.getMonth()] ?? "";
  // daily / weekly — short date
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Real bucket data only — each point is that exact period's own new
// activity (a delta), never a cumulative total. An empty/all-zero series
// just means no snapshots have been captured yet for that window (a brand
// new channel, or the scheduler hasn't completed its first hourly pass).
function chartDataForBuckets(
  buckets: StatsBucket[] | undefined,
  period: PeriodKey,
): { label: string; value: number }[] {
  if (!buckets || buckets.length === 0) return [];
  return buckets.map((b) => ({ label: labelForBucket(b.periodStart, period), value: b.value }));
}

// Most-recent-period vs previous-period, both already period-isolated
// deltas — this is the correct "+3.2% shu hafta" comparison (today vs
// yesterday, this week vs last week, etc.), never a cumulative-total
// comparison.
function growthForBuckets(
  buckets?: StatsBucket[],
): { percent: number; direction: "up" | "down" | "flat" } | null {
  if (!buckets || buckets.length < 2) return null;
  const prev = buckets[buckets.length - 2].value;
  const last = buckets[buckets.length - 1].value;
  if (prev === 0) return last === 0 ? { percent: 0, direction: "flat" } : null;
  const percent = ((last - prev) / Math.abs(prev)) * 100;
  const direction = percent > 0.5 ? "up" : percent < -0.5 ? "down" : "flat";
  return { percent, direction };
}

function ChannelStatsChart({
  metric,
  currentValue,
  isLive,
  isLoading,
  buckets,
  todayValue,
  yesterdayValue,
  hasGroundedHistory,
  period,
  onPeriodChange,
}: {
  metric: LiveMetric;
  currentValue?: number;
  isLive: boolean;
  isLoading: boolean;
  buckets?: StatsBucket[];
  todayValue?: number;
  yesterdayValue?: number;
  hasGroundedHistory?: boolean;
  period: PeriodKey;
  onPeriodChange: (period: PeriodKey) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const cfg = LIVE_METRIC_CONFIG[metric];
  const currentLabel = PERIOD_OPTIONS.find((o) => o.key === period)?.label || "";
  const chartData = chartDataForBuckets(buckets, period);
  // NOT "does some bucket have a nonzero value" — a run of real, grounded
  // 0-value buckets (tracking is live, nothing simply changed in that
  // window) is completely legitimate and must render as a normal chart.
  // Only "we have no grounded bucket at all" means there's truly nothing
  // to plot yet.
  const hasRealHistory = Boolean(hasGroundedHistory);
  const gradientId = `mountain-${metric}`;
  const headline =
    currentValue === undefined ? (isLoading ? "…" : "—") : currentValue.toLocaleString();
  const growth = growthForBuckets(buckets);

  // "bugun 2k emas, bugun alohida 1k" — today's and yesterday's own new
  // activity, side by side, never the all-time cumulative total above.
  const todayVsYesterday =
    todayValue !== undefined && yesterdayValue !== undefined
      ? (() => {
          if (yesterdayValue === 0) {
            return todayValue === 0 ? null : { percent: null as number | null };
          }
          return { percent: ((todayValue - yesterdayValue) / Math.abs(yesterdayValue)) * 100 };
        })()
      : null;

  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between mb-1 gap-2">
        <h3 className="text-white font-semibold">{cfg.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {(isLive || hasRealHistory) ? (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Jonli
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
              Ma'lumot to'planmoqda
            </span>
          )}
          <div className="relative">
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
                      onPeriodChange(o.key);
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
      </div>

      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <span className="text-2xl font-bold text-white">{headline}</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className="h-0.5 w-4 rounded-full inline-block"
            style={{ backgroundColor: cfg.color }}
          />
          {cfg.label} (jami)
        </span>
        {growth && growth.direction !== "flat" && (
          <span
            className={`flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 ${
              growth.direction === "up"
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-rose-400 bg-rose-500/10"
            }`}
          >
            {growth.direction === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {growth.percent > 0 ? "+" : ""}
            {growth.percent.toFixed(1)}%
          </span>
        )}
      </div>

      {todayValue !== undefined && yesterdayValue !== undefined && (
        <p className="text-xs text-slate-500 mb-4">
          Bugun:{" "}
          <span className="text-slate-300 font-medium">{todayValue.toLocaleString()}</span>
          {" · "}Kecha:{" "}
          <span className="text-slate-300 font-medium">{yesterdayValue.toLocaleString()}</span>
          {todayVsYesterday?.percent != null && (
            <span className={todayVsYesterday.percent >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {" "}
              ({todayVsYesterday.percent > 0 ? "+" : ""}
              {todayVsYesterday.percent.toFixed(1)}%)
            </span>
          )}
        </p>
      )}

      <div className="h-56 -ml-2">
        {isLoading && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
          </div>
        ) : !hasRealHistory ? (
          // Every bucket is 0 — either no buckets came back at all, or
          // tracking is so new that no window has two real snapshots to
          // diff yet (e.g. right after this feature ships, every period
          // — daily, weekly, even yearly — starts before our one and
          // only snapshot). A flat 0-line chart across a 5-year axis
          // reads as "broken", not "no data yet", so show the honest
          // empty state instead of rendering a misleadingly flat line.
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-500">
            <BarChart3 className="h-8 w-8 opacity-40" />
            <p className="text-xs max-w-[220px]">
              Hozircha tarixiy ma'lumot yo'q — vaqt o'tishi bilan bu yerda
              real grafik shakllanadi.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cfg.color} stopOpacity={0.55} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
              />
              <XAxis
                dataKey="label"
                stroke="rgba(255,255,255,0.3)"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                stroke="rgba(255,255,255,0.3)"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={["auto", "auto"]}
              />
              <RechartsTooltip
                content={<ChartTooltip metricLabel={cfg.label} />}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={cfg.color}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
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

// TELEGRAM CARD — single entry point in Connectors. No more bot-token
// ("custom") connect flow: everything goes through MTProto (the person's
// own Telegram account). Clicking the card opens a modal that either walks
// through the phone/code/(2FA) login, or — once logged in — lists every
// channel the account administers, with connected ones pinned to the top
// (green) and a connect/disconnect toggle per channel. Disconnecting just
// removes the telegram_channels row, so the channel naturally falls back
// into the "ulash mumkin" list below (see TelegramConnectModal).
// ---------------------------------------------------------------------------

type MtprotoStep = "idle" | "phone" | "code" | "password";

function TelegramCard() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: connectedChannels } = useListTelegramChannels();
  const list = connectedChannels || [];

  return (
    <>
      <Glass className="p-0 overflow-hidden">
        <button
          data-testid="button-open-telegram"
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
              <Send className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Telegram</h3>
              <p className="text-slate-500 text-xs mt-0.5">
                {list.length > 0 ? `${list.length} ta kanal ulangan` : "Ulanmagan"}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
        </button>
      </Glass>
      {modalOpen && <TelegramConnectModal onClose={() => setModalOpen(false)} />}
    </>
  );
}

function TelegramConnectModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: status, isLoading: statusLoading } = useGetTelegramMtprotoStatus();
  const connected = Boolean(status?.connected);

  const { data: channelsData, isLoading: channelsLoading } = useListTelegramMtprotoChannels({
    enabled: connected,
  });
  const { data: connectedChannels } = useListTelegramChannels({
    // Polls while the modal is open so a fresh connect/disconnect (or a
    // channel added on the Telegram side) reflects here without a manual
    // refresh.
    query: { refetchInterval: 5000 },
  });
  const connectChannel = useConnectTelegramMtprotoChannel();
  const disconnectChannel = useDisconnectTelegramChannel();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);

  const sendCode = useTelegramMtprotoSendCode();
  const resendCode = useTelegramMtprotoResendCode();
  const verifyCode = useTelegramMtprotoVerifyCode();
  const verifyPassword = useTelegramMtprotoVerifyPassword();
  const logout = useTelegramMtprotoLogout();

  const [step, setStep] = useState<MtprotoStep>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<
    "app" | "sms" | "call" | "flash_call" | "other" | null
  >(null);
  const [resendNotice, setResendNotice] = useState("");

  function resetFlow() {
    setStep("idle");
    setCode("");
    setPassword("");
    setPendingId(null);
    setError("");
    setDeliveryMethod(null);
    setResendNotice("");
  }

  async function handleSendCode() {
    setError("");
    try {
      const result = await sendCode.mutateAsync({ phoneNumber: phone.trim() });
      setPendingId(result.pendingId);
      setDeliveryMethod(result.deliveryMethod);
      setStep("code");
    } catch (err: any) {
      setError(err?.data?.error || "Kod yuborilmadi. Raqamni tekshirib qayta urining.");
    }
  }

  async function handleResendCode() {
    if (!pendingId) return;
    setError("");
    setResendNotice("");
    try {
      const result = await resendCode.mutateAsync({ pendingId, phoneNumber: phone.trim() });
      setDeliveryMethod(result.deliveryMethod);
      setResendNotice("Kod qayta yuborildi.");
    } catch (err: any) {
      setError(err?.data?.error || "Kod qayta yuborilmadi.");
    }
  }

  async function handleVerifyCode() {
    if (!pendingId) return;
    setError("");
    try {
      const result = await verifyCode.mutateAsync({
        pendingId,
        phoneNumber: phone.trim(),
        code: code.trim(),
      });
      if (result.status === "needs_password") {
        setStep("password");
      } else {
        onConnected();
      }
    } catch (err: any) {
      setError(err?.data?.error || "Kod noto'g'ri.");
    }
  }

  async function handleVerifyPassword() {
    if (!pendingId) return;
    setError("");
    try {
      await verifyPassword.mutateAsync({ pendingId, password });
      onConnected();
    } catch (err: any) {
      setError(err?.data?.error || "Parol noto'g'ri.");
    }
  }

  function onConnected() {
    resetFlow();
    queryClient.invalidateQueries({ queryKey: ["/api/telegram-mtproto/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/telegram-mtproto/channels"] });
  }

  async function handleLogout() {
    await logout.mutateAsync();
    setPhone("");
    queryClient.invalidateQueries({ queryKey: ["/api/telegram-mtproto/status"] });
  }

  async function handleConnectChannel(mtprotoChannelId: string) {
    setConnectingId(mtprotoChannelId);
    try {
      await connectChannel.mutateAsync({ mtprotoChannelId });
      queryClient.invalidateQueries({ queryKey: getListTelegramChannelsQueryKey() });
    } catch {
      // Rare (channel resolution failing server-side) — button just
      // reverts and the person can try again.
    } finally {
      setConnectingId(null);
    }
  }

  async function handleDisconnectChannel(rowId: number) {
    setDisconnectingId(rowId);
    try {
      await disconnectChannel.mutateAsync({ id: rowId });
      queryClient.invalidateQueries({ queryKey: getListTelegramChannelsQueryKey() });
    } finally {
      setDisconnectingId(null);
    }
  }

  const channels = channelsData?.channels || [];
  // Bot-format id ("-100...") for each discovered channel, matched against
  // telegram_channels rows regardless of connectionType — a channel
  // connected before this UI existed (connectionType "bot") still counts
  // as connected here.
  const connectedRowByChannelId = new Map(
    (connectedChannels || []).map((ch: any) => [ch.channelId, ch]),
  );
  const busy = sendCode.isPending || verifyCode.isPending || verifyPassword.isPending;

  const connectedRows = channels.filter((c) => connectedRowByChannelId.has(`-100${c.id}`));
  const availableRows = channels.filter((c) => !connectedRowByChannelId.has(`-100${c.id}`));

  function ChannelRow({ c, isConnected }: { c: (typeof channels)[number]; isConnected: boolean }) {
    const row = connectedRowByChannelId.get(`-100${c.id}`);
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${
          isConnected
            ? "border-emerald-500/30 bg-emerald-500/[0.08]"
            : "border-white/5 bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-violet-500/10 border-violet-500/30"
            }`}
          >
            <Radio className={`h-4 w-4 ${isConnected ? "text-emerald-400" : "text-violet-400"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{c.title}</p>
            <p className="text-slate-500 text-xs mt-0.5 truncate">
              {c.username ? `@${c.username}` : "Shaxsiy kanal"}
              {c.membersCount != null ? ` · ${c.membersCount.toLocaleString()} a'zo` : ""}
            </p>
          </div>
        </div>
        {isConnected ? (
          <button
            onClick={() => row && handleDisconnectChannel(row.id)}
            disabled={!row || disconnectingId === row?.id}
            title="Uzish"
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-300 disabled:opacity-40 transition"
          >
            {row && disconnectingId === row.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <button
            onClick={() => handleConnectChannel(c.id)}
            disabled={connectingId === c.id}
            title="Ulash"
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-white/5 border border-white/10 disabled:opacity-40 text-slate-300 hover:border-violet-500/40 hover:text-violet-300 transition"
          >
            {connectingId === c.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md my-4">
        <Glass className="p-6 max-h-[85vh] flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-1 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
                <Send className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Telegram</h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  {statusLoading
                    ? "Tekshirilmoqda..."
                    : connected
                      ? "Ulangan"
                      : "Ulanmagan"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {connected && (
                <button
                  onClick={handleLogout}
                  disabled={logout.isPending}
                  title="Hisobni uzish"
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 disabled:opacity-40 text-slate-300 px-3 py-2 rounded-xl text-xs font-medium hover:border-rose-500/30 hover:text-rose-300 transition"
                >
                  {logout.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  Uzish
                </button>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {!connected && (
            <p className="text-slate-500 text-xs mt-3 leading-relaxed shrink-0">
              Kanallaringizni ulash uchun haqiqiy Telegram hisobingizga
              kiring — bot emas, o'zingizning hisobingiz.
            </p>
          )}

          {error && <p className="text-rose-300 text-xs mt-3 shrink-0">{error}</p>}

          {connected ? (
            <div className="mt-5 overflow-y-auto -mx-1 px-1 space-y-5">
              {channelsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
                </div>
              ) : channels.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  Bu hisob hech qanday kanalda admin emas.
                </p>
              ) : (
                <>
                  {connectedRows.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-400/80 font-medium">
                        Ulangan
                      </p>
                      {connectedRows.map((c) => (
                        <ChannelRow key={c.id} c={c} isConnected />
                      ))}
                    </div>
                  )}
                  {availableRows.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                        Ulash mumkin
                      </p>
                      {availableRows.map((c) => (
                        <ChannelRow key={c.id} c={c} isConnected={false} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : step === "idle" ? (
            <button
              data-testid="button-connect-mtproto"
              onClick={() => setStep("phone")}
              className="mt-5 flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-violet-900/30 transition self-start"
            >
              <Link2 className="h-3.5 w-3.5" />
              Ulash
            </button>
          ) : (
            <div className="mt-5 space-y-3">
              {step === "phone" && (
                <>
                  <input
                    type="tel"
                    placeholder="+998901234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500/50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSendCode}
                      disabled={busy || !phone.trim()}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
                    >
                      {sendCode.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Kod yuborish
                    </button>
                    <button
                      onClick={resetFlow}
                      className="text-slate-400 text-sm px-3 py-2.5 hover:text-slate-200 transition"
                    >
                      Bekor qilish
                    </button>
                  </div>
                </>
              )}
              {step === "code" && (
                <>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {deliveryMethod === "app" &&
                      "Kod Telegram ilovasining o'zidagi \"Telegram\" nomli tizim chat'iga yuborildi — ilovani oching va o'sha yerdan qarang (SMS emas)."}
                    {deliveryMethod === "sms" && "Kod SMS orqali yuborildi."}
                    {(deliveryMethod === "call" || deliveryMethod === "flash_call") &&
                      "Kod telefon qo'ng'irog'i orqali yuboriladi/yuborildi."}
                    {(deliveryMethod === "other" || !deliveryMethod) &&
                      "Telegram tanlagan usul bilan kod yuborildi."}
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Telegramdan kelgan kod"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500/50"
                  />
                  <div className="flex gap-2 items-center flex-wrap">
                    <button
                      onClick={handleVerifyCode}
                      disabled={busy || !code.trim()}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
                    >
                      {verifyCode.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Tasdiqlash
                    </button>
                    <button
                      onClick={resetFlow}
                      className="text-slate-400 text-sm px-3 py-2.5 hover:text-slate-200 transition"
                    >
                      Bekor qilish
                    </button>
                  </div>
                  <button
                    onClick={handleResendCode}
                    disabled={resendCode.isPending}
                    className="flex items-center gap-1.5 text-violet-300 text-xs hover:text-violet-200 disabled:opacity-40 transition"
                  >
                    {resendCode.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Kod kelmadimi? Boshqa usul bilan yuborish
                  </button>
                  {resendNotice && <p className="text-emerald-300 text-xs">{resendNotice}</p>}
                </>
              )}
              {step === "password" && (
                <>
                  <input
                    type="password"
                    placeholder="2FA parol"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500/50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleVerifyPassword}
                      disabled={busy || !password}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
                    >
                      {verifyPassword.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Tasdiqlash
                    </button>
                    <button
                      onClick={resetFlow}
                      className="text-slate-400 text-sm px-3 py-2.5 hover:text-slate-200 transition"
                    >
                      Bekor qilish
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}

function ConnectorsPage() {
  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-6">
      <TelegramCard />
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

// YouTube connector — Google OAuth 2.0 (Authorization Code flow, no PKCE:
// the code exchange happens server-side where the client_secret lives, same
// shape as InstagramConnectorCard). Connecting only reads the channel's
// basic info for now (title/thumbnail); actual video upload/publish comes
// later once this card is wired to the backend.
function YoutubeConnectorCard() {
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
    queryKey: ["youtube-config"],
    queryFn: () => authedFetch("/api/connectors/youtube/config"),
    enabled: !!firebaseUser,
  });

  const {
    data: accounts,
    isLoading,
  } = useQuery({
    queryKey: ["youtube-accounts"],
    queryFn: () => authedFetch("/api/connectors/youtube"),
    enabled: !!firebaseUser,
  });

  const list = accounts || [];
  const atLimit = list.length >= 3;

  function randomToken(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    let str = "";
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function handleConnect() {
    if (!config?.clientId || atLimit) return;
    // Use the stable redirect URI from the server (based on PUBLIC_APP_URL)
    // so that the user only needs to register one URL in Google Cloud Console.
    const redirectUri = config.redirectUri || `${window.location.origin}/`;
    setConnecting(true);
    const state = randomToken(16);
    sessionStorage.setItem("yt_oauth_pending", "1");
    sessionStorage.setItem("yt_oauth_state", state);
    sessionStorage.setItem("yt_oauth_redirect_uri", redirectUri);
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope:
          config.scope ||
          "https://www.googleapis.com/auth/youtube.readonly",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      }).toString();
    window.location.href = authUrl;
  }

  async function handleDisconnect(id: number) {
    setRemovingId(id);
    try {
      await authedFetch(`/api/connectors/youtube/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["youtube-accounts"] });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Glass className="p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
            <Youtube className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">YouTube</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {list.length}/3 kanal ulangan
            </p>
          </div>
        </div>
        <button
          data-testid="button-connect-youtube"
          onClick={handleConnect}
          disabled={connecting || atLimit || !config?.clientId}
          className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-red-900/30 transition"
        >
          {connecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Ulash
        </button>
      </div>

      {config && !config.configured && (
        <p className="text-amber-300/80 text-xs mt-3">
          YouTube ulanishi hali serverda sozlanmagan (GOOGLE_CLIENT_ID /
          GOOGLE_CLIENT_SECRET kerak).
        </p>
      )}

      {atLimit && (
        <p className="text-slate-500 text-xs mt-3">
          Maksimal 3 ta kanal ulash mumkin.
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
                {a.thumbnailUrl ? (
                  <img
                    src={a.thumbnailUrl}
                    alt={a.title}
                    className="h-9 w-9 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                    <Youtube className="h-4 w-4 text-red-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {a.title || "YouTube kanal"}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">
                    {a.customUrl || "Ulangan"}
                  </p>
                </div>
              </div>
              <button
                data-testid={`button-disconnect-youtube-${a.id}`}
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
      const res = await fetch(apiUrl("/api/connectors/store/config"), {
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

// ShopFront — endi Connectors ichida emas, nav bar'da alohida katta bo'lim.
// Hozircha ichida xuddi Connectors sahifasida ko'ringan Vitrina bo'limi
// bilan bir xil ko'rinadi (vaqtincha); keyinchalik bu yerga to'liq
// ShopFront funksionalligi (mahsulotlar, dizayn, sozlamalar) qo'shiladi.
function ShopFrontPage() {
  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-6">
      <StoreConnectorCard />
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
  const subLabel = user?.company || "Pro plan";

  const items = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "inventory", label: "Inventory", icon: Package },
    { key: "orders", label: "Buyurtmalar", icon: ShoppingBag },
    { key: "connectors", label: "Connectors", icon: Send },
    { key: "shopfront", label: "ShopFront", icon: Globe },
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
    { key: "orders", label: "Orders", icon: ShoppingBag },
    { key: "connectors", label: "Connect", icon: Send },
    { key: "shopfront", label: "ShopFront", icon: Globe },
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

  const { user: firebaseUser } = useAuth();
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const saving = createProduct.isPending || updateProduct.isPending;

  // AI card (view/edit) — only meaningful once the product already exists
  // and has been researched at least once.
  const { data: research } = useGetProductResearch(initial?.id, { enabled: isEdit });
  const updateResearch = useUpdateProductResearch(initial?.id);
  const [cardEditing, setCardEditing] = useState(false);
  const [cardSearchTitle, setCardSearchTitle] = useState("");
  const [cardSearchKeywords, setCardSearchKeywords] = useState("");
  const [cardViewHook, setCardViewHook] = useState("");
  const [cardBuyHeadline, setCardBuyHeadline] = useState("");
  const [cardBuyCta, setCardBuyCta] = useState("");
  const [cardPopularNames, setCardPopularNames] = useState("");

  // Populate the editable fields once the cached card loads (or reloads
  // after a save) — but only while the person isn't actively mid-edit, so
  // a background refetch never clobbers what they're typing.
  useEffect(() => {
    if (!research || cardEditing) return;
    setCardSearchTitle(research.card.searchTitle ?? "");
    setCardSearchKeywords(research.card.searchKeywords ?? "");
    setCardViewHook(research.card.viewHook ?? "");
    setCardBuyHeadline(research.card.buyHeadline ?? "");
    setCardBuyCta(research.card.buyCta ?? "");
    setCardPopularNames((research.card.popularNames ?? []).join(", "));
  }, [research, cardEditing]);

  async function saveCard() {
    try {
      await updateResearch.mutateAsync({
        searchTitle: cardSearchTitle.trim(),
        searchKeywords: cardSearchKeywords.trim(),
        viewHook: cardViewHook.trim(),
        buyHeadline: cardBuyHeadline.trim(),
        buyCta: cardBuyCta.trim(),
        popularNames: cardPopularNames
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .slice(0, 5),
      });
      setCardEditing(false);
    } catch {
      // updateResearch.error already renders below — nothing else to do.
    }
  }

  // Fire-and-forget: as soon as a product is saved as "active" with a name
  // + price, kick off its one-time deep AI research in the background (not
  // awaited — the user doesn't wait for this). By the time they open
  // "Create Post" for it, the Professional Product Card is already cached
  // and post generation is instant instead of re-running AI/search.
  async function triggerBackgroundResearch(productId: number) {
    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) return;
      void fetch(apiUrl(`/api/products/${productId}/research`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort — a failed background trigger just means the first
      // "Create Post" for this product falls back to researching inline.
    }
  }

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
      let savedId = initial?.id;
      if (isEdit && initial) {
        await updateProduct.mutateAsync({ id: initial.id, data });
      } else {
        const created = await createProduct.mutateAsync({ data });
        savedId = (created as any)?.id;
      }
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      if (status === "active" && savedId && name.trim() && sellPrice.trim()) {
        void triggerBackgroundResearch(savedId);
      }
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

          {isEdit && research && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-violet-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI kartasi — postlarda ishlatiladigan matnlar
                </div>
                {!cardEditing && (
                  <button
                    type="button"
                    onClick={() => setCardEditing(true)}
                    className="text-xs text-violet-300 hover:text-violet-200 transition"
                  >
                    Tahrirlash
                  </button>
                )}
              </div>

              {cardEditing ? (
                <>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Qidiruv nomi
                    </label>
                    <input
                      value={cardSearchTitle}
                      onChange={(e) => setCardSearchTitle(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-400 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Kalit so'zlar
                    </label>
                    <input
                      value={cardSearchKeywords}
                      onChange={(e) => setCardSearchKeywords(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-400 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      E'tibor tortuvchi jumla
                    </label>
                    <input
                      value={cardViewHook}
                      onChange={(e) => setCardViewHook(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-400 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Xarid sarlavhasi
                    </label>
                    <input
                      value={cardBuyHeadline}
                      onChange={(e) => setCardBuyHeadline(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-400 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Harakatga chaqiruv (CTA)
                    </label>
                    <input
                      value={cardBuyCta}
                      onChange={(e) => setCardBuyCta(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-400 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Mashhur nomlar (vergul bilan ajrating)
                    </label>
                    <input
                      value={cardPopularNames}
                      onChange={(e) => setCardPopularNames(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-400 transition"
                    />
                  </div>
                  {updateResearch.isError && (
                    <p className="text-rose-400 text-xs">Saqlashda xatolik yuz berdi.</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={saveCard}
                      disabled={updateResearch.isPending}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 text-white px-3.5 py-2 rounded-lg text-xs font-medium transition"
                    >
                      {updateResearch.isPending && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      Saqlash
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardEditing(false)}
                      className="text-slate-400 text-xs px-2 py-2 hover:text-slate-200 transition"
                    >
                      Bekor qilish
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5 text-xs text-slate-300">
                  {research.card.viewHook && <p>{research.card.viewHook}</p>}
                  {research.card.buyCta && (
                    <p className="text-slate-400">{research.card.buyCta}</p>
                  )}
                  {!research.card.viewHook && !research.card.buyCta && (
                    <p className="text-slate-500">Hali to'ldirilmagan.</p>
                  )}
                </div>
              )}
            </div>
          )}
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
      <div className="relative rounded-lg sm:rounded-xl overflow-hidden bg-white/5 aspect-[3/4] mb-2 sm:mb-3 flex items-center justify-center">
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

// ---------------------------------------------------------------------------
// SUMMARY CARDS — four top-line numbers computed entirely from data the
// two live-stats queries already fetch (no extra requests): total
// subscribers, total views, an engagement ratio (views per subscriber),
// and which connected channel is pulling the most views right now.
// ---------------------------------------------------------------------------
function DashboardSummaryCards({
  totalSubscribers,
  totalViews,
  viewsKnown,
  topChannel,
  todaySubscribers,
  yesterdaySubscribers,
  todayViews,
  yesterdayViews,
}: {
  totalSubscribers?: number;
  totalViews?: number;
  viewsKnown: boolean;
  topChannel?: { title: string; views: number } | null;
  todaySubscribers?: number;
  yesterdaySubscribers?: number;
  todayViews?: number;
  yesterdayViews?: number;
}) {
  const engagement =
    viewsKnown && totalViews !== undefined && totalSubscribers
      ? totalViews / totalSubscribers
      : null;

  // "bugun 2k emas, bugun alohida 1k" — each card's own today-vs-yesterday
  // line, right under the all-time total, so the two numbers are never
  // confused with each other.
  function todayLine(today?: number, yesterday?: number): string | undefined {
    if (today === undefined) return undefined;
    const parts = [`Bugun: ${today.toLocaleString()}`];
    if (yesterday !== undefined) parts.push(`Kecha: ${yesterday.toLocaleString()}`);
    return parts.join(" · ");
  }

  const cards = [
    {
      icon: Users,
      color: "#22d3ee",
      label: "Jami obunachilar",
      value: totalSubscribers !== undefined ? totalSubscribers.toLocaleString() : "—",
      sub: todayLine(todaySubscribers, yesterdaySubscribers),
    },
    {
      icon: Eye,
      color: "#a78bfa",
      label: "Jami ko'rishlar",
      value: viewsKnown && totalViews !== undefined ? totalViews.toLocaleString() : "—",
      sub: viewsKnown ? todayLine(todayViews, yesterdayViews) : undefined,
    },
    {
      icon: BarChart3,
      color: "#34d399",
      label: "O'rtacha ko'rish / obunachi",
      value: engagement !== null ? engagement.toFixed(2) : "—",
    },
    {
      icon: Layers,
      color: "#fbbf24",
      label: "Eng faol kanal",
      value: topChannel ? topChannel.title : "—",
      sub: topChannel ? `${topChannel.views.toLocaleString()} ko'rish` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Glass key={c.label} className="p-4">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center mb-3"
            style={{ backgroundColor: `${c.color}1a` }}
          >
            <c.icon className="h-4 w-4" style={{ color: c.color }} />
          </div>
          <p className="text-lg font-bold text-white truncate">{c.value}</p>
          <p className="text-xs text-slate-400 mt-0.5">{c.label}</p>
          {c.sub && <p className="text-[11px] text-slate-500 mt-0.5">{c.sub}</p>}
        </Glass>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PER-CHANNEL BREAKDOWN — merges the bot_api channel list (always present,
// subscribers only) with the mtproto channel list (subscribers + real
// views, once connected) by row id, so each connected channel gets one
// line with both numbers side by side instead of only an aggregate total.
// ---------------------------------------------------------------------------
function ChannelBreakdownList({
  botChannels,
  mtprotoChannels,
  mtprotoConnected,
}: {
  botChannels?: { id: number; channelTitle: string; subscribers: number | null }[];
  mtprotoChannels?: {
    channelRowId: number;
    channelTitle: string;
    subscribers: number | null;
    views: number | null;
  }[];
  mtprotoConnected: boolean;
}) {
  const mtprotoByChannel = new Map(
    (mtprotoChannels ?? []).map((c) => [c.channelRowId, c]),
  );

  // Prefer MTProto's per-channel count — it resolves every connected
  // channel (bot- or mtproto-connectionType) via the account's own admin
  // access, whereas the bot API's count only ever works for a channel the
  // bot itself is a member/admin of. Falling back to the bot API value
  // keeps things working before MTProto is connected at all.
  const rows = (botChannels ?? []).map((ch) => {
    const m = mtprotoByChannel.get(ch.id);
    return {
      key: `bot-${ch.id}`,
      title: ch.channelTitle,
      subscribers: m?.subscribers ?? ch.subscribers,
      views: m?.views ?? null,
    };
  });

  if (rows.length === 0) {
    return null;
  }

  return (
    <Glass className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="h-4 w-4 text-violet-400" />
        <h3 className="text-white font-semibold">Kanallar bo'yicha statistika</h3>
      </div>
      <div className="space-y-2">
        {rows
          .slice()
          .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
          .map((ch) => (
            <div
              key={ch.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">
                  {ch.title}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-xs">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Users className="h-3.5 w-3.5 text-cyan-400" />
                  {ch.subscribers !== null ? ch.subscribers.toLocaleString() : "—"}
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Eye className="h-3.5 w-3.5 text-violet-400" />
                  {mtprotoConnected && ch.views != null ? ch.views.toLocaleString() : "—"}
                </span>
              </div>
            </div>
          ))}
      </div>
      {!mtprotoConnected && (
        <p className="text-[11px] text-slate-500 mt-3">
          Har bir kanal bo'yicha real ko'rishlar sonini ko'rish uchun MTProto'ni ulang.
        </p>
      )}
    </Glass>
  );
}

// ---------------------------------------------------------------------------
// ORDERS — every order that came in from any of the seller's storefront
// pages. Same lifecycle real marketplaces use: Yangi -> Tasdiqlangan ->
// Jo'natildi -> Yetkazildi, or Bekor qilindi at any point.
// ---------------------------------------------------------------------------

const ORDER_STATUS_META: Record<
  string,
  { label: string; color: string; next?: { key: string; label: string } }
> = {
  new: { label: "Yangi", color: "#fbbf24", next: { key: "confirmed", label: "Tasdiqlash" } },
  confirmed: { label: "Tasdiqlangan", color: "#22d3ee", next: { key: "shipped", label: "Jo'natish" } },
  shipped: { label: "Jo'natildi", color: "#a78bfa", next: { key: "delivered", label: "Yetkazildi deb belgilash" } },
  delivered: { label: "Yetkazildi", color: "#34d399" },
  cancelled: { label: "Bekor qilindi", color: "#f87171" },
};

const ORDER_FILTERS = [
  { key: "all", label: "Barchasi" },
  { key: "new", label: "Yangi" },
  { key: "confirmed", label: "Tasdiqlangan" },
  { key: "shipped", label: "Jo'natildi" },
  { key: "delivered", label: "Yetkazildi" },
  { key: "cancelled", label: "Bekor qilindi" },
];

function OrdersPage() {
  const { user: firebaseUser } = useAuth();
  const [orders, setOrders] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await firebaseUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function load() {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(apiUrl("/api/orders"), { headers });
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      const headers = await authHeaders();
      const res = await fetch(apiUrl(`/api/orders/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setOrders((prev) =>
          prev ? prev.map((o) => (o.id === id ? { ...o, status } : o)) : prev,
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = (orders || []).filter((o) => filter === "all" || o.status === filter);

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ORDER_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
              filter === f.key
                ? "bg-gradient-to-r from-violet-500 to-blue-500 text-white"
                : "bg-white/5 text-slate-400 hover:text-white border border-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Glass className="p-10 flex flex-col items-center text-center gap-2">
          <ShoppingBag className="h-8 w-8 text-slate-600" />
          <p className="text-slate-400 text-sm">
            {filter === "all"
              ? "Hali buyurtmalar yo'q. Vitrinangiz havolasini ulashing — mijozlar u yerdan to'g'ridan-to'g'ri buyurtma bera oladi."
              : "Bu holatda buyurtma yo'q."}
          </p>
        </Glass>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.new;
            const isExpanded = expandedId === o.id;
            return (
              <Glass key={o.id} className="p-4">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-slate-500">{o.orderNumber}</span>
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-sm text-white truncate">{o.customerName} · {o.customerPhone}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(o.items || []).length} mahsulot · {o.totalAmount} {o.currency}
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    <div className="space-y-2">
                      {(o.items || []).map((it: any, i: number) => (
                        <div key={i} className="flex items-center gap-3">
                          {it.image && (
                            <img src={it.image} alt={it.name} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{it.name}</p>
                            <p className="text-xs text-slate-500">
                              {it.quantity} x {it.price} {it.currency}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <p><span className="text-slate-500">Manzil:</span> {o.customerAddress}</p>
                      {o.customerComment && <p><span className="text-slate-500">Izoh:</span> {o.customerComment}</p>}
                      <p><span className="text-slate-500">Sana:</span> {new Date(o.createdAt).toLocaleString("uz-UZ")}</p>
                    </div>
                    {meta.next && o.status !== "cancelled" && o.status !== "delivered" && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => updateStatus(o.id, meta.next!.key)}
                          disabled={updatingId === o.id}
                          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium"
                        >
                          {updatingId === o.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {meta.next.label}
                        </button>
                        <button
                          onClick={() => updateStatus(o.id, "cancelled")}
                          disabled={updatingId === o.id}
                          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-rose-400 hover:bg-rose-500/10"
                        >
                          Bekor qilish
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Glass>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dashboard({ goCreate, user }: any) {
  void goCreate;
  void user;

  const [subscribersPeriod, setSubscribersPeriod] = useState<PeriodKey>("daily");
  const [viewsPeriod, setViewsPeriod] = useState<PeriodKey>("daily");

  // 30s is plenty for a subscriber count (it moves slowly) and keeps Bot
  // API calls light — no need for the aggressive polling a truly
  // second-by-second view would need.
  const { data, isLoading } = useGetTelegramLiveStats({
    query: { refetchInterval: 30000 },
  });

  const { data: mtprotoStatus } = useGetTelegramMtprotoStatus();
  const mtprotoConnected = Boolean(mtprotoStatus?.connected);

  // Real views — only source is MTProto (see telegram-mtproto/stats.ts).
  // Disabled entirely until connected, so we don't poll a 409 every 30s.
  const { data: mtprotoLive, isLoading: mtprotoLoading } = useGetTelegramMtprotoLiveStats({
    enabled: mtprotoConnected,
    refetchInterval: 30000,
  });

  // Period-correct bucket series + today/yesterday, straight from
  // /api/stats/dashboard — every number here is already isolated to its
  // own window (see statsAggregation.ts), so nothing downstream needs to
  // re-derive deltas from cumulative snapshots itself.
  const viewsStats = useStatsDashboard("views", viewsPeriod, mtprotoConnected);
  const subscribersStats = useStatsDashboard("subscribers", subscribersPeriod, true);

  const topChannel = (mtprotoLive?.channels ?? [])
    .filter((c: { views: number | null }) => c.views != null)
    .sort(
      (a: { views: number | null }, b: { views: number | null }) =>
        (b.views ?? 0) - (a.views ?? 0),
    )[0];

  // Once MTProto is connected, its channel list is the full picture — bot-
  // connected channels (matched) plus channels the account administers but
  // never bot-connected (see stats.ts) — so it's the more complete total.
  // Bot API's count only ever covers bot-connected channels.
  const totalSubscribers = mtprotoConnected && mtprotoLive
    ? mtprotoLive.totalSubscribers
    : data?.totalSubscribers;

  return (
    <div className="p-6 md:p-10 space-y-8">
      {!mtprotoConnected && (
        <Glass className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <KeyRound className="h-5 w-5 text-violet-400" />
            </div>
            <p className="text-sm text-slate-300">
              Real post views'ni ko'rish uchun{" "}
              <strong className="text-white">Telegram MTProto</strong>ni
              ulang — Sozlamalar → Ulanishlar bo'limida.
            </p>
          </div>
        </Glass>
      )}

      <DashboardSummaryCards
        totalSubscribers={totalSubscribers}
        totalViews={mtprotoLive?.totalViews}
        viewsKnown={mtprotoConnected}
        topChannel={topChannel ? { title: topChannel.channelTitle, views: topChannel.views ?? 0 } : null}
        todaySubscribers={subscribersStats.data?.todayValue}
        yesterdaySubscribers={subscribersStats.data?.yesterdayValue}
        todayViews={mtprotoConnected ? viewsStats.data?.todayValue : undefined}
        yesterdayViews={mtprotoConnected ? viewsStats.data?.yesterdayValue : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChannelStatsChart
          metric="views"
          currentValue={mtprotoLive?.totalViews}
          isLive={mtprotoConnected && Boolean(mtprotoLive)}
          isLoading={mtprotoConnected && (mtprotoLoading || viewsStats.isLoading)}
          buckets={viewsStats.data?.buckets}
          todayValue={mtprotoConnected ? viewsStats.data?.todayValue : undefined}
          yesterdayValue={mtprotoConnected ? viewsStats.data?.yesterdayValue : undefined}
          hasGroundedHistory={mtprotoConnected ? viewsStats.data?.hasGroundedHistory : false}
          period={viewsPeriod}
          onPeriodChange={setViewsPeriod}
        />
        <ChannelStatsChart
          metric="subscribers"
          currentValue={totalSubscribers}
          isLive={Boolean(data) || (mtprotoConnected && Boolean(mtprotoLive))}
          isLoading={isLoading || subscribersStats.isLoading}
          buckets={subscribersStats.data?.buckets}
          todayValue={subscribersStats.data?.todayValue}
          yesterdayValue={subscribersStats.data?.yesterdayValue}
          hasGroundedHistory={subscribersStats.data?.hasGroundedHistory}
          period={subscribersPeriod}
          onPeriodChange={setSubscribersPeriod}
        />
      </div>

      <ChannelBreakdownList
        botChannels={data?.channels}
        mtprotoChannels={mtprotoLive?.channels}
        mtprotoConnected={mtprotoConnected}
      />
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
        <div className="relative rounded-xl overflow-hidden bg-white/5 aspect-[3/4] mb-2.5 flex items-center justify-center">
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

function Generating({ form, product, onDone, onError }: any) {
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
          // When this post is for a saved inventory product, the backend
          // reuses (or creates once, then caches) that product's deep
          // research — every post after the first is instant and free.
          ...(product?.id ? { productId: product.id } : {}),
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
  onYtApprove,
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

    const dataUrl = await resizeImageFile(file);

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

      {/* ── PROFESSIONAL PRODUCT CARD: search / view / buy ── */}
      {(enriched.viewHook || enriched.buyCta || enriched.searchKeywords || (enriched.popularNames && enriched.popularNames.length > 0)) && (
        <Glass className="p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h3 className="text-white font-semibold">
              Professional Product Card
            </h3>
          </div>

          {enriched.popularNames && enriched.popularNames.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                Internetda topilgan mashhur nomlar
              </p>
              <div className="flex flex-wrap gap-2">
                {enriched.popularNames.map((n: string, i: number) => (
                  <span
                    key={i}
                    className="text-xs bg-white/5 border border-white/10 text-slate-300 rounded-full px-3 py-1"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {enriched.searchKeywords && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                🔍 Qidiruv uchun kalit so'zlar
              </p>
              <p className="text-slate-300 text-sm leading-relaxed">
                {enriched.searchKeywords}
              </p>
            </div>
          )}

          {enriched.viewHook && (
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                👀 E'tibor tortish uchun (view)
              </p>
              <p className="text-white text-sm">{enriched.viewHook}</p>
            </div>
          )}

          {enriched.buyCta && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-xs text-emerald-300 mb-1.5 font-medium uppercase tracking-wider">
                🛒 Sotib olishga undash (buy)
              </p>
              <p className="text-slate-200 text-sm">{enriched.buyCta}</p>
            </div>
          )}

          {enrichData?.cached && (
            <p className="text-xs text-slate-500">
              ⚡ Ushbu mahsulot avval tahlil qilingan — natija keshdan olindi (AI qayta chaqirilmadi).
            </p>
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
          <ThumbsUp className="h-4 w-4" /> Telegram'ga publish
        </button>
        {onYtApprove && (
          <button
            data-testid="button-approve-youtube"
            onClick={onYtApprove}
            className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg shadow-red-900/30"
          >
            <Youtube className="h-4 w-4" /> YouTube'ga publish
          </button>
        )}
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
  productId,
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
              ...(form?.name ? { name: form.name } : {}),
              ...(form?.price
                ? { price: `${form.price}${form.currency ? " " + form.currency : ""}` }
                : {}),
              ...(productId ? { productId } : {}),
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
// YOUTUBE PUBLISH FLOW
// ---------------------------------------------------------------------------

// Step 1 — call the backend to generate YouTube metadata
function YtMetadataGenerating({ product, form, onDone, onError }: any) {
  const { user: firebaseUser } = useAuth();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    async function run() {
      try {
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(apiUrl("/api/connectors/youtube/metadata"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            productId: product?.id,
            isShort: false,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Metadata generatsiya qilishda xato.");
        onDone(body);
      } catch (err: any) {
        onError(err?.message || "YouTube metadata tayyorlashda xato yuz berdi.");
      }
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-md">
      <Glass className="p-10 text-center">
        <div className="relative h-16 w-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping" />
          <div className="relative h-16 w-16 rounded-full bg-red-500 flex items-center justify-center">
            <Youtube className="h-7 w-7 text-white" />
          </div>
        </div>
        <h3 className="text-white font-semibold text-lg">YouTube metadata tayyorlanmoqda…</h3>
        <p className="text-slate-400 text-sm mt-1">AI sarlavha, tavsif va teglar yozmoqda.</p>
      </Glass>
    </div>
  );
}

// Step 2 — review / edit metadata and choose YouTube account
function YtMetadataReview({ product, ytMetadata, uploadError, onConfirm, onBack }: any) {
  const { user: firebaseUser } = useAuth();
  const [title, setTitle] = useState(ytMetadata?.title ?? "");
  const [description, setDescription] = useState(ytMetadata?.description ?? "");
  const [tagsStr, setTagsStr] = useState((ytMetadata?.tags ?? []).join(", "));
  const [isShort, setIsShort] = useState(ytMetadata?.isShort ?? false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [regenerating, setRegenerating] = useState(false);

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
      const b = await res.json().catch(() => null);
      throw new Error(b?.error ?? "So'rov muvaffaqiyatsiz.");
    }
    return res.status === 204 ? null : res.json();
  }

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["youtube-accounts"],
    queryFn: () => authedFetch("/api/connectors/youtube"),
    enabled: !!firebaseUser,
  });
  const list: any[] = accounts ?? [];

  // Auto-select first account
  useEffect(() => {
    if (list.length > 0 && !selectedAccountId) setSelectedAccountId(list[0].id);
  }, [list, selectedAccountId]);

  async function handleRegenerate() {
    setRegenerating(true);
    setMetaError("");
    try {
      const data = await authedFetch("/api/connectors/youtube/metadata", {
        method: "POST",
        body: JSON.stringify({ productId: product?.id, isShort }),
      });
      setTitle(data.title ?? "");
      setDescription(data.description ?? "");
      setTagsStr((data.tags ?? []).join(", "));
    } catch (err: any) {
      setMetaError(err?.message ?? "Metadata regeneratsiya muvaffaqiyatsiz.");
    } finally {
      setRegenerating(false);
    }
  }

  function handlePublish() {
    if (!selectedAccountId) {
      setMetaError("Iltimos, YouTube kanalini tanlang.");
      return;
    }
    if (!title.trim()) {
      setMetaError("Sarlavha bo'sh bo'lishi mumkin emas.");
      return;
    }
    setSubmitting(true);
    onConfirm(selectedAccountId, {
      title: title.trim(),
      description,
      tags: tagsStr.split(",").map((t: string) => t.trim()).filter(Boolean),
      hashtags: ytMetadata?.hashtags ?? [],
      isShort,
    });
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
        <Youtube className="h-4 w-4" /> YouTube metadata
      </div>

      {/* Account picker */}
      <Glass className="p-5 space-y-3">
        <h3 className="text-white font-semibold text-sm">YouTube kanalini tanlang</h3>
        {accountsLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
          </div>
        ) : list.length === 0 ? (
          <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            YouTube kanal ulanmagan. Connectors bo'limidan kanal ulang.
          </p>
        ) : (
          <div className="grid gap-2">
            {list.map((a: any) => {
              const checked = selectedAccountId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedAccountId(a.id)}
                  aria-pressed={checked}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    checked ? "border-red-400 bg-red-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  {a.thumbnailUrl ? (
                    <img src={a.thumbnailUrl} alt={a.title} className="h-8 w-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                      <Youtube className="h-4 w-4 text-red-400" />
                    </div>
                  )}
                  <span className="text-sm text-white truncate min-w-0">
                    {a.title || "YouTube kanal"}
                  </span>
                  <span className={`ml-auto h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition ${checked ? "bg-red-500 border-red-500" : "border-white/20"}`}>
                    {checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Glass>

      {/* Format toggle */}
      <Glass className="p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-white text-sm font-medium">YouTube Shorts formati</p>
          <p className="text-slate-400 text-xs mt-0.5">Vertikal video (9:16), ≤60 soniya</p>
        </div>
        <button
          onClick={() => setIsShort((v: boolean) => !v)}
          className={`h-6 w-11 rounded-full transition relative shrink-0 ${isShort ? "bg-red-500" : "bg-white/10"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${isShort ? "left-5" : "left-0.5"}`} />
        </button>
      </Glass>

      {/* Metadata fields */}
      <Glass className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Sarlavha va tavsif</h3>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40 transition"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Qayta yaratish
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 text-xs">Sarlavha (≤100 belgi)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 100))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-400 transition"
            placeholder="Video sarlavhasi…"
          />
          <p className="text-slate-600 text-xs text-right">{title.length}/100</p>
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 text-xs">Tavsif</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-400 transition resize-none"
            placeholder="Video tavsifi…"
          />
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 text-xs">Teglar (vergul bilan ajrating)</label>
          <input
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-400 transition"
            placeholder="mahsulot, elektronika, aksiya…"
          />
        </div>
      </Glass>

      {(metaError || uploadError) && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-sm">
          {metaError || uploadError}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-5 py-3 rounded-xl text-sm font-medium hover:border-white/20 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Ortga
        </button>
        <button
          data-testid="button-yt-publish"
          onClick={handlePublish}
          disabled={submitting || list.length === 0}
          className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-500 text-white px-6 py-3 rounded-xl text-sm font-medium shadow-lg shadow-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Youtube className="h-4 w-4" />
          )}
          YouTube'ga yuklash
        </button>
      </div>
    </div>
  );
}

// Step 3 — upload video, show progress
function YtPublishing({ product, accountId, ytMetadata, selectedImages, onDone, onError }: any) {
  const { user: firebaseUser } = useAuth();
  const called = useRef(false);
  const mounted = useRef(true);
  const [stage, setStage] = useState<"building" | "uploading">("building");

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    async function run() {
      try {
        const token = await firebaseUser?.getIdToken();
        if (mounted.current) setStage("uploading");

        // Send the user-selected image URLs so the backend builds the
        // slideshow from exactly those images (falls back to product.images
        // when the array is empty).
        const imageUrls = (selectedImages ?? []).map((img: any) => img.url).filter(Boolean);

        const res = await fetch(apiUrl("/api/connectors/youtube/publish"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            accountId,
            productId: product?.id,
            title: ytMetadata?.title,
            description: ytMetadata?.description,
            tags: ytMetadata?.tags,
            hashtags: ytMetadata?.hashtags,
            isShort: ytMetadata?.isShort,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "YouTube'ga yuklashda xato.");
        if (mounted.current) onDone(body?.url ?? "");
      } catch (err: any) {
        if (mounted.current) onError(err?.message || "YouTube publish muvaffaqiyatsiz.");
      }
    }
    run();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-md">
      <Glass className="p-10 text-center">
        <div className="relative h-16 w-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping" />
          <div className="relative h-16 w-16 rounded-full bg-red-500 flex items-center justify-center">
            <Youtube className="h-7 w-7 text-white" />
          </div>
        </div>
        <h3 className="text-white font-semibold text-lg">
          {stage === "building" ? "Video tayyorlanmoqda…" : "YouTube'ga yuklanmoqda…"}
        </h3>
        <p className="text-slate-400 text-sm mt-1">
          {stage === "building"
            ? "Rasmlardan slideshow video yaratilmoqda."
            : "Video YouTube'ga yuklanmoqda. Bu bir necha daqiqa olishi mumkin."}
        </p>
      </Glass>
    </div>
  );
}

// Step 4 — success
function YtSuccessScreen({ videoUrl, onDone }: any) {
  return (
    <div className="p-6 md:p-10 max-w-md">
      <Glass className="p-10 text-center">
        <div className="h-16 w-16 rounded-full bg-red-500 flex items-center justify-center mx-auto mb-5">
          <Check className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-white font-semibold text-xl">YouTube'ga muvaffaqiyatli yuklandi!</h3>
        <p className="text-slate-400 text-sm mt-2">
          Videongiz YouTube'da publish qilindi.
        </p>
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-2 w-full bg-red-500/10 border border-red-500/30 text-red-400 py-3 rounded-xl text-sm font-medium hover:bg-red-500/15 transition"
          >
            <Youtube className="h-4 w-4" /> YouTube'da ko'rish
          </a>
        )}
        <button
          data-testid="button-yt-back-to-dashboard"
          onClick={onDone}
          className="mt-3 w-full bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3 rounded-xl text-sm font-medium"
        >
          Dashboard'ga qaytish
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
      // Force-refresh the token so an expired cached token never silently
      // becomes a 401 (which would show the wrong "server error" screen).
      const token = await firebaseUser?.getIdToken(true);
      const res = await fetch(apiUrl("/api/me"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // 404 → profile doesn't exist yet (new user, onboarding needed)
      if (res.status === 404) return null;
      // 401 → token was rejected; sign the user out so they can log in fresh
      if (res.status === 401) {
        await signOut();
        return null;
      }
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!firebaseUser,
    retry: 1,
  });

  // Public storefront slug — same query key as StoreConnectorCard, so this
  // is a cache-share, not a duplicate request. Used to build the
  // per-product order link that gets folded into post text (see
  // handleGenerateDone / handleApprove below).
  const { data: storeConfig } = useQuery({
    queryKey: ["store-config"],
    queryFn: async () => {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch(apiUrl("/api/connectors/store/config"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load store config");
      return res.json();
    },
    enabled: !!firebaseUser,
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

  // Ensures the "order this product" link (see handleApprove) always has
  // somewhere to write to — create a brand-new product for posts made via
  // Skip/manual entry, or flip a picked Draft to Active right before
  // publishing.
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

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
  // YouTube publishing state
  const [ytMetadata, setYtMetadata] = useState<any>(null);
  const [ytAccountId, setYtAccountId] = useState<number | null>(null);
  const [ytVideoUrl, setYtVideoUrl] = useState<string>("");

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
        const res = await fetch(apiUrl("/api/connectors/vk/exchange"), {
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

  // YouTube (Google) OAuth redirects back to our own root URL with a
  // `?code=` (or `?error=`) query string, same pattern as Instagram/VK
  // above — the yt_oauth_pending flag (set in YoutubeConnectorCard)
  // disambiguates it. No PKCE here: the code exchange happens server-side
  // where GOOGLE_CLIENT_SECRET lives.
  const [youtubeNotice, setYoutubeNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem("yt_oauth_pending") !== "1") return;
    sessionStorage.removeItem("yt_oauth_pending");
    const expectedState = sessionStorage.getItem("yt_oauth_state") || "";
    sessionStorage.removeItem("yt_oauth_state");

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error_description") || params.get("error");
    window.history.replaceState({}, "", window.location.pathname);
    setNavView("connectors");

    if (oauthError) {
      setYoutubeNotice({ type: "error", message: oauthError.replace(/\+/g, " ") });
      return;
    }
    if (!code) return;
    if (expectedState && state !== expectedState) {
      setYoutubeNotice({
        type: "error",
        message: "YouTube ulanmadi: xavfsizlik tekshiruvi mos kelmadi. Qayta urinib ko'ring.",
      });
      return;
    }

    (async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(apiUrl("/api/connectors/youtube/exchange"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            code,
            // Must exactly match the redirect_uri used when the auth URL was
            // built — read it back from sessionStorage so it's consistent.
            redirectUri:
              sessionStorage.getItem("yt_oauth_redirect_uri") ||
              `${window.location.origin}/`,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || "YouTube ulanmadi. Qayta urinib ko'ring.");
        }
        queryClient.invalidateQueries({ queryKey: ["youtube-accounts"] });
        setYoutubeNotice({
          type: "success",
          message: "YouTube kanal muvaffaqiyatli ulandi.",
        });
      } catch (err: any) {
        setYoutubeNotice({
          type: "error",
          message: err?.message || "YouTube ulanmadi. Qayta urinib ko'ring.",
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
    orders: "Buyurtmalar",
    connectors: "Connectors",
    shopfront: "ShopFront",
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
    setYtMetadata(null);
    setYtAccountId(null);
    setYtVideoUrl("");
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
    // Fold in a direct "order this exact product" link — but only when the
    // post is for a real saved product (picked from Inventory, so it has an
    // id) that's actually "active" (drafts don't exist on the public
    // storefront yet, so linking one would 404) and the seller's storefront
    // slug has loaded. This is the fast path for the common case; the
    // Skip/manual and Draft cases are covered as a safety net in
    // handleApprove right before publishing (see below).
    if (
      selectedProduct?.id &&
      selectedProduct.status === "active" &&
      storeConfig?.slug &&
      data?.postText
    ) {
      const orderUrl = `${window.location.origin}/store/${storeConfig.slug}/product/${selectedProduct.id}`;
      data = {
        ...data,
        postText: `${data.postText}\n\n🛍 Onlayn buyurtma: ${orderUrl}`,
      };
    }
    setEnrichData(data);
    setFlow("results");
  }

  function handleGenerateError(msg: string) {
    setGenerateError(msg);
    setFlow("results"); // Show results even on error with fallback text
  }

  async function handleApprove() {
    if (selectedChannelIds.length === 0) {
      setShowPreview(false);
      setPublishError("Post qilishdan oldin kamida bitta Telegram kanal tanlang.");
      return;
    }
    setShowPreview(false);
    setPublishError("");

    // Guarantee an order link at the bottom of the actual published
    // message — not just when a product happened to be pre-selected and
    // active at generation time. Covers every path into Create Post:
    //  - "Skip" / typed manually → no product exists yet, create one now
    //    (with whatever images were picked) so it's orderable.
    //  - picked a Draft from Inventory → publishing it publicly means it
    //    should also go live on the storefront, so promote it to Active.
    //  - already an Active product → link was already added after
    //    generation; this just avoids adding it twice.
    try {
      let product = selectedProduct;
      const productImageUrls = (selectedImages || []).map((img: any) => img.url);

      if (!product?.id) {
        product = await createProduct.mutateAsync({
          data: {
            name: form.name,
            category: form.category,
            sellPrice: form.price,
            currency: form.currency as any,
            description: form.notes || "",
            images: productImageUrls,
            status: "active",
          },
        });
        setSelectedProduct(product);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      } else if (product.status !== "active") {
        product = await updateProduct.mutateAsync({
          id: product.id,
          data: { status: "active" },
        });
        setSelectedProduct(product);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      }

      if (product?.id && storeConfig?.slug && enrichData?.postText) {
        const orderUrl = `${window.location.origin}/store/${storeConfig.slug}/product/${product.id}`;
        if (!enrichData.postText.includes(orderUrl)) {
          setEnrichData({
            ...enrichData,
            postText: `${enrichData.postText}\n\n🛍 Onlayn buyurtma: ${orderUrl}`,
          });
        }
      }
    } catch (err: any) {
      setPublishError(
        err?.data?.error ||
          err?.message ||
          "Mahsulotni saqlab bo'lmadi. Qayta urinib ko'ring.",
      );
      return;
    }

    setFlow("publishing");
  }

  function handlePublishDone() {
    setFlow("success");
  }

  function handlePublishError(message: string) {
    setPublishError(message);
    setFlow("results");
  }

  // YouTube flow handlers
  function handleYtApprove() {
    if (!selectedProduct?.id) {
      setPublishError("YouTube'ga publish qilish uchun inventory'dan mahsulot tanlang.");
      return;
    }
    setPublishError("");
    setFlow("yt-metadata");
  }

  function handleYtMetadataDone(data: any) {
    setYtMetadata(data);
    setFlow("yt-review");
  }

  function handleYtMetadataError(msg: string) {
    setPublishError(msg);
    setFlow("results");
  }

  function handleYtPublish(accountId: number, metadata: any) {
    setYtAccountId(accountId);
    setYtMetadata(metadata);
    setFlow("yt-publishing");
  }

  function handleYtDone(url: string) {
    setYtVideoUrl(url);
    setFlow("yt-success");
  }

  function handleYtPublishError(msg: string) {
    setPublishError(msg);
    setFlow("yt-review");
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

        {navView === "orders" && <OrdersPage />}

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
                product={selectedProduct}
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
                onYtApprove={selectedProduct?.id ? handleYtApprove : undefined}
              />
            )}
            {flow === "publishing" && (
              <Publishing
                user={user}
                channelIds={selectedChannelIds}
                form={form}
                enrichData={enrichData}
                selectedImages={selectedImages}
                productId={selectedProduct?.id}
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
            {flow === "yt-metadata" && (
              <YtMetadataGenerating
                product={selectedProduct}
                form={form}
                onDone={handleYtMetadataDone}
                onError={handleYtMetadataError}
              />
            )}
            {flow === "yt-review" && (
              <YtMetadataReview
                product={selectedProduct}
                ytMetadata={ytMetadata}
                uploadError={publishError}
                onConfirm={handleYtPublish}
                onBack={() => {
                  setPublishError("");
                  setFlow("results");
                }}
              />
            )}
            {flow === "yt-publishing" && (
              <YtPublishing
                product={selectedProduct}
                accountId={ytAccountId}
                ytMetadata={ytMetadata}
                selectedImages={selectedImages}
                onDone={handleYtDone}
                onError={handleYtPublishError}
              />
            )}
            {flow === "yt-success" && (
              <YtSuccessScreen
                videoUrl={ytVideoUrl}
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

        {navView === "connectors" && <ConnectorsPage />}
        {navView === "shopfront" && <ShopFrontPage />}
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
      const res = await fetch(apiUrl(`/api/store/${encodeURIComponent(slug)}`));
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
          // "Pro card" — restructured after Uzum.uz's actual product-card
          // anatomy (image → price, bold and dominant → title, 2 lines →
          // status badges), adapted to our own dark violet/blue glass
          // brand instead of copying Uzum's white theme. Two deliberate
          // departures from the old card: (1) price moves OUT of a small
          // pill overlaid on the image and into its own full-width,
          // bold line below the image — on Uzum the price is the single
          // most prominent line on the whole card, bigger than the
          // title, not a corner badge; (2) the per-card category label
          // and description snippet are dropped — Uzum's grid cards never
          // repeat the category (the filter pills above already carry
          // that) and never show body copy, only image + price + title
          // + status badges, which keeps the grid scannable at a glance.
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p: any) => {
              const isNew =
                p.createdAt &&
                Date.now() - new Date(p.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;
              return (
                <Glass
                  key={p.id}
                  onClick={() => setLocation(`/store/${slug}/product/${p.id}`)}
                  className="!rounded-2xl overflow-hidden group hover:border-violet-400/30 transition cursor-pointer"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-white/5">
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

                    {/* Status badges — top-left, stacked like Uzum's
                        ORIGINAL / Yangilik corner badges. */}
                    {isNew && (
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold font-mono uppercase tracking-wide bg-emerald-500 text-white shadow-lg shadow-emerald-900/30">
                        <Sparkles className="h-2.5 w-2.5" /> Yangi
                      </span>
                    )}

                    {/* Image count — top-right, unchanged position. */}
                    {p.images?.length > 1 && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium font-mono bg-black/50 backdrop-blur-sm text-white">
                        <ImageIcon className="h-3 w-3" /> {p.images.length}
                      </span>
                    )}

                    {/* Bottom scrim so a busy photo never fights the
                        content block right below it — a subtle,
                        professional finishing touch Uzum's own cards
                        use via a soft image-to-white gradient; ours
                        fades to the same slate the content area sits
                        on instead of white, to stay on-brand. */}
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950/40 to-transparent pointer-events-none" />
                  </div>

                  <div className="p-3.5">
                    {p.sellPrice && (
                      <p className="flex items-baseline gap-1 text-[15px] font-bold text-white">
                        {p.sellPrice}
                        <span className="text-xs font-semibold text-slate-400">
                          {p.currency || "UZS"}
                        </span>
                      </p>
                    )}
                    <p className="text-sm text-slate-300 leading-snug line-clamp-2 mt-1">
                      {p.name}
                    </p>
                  </div>
                </Glass>
              );
            })}
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
  const carouselRef = useRef<HTMLDivElement>(null);

  function handleCarouselScroll() {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function scrollCarouselTo(i: number) {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActiveIndex(i);
  }
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [orderResult, setOrderResult] = useState<{ orderNumber: string; totalAmount: string; currency: string } | null>(null);
  const [orderName, setOrderName] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [orderComment, setOrderComment] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["storefront", slug],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/store/${encodeURIComponent(slug)}`));
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

  async function submitOrder() {
    if (!product) return;
    if (!orderName.trim() || !orderPhone.trim() || !orderAddress.trim()) {
      setOrderError("Ism, telefon raqam va manzilni to'ldiring.");
      return;
    }
    setPlacing(true);
    setOrderError("");
    try {
      const res = await fetch(apiUrl(`/api/store/${encodeURIComponent(slug)}/orders`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: product.id, quantity }],
          customerName: orderName.trim(),
          customerPhone: orderPhone.trim(),
          customerAddress: orderAddress.trim(),
          customerComment: orderComment.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Buyurtma yuborilmadi.");
      setOrderResult(body);
    } catch (err: any) {
      setOrderError(err?.message || "Buyurtma yuborilmadi.");
    } finally {
      setPlacing(false);
    }
  }

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
    <div className="min-h-screen bg-slate-950 relative pb-24">
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
        <div className="relative">
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {images.length > 0 ? (
              images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setActiveIndex(i);
                    setLightboxOpen(true);
                  }}
                  className="shrink-0 w-full snap-center aspect-[3/4] bg-white/5 cursor-zoom-in"
                  aria-label="Rasmni to'liq ekranda ochish"
                >
                  <img
                    src={src}
                    alt={`${product.name} ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))
            ) : (
              <div className="shrink-0 w-full snap-center aspect-[3/4] bg-white/5 flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-slate-600" />
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeIndex ? "w-4 bg-white" : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex items-center gap-2 px-4 pt-4 overflow-x-auto">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => scrollCarouselTo(i)}
                className={`shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition ${
                  i === activeIndex
                    ? "border-violet-400"
                    : "border-white/10 opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={src}
                  alt={`${product.name} thumb ${i + 1}`}
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

      {/* Fixed checkout bar — same pattern Uzum/Ozon/Wildberries product
          pages use: price stays visible, one primary action always in
          reach at the bottom of the screen. */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-slate-950/90 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <button
            onClick={() => setCheckoutOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3.5 rounded-xl font-semibold"
          >
            <ShoppingCart className="h-4 w-4" /> Buyurtma berish
          </button>
        </div>
      </div>

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
            {orderResult ? (
              <div className="text-center py-4">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <p className="text-white font-semibold text-lg mb-1">Buyurtma qabul qilindi!</p>
                <p className="text-slate-400 text-sm mb-4">
                  Buyurtma raqami: <span className="font-mono text-white">{orderResult.orderNumber}</span>
                </p>
                <p className="text-slate-400 text-sm mb-6">
                  Jami: <span className="text-white font-semibold">{orderResult.totalAmount} {orderResult.currency}</span>
                </p>
                <button
                  onClick={() => {
                    setCheckoutOpen(false);
                    setOrderResult(null);
                    setOrderName("");
                    setOrderPhone("");
                    setOrderAddress("");
                    setOrderComment("");
                    setQuantity(1);
                  }}
                  className="w-full bg-white/5 border border-white/10 text-white py-3 rounded-xl font-medium"
                >
                  Yopish
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <p className="text-white font-semibold text-lg">Buyurtma berish</p>
                  <button
                    onClick={() => setCheckoutOpen(false)}
                    className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-5 p-3 bg-white/5 rounded-xl">
                  {images[0] && (
                    <img src={images[0]} alt={product.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{product.name}</p>
                    <p className="text-xs text-slate-400">{product.sellPrice} {product.currency || "UZS"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="h-7 w-7 rounded-full bg-white/10 text-white flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="text-white text-sm w-5 text-center">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                      className="h-7 w-7 rounded-full bg-white/10 text-white flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    value={orderName}
                    onChange={(e) => setOrderName(e.target.value)}
                    placeholder="Ism familiya"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400"
                  />
                  <input
                    value={orderPhone}
                    onChange={(e) => setOrderPhone(e.target.value)}
                    placeholder="Telefon raqam"
                    type="tel"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400"
                  />
                  <textarea
                    value={orderAddress}
                    onChange={(e) => setOrderAddress(e.target.value)}
                    placeholder="Yetkazib berish manzili"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 resize-none"
                  />
                  <textarea
                    value={orderComment}
                    onChange={(e) => setOrderComment(e.target.value)}
                    placeholder="Izoh (ixtiyoriy)"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 resize-none"
                  />
                </div>

                {orderError && (
                  <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 mt-3">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {orderError}
                  </div>
                )}

                <button
                  onClick={submitOrder}
                  disabled={placing}
                  className="w-full mt-5 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 disabled:opacity-40 text-white py-3.5 rounded-xl font-semibold"
                >
                  {placing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Buyurtmani tasdiqlash
                </button>
              </>
            )}
          </div>
        </div>
      )}
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
