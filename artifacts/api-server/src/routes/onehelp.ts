import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, oneHelpMessagesTable, oneHelpTasksTable } from "@workspace/db/schema";
import { eq, desc, lt, and, inArray } from "drizzle-orm";
import { generateOneHelpText } from "../ai/textProviders";
import { runPublishRandomProductPost } from "../ai/autoPost";
import { buildBusinessSnapshot } from "../ai/businessContext";
import { createProductViaOneHelp, updateProductViaOneHelp, deleteProductViaOneHelp } from "../ai/productActions";

const router = Router();
const ONEHELP_AI_TIMEOUT_MS = 180_000;
const MAX_VISIBLE_HISTORY = 20;
const MEMORY_PREFIX = "__ONEHELP_MEMORY__\n";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OneHelp AI timeout after ${ms}ms`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function getCurrentUserId(req: Parameters<typeof getAuth>[0]) {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) return null;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
  return user?.id ?? null;
}

const NAVIGATE_VIEWS = ["dashboard", "inventory", "create", "connectors", "shopfront", "orders", "settings", "profile"] as const;
const HIGHLIGHT_TARGETS = ["product-name-input", "product-price-input", "product-save-button", "post-pick-product", "post-generate-button", "button-approve"] as const;

type ClientAction =
  | { type: "navigate"; view: (typeof NAVIGATE_VIEWS)[number] }
  | { type: "highlight"; target: (typeof HIGHLIGHT_TARGETS)[number] }
  | { type: "open_new_product_form" }
  | { type: "request_confirmation"; question: string };

type ServerAction =
  | { type: "schedule_task"; description: string; actionType: "publish_random_product_post"; kind: "once" | "daily"; time: string; productName?: string; channelName?: string }
  | { type: "run_task_now"; actionType: "publish_random_product_post"; productName?: string; channelName?: string }
  | { type: "create_product"; name: string; category?: string; sellPrice?: string; costPrice?: string; description?: string; active?: boolean }
  | { type: "update_product"; productName: string; sellPrice?: string; costPrice?: string; description?: string; category?: string; active?: boolean }
  | { type: "delete_product"; productName: string };

type AgentAction = ClientAction | ServerAction;
interface AgentStep { say: string; action?: AgentAction; }

function nowInTashkent(): string { return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().replace("Z", " (Toshkent)"); }

function buildSystemPrompt(snapshot: string, memory: string): string {
  return `Siz OneHelp — OneOffice AI saytining pastki burchagidagi yordamchi chatisiz.

Vaqt: ${nowInTashkent()}. "bugun/ertaga/hozir" shu vaqtga nisbatan.

Uzoq muddatli suhbat xotirasi (oldingi chatlardan siqilgan mazmun):
${memory || "Hozircha oldingi suhbat xotirasi yo'q."}

Sizning haqiqiy ma'lumotlaringiz (savollarga shu asosda ANIQ javob bering):
${snapshot}

QOIDA: foydalanuvchi nima desa — ANIQ o'shani, ruxsat so'ramasdan, darhol bajaring. Maqsadi o'rganish bo'lsa — sekin, ko'rsatib bajaring. Ishni topshirsa — fon rejimida bajarib, natijani xabar qiling. Savol berilsa (masalan "nechta buyurtmam bor", "eng qimmat mahsulot qaysi") — yuqoridagi ma'lumotdan to'g'ridan-to'g'ri javob bering, action qo'ymang.

