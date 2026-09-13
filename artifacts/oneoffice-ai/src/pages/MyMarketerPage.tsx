import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  ChevronRight,
  Lightbulb,
  Megaphone,
  MessageSquareText,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

type MarketerSection =
  | "overview"
  | "content"
  | "trends"
  | "campaigns"
  | "analytics"
  | "assistant";

const sections: Array<{
  id: MarketerSection;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  { id: "overview", label: "Overview", description: "Marketing holatini bir joyda ko'ring", icon: Sparkles },
  { id: "content", label: "Content Plan", description: "Kontentni oldindan rejalashtiring", icon: CalendarDays },
  { id: "trends", label: "Trends", description: "Bozordagi yangi imkoniyatlarni toping", icon: TrendingUp },
  { id: "campaigns", label: "Campaigns", description: "Kampaniyalarni boshqaring", icon: Megaphone },
  { id: "analytics", label: "Analytics", description: "Natijalarni va o'sishni kuzating", icon: BarChart3 },
  { id: "assistant", label: "AI Marketer", description: "Marketing bo'yicha AI bilan ishlang", icon: Bot },
];

const cards = [
  {
    title: "Content Plan",
    description: "Telegram, Instagram, Facebook, VK va YouTube uchun kontent rejasini AI bilan tuzing.",
    icon: CalendarDays,
    accent: "from-violet-500 to-indigo-500",
    section: "content" as MarketerSection,
  },
  {
    title: "Trends",
    description: "Sizning biznesingizga mos trendlar, mavzular va yangi marketing imkoniyatlarini toping.",
    icon: TrendingUp,
    accent: "from-cyan-500 to-blue-500",
    section: "trends" as MarketerSection,
  },
  {
    title: "Audience Insights",
    description: "Mijozlar nimani xohlashini, qaysi kontent ishlayotganini va qayerda o'sish borligini tushuning.",
    icon: Users,
    accent: "from-fuchsia-500 to-violet-500",
    section: "analytics" as MarketerSection,
  },
  {
    title: "Campaigns",
    description: "Mahsulot, aksiya va mavsumiy kampaniyalarni yagona workspace'da boshqaring.",
    icon: Target,
    accent: "from-amber-500 to-orange-500",
    section: "campaigns" as MarketerSection,
  },
  {
    title: "Marketing Analytics",
    description: "Ko'rishlar, engagement, conversion va boshqa muhim ko'rsatkichlarni bir joyda kuzating.",
    icon: BarChart3,
    accent: "from-emerald-500 to-teal-500",
    section: "analytics" as MarketerSection,
  },
  {
    title: "AI Marketer",
    description: "Biznesingiz holatini hisobga olib, keyingi marketing qadamini AI bilan aniqlang.",
    icon: Bot,
    accent: "from-blue-500 to-violet-500",
    section: "assistant" as MarketerSection,
  },
];

function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

export default function MyMarketerPage() {
  const [active, setActive] = useState<MarketerSection>("overview");
  const [query, setQuery] = useState("");

  const activeSection = sections.find((item) => item.id === active) || sections[0];
  const visibleCards = useMemo(
    () =>
      cards.filter((card) =>
        `${card.title} ${card.description}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  return (
    <div className="relative h-full min-h-0 overflow-y-auto overflow-x-hidden p-6 md:p-10">
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="pointer-events-none absolute top-72 -left-40 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300">
              <Sparkles className="h-3.5 w-3.5" /> AI Marketing Workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">My Marketer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
              Biznesingiz uchun marketingni rejalashtirish, trendlarni topish va natijalarni yaxshilash uchun shaxsiy AI workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActive("assistant")}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-violet-900/20 transition hover:brightness-110"
          >
            <Bot className="h-4 w-4" />
            Ask AI Marketer
          </button>
        </div>

        <Glass className="p-2">
          <div className="flex gap-1 overflow-x-auto">
            {sections.map((item) => {
              const Icon = item.icon;
              const selected = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm transition ${
                    selected
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${selected ? "text-violet-300" : ""}`} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </Glass>

        <Glass className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between md:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 text-violet-300">
                <activeSection.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">{activeSection.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{activeSection.description}</p>
              </div>
            </div>

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Marketing tool qidirish..."
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/50"
              />
            </div>
          </div>

          {active === "overview" ? (
            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6 lg:grid-cols-3">
              {visibleCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => setActive(card.section)}
                    className="group text-left"
                  >
                    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-violet-400/30 hover:bg-white/[0.05]">
                      <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent} bg-opacity-20 text-white shadow-lg`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-sm font-semibold text-white">{card.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{card.description}</p>
                      <div className="mt-5 flex items-center gap-1 text-xs font-medium text-violet-300 opacity-80 transition group-hover:opacity-100">
                        Open workspace <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-5 md:p-6">
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center md:p-12">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-blue-500/15 text-violet-300">
                  <activeSection.icon className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-white">{activeSection.label}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Bu workspace uchun keyingi bosqichdagi AI marketing funksiyalari shu yerda ishlaydi. Hozircha OneOffice marketing markazi tayyor.
                </p>
                <button
                  type="button"
                  onClick={() => setActive("assistant")}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  <MessageSquareText className="h-4 w-4" />
                  AI Marketer bilan boshlash
                </button>
              </div>
            </div>
          )}
        </Glass>

        <div className="grid gap-4 md:grid-cols-3">
          <Glass className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Zap className="h-3.5 w-3.5 text-amber-400" /> Next best action</div>
            <p className="mt-3 text-sm font-medium text-white">Bugungi marketing ishlarini AI bilan aniqlang</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">OneOffice sizning mahsulotlaringiz va kanallaringizdan foydalanib tavsiya beradi.</p>
          </Glass>
          <Glass className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Lightbulb className="h-3.5 w-3.5 text-cyan-400" /> Marketing insight</div>
            <p className="mt-3 text-sm font-medium text-white">Trend + mahsulot + auditoriya</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Keyingi versiyada AI shu uchta signalni birlashtirib kontent g'oyalarini chiqaradi.</p>
          </Glass>
          <Glass className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><MessageSquareText className="h-3.5 w-3.5 text-violet-400" /> AI Marketer</div>
            <p className="mt-3 text-sm font-medium text-white">Savol bering, reja oling</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Marketing bo'yicha kundalik muammolarni AI bilan bosqichma-bosqich hal qilish uchun.</p>
          </Glass>
        </div>
      </div>
    </div>
  );
}
