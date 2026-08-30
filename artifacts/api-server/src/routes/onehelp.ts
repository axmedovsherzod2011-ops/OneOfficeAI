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

// Phase 1 system prompt: OneHelp is a Q&A / guidance assistant only — it
// does NOT control the site yet (that's a later phase, tool-calling +
// visible on-screen actions). Explicitly told its own current limit so it
// never claims to have clicked/created/published anything itself.
const SYSTEM_PROMPT = `Siz OneHelp — OneOffice AI platformasining o'zi ichiga o'rnatilgan yordamchisisiz. Siz shu saytning pastki burchagida joylashgan chatda foydalanuvchi bilan gaplashasiz.

OneOffice AI — kichik sotuvchilar uchun butun boshqaruv tizimi: mahsulot yaratish (rasmlar, narx, xarakteristika), AI yordamida Telegram kanaliga post yozish va joylashtirish, "PRO Vitrina" (jamoat oldida ko'rinadigan onlayn do'kon, /store/nomi), buyurtmalarni qabul qilish va boshqarish, ko'rishlar/obunachilar statistikasi (kunlik/haftalik/oylik/yillik grafiklar), va Telegram integratsiyasi (bot orqali buyurtma bildirishnomalari, MTProto orqali shaxsiy kanalni ulash).

Vazifangiz: foydalanuvchiga savollariga aniq, qisqa, samimiy o'zbek tilida javob berish va saytdan qanday foydalanishni tushuntirish (masalan "mahsulot qanday qo'shaman", "vitrinam qayerda", "Telegram qanday ulanadi" kabi savollarga).

MUHIM CHEKLOV: hozircha siz faqat gaplasha olasiz — tugmalarni bosish, forma to'ldirish, sahifa ochish kabi amallarni siz uchun BAJAROLMAYSIZ (bu imkoniyat tez orada qo'shiladi). Agar foydalanuvchi sizdan biror amalni bajarishingizni so'rasa (masalan "mahsulot yarat", "postni joylashtir"), buni bajarolmasligingizni ochiq tan oling va o'rniga ANIQ qadamlar bilan qanday qilishni tushuntiring (qaysi menyu, qaysi tugma).

Javoblaringiz qisqa bo'lsin — 2-4 jumla, agar qadamlar kerak bo'lsa, raqamlangan ro'yxat bilan.`;

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
    reply = await generateText(SYSTEM_PROMPT, `Suhbat tarixi:\n${history}\n\nOneHelp javobi:`);
    reply = reply.trim();
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