AMALLAR (action maydoniga aynan shu JSON obyektlardan birini qo'ying, aks holda null):
{"type":"navigate","view":"dashboard|inventory|create|connectors|shopfront|orders|settings|profile"}
{"type":"highlight","target":"product-name-input|product-price-input|product-save-button|post-pick-product|post-generate-button|button-approve"}
{"type":"open_new_product_form"}
{"type":"run_task_now","actionType":"publish_random_product_post","productName":"(ixtiyoriy, aniq mahsulot)","channelName":"(ixtiyoriy, aniq kanal)"}
{"type":"schedule_task","description":"qisqa tavsif","actionType":"publish_random_product_post","kind":"daily|once","time":"HH:mm yoki ISO sana","productName":"(ixtiyoriy)","channelName":"(ixtiyoriy)"}
{"type":"create_product","name":"...","category":"(ixtiyoriy)","sellPrice":"(ixtiyoriy)","costPrice":"(ixtiyoriy)","description":"(ixtiyoriy)","active":true/false}
{"type":"update_product","productName":"mavjud mahsulot nomi","sellPrice":"(ixtiyoriy)","costPrice":"(ixtiyoriy)","description":"(ixtiyoriy)","category":"(ixtiyoriy)","active":true/false}
{"type":"delete_product","productName":"mavjud mahsulot nomi"}
{"type":"request_confirmation","question":"..."} — FAQAT delete_product oldidan yoki juda noaniq holatda ishlating.

CHEKLOV: faqat shu qiymatlardan foydalaning, o'ylab topmang. productName/channelName — yuqoridagi ro'yxatdagi haqiqiy nomlarga eng yaqinini tanlang.

JAVOB — FAQAT shu JSON, boshqa hech narsa yo'q:
{"steps":[{"say":"qisqa, jonli, samimiy o'zbekcha gap (markdown/ro'yxat/kod ISHLATMANG)","action":null yoki yuqoridagilardan biri}]}`;
}

function isClientAction(action: Record<string, unknown>): action is ClientAction {
  if (action.type === "navigate") return NAVIGATE_VIEWS.includes(action.view as never);
  if (action.type === "highlight") return HIGHLIGHT_TARGETS.includes(action.target as never);
  if (action.type === "open_new_product_form") return true;
  if (action.type === "request_confirmation") return typeof action.question === "string" && action.question.trim().length > 0;
  return false;
}

function isServerAction(action: Record<string, unknown>): action is ServerAction {
  if (action.type === "run_task_now") return action.actionType === "publish_random_product_post";
  if (action.type === "schedule_task") {
    if (action.actionType !== "publish_random_product_post") return false;
    if (typeof action.description !== "string" || !action.description.trim()) return false;
    if (action.kind === "daily") return typeof action.time === "string" && /^\d{1,2}:\d{2}$/.test(action.time);
    if (action.kind === "once") return typeof action.time === "string" && !Number.isNaN(Date.parse(action.time));
    return false;
  }
  if (action.type === "create_product") return typeof action.name === "string" && action.name.trim().length > 0;
  if (action.type === "update_product") return typeof action.productName === "string" && action.productName.trim().length > 0;
  if (action.type === "delete_product") return typeof action.productName === "string" && action.productName.trim().length > 0;
  return false;
}

function parseAgentPlan(raw: string): AgentStep[] {
  try {
    const parsed = JSON.parse(raw.trim());
    const steps = Array.isArray(parsed?.steps) ? parsed.steps : null;
    if (!steps || steps.length === 0) throw new Error("no steps");
    const cleaned: AgentStep[] = steps.map((s: unknown): AgentStep | null => {
      if (!s || typeof s !== "object") return null;
      const say = String((s as Record<string, unknown>).say ?? "").trim();
      if (!say) return null;
      const rawAction = (s as Record<string, unknown>).action;
      if (!rawAction || typeof rawAction !== "object") return { say };
      const a = rawAction as Record<string, unknown>;
      if (isClientAction(a) || isServerAction(a)) return { say, action: a as AgentAction };
      return { say };
    }).filter((s: AgentStep | null): s is AgentStep => s !== null);
    if (cleaned.length === 0) throw new Error("no valid steps after cleaning");
    return cleaned;
  } catch { return [{ say: "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring." }]; }
}

function computeNextDailyRunForNewTask(timeOfDay: string): Date {
  const [hh, mm] = timeOfDay.split(":").map(Number);
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh - 5, mm, 0, 0));
  if (candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

async function executeServerActionsAndStrip(userId: number, steps: AgentStep[]): Promise<AgentStep[]> {
  const result: AgentStep[] = [];
  for (const step of steps) {
    const action = step.action;
    if (!action) { result.push(step); continue; }
    if (action.type === "schedule_task") {
      try {
        const nextRunAt = action.kind === "once" ? new Date(action.time) : computeNextDailyRunForNewTask(action.time);
        await db.insert(oneHelpTasksTable).values({ userId, description: action.description, actionType: action.actionType, kind: action.kind, timeOfDay: action.kind === "daily" ? action.time : null, nextRunAt });
      } catch (err) { console.error("[onehelp] schedule_task failed", err); }
      result.push({ say: step.say }); continue;
    }
    if (action.type === "run_task_now") {
      const { productName, channelName } = action;
      void (async () => { try { await runPublishRandomProductPost(userId, productName, channelName); } catch (err) { console.error("[onehelp] run_task_now failed", err); } })();
      result.push({ say: step.say }); continue;
    }
    if (action.type === "create_product") {
      const r = await createProductViaOneHelp(userId, action);
      result.push({ say: r.ok ? step.say : `${step.say} (${r.error})` }); continue;
    }
    if (action.type === "update_product") {
      const { productName, ...changes } = action;
      const r = await updateProductViaOneHelp(userId, productName, changes);
      result.push({ say: r.ok ? step.say : `${step.say} (${r.error})` }); continue;
    }
    if (action.type === "delete_product") {
      const r = await deleteProductViaOneHelp(userId, action.productName);
      result.push({ say: r.ok ? step.say : `${step.say} (${r.error})` }); continue;
    }
    result.push(step);
  }
  return result;
}

async function getOneHelpMemory(userId: number): Promise<string> {
  const rows = await db.select({ content: oneHelpMessagesTable.content })
    .from(oneHelpMessagesTable).where(eq(oneHelpMessagesTable.userId, userId)).orderBy(desc(oneHelpMessagesTable.id)).limit(100);
  const memoryRow = rows.find((r) => r.content.startsWith(MEMORY_PREFIX));
  return memoryRow ? memoryRow.content.slice(MEMORY_PREFIX.length).trim() : "";
}

async function compactOneHelpHistory(userId: number): Promise<void> {
  const rows = await db.select({ id: oneHelpMessagesTable.id, role: oneHelpMessagesTable.role, content: oneHelpMessagesTable.content })
    .from(oneHelpMessagesTable).where(eq(oneHelpMessagesTable.userId, userId)).orderBy(desc(oneHelpMessagesTable.id)).limit(MAX_VISIBLE_HISTORY + 2);

  const realRows = rows.filter((r) => !r.content.startsWith(MEMORY_PREFIX));
  if (realRows.length <= MAX_VISIBLE_HISTORY) return;

  const oldRows = realRows.slice(MAX_VISIBLE_HISTORY).reverse();
  const previousMemory = await getOneHelpMemory(userId);
  const oldConversation = oldRows.map((r) => `${r.role === "user" ? "Foydalanuvchi" : "OneHelp"}: ${r.content}`).join("\n");

  let newMemory: string;
  try {
    newMemory = await withTimeout(generateOneHelpText(
      `Siz OneHelp chat xotirasini ixchamlashtiruvchi yordamchisiz. Muhim faktlar, foydalanuvchining biznesi, afzalliklari, kelishilgan qarorlar, bajarilgan ishlar va davom etayotgan vazifalarni saqlang. Keraksiz salomlashuv va takrorlarni olib tashlang. O'zbekcha yozing. Maksimal 3500 belgi. Faqat xotira matnini qaytaring, JSON yozmang.`,
      `Oldingi xotira:\n${previousMemory || "yo'q"}\n\nYangi siqiladigan suhbat:\n${oldConversation}`,
    ), ONEHELP_AI_TIMEOUT_MS);
  } catch (err) {
    console.error("[onehelp] memory compaction failed", err);
    return;
  }

  newMemory = newMemory.trim().slice(0, 3500);
  const memoryRow = (await db.select({ id: oneHelpMessagesTable.id, content: oneHelpMessagesTable.content })
    .from(oneHelpMessagesTable).where(eq(oneHelpMessagesTable.userId, userId)).orderBy(desc(oneHelpMessagesTable.id)).limit(100))
    .find((r) => r.content.startsWith(MEMORY_PREFIX));

  if (memoryRow) {
    await db.update(oneHelpMessagesTable).set({ content: `${MEMORY_PREFIX}${newMemory}` }).where(eq(oneHelpMessagesTable.id, memoryRow.id));
  } else {
    await db.insert(oneHelpMessagesTable).values({ userId, role: "assistant", content: `${MEMORY_PREFIX}${newMemory}` });
  }

  await db.delete(oneHelpMessagesTable).where(inArray(oneHelpMessagesTable.id, oldRows.map((r) => r.id)));
}

