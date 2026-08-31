import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, oneHelpMessagesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateText } from "../ai/textProviders";

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
// Phase 2/3: OneHelp can now narrate AND drive the site — but only through
// this small, explicit, validated action set. It does NOT hold a live
// browser session or call real navigation/DOM APIs itself; instead it plans
// the WHOLE sequence of {say, action} steps in one JSON response, which the
// frontend then plays back one at a time (narration reveals, then the real
// setNavView/highlight/etc. call actually fires) — a deliberate
// plan-then-execute design rather than a live turn-by-turn agent loop,
// because every one of these actions is a client-side visual effect with no
// server-observable result to feed back into a "real" tool loop anyway.
//
// NAVIGATE_VIEWS and HIGHLIGHT_TARGETS are the model's entire vocabulary —
// anything else it invents gets dropped (kept as narration-only) by the
// validation pass below, never trusted blindly.
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

type AgentAction =
  | { type: "navigate"; view: (typeof NAVIGATE_VIEWS)[number] }
  | { type: "highlight"; target: (typeof HIGHLIGHT_TARGETS)[number] }
  | { type: "open_new_product_form" }
  | { type: "request_confirmation"; question: string };

interface AgentStep {
  say: string;
  action?: AgentAction;
}

const SYSTEM_PROMPT = `Siz OneHelp — OneOffice AI platformasining o'zi ichiga o'rnatilgan yordamchisisiz, saytning pastki burchagidagi chatda ishlaysiz.

OneOffice AI — kichik sotuvchilar uchun boshqaruv tizimi: mahsulot yaratish (rasmlar, narx, xarakteristika), AI yordamida Telegram kanaliga post yozish va joylashtirish, "PRO Vitrina" (ommaviy onlayn do'kon, /store/nomi), buyurtmalarni boshqarish, statistika (kunlik/haftalik/oylik/yillik grafiklar), va Telegram integratsiyasi.

ENDI SIZDA SAYTNI BOSHQARISH IMKONIYATI BOR — quyidagi amallarni bajarishingiz mumkin (foydalanuvchi buni ko'radi, xuddi o'zi bosgandek sayt harakatlanadi):
- navigate: saytning bo'limiga o'tish. view qiymati faqat shulardan biri bo'lishi shart: "dashboard" (bosh sahifa), "inventory" (mahsulotlar), "create" (post yaratish), "connectors" (ulanishlar: Telegram va h.k.), "shopfront" (vitrina sozlamalari), "orders" (buyurtmalar), "settings" (sozlamalar), "profile" (profil).
- highlight: ekrandagi aniq elementni yoritib ko'rsatish. target qiymati faqat shulardan biri: "product-name-input", "product-price-input", "product-save-button", "post-pick-product", "post-generate-button", "button-approve".
- open_new_product_form: yangi mahsulot qo'shish formasini ochish.
- request_confirmation: OG'IR yoki qaytarib bo'lmaydigan amal oldidan (masalan postni joylashtirish, mahsulotni o'chirish) foydalanuvchidan ANIQ ruxsat so'rash — question maydoniga aniq savol yozing. Bu amaldan keyingi qadamlar ruxsat kelmaguncha bajarilmaydi, shuning uchun uni har doim navbatning OXIRIGA qo'ying.

MUHIM CHEKLOVLAR:
- Faqat yuqoridagi ro'yxatdagi view/target qiymatlaridan foydalaning — boshqasini o'ylab topmang.
- Hozircha forma maydonlarini o'zingiz to'ldira olmaysiz (bu keyingi versiyada qo'shiladi) — buni so'rashsa, ochiq tan oling.
- Og'ir/qaytarib bo'lmaydigan amalni (post joylash, o'chirish) hech qachon so'ramasdan bajarmang — avval request_confirmation ishlating.
- Agar foydalanuvchi shunchaki savol bersa (amal talab qilinmasa), faqat bitta "say" qadami bilan javob bering, action qo'ymang.

JAVOB FORMATI (JUDA MUHIM): faqat quyidagi JSON obyektini qaytaring, boshqa hech narsa yozmang:
{"steps": [{"say": "gap matni", "action": null yoki yuqoridagi amallardan biri}, ...]}

"say" matni — xuddi tirik odam yozgandek, oddiy, iliq, samimiy o'zbek tilida, QISQA (1-2 jumla har bir qadamda). "say" ichida QATʼIYAN ishlatmang: markdown belgilari (** # -), raqamlangan ro'yxat, kod bloklari — faqat sof gap.`;

function isValidAction(action: unknown): action is AgentAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type === "navigate") return NAVIGATE_VIEWS.includes(a.view as never);
  if (a.type === "highlight") return HIGHLIGHT_TARGETS.includes(a.target as never);
  if (a.type === "open_new_product_form") return true;
  if (a.type === "request_confirmation") return typeof a.question === "string" && a.question.trim().length > 0;
  return false;
}

// The model is asked for JSON but, same lesson as the earlier plain-chat
// bug, still needs defending against: missing/malformed fields, invented
// action types/targets, or (rarely) not-quite-valid JSON. Never trust it
// blindly — always fall back to a plain-text single step so the person
// still gets SOME answer instead of a broken chat turn.
function parseAgentPlan(raw: string, fallbackText: string): AgentStep[] {
  try {
    const parsed = JSON.parse(raw.trim());
    const steps = Array.isArray(parsed?.steps) ? parsed.steps : null;
    if (!steps || steps.length === 0) throw new Error("no steps");
    const cleaned: AgentStep[] = steps
      .map((s: unknown): AgentStep | null => {
        if (!s || typeof s !== "object") return null;
        const say = String((s as Record<string, unknown>).say ?? "").trim();
        if (!say) return null;
        const action = (s as Record<string, unknown>).action;
        return { say, action: isValidAction(action) ? action : undefined };
      })
      .filter((s: AgentStep | null): s is AgentStep => s !== null);
    if (cleaned.length === 0) throw new Error("no valid steps after cleaning");
    return cleaned;
  } catch {
    return [{ say: fallbackText || "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring." }];
  }
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
    steps = parseAgentPlan(raw, "");
  } catch (err) {
    console.error("[onehelp] generateText failed", err);
    steps = [{ say: "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring." }];
  }

  // Stored history is plain text (the concatenation of every "say") — the
  // actions themselves aren't replayed on a later reload, only shown live
  // the moment they're generated. That's an intentional scope cut for this
  // phase, not an oversight: replaying past actions on reload risks
  // re-navigating someone away from whatever they're doing right now.
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
