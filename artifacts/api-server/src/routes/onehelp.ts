import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, oneHelpMessagesTable, oneHelpTasksTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateText } from "../ai/textProviders";
import { runPublishRandomProductPost } from "../ai/autoPost";

const router = Router();

async function getCurrentUserId(req: Parameters<typeof getAuth>[0]) {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) return null;

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);

  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// OneHelp can now narrate AND drive the site — through a small, explicit,
// validated action set. It plans the WHOLE sequence of {say, action} steps
// in one JSON response (generateText's JSON mode — the correct use case for
// it here). Two kinds of action:
//   - CLIENT actions (navigate, highlight, open_new_product_form,
//     request_confirmation) are visual effects with no server-observable
//     result — the frontend plays them back step by step, narration then
//     the real effect.
//   - SERVER actions (schedule_task, run_task_now) are real backend writes
//     (a DB row, an actual Telegram publish) with nothing for a browser to
//     "play back" — these execute HERE, synchronously/fire-and-forget,
//     the moment the plan is generated, before the response is even sent.
//     Per explicit instruction, none of this asks for confirmation first —
//     "vaqtni tejash" is the whole point, so request_confirmation exists in
//     the vocabulary but the prompt no longer tells the model to use it by
//     default the way an earlier version did.
// ---------------------------------------------------------------------------

const NAVIGATE_VIEWS = [
  "dashboard",
  "inventory",
  "create",
  "connectors",
  "shopfront",
  "orders",
  "settings",
  "profile",
] as const;

// Mirrors the data-tour attributes already on real elements (see
// TourOverlay/PRODUCT_TOUR_STEPS etc.) — reusing the exact same onboarding
// spotlight mechanism instead of building a second one.
const HIGHLIGHT_TARGETS = [
  "product-name-input",
  "product-price-input",
  "product-save-button",
  "post-pick-product",
  "post-generate-button",
  "button-approve",
] as const;

// The whole security boundary of what a background task can ever do — see
// schema/oneHelpTasks.ts's own comment on this same list.
const TASK_ACTION_TYPES = ["publish_random_product_post"] as const;

type ClientAction =
  | { type: "navigate"; view: (typeof NAVIGATE_VIEWS)[number] }
  | { type: "highlight"; target: (typeof HIGHLIGHT_TARGETS)[number] }
  | { type: "open_new_product_form" }
  | { type: "request_confirmation"; question: string };

type ServerAction =
  | {
      type: "schedule_task";
      description: string;
      actionType: (typeof TASK_ACTION_TYPES)[number];
      kind: "once" | "daily";
      // "HH:mm" for kind="daily"; an ISO datetime string for kind="once".
      time: string;
    }
  | { type: "run_task_now"; actionType: (typeof TASK_ACTION_TYPES)[number] };

type AgentAction = ClientAction | ServerAction;

interface AgentStep {
  say: string;
  action?: AgentAction;
}

function nowInTashkent(): string {
  // Asia/Tashkent is UTC+5 year-round (no DST) — used both here (so the
  // model knows "today"/"hozir" without guessing the server's own TZ) and
  // in taskScheduler.ts's daily-time math.
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().replace("Z", " (Toshkent vaqti)");
}

