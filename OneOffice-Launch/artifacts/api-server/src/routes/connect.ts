import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, telegramChannelsTable } from "@workspace/db/schema";
import { CreateProfileBody } from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";

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
      telegramChannels: channels.map((c) => ({
        id: c.id,
        channelId: c.channelId,
        channelUsername: c.channelUsername,
        channelTitle: c.channelTitle,
      })),
    });
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

    const { firstName, lastName, company } = parsed.data;

    // Idempotent — calling this again (e.g. a retry after a dropped
    // connection) updates the same row instead of creating a duplicate.
    const [user] = await db
      .insert(usersTable)
      .values({ firebaseUid, firstName, lastName, company })
      .onConflictDoUpdate({
        target: usersTable.firebaseUid,
        set: { firstName, lastName, company },
      })
      .returning({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        company: usersTable.company,
      });

    res.json(user);
  }),
);

export default router;
