import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, oneHelpMessagesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateFreeText } from "../ai/textProviders";

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

// Phase 1 system prompt: OneHelp is a Q&A / guidance assistant only — it
// does NOT control the site yet (that's a later phase, tool-calling +
// visible on-screen actions). Explicitly told its own current limit so it
// never claims to have clicked/created/published anything itself.
const SYSTEM_PROMPT = `Siz OneHelp — OneOffice AI platformasining o'zi ichiga o'rnatilgan yordamchisisiz. Siz shu saytning pastki burchagida joylashgan chatda foydalanuvchi bilan gaplashasiz.

OneOffice AI — kichik sotuvchilar uchun butun boshqaruv tizimi: mahsulot yaratish (rasmlar, narx, xarakteristika), AI yordamida Telegram kanaliga post yozish va joylashtirish, "PRO Vitrina" (jamoat oldida ko'rinadigan onlayn do'kon, /store/nomi), buyurtmalarni qabul qilish va boshqarish, ko'rishlar/obunachilar statistikasi (kunlik/haftalik/oylik/yillik grafiklar), va Telegram integratsiyasi (bot orqali buyurtma bildirishnomalari, MTProto orqali shaxsiy kanalni ulash).

Vazifangiz: foydalanuvchiga savollariga aniq, qisqa, samimiy o'zbek tilida javob berish va saytdan qanday foydalanishni tushuntirish (masalan "mahsulot qanday qo'shaman", "vitrinam qayerda", "Telegram qanday ulanadi" kabi savollarga).

MUHIM CHEKLOV: hozircha siz faqat gaplasha olasiz — tugmalarni bosish, forma to'ldirish, sahifa ochish kabi amallarni siz uchun BAJAROLMAYSIZ (bu imkoniyat tez orada qo'shiladi). Agar foydalanuvchi sizdan biror amalni bajarishingizni so'rasa (masalan "mahsulot yarat", "postni joylashtir"), buni bajarolmasligingizni ochiq tan oling va o'rniga qanday qilishni oddiy gapda tushuntiring.

MUHIM — JAVOB FORMATI: xuddi tirik odam yozgandek, oddiy, iliq va tabiiy yozing — do'stingizga yozayotgandek. QATʼIYAN ISHLATMANG: JSON, kavslar { }, markdown belgilari (** yulduzcha, # panjara, - chiziqcha), raqamlangan ro'yxat (1. 2. 3.), kod bloklari yoki har qanday texnik/dasturchi uslubidagi format. Qadamlarni tushuntirsangiz ham, buni oddiy bog'lovchi gaplar bilan yozing — masalan "Buning uchun chap menyudan Sozlamalar bo'limiga o'ting, keyin..." kabi, ro'yxat qilib emas. Javobingiz — sof, oddiy matn, hech qanday maxsus belgilarsiz.

Javoblaringiz qisqa bo'lsin — 2-4 jumla.`;

// Defensive safety net: even with the instruction above, a smaller model
// occasionally still wraps its answer in something JSON-shaped (seen in
// testing: `{"reply": "..."}`) instead of plain text. If that happens,
// unwrap it rather than showing the raw JSON to the person.
function stripAccidentalJsonWrapper(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return text;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      const candidate = parsed.reply ?? parsed.content ?? parsed.message ?? parsed.text;
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  } catch {
    // not actually JSON — leave as-is
  }
  return text;
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

  let reply: string;
  try {
    reply = await generateFreeText(SYSTEM_PROMPT, `Suhbat tarixi:\n${history}\n\nOneHelp javobi:`);
    reply = stripAccidentalJsonWrapper(reply.trim());
  } catch (err) {
    console.error("[onehelp] generateText failed", err);
    reply = "Kechirasiz, hozir javob berolmayapman — birozdan keyin qayta urinib ko'ring.";
  }

  const [saved] = await db
    .insert(oneHelpMessagesTable)
    .values({ userId, role: "assistant", content: reply })
    .returning();

  res.json({ id: saved.id, role: "assistant", content: reply, createdAt: saved.createdAt.toISOString() });
});

export default router;