const SYSTEM_PROMPT = `Siz OneHelp — OneOffice AI platformasining o'zi ichiga o'rnatilgan yordamchisisiz, saytning pastki burchagidagi chatda ishlaysiz.

Hozirgi sana va vaqt: ${nowInTashkent()}. Foydalanuvchi "bugun", "ertaga", "hozir" kabi so'zlarni ishlatsa, shu vaqtga nisbatan hisoblang.

OneOffice AI — kichik sotuvchilar uchun boshqaruv tizimi: mahsulot yaratish, AI yordamida Telegram kanaliga post yozish va joylashtirish, "PRO Vitrina" (ommaviy onlayn do'kon), buyurtmalarni boshqarish, statistika, va Telegram integratsiyasi.

SIZDA SAYTNI BOSHQARISH VA FON VAZIFALARINI BAJARISH IMKONIYATI BOR. Foydalanuvchi nima desa, ANIQ o'shani qiling — ruxsat so'ramasdan, ikkilanmasdan bajaring. Foydalanuvchi maqsadi ikki xil bo'lishi mumkin: (1) saytni tushunish/o'rganish — bunda nima qilayotganingizni ko'rsatib, sekin-asta bajaring; (2) ishni sizga topshirib, o'zi band bo'lish — bunda vazifani fon rejimida (background) bajaring va faqat natijani xabar qiling. Foydalanuvchining gapidan qaysi holat ekanini tushunib oling.

MAVJUD AMALLAR:
- navigate: {"type":"navigate","view":"..."} — saytning bo'limiga o'tish. view: "dashboard", "inventory", "create", "connectors", "shopfront", "orders", "settings", "profile" — shulardan biri.
- highlight: {"type":"highlight","target":"..."} — ekrandagi elementni yoritish. target: "product-name-input", "product-price-input", "product-save-button", "post-pick-product", "post-generate-button", "button-approve" — shulardan biri.
- open_new_product_form: {"type":"open_new_product_form"} — yangi mahsulot formasini ochish.
- run_task_now: {"type":"run_task_now","actionType":"publish_random_product_post"} — HOZIR bitta tasodifiy faol mahsulot haqida post tayyorlab, ulangan Telegram kanalga DARHOL joylashtirish (fon rejimida, natija keyin chatda xabar qilinadi).
- schedule_task: {"type":"schedule_task","description":"qisqa tavsif","actionType":"publish_random_product_post","kind":"daily" yoki "once","time":"HH:mm" (daily uchun, Toshkent vaqti) yoki to'liq ISO sana-vaqt (once uchun)} — takrorlanuvchi yoki bir martalik vazifani REJALASHTIRISH. Masalan "har kuni soat 20:00 da post qo'y" -> kind:"daily", time:"20:00". Vazifa fon rejimida, hatto foydalanuvchi saytda bo'lmasa ham, aynan belgilangan vaqtda ishga tushadi.
- request_confirmation: {"type":"request_confirmation","question":"..."} — juda kam hollarda, faqat foydalanuvchi ANIQ so'ramagan, lekin oqibati katta bo'lgan noaniq vaziyatda ishlating. Oddiy so'rovlar uchun ISHLATMANG — to'g'ridan-to'g'ri bajaring.

MUHIM CHEKLOVLAR:
- Faqat yuqoridagi ro'yxatlardagi qiymatlardan foydalaning — boshqasini o'ylab topmang.
- Hozircha forma maydonlarini o'zingiz to'ldira olmaysiz (bu keyingi versiyada qo'shiladi) — buni so'rashsa, ochiq tan oling.
- Faqat "publish_random_product_post" haqiqiy avtomatlashtirilgan amal — boshqa amal turlarini o'ylab topmang, agar so'ralsa buni hali qila olmasligingizni ayting.
- Agar foydalanuvchi shunchaki savol bersa (amal talab qilinmasa), faqat bitta "say" qadami bilan javob bering, action qo'ymang.

JAVOB FORMATI (JUDA MUHIM): faqat quyidagi JSON obyektini qaytaring, boshqa hech narsa yozmang:
{"steps": [{"say": "gap matni", "action": null yoki yuqoridagi amallardan biri}, ...]}

"say" matni — xuddi tirik odam yozgandek, oddiy, iliq, samimiy o'zbek tilida, QISQA (1-2 jumla har bir qadamda). "say" ichida QATʼIYAN ishlatmang: markdown belgilari (** # -), raqamlangan ro'yxat, kod bloklari — faqat sof gap.`;

function isClientAction(action: Record<string, unknown>): action is ClientAction {
  if (action.type === "navigate") return NAVIGATE_VIEWS.includes(action.view as never);
  if (action.type === "highlight") return HIGHLIGHT_TARGETS.includes(action.target as never);
  if (action.type === "open_new_product_form") return true;
  if (action.type === "request_confirmation")
    return typeof action.question === "string" && action.question.trim().length > 0;
  return false;
}

function isServerAction(action: Record<string, unknown>): action is ServerAction {
  if (action.type === "run_task_now") {
    return TASK_ACTION_TYPES.includes(action.actionType as never);
  }
  if (action.type === "schedule_task") {
    if (!TASK_ACTION_TYPES.includes(action.actionType as never)) return false;
    if (typeof action.description !== "string" || !action.description.trim()) return false;
    if (action.kind === "daily") return typeof action.time === "string" && /^\d{1,2}:\d{2}$/.test(action.time);
    if (action.kind === "once") return typeof action.time === "string" && !Number.isNaN(Date.parse(action.time));
    return false;
  }
  return false;
}

// The model is asked for JSON but, same lesson as the earlier plain-chat
// bug, still needs defending against: missing/malformed fields, invented
// action types/targets, or (rarely) not-quite-valid JSON. Never trust it
// blindly — always fall back to a plain-text single step so the person
// still gets SOME answer instead of a broken chat turn.
function parseAgentPlan(raw: string): AgentStep[] {
  try {
    const parsed = JSON.parse(raw.trim());
    const steps = Array.isArray(parsed?.steps) ? parsed.steps : null;
    if (!steps || steps.length === 0) throw new Error("no steps");
    const cleaned: AgentStep[] = steps
      .map((s: unknown): AgentStep | null => {
        if (!s || typeof s !== "object") return null;
        const say = String((s as Record<string, unknown>).say ?? "").trim();
        if (!say) return null;
        const rawAction = (s as Record<string, unknown>).action;
        if (!rawAction || typeof rawAction !== "object") return { say };
        const a = rawAction as Record<string, unknown>;
        if (isClientAction(a) || isServerAction(a)) return { say, action: a as AgentAction };
        return { say };
      })
      .filter((s: AgentStep | null): s is AgentStep => s !== null);
    if (cleaned.length === 0) throw new Error("no valid steps after cleaning");
    return cleaned;
  } catch {
    return [{ say: "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring." }];
  }
}

