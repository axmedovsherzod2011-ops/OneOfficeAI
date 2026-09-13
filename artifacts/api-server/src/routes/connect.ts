import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, telegramChannelsTable } from "@workspace/db/schema";
import { CreateProfileBody } from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";
import { classifyBusinessCategory } from "../ai/businessCategory";

const LANGUAGES = ["uz", "en", "ru"] as const;
type Language = (typeof LANGUAGES)[number];

const router = Router();

// So a DB/driver error comes back as a normal JSON {error} response
// instead of Express's raw HTML "Internal Server Error" page — makes the
// real cause visible in the browser instead of just in server logs.
function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[connect route]", err);
      res.status(500).json({
        error:
          "Serverda xatolik yuz berdi. Ma'lumotlar bazasi so'nggi o'zgarishlar bilan sinxron emas bo'lishi mumkin (pnpm run push kerak bo'lishi mumkin).",
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Current user's app-specific business profile (first/last name, business
// name). Identity itself (who is signed in) is entirely handled by Firebase
// Authentication — this just looks up "our" data for whichever Firebase
// user made the request, plus whatever Telegram channels they've connected
// from Settings → Connectors.
//
// A 404 here means the person is signed in with Firebase but the profile
// row hasn't been created yet — this should only happen if the POST
// /api/profile call right after sign-up failed (e.g. lost connection); the
// client falls back to a small "finish setting up" form in that case.
// ---------------------------------------------------------------------------

router.get(
  "/me",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const channels = await db
      .select()
      .from(telegramChannelsTable)
      .where(
        and(
          eq(telegramChannelsTable.userId, user.id),
          eq(telegramChannelsTable.isActive, true),
        ),
      );

    res.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      company: user.company,
      language: user.language,
      category: user.category,
      onboardingCompleted: Boolean(user.onboardingCompletedAt),
      telegramChannels: channels.map((c) => ({
        id: c.id,
        channelId: c.channelId,
        channelUsername: c.channelUsername,
        channelTitle: c.channelTitle,
      })),
    });
  }),
);

// Marks the first-time walkthrough as done (finished OR explicitly
// skipped) so it never shows again for this account.
router.post(
  "/me/onboarding-complete",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    await db
      .update(usersTable)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(usersTable.firebaseUid, firebaseUid));
    res.json({ ok: true });
  }),
);

// Changes the account's display language — used by the Profile page's
// language switcher (the pre-signup language screen only sets this once,
// at account creation; this is how it's changed afterwards).
router.post(
  "/me/language",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    const language = String((req.body as { language?: unknown })?.language ?? "");
    if (!LANGUAGES.includes(language as Language)) {
      res.status(400).json({ error: "Invalid language" });
      return;
    }
    await db
      .update(usersTable)
      .set({ language: language as Language })
      .where(eq(usersTable.firebaseUid, firebaseUid));
    res.json({ language });
  }),
);

// ---------------------------------------------------------------------------
// Creates the business profile right after Firebase sign-up. No Telegram
// details are collected here anymore — the person connects a channel later,
// whenever they're ready, from Settings → Connectors.
// ---------------------------------------------------------------------------

router.post(
  "/profile",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }

    const parsed = CreateProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { firstName, lastName, company, language, categoryHint } = parsed.data;
    const resolvedLanguage: Language = LANGUAGES.includes(language as Language)
      ? (language as Language)
      : "uz";

    // One-time AI classification of the free-text "nima sotasiz?" answer
    // into a fixed category — never re-run, never re-asked. A blank/failed
    // classification just leaves category empty, which is fine: product
    // category is optional anyway.
    const category = categoryHint
      ? await classifyBusinessCategory(categoryHint, company)
      : "";

    // Idempotent — calling this again (e.g. a retry after a dropped
    // connection) updates the same row instead of creating a duplicate.
    const [user] = await db
      .insert(usersTable)
      .values({
        firebaseUid,
        firstName,
        lastName,
        company,
        language: resolvedLanguage,
        category,
      })
      .onConflictDoUpdate({
        target: usersTable.firebaseUid,
        set: { firstName, lastName, company, language: resolvedLanguage, category },
      })
      .returning({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        company: usersTable.company,
        language: usersTable.language,
        category: usersTable.category,
      });

    res.json(user);
  }),
);

export default router;
