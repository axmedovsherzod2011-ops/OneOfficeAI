import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  instagramAccountsTable,
  MAX_INSTAGRAM_ACCOUNTS_PER_USER,
} from "@workspace/db/schema";
import { ExchangeInstagramCodeBody } from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";

const router = Router();

// Only the "connect" scope for now — no instagram_business_content_publish
// yet, since posting isn't built. Add it here (and re-connect accounts)
// when that step happens.
const INSTAGRAM_SCOPE = "instagram_business_basic";

function getProfileOr401(req: any, res: any): string | null {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return null;
  }
  return firebaseUid;
}

async function getUserRowId(firebaseUid: string) {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  return user?.id ?? null;
}

function toAccountResponse(a: typeof instagramAccountsTable.$inferSelect) {
  return {
    id: a.id,
    username: a.username,
    name: a.name,
    accountType: a.accountType,
    profilePictureUrl: a.profilePictureUrl,
  };
}

// So a DB/network error comes back as JSON, not a raw HTML 500 page.
function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[instagram route]", err);
      res.status(500).json({
        error:
          "Serverda xatolik yuz berdi. Ma'lumotlar bazasi so'nggi o'zgarishlar bilan sinxron emas bo'lishi mumkin (pnpm run push kerak bo'lishi mumkin).",
      });
    }
  };
}

// ---------------------------------------------------------------------------
// GET /connectors/instagram/config — public info the frontend needs to
// build the Instagram authorize URL itself (app id + scope are not
// secrets; the app secret never leaves this server).
// ---------------------------------------------------------------------------
router.get("/connectors/instagram/config", (_req, res) => {
  const appId = process.env.INSTAGRAM_APP_ID ?? "";
  res.json({
    appId,
    scope: INSTAGRAM_SCOPE,
    configured: Boolean(appId && process.env.INSTAGRAM_APP_SECRET),
  });
});

// ---------------------------------------------------------------------------
// GET /connectors/instagram — list accounts connected by the signed-in
// user (0-3).
// ---------------------------------------------------------------------------
router.get(
  "/connectors/instagram",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const accounts = await db
      .select()
      .from(instagramAccountsTable)
      .where(eq(instagramAccountsTable.userId, userId));

    res.json(accounts.map(toAccountResponse));
  }),
);

// ---------------------------------------------------------------------------
// POST /connectors/instagram/exchange — the frontend redirected the user
// through Instagram's OAuth screen and got a `code` back at its own
// redirect_uri. This trades that code for a long-lived token, pulls the
// account's basic profile, and stores the connection (up to
// MAX_INSTAGRAM_ACCOUNTS_PER_USER at a time).
// ---------------------------------------------------------------------------
router.post(
  "/connectors/instagram/exchange",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appId || !appSecret) {
      res.status(400).json({
        error:
          "Instagram ulanishi hali sozlanmagan (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET server sozlamalarida yo'q).",
      });
      return;
    }

    const parsed = ExchangeInstagramCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { code, redirectUri } = parsed.data;

    const existing = await db
      .select({ id: instagramAccountsTable.id })
      .from(instagramAccountsTable)
      .where(eq(instagramAccountsTable.userId, userId));

    if (existing.length >= MAX_INSTAGRAM_ACCOUNTS_PER_USER) {
      res.status(400).json({
        error: `Siz eng ko'pi bilan ${MAX_INSTAGRAM_ACCOUNTS_PER_USER} ta Instagram akkaunt ulashingiz mumkin. Yangisini ulash uchun avval birontasini o'chiring.`,
      });
      return;
    }

    // 1) Exchange the authorization code for a short-lived access token.
    let shortLivedToken: string;
    let igUserId: string;
    try {
      const tokenRes = await fetch(
        "https://api.instagram.com/oauth/access_token",
        {
          method: "POST",
          body: new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
            code,
          }),
        },
      );
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        user_id?: string | number;
        error_message?: string;
      };
      if (!tokenRes.ok || !tokenData.access_token) {
        res.status(400).json({
          error: `Instagram kod almashinuvi muvaffaqiyatsiz: ${tokenData.error_message ?? "noma'lum xato"}`,
        });
        return;
      }
      shortLivedToken = tokenData.access_token;
      igUserId = String(tokenData.user_id ?? "");
    } catch {
      res.status(400).json({
        error: "Instagram API bilan bog'lanib bo'lmadi.",
      });
      return;
    }

    // 2) Exchange the short-lived token for a long-lived one (60 days).
    let longLivedToken = shortLivedToken;
    let expiresInSeconds: number | null = null;
    try {
      const exchangeUrl =
        "https://graph.instagram.com/access_token?" +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: appSecret,
          access_token: shortLivedToken,
        }).toString();
      const exchangeRes = await fetch(exchangeUrl);
      const exchangeData = (await exchangeRes.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (exchangeRes.ok && exchangeData.access_token) {
        longLivedToken = exchangeData.access_token;
        expiresInSeconds = exchangeData.expires_in ?? null;
      } else {
        console.error(
          "[instagram] long-lived token exchange failed:",
          exchangeRes.status,
          exchangeData,
        );
      }
      // If this step fails, we still proceed with the short-lived token —
      // the account connects, just with a token that expires sooner.
    } catch (err) {
      console.error("[instagram] long-lived token exchange threw:", err);
      // Non-fatal — proceed with the short-lived token.
    }

    // 3) Fetch the account's basic profile.
    let username = "";
    let name = "";
    let accountType = "";
    let profilePictureUrl = "";
    try {
      const profileUrl =
        `https://graph.instagram.com/v21.0/${igUserId}?` +
        new URLSearchParams({
          fields: "id,username,name,account_type,profile_picture_url",
          access_token: longLivedToken,
        }).toString();
      const profileRes = await fetch(profileUrl);
      const profileData = (await profileRes.json()) as {
        username?: string;
        name?: string;
        account_type?: string;
        profile_picture_url?: string;
        error?: unknown;
      };
      if (!profileRes.ok) {
        console.error(
          "[instagram] profile fetch failed:",
          profileRes.status,
          profileData,
        );
      }
      username = profileData.username ?? "";
      name = profileData.name ?? "";
      accountType = profileData.account_type ?? "";
      profilePictureUrl = profileData.profile_picture_url ?? "";
    } catch (err) {
      console.error("[instagram] profile fetch threw:", err);
      // Non-fatal — the connection is still saved without profile details.
    }

    const tokenExpiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null;

    // Same Instagram account re-connected: update the existing row instead
    // of creating a duplicate.
    const [already] = await db
      .select({ id: instagramAccountsTable.id })
      .from(instagramAccountsTable)
      .where(
        and(
          eq(instagramAccountsTable.userId, userId),
          eq(instagramAccountsTable.igUserId, igUserId),
        ),
      );

    const values = {
      userId,
      igUserId,
      username,
      name,
      accountType,
      profilePictureUrl,
      accessToken: longLivedToken,
      tokenExpiresAt,
    };

    const [account] = already
      ? await db
          .update(instagramAccountsTable)
          .set(values)
          .where(eq(instagramAccountsTable.id, already.id))
          .returning()
      : await db.insert(instagramAccountsTable).values(values).returning();

    res.json(toAccountResponse(account));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /connectors/instagram/:id — disconnect an account.
// ---------------------------------------------------------------------------
router.delete(
  "/connectors/instagram/:id",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    const deleted = await db
      .delete(instagramAccountsTable)
      .where(
        and(
          eq(instagramAccountsTable.id, id),
          eq(instagramAccountsTable.userId, userId),
        ),
      )
      .returning({ id: instagramAccountsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    res.status(204).end();
  }),
);

export default router;