// Executes any SERVER actions in the plan right now (before responding),
// and strips them out of what's sent to the frontend — there's nothing for
// a browser to play back for these, only the "say" narration stands alone.
async function executeServerActionsAndStrip(userId: number, steps: AgentStep[]): Promise<AgentStep[]> {
  const result: AgentStep[] = [];
  for (const step of steps) {
    if (step.action?.type === "schedule_task") {
      const a = step.action;
      try {
        const nextRunAt =
          a.kind === "once" ? new Date(a.time) : computeNextDailyRunForNewTask(a.time);
        await db.insert(oneHelpTasksTable).values({
          userId,
          description: a.description,
          actionType: a.actionType,
          kind: a.kind,
          timeOfDay: a.kind === "daily" ? a.time : null,
          nextRunAt,
        });
      } catch (err) {
        console.error("[onehelp] schedule_task failed", err);
      }
      result.push({ say: step.say });
      continue;
    }
    if (step.action?.type === "run_task_now") {
      const actionType = step.action.actionType;
      // Fire-and-forget — the chat reply shouldn't wait on a full
      // research+publish round trip. The outcome gets logged as a new
      // OneHelp message once it's done (same as a scheduled task), so the
      // person sees it whether they're still watching or not.
      void (async () => {
        try {
          const outcome =
            actionType === "publish_random_product_post"
              ? await runPublishRandomProductPost(userId)
              : { ok: false as const, error: "Noma'lum amal turi." };
          const message = outcome.ok
            ? `"${outcome.productName}" mahsuloti "${outcome.channelTitle}" kanaliga muvaffaqiyatli joylandi.`
            : `Postni joylashda muammo chiqdi: ${outcome.error}`;
          await db.insert(oneHelpMessagesTable).values({ userId, role: "assistant", content: message });
        } catch (err) {
          console.error("[onehelp] run_task_now failed", err);
        }
      })();
      result.push({ say: step.say });
      continue;
    }
    result.push(step);
  }
  return result;
}

function computeNextDailyRunForNewTask(timeOfDay: string): Date {
  const [hh, mm] = timeOfDay.split(":").map(Number);
  const now = new Date();
  const utcHour = hh - 5; // Asia/Tashkent, UTC+5, no DST
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, mm, 0, 0),
  );
  if (candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

router.get("/onehelp/messages", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const rows = await db
    .select({
      id: oneHelpMessagesTable.id,
      role: oneHelpMessagesTable.role,
      content: oneHelpMessagesTable.content,
      createdAt: oneHelpMessagesTable.createdAt,
    })
    .from(oneHelpMessagesTable)
    .where(eq(oneHelpMessagesTable.userId, userId))
    .orderBy(desc(oneHelpMessagesTable.createdAt))
    .limit(100);

  res.json(rows.reverse().map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/onehelp/chat", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const message = String((req.body as { message?: string })?.message ?? "").trim();
  if (!message) {
    res.status(400).json({ error: "Xabar bo'sh bo'lishi mumkin emas." });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Xabar juda uzun." });
    return;
  }

  await db.insert(oneHelpMessagesTable).values({ userId, role: "user", content: message });

  // Recent history for context — folded into the user prompt as text
  // since generateText() is single-turn (system + one user string, no
  // messages array) across every provider it wraps.
  const recent = await db
    .select({ role: oneHelpMessagesTable.role, content: oneHelpMessagesTable.content })
    .from(oneHelpMessagesTable)
    .where(eq(oneHelpMessagesTable.userId, userId))
    .orderBy(desc(oneHelpMessagesTable.createdAt))
    .limit(20);
  const history = recent
    .reverse()
    .map((m) => `${m.role === "user" ? "Foydalanuvchi" : "OneHelp"}: ${m.content}`)
    .join("\n");

  let steps: AgentStep[];
  try {
    const raw = await generateText(SYSTEM_PROMPT, `Suhbat tarixi:\n${history}\n\nOneHelp javobi (faqat JSON):`);
    steps = parseAgentPlan(raw);
  } catch (err) {
    console.error("[onehelp] generateText failed", err);
    steps = [{ say: "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring." }];
  }

  steps = await executeServerActionsAndStrip(userId, steps);

  // Stored history is plain text (the concatenation of every "say") — the
  // client actions themselves aren't replayed on a later reload, only
  // shown live the moment they're generated. That's an intentional scope
  // cut for this phase, not an oversight: replaying past actions on
  // reload risks re-navigating someone away from whatever they're doing.
  const contentForHistory = steps.map((s) => s.say).join("\n\n");

  const [saved] = await db
    .insert(oneHelpMessagesTable)
    .values({ userId, role: "assistant", content: contentForHistory })
    .returning();

  res.json({
    id: saved.id,
    role: "assistant",
    content: contentForHistory,
    createdAt: saved.createdAt.toISOString(),
    steps,
  });
});

export default router;
