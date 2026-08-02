import { useState, useEffect, useRef } from "react";
import {
  Sparkles, Home, PlusCircle, History, Settings, User, Bell, Check, X,
  ChevronRight, Image as ImageIcon, Zap, TrendingUp, Search, Moon, Sun,
  Globe, LogOut, ArrowRight, Play, Loader2, ShieldCheck, Send, Eye,
  ThumbsUp, ThumbsDown, Package, DollarSign, Tag, FileText, CheckCircle2,
  Wand2, Camera, PenTool, BarChart3, Clock, Rocket, ChevronDown, Menu,
  Bot, Copy, ExternalLink, KeyRound, AlertCircle, ArrowLeft, Hash, ClipboardCheck
} from "lucide-react";

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

const CATEGORIES = ["Electronics", "Fashion", "Home & Living", "Beauty", "Sports", "Toys"];

const IMAGE_STYLES = [
  { key: "minimal", name: "Minimal", from: "from-slate-100", to: "to-slate-300", text: "text-slate-800", accent: "bg-slate-800" },
  { key: "luxury", name: "Luxury", from: "from-amber-200", to: "to-yellow-500", text: "text-amber-950", accent: "bg-amber-950" },
  { key: "dark", name: "Dark Theme", from: "from-slate-900", to: "to-indigo-950", text: "text-white", accent: "bg-violet-500" },
];

const seedHistory = [
  { id: 1, name: "AeroSound Pro Earbuds", price: "349,000", category: "Electronics", status: "Published", date: "Jul 14" },
  { id: 2, name: "Velour Oversized Hoodie", price: "219,000", category: "Fashion", status: "Published", date: "Jul 12" },
  { id: 3, name: "Nimbus Ceramic Vase Set", price: "128,000", category: "Home & Living", status: "Pending", date: "Jul 11" },
  { id: 4, name: "GlowLux Serum 30ml", price: "97,000", category: "Beauty", status: "Rejected", date: "Jul 9" },
  { id: 5, name: "TrailBlaze Running Shoes", price: "412,000", category: "Sports", status: "Published", date: "Jul 6" },
];

const NOTIFICATIONS = [
  { id: 1, text: "AI finished generating \"AeroSound Pro Earbuds\" post", time: "2m ago" },
  { id: 2, text: "Product images are ready for review", time: "18m ago" },
  { id: 3, text: "Description writing completed", time: "1h ago" },
  { id: 4, text: "\"Velour Oversized Hoodie\" was published", time: "3h ago" },
];

// ---------------------------------------------------------------------------
// BACKEND API
// ---------------------------------------------------------------------------
// The frontend never talks to the Telegram Bot API directly. It only ever
// calls our own backend, which does the real verification and publishing.

// Configure this to point at your deployed backend (e.g. during your build
// step, or by editing it here directly before deploying). Using a plain
// constant instead of import.meta/process.env keeps this file runnable in
// any environment (including sandboxed artifact previews), since those
// special globals only exist inside a real ES module / bundler build.
const API_BASE_URL = "/api";

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response, fall through to generic error below
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// ONBOARDING PERSISTENCE
// ---------------------------------------------------------------------------
// Signup progress is saved locally so an interrupted signup resumes exactly
// where the user left off next time they open the site.

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

