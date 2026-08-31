import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, externalAgentSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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
// External Agent — content script (artifacts/external-agent-extension)
// scans whatever third-party site is open and sends the interactive
// elements + the user's command here. The model picks ONE next action;
// the extension executes it and calls back again for the next step (a
// live turn-by-turn loop, unlike OneHelp's plan-the-whole-thing-at-once
// design — this has to be turn-by-turn because each click can change the
// page's DOM in ways we can't predict ahead of time).
//
// Nothing here is persisted per-turn (no messages table) — the extension
// keeps the running chat client-side and resends recent history each
// call. Only /external-agent/summarize writes anything to the DB, once,
// when the session ends.
// ---------------------------------------------------------------------------

interface PageElement {
  selector: string;
  tag: string;
  text: string;
  type: string | null;
}

interface ChatTurn {
  role: "user" | "agent";
  text: string;
}

type AgentAction =
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; value: string }
  | { type: "scroll"; value: "up" | "down" };

interface AgentDecision {
  message: string;
  action: AgentAction | null;
}

const SYSTEM_PROMPT = `Siz OneOffice AI'ning "External Agent"isiz. Foydalanuvchi brauzerida ochilgan BOSHQA bir veb-saytni (masalan OLX.uz, Uzum Seller kabi sotuv platformalari) xuddi haqiqiy odam kabi boshqarasiz — sizga har safar joriy sahifadagi bosiladigan/yoziladigan elementlar ro'yxati (selector, turi, matni) va foydalanuvchi buyrug'i beriladi. Siz esa KEYINGI BITTA harakatni tanlaysiz (bir vaqtda faqat bitta — chunki har bir klikdan keyin sahifa o'zgarishi mumkin, shuning uchun keyingi qadamni faqat yangilangan elementlar ro'yxati kelgach aytasiz).

Harakat turlari:
- {"type":"click","selector":"..."} — elementni bosish
- {"type":"type","selector":"...","value":"..."} — input/textarea'ga matn yozish
- {"type":"scroll","value":"down"} yoki {"value":"up"} — sahifani surish (kerakli element hozircha ko'rinmasa)
- null — hech narsa bosilmaydi: savol berasiz, tushuntirasiz, yoki vazifa tugadi deb aytasiz

QAT'IY QOIDALAR:
- "selector" FAQAT sizga berilgan elementlar ro'yxatidagi qiymatlardan bo'lishi SHART — hech qachon o'zingiz o'ylab topmang.
- Kerakli element ro'yxatda yo'q bo'lsa: yoki scroll qiling, yoki foydalanuvchiga sahifa boshqacha ko'rinishini tushuntirib so'rang (action: null).
- Har bir javobda "message" maydonida — xuddi tirik odam kabi, tabiiy o'zbek tilida, NIMA qilayotganingizni yoki NIMA uchun so'rayotganingizni qisqa ayting (Claude uslubida: "Mahsulot nomi maydonini topdim, endi yozaman..." kabi). Markdown ishlatmang.
- Agar buyruq juda noaniq bo'lsa yoki vaziyat xavfli/qaytarib bo'lmaydigan bo'lsa (masalan hisobni o'chirish, to'lov), avval aniq ruxsat so'rang (action: null, message'da savol bering).

JAVOB FORMATI (FAQAT SHU JSON, boshqa hech narsa yozmang):
{"message": "...", "action": null yoki yuqoridagi amallardan biri}`;

function isValidAction(action: unknown, validSelectors: Set<string>): action is AgentAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type === "click") {
    return typeof a.selector === "string" && validSelectors.has(a.selector);
  }
  if (a.type === "type") {
    return (
      typeof a.selector === "string" &&
      validSelectors.has(a.selector) &&
      typeof a.value === "string"
    );
  }
  if (a.type === "scroll") {
    return a.value === "up" || a.value === "down";
  }
  return false;
}

