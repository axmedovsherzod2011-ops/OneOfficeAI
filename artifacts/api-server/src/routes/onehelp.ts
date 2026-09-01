import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, oneHelpMessagesTable, oneHelpTasksTable, productsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
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
// in one JSON response (generateText's JSON mode). Two kinds of action:
//   - CLIENT actions (navigate, highlight, open_new_product_form,
//     request_confirmation) are visual effects — the frontend plays them
//     back step by step.
//   - SERVER actions (schedule_task, run_task_now) are real backend writes
//     — these execute HERE, synchronously/fire-and-forget, before the
//     response is even sent. No confirmation gate by default (explicit
//     instruction: "vaqtni tejash" is the whole point).
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

const HIGHLIGHT_TARGETS = [
  "product-name-input",
  "product-price-input",
  "product-save-button",
  "post-pick-product",
  "post-generate-button",
  "button-approve",
] as const;

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
      time: string; // "HH:mm" for daily; ISO datetime for once
      productName?: string;
    }
  | { type: "run_task_now"; actionType: (typeof TASK_ACTION_TYPES)[number]; productName?: string };

type AgentAction = ClientAction | ServerAction;

interface AgentStep {
  say: string;
  action?: AgentAction;
}

function nowInTashkent(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().replace("Z", " (Toshkent)");
}

// Kept intentionally compact — a bloated prompt plus conversation history
// was blowing past Groq's per-request size limit (413 errors observed in
// production), which meant every single turn silently fell through to a
// slower fallback provider. Every sentence here earns its place.
function buildSystemPrompt(productNames: string[]): string {
  const productList = productNames.length
    ? `Faol mahsulotlar: ${productNames.slice(0, 25).join(", ")}.`
    : "Hozircha faol mahsulot yo'q.";

  return `Siz OneHelp — OneOffice AI saytining pastki burchagidagi yordamchi chatisiz.

Vaqt: ${nowInTashkent()}. "bugun/ertaga/hozir" shu vaqtga nisbatan.

Sayt: mahsulot yaratish, Telegram kanaliga post yozish/joylashtirish, PRO Vitrina (onlayn do'kon), buyurtmalar, statistika. ${productList}

QOIDA: foydalanuvchi nima desa — ANIQ o'shani, ruxsat so'ramasdan, darhol bajaring. Agar maqsadi o'rganish bo'lsa — sekin, ko'rsatib bajaring. Agar ishni sizga topshirsa — fon rejimida bajarib, natijani xabar qiling.

AMALLAR (action maydoniga aynan shu JSON obyektlardan birini qo'ying, aks holda null):
{"type":"navigate","view":"dashboard|inventory|create|connectors|shopfront|orders|settings|profile"}
{"type":"highlight","target":"product-name-input|product-price-input|product-save-button|post-pick-product|post-generate-button|button-approve"}
{"type":"open_new_product_form"}
{"type":"run_task_now","actionType":"publish_random_product_post","productName":"(ixtiyoriy — aniq mahsulot nomi, bo'lmasa tasodifiy)"}
{"type":"schedule_task","description":"qisqa tavsif","actionType":"publish_random_product_post","kind":"daily|once","time":"HH:mm (daily) yoki ISO sana (once)","productName":"(ixtiyoriy)"}
{"type":"request_confirmation","question":"..."} — FAQAT juda noaniq/xavfli holatda, aks holda ishlatmang.

CHEKLOV: faqat shu qiymatlardan foydalaning, o'ylab topmang. Forma maydonlarini o'zingiz to'ldira olmaysiz — so'rashsa aytib qo'ying. Faqat "publish_random_product_post" haqiqiy amal.

JAVOB — FAQAT shu JSON, boshqa hech narsa yo'q:
{"steps":[{"say":"qisqa, jonli, samimiy o'zbekcha gap (markdown/ro'yxat/kod ISHLATMANG)","action":null yoki yuqoridagilardan biri}]}`;
}

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

// The model is asked for JSON but still needs defending against:
// missing/malformed fields, invented action types/targets, or (rarely)
// not-quite-valid JSON. Never trust it blindly — always fall back to a
// plain-text single step so the person still gets SOME answer.
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

async function executeServerActionsAndStrip(userId: number, steps: AgentStep[]): Promise<AgentStep[]> {
  const result: AgentStep[] = [];
  for (const step of steps) {
    if (step.action?.type === "schedule_task") {
      const a = step.action;
      try {
        const nextRunAt = a.kind === "once" ? new Date(a.time) : computeNextDailyRunForNewTask(a.time);
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
      const { actionType, productName } = step.action;
      // Fire-and-forget — the chat reply shouldn't wait on a full
      // research+publish round trip. Progress + outcome get logged as new
      // OneHelp messages as they happen (see ai/autoPost.ts's report()),
      // which the frontend picks up via polling while the chat is open.
      void (async () => {
        try {
          if (actionType === "publish_random_product_post") {
            await runPublishRandomProductPost(userId, productName);
          }
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

  // Recent history for context, kept deliberately small (last 8 turns,
  // each truncated) — folded into the user prompt as text since
  // generateText() is single-turn across every provider it wraps. An
  // unbounded history (previously up to 20 full-length messages) was the
  // main contributor to Groq's 413 "payload too large" errors seen in
  // production, which silently pushed every request onto a slower
  // fallback provider.
  const recent = await db
    .select({ role: oneHelpMessagesTable.role, content: oneHelpMessagesTable.content })
    .from(oneHelpMessagesTable)
    .where(eq(oneHelpMessagesTable.userId, userId))
    .orderBy(desc(oneHelpMessagesTable.createdAt))
    .limit(8);
  const history = recent
    .reverse()
    .map((m) => {
      const truncated = m.content.length > 200 ? m.content.slice(0, 200) + "…" : m.content;
      return `${m.role === "user" ? "U" : "AI"}: ${truncated}`;
    })
    .join("\n");

  const activeProducts = await db
    .select({ name: productsTable.name })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), eq(productsTable.status, "active")))
    .limit(25);

  let steps: AgentStep[];
  try {
    const raw = await generateText(
      buildSystemPrompt(activeProducts.map((p) => p.name)),
      `Suhbat:\n${history}\n\nJavob (JSON):`,
    );
    steps = parseAgentPlan(raw);
  } catch (err) {
    console.error("[onehelp] generateText failed", err);
    steps = [{ say: "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring." }];
  }

  steps = await executeServerActionsAndStrip(userId, steps);

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