function saveOnboarding(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable — signup still works, it just won't resume
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
// SMALL HELPERS
// ---------------------------------------------------------------------------

function GradientBlob({ className }) {
  return <div className={`absolute rounded-full blur-3xl opacity-40 pointer-events-none ${className}`} />;
}

function Glass({ children, className = "" }) {
  return (
    <div className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl shadow-black/30 ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <Glass className="p-6 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center ${accent}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <span className="text-xs text-emerald-400 font-medium">{sub}</span>
      </div>
      <p className="text-3xl font-semibold text-white tracking-tight">{value}</p>
      <p className="text-sm text-slate-400 mt-1">{label}</p>
    </Glass>
  );
}

function StatusPill({ status }) {
  const map = {
    Published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Rejected: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LANDING PAGE
// ---------------------------------------------------------------------------

function Landing({ onStart }) {
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
          <span className="text-white font-semibold text-lg tracking-tight">OneOffice AI</span>
        </div>
        <button onClick={onStart} className="text-sm text-slate-300 hover:text-white transition px-4 py-2 rounded-full border border-white/10 hover:border-white/20">
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
            onClick={onStart}
            className="group flex items-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-7 py-3.5 rounded-full font-medium shadow-lg shadow-violet-900/40 hover:shadow-violet-700/40 transition"
          >
            Start Now
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition" />
          </button>
          <button className="flex items-center gap-2 text-slate-300 hover:text-white px-7 py-3.5 rounded-full border border-white/10 hover:border-white/20 transition">
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
        OneOffice AI — MVP preview. All AI output shown is simulated for demonstration.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIGN UP — multi-step Telegram onboarding wizard
// ---------------------------------------------------------------------------

const SIGNUP_STEPS = [
  { key: "info", label: "Your details" },
  { key: "channel", label: "Create channel" },
  { key: "bot", label: "Create bot" },
  { key: "connect", label: "Connect" },
];

function StepRail({ step }) {
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
            <span className={`text-[10px] whitespace-nowrap ${i <= step ? "text-slate-300" : "text-slate-600"}`}>
              {s.label}
            </span>
          </div>
          {i < SIGNUP_STEPS.length - 1 && (
            <div className={`h-px flex-1 mx-2 mb-4 ${i < step ? "bg-violet-500" : "bg-white/10"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function InstructionList({ items }) {
  return (
    <ol className="space-y-3 mb-5">
      {items.map((text, i) => (
        <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
          <span className="h-5 w-5 rounded-full bg-white/5 border border-white/10 text-[11px] text-violet-300 flex items-center justify-center shrink-0 mt-0.5 font-medium">
            {i + 1}
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (navigator?.clipboard) navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="w-full flex items-center justify-between bg-black/30 border border-white/10 rounded-xl px-4 py-3 mb-5 font-mono text-sm text-slate-200 hover:border-white/20 transition"
    >
      {value}
      {copied ? <ClipboardCheck className="h-4 w-4 text-emerald-400 shrink-0" /> : <Copy className="h-4 w-4 text-slate-500 shrink-0" />}
    </button>
  );
}

function SignUp({ onDone }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ first: "", last: "", tgUsername: "", company: "", channelUsername: "", botToken: "" });
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const restored = useRef(false);

  // Resume any in-progress signup saved from a previous visit.
  useEffect(() => {
    const saved = loadOnboarding();
    if (saved) {
      setStep(saved.step || 0);
      setF((prev) => ({ ...prev, ...saved.data }));
    }
    restored.current = true;
  }, []);

  // Persist progress after every change so an exit mid-flow can resume later.
  useEffect(() => {
    if (!restored.current) return;
    saveOnboarding({ step, data: f });
  }, [step, f]);

  const set = (k) => (e) => { setError(""); setF({ ...f, [k]: e.target.value }); };

  const canNext = [
    f.first && f.last && f.tgUsername && f.company,
    !!f.channelUsername,
    true,
    true,
  ][step];

  function goNext() {
    if (!canNext) { setError("Please fill in every field to continue."); return; }
    setError("");
    setStep((s) => Math.min(s + 1, SIGNUP_STEPS.length - 1));
  }
  function goBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleConnect() {
    if (!f.botToken.trim()) { setError("Paste your bot token to finish connecting."); return; }
    setError("");
    setConnecting(true);
    try {
      // Real verification happens server-side: the backend checks the bot
      // token via Telegram's getMe, resolves the channel via getChat, and
      // confirms the bot is an admin via getChatMember — no mocks here.
      const connected = await apiPost("/connect", {
        firstName: f.first,
        lastName: f.last,
        telegramUsername: f.tgUsername,
        company: f.company,
        channelUsername: f.channelUsername,
        botToken: f.botToken,
      });
      clearOnboarding();
      // `connected.id` is the backend's user id — publishing later sends
      // only this id, never the bot token, back to the server.
      onDone({ ...f, id: connected.id, channelId: connected.channelId, botUsername: connected.botUsername });
    } catch (err) {
      setError(err.message || "Something went wrong while connecting. Please try again.");
    } finally {
      setConnecting(false);
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

        {/* STEP 0 — Your details */}
        {step === 0 && (
          <div>
            <h2 className="text-2xl font-semibold text-white mb-1">Create your account</h2>
            <p className="text-sm text-slate-400 mb-6">Tell us a bit about you and your business.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={f.first} onChange={set("first")} placeholder="First name"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
                <input value={f.last} onChange={set("last")} placeholder="Last name"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">@</span>
                <input value={f.tgUsername} onChange={set("tgUsername")} placeholder="Telegram username"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
              </div>
              <input value={f.company} onChange={set("company")} placeholder="Business name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
            </div>
          </div>
        )}

        {/* STEP 1 — Create channel */}
        {step === 1 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><Send className="h-4 w-4 text-blue-400" /></div>
              <h2 className="text-xl font-semibold text-white">Create your Telegram channel</h2>
            </div>
            <p className="text-sm text-slate-400 mb-5 ml-12">This is where your AI-generated posts will be published.</p>
            <InstructionList
              items={[
                <>In Telegram, tap the compose icon and choose <b className="text-white">New Channel</b>.</>,
                <>Name it after your business — e.g. <span className="text-slate-100">"{f.company || "Your Business"} Store"</span>.</>,
                <>In channel settings, set it to <b className="text-white">Public</b> and pick a channel username.</>,
                <>Enter that username below so OneOffice AI knows where to post.</>,
              ]}
            />
            <div className="relative mb-2">
              <Hash className="h-4 w-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input value={f.channelUsername} onChange={set("channelUsername")} placeholder="yourchannelname"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
            </div>
          </div>
        )}

        {/* STEP 2 — Create bot */}
        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-violet-400" /></div>
              <h2 className="text-xl font-semibold text-white">Create your posting bot</h2>
            </div>
            <p className="text-sm text-slate-400 mb-5 ml-12">Telegram bots publish on your behalf — BotFather creates one in seconds.</p>
            <InstructionList
              items={[
                <>Open <b className="text-white">@BotFather</b> in Telegram.</>,
                <>Send the command below to start creating a bot.</>,
                <>Choose a display name, then a username ending in <span className="text-slate-100">"bot"</span> (e.g. {(f.company || "yourstore").replace(/\s/g, "").toLowerCase()}_bot).</>,
                <>BotFather replies with an API token — keep that chat open, you'll need it in the next step.</>,
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

        {/* STEP 3 — Connect */}
        {step === 3 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><KeyRound className="h-4 w-4 text-emerald-400" /></div>
              <h2 className="text-xl font-semibold text-white">Add your bot as a poster</h2>
            </div>
            <p className="text-sm text-slate-400 mb-5 ml-12">Give the bot permission to post in your channel, then connect it here.</p>
            <InstructionList
              items={[
                <>Open your channel → <b className="text-white">Settings → Administrators → Add Admin</b>.</>,
                <>Search for your bot's username and select it.</>,
                <>Enable <b className="text-white">Post Messages</b> permission and save.</>,
                <>Paste the API token BotFather gave you below.</>,
              ]}
            />
            <input
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
              onClick={goBack}
              disabled={connecting}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white px-4 py-3.5 rounded-xl border border-white/10 hover:border-white/20 transition text-sm font-medium disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {step < SIGNUP_STEPS.length - 1 ? (
            <button
              onClick={goNext}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-violet-900/30 hover:shadow-violet-700/30 transition"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 disabled:opacity-60 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-emerald-900/30 transition"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying bot token...
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
          Steps saved automatically — close anytime and pick up right where you left off.
        </p>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// APP SHELL (Sidebar + Topbar)
// ---------------------------------------------------------------------------

function Sidebar({ user, active, setActive, mobileOpen, setMobileOpen }) {
  const displayName = user ? `${user.first} ${user.last}`.trim() : "Aziz Karimov";
  const initial = (user?.first?.[0] || "A").toUpperCase();
  const subLabel = user?.channelUsername ? `@${user.channelUsername}` : "Pro plan";
  const items = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "create", label: "Create Post", icon: PlusCircle },
    { key: "history", label: "History", icon: History },
    { key: "settings", label: "Settings", icon: Settings },
    { key: "profile", label: "Profile", icon: User },
  ];
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`fixed md:static z-40 top-0 left-0 h-full w-64 bg-slate-900/95 md:bg-white/5 backdrop-blur-xl border-r border-white/10 flex flex-col py-6 px-4 transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
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
                onClick={() => { setActive(it.key); setMobileOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  isActive ? "bg-gradient-to-r from-violet-500/20 to-blue-500/20 text-white border border-violet-400/30" : "text-slate-400 hover:text-white hover:bg-white/5"
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
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">{initial}</div>
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{displayName}</p>
              <p className="text-xs text-slate-500 truncate">{subLabel}</p>
            </div>
          </div>
          <button className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-rose-400 px-2 py-1 transition">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ title, onMenu, notifOpen, setNotifOpen }) {
  return (
    <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-white/10">
      <div className="flex items-center gap-3">
        <button className="md:hidden text-slate-300" onClick={onMenu}>
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold text-white tracking-tight">{title}</h1>
      </div>
      <div className="relative">
        <button onClick={() => setNotifOpen(!notifOpen)} className="relative h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:border-white/20 transition">
          <Bell className="h-4 w-4 text-slate-300" />
          <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>
        {notifOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-2 z-20">
            <p className="text-xs text-slate-500 px-3 py-2">Notifications</p>
            {NOTIFICATIONS.map((n) => (
              <div key={n.id} className="px-3 py-2.5 rounded-xl hover:bg-white/5 transition">
                <p className="text-sm text-slate-200">{n.text}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.time}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------

function Dashboard({ goCreate }) {
  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="flex flex-col md:flex-row gap-4">
        <StatCard icon={FileText} label="Generated Posts" value="128" sub="+12 this week" accent="bg-violet-600" />
        <StatCard icon={Clock} label="Pending" value="4" sub="awaiting review" accent="bg-amber-600" />
        <StatCard icon={Rocket} label="Published" value="109" sub="+8 this week" accent="bg-blue-600" />
        <StatCard icon={ShieldCheck} label="AI Accuracy" value="98.7%" sub="+0.4%" accent="bg-emerald-600" />
      </div>

      <Glass className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-white text-xl font-semibold mb-2">Ready to publish something new?</h3>
          <p className="text-slate-400 text-sm max-w-md">Enter a product name and price — OneOffice AI handles research, imagery, copy, and design.</p>
        </div>
        <button onClick={goCreate} className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-6 py-3 rounded-full font-medium shadow-lg shadow-violet-900/30 whitespace-nowrap">
          <PlusCircle className="h-4 w-4" /> Create Post
        </button>
      </Glass>

      <Glass className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Recent activity</h3>
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="divide-y divide-white/5">
          {seedHistory.map((h) => (
            <div key={h.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-white">{h.name}</p>
                <p className="text-xs text-slate-500">{h.category} · {h.date}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-300">{h.price} UZS</span>
                <StatusPill status={h.status} />
              </div>
            </div>
          ))}
        </div>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CREATE POST FLOW
// ---------------------------------------------------------------------------

function CreateForm({ form, setForm, onGenerate }) {
  const valid = form.name.trim() && form.price.trim();
  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <Glass className="p-8">
        <h3 className="text-white text-xl font-semibold mb-1">Create a new post</h3>
        <p className="text-slate-400 text-sm mb-6">Tell us what you're selling — AI will do the rest.</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5"><Package className="h-3 w-3" /> Product Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. AeroSound Pro Earbuds"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Price (UZS)</label>
            <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="e.g. 349,000"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5"><Tag className="h-3 w-3" /> Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-violet-400 transition">
              {CATEGORIES.map((c) => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5"><FileText className="h-3 w-3" /> Optional Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any details the AI should highlight..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition resize-none" />
          </div>
        </div>

        <button
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

function Generating({ onDone }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const total = PIPELINE_STEPS.length;

  useEffect(() => {
    const stepDuration = 1300;
    const timer = setInterval(() => {
      setStep((s) => {
        const next = s + 1;
        if (next >= total) {
          clearInterval(timer);
          setTimeout(onDone, 500);
          return s;
        }
        return next;
      });
    }, stepDuration);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setProgress(Math.min(100, Math.round(((step + 1) / total) * 100)));
  }, [step]);

  return (
    <div className="p-6 md:p-10 max-w-xl">
      <Glass className="p-8 text-center">
        <div className="relative h-20 w-20 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 opacity-30 animate-ping" />
          <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        </div>
        <h3 className="text-white text-lg font-semibold mb-1">AI is working its magic</h3>
        <p className="text-slate-400 text-sm mb-6">This usually takes about 10–15 seconds.</p>

        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mb-6">
          <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>

        <div className="space-y-2 text-left">
          {PIPELINE_STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.label} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition ${active ? "bg-white/5" : ""}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500" : active ? "bg-violet-500" : "bg-white/10"}`}>
                  {done ? <Check className="h-3.5 w-3.5 text-white" /> : <Icon className={`h-3 w-3 ${active ? "text-white animate-pulse" : "text-slate-500"}`} />}
                </div>
                <span className={`text-sm ${done ? "text-slate-500 line-through" : active ? "text-white" : "text-slate-600"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </Glass>
    </div>
  );
}

function ImageMock({ style, price }) {
  return (
    <div className={`aspect-square rounded-2xl bg-gradient-to-br ${style.from} ${style.to} flex flex-col items-center justify-center relative overflow-hidden`}>
      <div className={`h-16 w-16 rounded-2xl ${style.accent} flex items-center justify-center shadow-lg`}>
        <Package className="h-8 w-8 text-white" />
      </div>
      <span className={`absolute bottom-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-black/20 ${style.text}`}>
        {price} UZS
      </span>
      <span className={`absolute top-3 left-3 text-xs font-medium ${style.text} opacity-70`}>{style.name}</span>
    </div>
  );
}

function Results({ form, error, onPreview, onApprove, onReject }) {
  const [selected, setSelected] = useState("dark");
  const style = IMAGE_STYLES.find((s) => s.key === selected);

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4" /> Generation complete
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <Glass className="p-6">
        <h3 className="text-white font-semibold mb-4">Choose an image style</h3>
        <div className="grid grid-cols-3 gap-4">
          {IMAGE_STYLES.map((s) => (
            <button key={s.key} onClick={() => setSelected(s.key)} className={`rounded-2xl transition ring-2 ${selected === s.key ? "ring-violet-400" : "ring-transparent"}`}>
              <ImageMock style={s} price={form.price || "0"} />
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="p-6">
        <h3 className="text-white font-semibold mb-4">Generated post</h3>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <h4 className="text-white text-lg font-semibold">✨ {form.name || "Premium Product"} — Now Available!</h4>
          <p className="text-slate-300 text-sm leading-relaxed">
            Discover the {form.name || "product"} — thoughtfully designed for everyday performance and built to impress.
            Crafted with premium materials and backed by outstanding reviews, it's the upgrade your routine deserves.
          </p>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>✔ Premium build quality</li>
            <li>✔ Fast, reliable performance</li>
            <li>✔ Limited stock available</li>
          </ul>
          <p className="text-white font-semibold text-lg">💰 {form.price || "0"} UZS</p>
          <p className="text-violet-300 text-sm font-medium">👉 Order now — DM to reserve yours!</p>
          <p className="text-blue-400 text-xs">#{(form.category || "New").replace(/\s/g, "")} #OneOfficeAI #PremiumQuality #{selected}</p>
        </div>
      </Glass>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => onPreview(style)} className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-5 py-3 rounded-xl text-sm font-medium hover:border-white/20 transition">
          <Eye className="h-4 w-4" /> Preview
        </button>
        <button onClick={() => onApprove(style)} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg shadow-emerald-900/30">
          <ThumbsUp className="h-4 w-4" /> Approve
        </button>
        <button onClick={onReject} className="flex items-center gap-2 bg-white/5 border border-rose-500/30 text-rose-400 px-5 py-3 rounded-xl text-sm font-medium hover:bg-rose-500/10 transition">
          <ThumbsDown className="h-4 w-4" /> Reject
        </button>
      </div>
    </div>
  );
}

function TelegramPreviewModal({ form, style, onClose, onApprove }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-white text-sm font-medium">Telegram Preview</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="bg-[#0e1621] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 bg-[#17212b]">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">O</div>
            <div>
              <p className="text-white text-sm font-medium">OneOffice Store</p>
              <p className="text-slate-400 text-xs">channel · 24.1k subscribers</p>
            </div>
          </div>
          <div className="p-3">
            <div className={`rounded-xl bg-gradient-to-br ${style.from} ${style.to} aspect-square flex items-center justify-center relative mb-2`}>
              <div className={`h-14 w-14 rounded-2xl ${style.accent} flex items-center justify-center`}>
                <Package className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="bg-[#182533] rounded-xl p-3">
              <p className="text-white text-sm font-semibold mb-1">✨ {form.name || "Premium Product"} — Now Available!</p>
              <p className="text-slate-300 text-xs leading-relaxed mb-2">
                Discover the {form.name || "product"} — premium quality, fast performance, limited stock.
              </p>
              <p className="text-white text-sm font-semibold mb-1">💰 {form.price || "0"} UZS</p>
              <p className="text-violet-300 text-xs mb-2">👉 Order now — DM to reserve yours!</p>
              <p className="text-blue-400 text-xs">#{(form.category || "New").replace(/\s/g, "")} #OneOfficeAI</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                <span className="text-slate-500 text-xs">18:42</span>
                <span className="text-slate-500 text-xs">✓✓ 1.2k views</span>
              </div>
            </div>
            <button className="w-full mt-2 bg-[#2b5278] text-white text-sm py-2.5 rounded-lg font-medium">🛒 Buy Now</button>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 bg-white/5 border border-white/10 text-white py-3 rounded-xl text-sm font-medium">Close</button>
          <button onClick={onApprove} className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 rounded-xl text-sm font-medium">Approve &amp; Publish</button>
        </div>
      </div>
    </div>
  );
}

function Publishing({ user, form, onDone, onError }) {
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        // Real call to our backend — it decrypts the stored bot token
        // server-side and calls Telegram's sendMessage/sendPhoto itself.
        // The frontend only ever sends userId, never the bot token.
        await apiPost("/publish", {
          userId: user?.id,
          text: `${form.name} — ${form.price}`.trim(),
          ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
        });
        if (!cancelled) onDone();
      } catch (err) {
        if (!cancelled) onError?.(err.message || "Failed to publish to Telegram.");
      }
    }
    run();
    return () => { cancelled = true; };
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
        <h3 className="text-white font-semibold text-lg">Publishing to Telegram...</h3>
        <p className="text-slate-400 text-sm mt-1">Please wait a moment.</p>
      </Glass>
    </div>
  );
}

function SuccessScreen({ form, onDone }) {
  return (
    <div className="p-6 md:p-10 max-w-md">
      <Glass className="p-10 text-center">
        <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
          <Check className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-white font-semibold text-xl">Post Published Successfully</h3>
        <p className="text-slate-400 text-sm mt-2">"{form.name}" is now live on your Telegram channel.</p>
        <button onClick={onDone} className="mt-7 w-full bg-gradient-to-r from-violet-500 to-blue-500 text-white py-3 rounded-xl text-sm font-medium">
          Back to Dashboard
        </button>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------

function HistoryPage({ items }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const filtered = items.filter((h) =>
    (filter === "All" || h.status === filter) && h.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400 transition" />
        </div>
        <div className="flex gap-2">
          {["All", "Published", "Pending", "Rejected"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-medium border transition ${filter === f ? "bg-violet-500/20 border-violet-400/40 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((h) => (
          <Glass key={h.id} className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-violet-300" />
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{h.name}</p>
                <p className="text-slate-500 text-xs mt-0.5">{h.category} · {h.date}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="text-sm text-slate-300">{h.price} UZS</span>
              <StatusPill status={h.status} />
            </div>
          </Glass>
        ))}
        {filtered.length === 0 && (
          <p className="text-slate-500 text-sm col-span-2 text-center py-10">No posts match your search.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} className={`h-6 w-11 rounded-full transition relative shrink-0 ${checked ? "bg-violet-500" : "bg-white/10"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

function SettingsPage() {
  const [s, setS] = useState({ autoPublish: false, skipPreview: false, darkMode: true, notifications: true });
  const rows = [
    { key: "autoPublish", icon: Rocket, label: "Auto Publish", desc: "Publish posts automatically once generated" },
    { key: "skipPreview", icon: Eye, label: "Publish without Preview", desc: "Skip the Telegram preview step before publishing" },
    { key: "darkMode", icon: Moon, label: "Dark Mode", desc: "Use a dark interface theme" },
    { key: "notifications", icon: Bell, label: "Notifications", desc: "Get notified about generation and publishing" },
  ];
  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-4">
      <Glass className="p-6 divide-y divide-white/5">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center"><Icon className="h-4 w-4 text-slate-300" /></div>
                <div>
                  <p className="text-white text-sm font-medium">{r.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{r.desc}</p>
                </div>
              </div>
              <Toggle checked={s[r.key]} onChange={(v) => setS({ ...s, [r.key]: v })} />
            </div>
          );
        })}
      </Glass>
      <Glass className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center"><Globe className="h-4 w-4 text-slate-300" /></div>
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

function ProfilePage({ user }) {
  const displayName = user ? `${user.first} ${user.last}`.trim() : "Aziz Karimov";
  const initial = (user?.first?.[0] || "A").toUpperCase();
  const subLabel = user ? `@${user.tgUsername} · ${user.company}` : "aziz@onestore.uz · OneStore LLC";

  return (
    <div className="p-6 md:p-10 max-w-2xl space-y-6">
      <Glass className="p-8 flex items-center gap-5">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-2xl font-semibold">{initial}</div>
        <div>
          <h3 className="text-white text-xl font-semibold">{displayName}</h3>
          <p className="text-slate-400 text-sm">{subLabel}</p>
        </div>
      </Glass>
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={FileText} label="Total Posts" value="128" sub="" accent="bg-violet-600" />
        <StatCard icon={Rocket} label="Published" value="109" sub="" accent="bg-blue-600" />
        <StatCard icon={ShieldCheck} label="Accuracy" value="98.7%" sub="" accent="bg-emerald-600" />
      </div>
      {user?.channelUsername && (
        <Glass className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center"><Send className="h-4 w-4 text-blue-400" /></div>
            <div>
              <p className="text-white text-sm font-medium">Connected channel</p>
              <p className="text-slate-500 text-xs mt-0.5">@{user.channelUsername}</p>
            </div>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">Connected</span>
        </Glass>
      )}
      <Glass className="p-6 flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-medium">Subscription</p>
          <p className="text-slate-500 text-xs mt-0.5">Pro plan · renews Aug 19, 2026</p>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 font-medium">Active</span>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROOT APP
// ---------------------------------------------------------------------------

export default function OneOfficeAI() {
  // If a signup was left mid-flow, reopen straight into it instead of the landing page.
  const [screen, setScreen] = useState(() => (loadOnboarding() ? "signup" : "landing")); // landing | signup | app
  const [navView, setNavView] = useState("dashboard"); // dashboard|create|history|settings|profile
  const [flow, setFlow] = useState("form"); // form|generating|results|publishing|success
  const [form, setForm] = useState({ name: "", price: "", category: "Electronics", notes: "" });
  const [history, setHistory] = useState(seedHistory);
  const [previewStyle, setPreviewStyle] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [publishError, setPublishError] = useState("");

  const titles = { dashboard: "Dashboard", create: "Create Post", history: "History", settings: "Settings", profile: "Profile" };

  function resetCreate() {
    setFlow("form");
    setForm({ name: "", price: "", category: "Electronics", notes: "" });
    setPublishError("");
  }

  function handleApprove() {
    setPreviewStyle(null);
    setPublishError("");
    setFlow("publishing");
  }

  function handlePublishDone() {
    setHistory([{ id: Date.now(), name: form.name, price: form.price, category: form.category, status: "Published", date: "Today" }, ...history]);
    setFlow("success");
  }

  function handlePublishError(message) {
    setPublishError(message);
    // Back to results so the user can retry (e.g. bot was removed as admin) or edit the post.
    setFlow("results");
  }

  if (screen === "landing") return <Landing onStart={() => setScreen("signup")} />;
  if (screen === "signup") return <SignUp onDone={(data) => { setUser(data); setScreen("app"); }} />;

  return (
    <div className="min-h-screen bg-slate-950 flex" onClick={() => notifOpen && setNotifOpen(false)}>
      <Sidebar user={user} active={navView} setActive={(v) => { setNavView(v); if (v === "create") resetCreate(); }} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div className="flex-1 min-w-0">
        <Topbar title={titles[navView]} onMenu={() => setMobileOpen(true)} notifOpen={notifOpen} setNotifOpen={setNotifOpen} />

        {navView === "dashboard" && <Dashboard goCreate={() => { setNavView("create"); resetCreate(); }} />}

        {navView === "create" && (
          <>
            {flow === "form" && <CreateForm form={form} setForm={setForm} onGenerate={() => setFlow("generating")} />}
            {flow === "generating" && <Generating onDone={() => setFlow("results")} />}
            {flow === "results" && (
              <Results
                form={form}
                error={publishError}
                onPreview={(style) => setPreviewStyle(style)}
                onApprove={handleApprove}
                onReject={resetCreate}
              />
            )}
            {flow === "publishing" && (
              <Publishing user={user} form={form} onDone={handlePublishDone} onError={handlePublishError} />
            )}
            {flow === "success" && <SuccessScreen form={form} onDone={() => { setNavView("dashboard"); resetCreate(); }} />}
          </>
        )}

        {navView === "history" && <HistoryPage items={history} />}
        {navView === "settings" && <SettingsPage />}
        {navView === "profile" && <ProfilePage user={user} />}
      </div>

      {previewStyle && (
        <TelegramPreviewModal
          form={form}
          style={previewStyle}
          onClose={() => setPreviewStyle(null)}
          onApprove={handleApprove}
        />
      )}
    </div>
  );
}