function parseDecision(raw: string, validSelectors: Set<string>): AgentDecision {
  try {
    const parsed = JSON.parse(raw.trim());
    const message = String(parsed?.message ?? "").trim();
    if (!message) throw new Error("no message");
    const action = isValidAction(parsed?.action, validSelectors) ? parsed.action : null;
    return { message, action };
  } catch {
    return {
      message: "Kechirasiz, sahifani tahlil qilishda xatolik yuz berdi — qayta urinib ko'ring.",
      action: null,
    };
  }
}

router.post("/external-agent/act", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const body = req.body as {
    command?: string;
    pageUrl?: string;
    elements?: PageElement[];
    history?: ChatTurn[];
  };
  const command = String(body.command ?? "").trim();
  const pageUrl = String(body.pageUrl ?? "").trim();
  const elements = Array.isArray(body.elements) ? body.elements.slice(0, 200) : [];
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  if (!command) {
    res.status(400).json({ error: "Buyruq bo'sh bo'lishi mumkin emas." });
    return;
  }
  if (command.length > 1000) {
    res.status(400).json({ error: "Buyruq juda uzun." });
    return;
  }

  const validSelectors = new Set(elements.map((e) => e.selector));

  const elementsText = elements
    .map((e) => `${e.selector} | ${e.tag}${e.type ? `[${e.type}]` : ""} | "${e.text}"`)
    .join("\n");
  const historyText = history
    .map((h) => `${h.role === "user" ? "Foydalanuvchi" : "Agent"}: ${h.text}`)
    .join("\n");

  const userPrompt = `Joriy sahifa: ${pageUrl || "(noma'lum)"}

Sahifadagi elementlar (selector | tur | matn):
${elementsText || "(hech qanday element topilmadi)"}

Suhbat tarixi:
${historyText || "(yo'q)"}

Foydalanuvchining so'nggi buyrug'i: "${command}"

Javob (faqat JSON):`;

  let decision: AgentDecision;
  try {
    const raw = await generateText(SYSTEM_PROMPT, userPrompt);
    decision = parseDecision(raw, validSelectors);
  } catch (err) {
    console.error("[external-agent] generateText failed", err);
    decision = {
      message: "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring.",
      action: null,
    };
  }

  res.json(decision);
});

// ---------------------------------------------------------------------------
// Called once when the user ends a session (⏻ → "Ha, tugatish"). Summarizes
// the client-held chat into a couple of sentences and writes ONE row — this
// is the only DB write this feature ever makes, per the "don't log every
// message, cost matters" requirement.
// ---------------------------------------------------------------------------

router.post("/external-agent/summarize", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const body = req.body as {
    targetUrl?: string;
    messages?: ChatTurn[];
    startedAt?: string;
  };
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 200) : [];
  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();

  if (messages.length === 0) {
    res.json({ skipped: true });
    return;
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Foydalanuvchi" : "Agent"}: ${m.text}`)
    .join("\n");

  let summary = "Sessiya yakunlandi.";
  try {
    summary = await generateText(
      "Quyidagi External Agent sessiyasi suhbatini 1-2 jumlada, o'zbek tilida, qisqa xulosalab bering (nima qilindi/so'raldi). Faqat oddiy JSON qaytaring: {\"summary\": \"...\"}",
      transcript,
    ).then((raw) => {
      try {
        return String(JSON.parse(raw.trim())?.summary ?? "").trim() || "Sessiya yakunlandi.";
      } catch {
        return raw.trim().slice(0, 500) || "Sessiya yakunlandi.";
      }
    });
  } catch (err) {
    console.warn("[external-agent] summarize failed, saving generic summary", err);
  }

  await db.insert(externalAgentSessionsTable).values({
    userId,
    targetUrl: body.targetUrl?.slice(0, 500) ?? null,
    summary: summary.slice(0, 1000),
    stepCount: messages.length,
    startedAt,
  });

  res.json({ saved: true });
});

export default router;