router.get("/onehelp/messages", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) { res.status(401).json({ error: "Tizimga kirilmagan." }); return; }
  const rows = await db.select({ id: oneHelpMessagesTable.id, role: oneHelpMessagesTable.role, content: oneHelpMessagesTable.content, createdAt: oneHelpMessagesTable.createdAt })
    .from(oneHelpMessagesTable).where(eq(oneHelpMessagesTable.userId, userId)).orderBy(desc(oneHelpMessagesTable.createdAt)).limit(100);
  const visible = rows.filter((r) => !r.content.startsWith(MEMORY_PREFIX)).slice(0, MAX_VISIBLE_HISTORY).reverse();
  res.json(visible.map((r) => ({ ...r, id: r.role === "user" ? -Math.abs(r.id) : r.id, createdAt: r.createdAt.toISOString() })));
});

router.post("/onehelp/chat", async (req, res) => {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) { res.status(401).json({ error: "Tizimga kirilmagan." }); return; }
    const message = String((req.body as { message?: string })?.message ?? "").trim();
    if (!message) { res.status(400).json({ error: "Xabar bo'sh bo'lishi mumkin emas." }); return; }
    if (message.length > 2000) { res.status(400).json({ error: "Xabar juda uzun." }); return; }
    await db.insert(oneHelpMessagesTable).values({ userId, role: "user", content: message });

    const memory = await getOneHelpMemory(userId);
    const recent = await db.select({ role: oneHelpMessagesTable.role, content: oneHelpMessagesTable.content })
      .from(oneHelpMessagesTable).where(eq(oneHelpMessagesTable.userId, userId)).orderBy(desc(oneHelpMessagesTable.createdAt)).limit(MAX_VISIBLE_HISTORY);
    const history = recent.filter((m) => !m.content.startsWith(MEMORY_PREFIX)).reverse()
      .map((m) => `${m.role === "user" ? "U" : "AI"}: ${m.content.length > 200 ? m.content.slice(0, 200) + "…" : m.content}`).join("\n");
    const snapshot = await withTimeout(buildBusinessSnapshot(userId), ONEHELP_AI_TIMEOUT_MS);

    let steps: AgentStep[];
    try {
      const raw = await withTimeout(generateOneHelpText(buildSystemPrompt(snapshot, memory), `Suhbat:\n${history}\n\nJavob (JSON):`), ONEHELP_AI_TIMEOUT_MS);
      steps = parseAgentPlan(raw);
    } catch (err) {
      console.error("[onehelp] external AI generate failed", err);
      steps = [{ say: "Kechirasiz, OneHelp AI server hozir javobni vaqtida qaytara olmadi. Qayta urinib ko'ring." }];
    }

    try {
      steps = await withTimeout(executeServerActionsAndStrip(userId, steps), ONEHELP_AI_TIMEOUT_MS);
    } catch (err) {
      console.error("[onehelp] action execution failed", err);
      steps = steps.map((s) => ({ say: s.say }));
    }

    const contentForHistory = steps.map((s) => s.say).join("\n\n");
    const [saved] = await db.insert(oneHelpMessagesTable).values({ userId, role: "assistant", content: contentForHistory }).returning();
    res.json({ id: saved.id, role: "assistant", content: contentForHistory, createdAt: saved.createdAt.toISOString(), steps });

    void compactOneHelpHistory(userId).catch((err) => console.error("[onehelp] background history compaction failed", err));
  } catch (err) {
    console.error("[onehelp] request failed", err);
    res.status(500).json({ error: "OneHelp serverda xatolik yuz berdi. Qayta urinib ko'ring." });
  }
});

export default router;
