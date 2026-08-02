import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  vkAccountsTable,
  MAX_VK_ACCOUNTS_PER_USER,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

// Read-only "connect" scope only — no wall posting yet, since publishing
// isn't built. Add it here (and re-connect accounts) when that step
// happens.
const VK_SCOPE = "";

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

function toAccountResponse(a: typeof vkAccountsTable.$inferSelect) {
  return {
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    screenName: a.screenName,
    photoUrl: a.photoUrl,
  };
}

// So a DB/network error comes back as JSON, not a raw HTML 500 page.
function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[vk route]", err);
      res.status(500).json({
        error:
          "Serverda xatolik yuz berdi. Ma'lumotlar bazasi so'nggi o'zgarishlar bilan sinxron emas bo'lishi mumkin (pnpm run push kerak bo'lishi mumkin).",
      });
    }
  };
}

// ---------------------------------------------------------------------------
// GET /connectors/vk/config — public info the frontend needs to build the
// VK ID authorize URL itself (app id + scope are not secrets). VK's old
// oauth.vk.com flow (which needed a client secret on exchange) stopped
// working 2025-09-30 — the current "VK ID" flow uses PKCE instead, so no
// secret is required here or in the exchange below.
// ---------------------------------------------------------------------------
router.get("/connectors/vk/config", (_req, res) => {
  const appId = process.env.VK_APP_ID ?? "";
  res.json({
    appId,
    scope: VK_SCOPE,
    configured: Boolean(appId),
  });
});

// ---------------------------------------------------------------------------
// GET /connectors/vk — list accounts connected by the signed-in user
// (0-3).
// ---------------------------------------------------------------------------
router.get(
  "/connectors/vk",
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
      .from(vkAccountsTable)
      .where(eq(vkAccountsTable.userId, userId));

    res.json(accounts.map(toAccountResponse));
  }),
);

// ---------------------------------------------------------------------------
// POST /connectors/vk/exchange — the frontend redirected the user through
// VK's OAuth screen and got a `code` back at its own redirect_uri. This
// trades that code for an access token, pulls the account's basic
// profile, and stores the connection (up to MAX_VK_ACCOUNTS_PER_USER at a
// time).
// ---------------------------------------------------------------------------
router.post(
  "/connectors/vk/exchange",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const appId = process.env.VK_APP_ID;
    if (!appId) {
      res.status(400).json({
        error: "VK ulanishi hali sozlanmagan (VK_APP_ID server sozlamalarida yo'q).",
      });
      return;
    }

    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const deviceId =
      typeof req.body?.deviceId === "string" ? req.body.deviceId : "";
    const codeVerifier =
      typeof req.body?.codeVerifier === "string" ? req.body.codeVerifier : "";
    const redirectUri =
      typeof req.body?.redirectUri === "string" ? req.body.redirectUri : "";
    if (!code || !deviceId || !codeVerifier || !redirectUri) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const existing = await db
      .select({ id: vkAccountsTable.id })
      .from(vkAccountsTable)
      .where(eq(vkAccountsTable.userId, userId));

    if (existing.length >= MAX_VK_ACCOUNTS_PER_USER) {
      res.status(400).json({
        error: `Siz eng ko'pi bilan ${MAX_VK_ACCOUNTS_PER_USER} ta VK akkaunt ulashingiz mumkin. Yangisini ulash uchun avval birontasini o'chiring.`,
      });
      return;
    }

    // 1) Exchange the authorization code for an access token — VK ID's
    // OAuth 2.1 + PKCE flow. VK's older oauth.vk.com/access_token
    // (client_secret-based) endpoint stopped working on 2025-09-30.
    let accessToken: string;
    let vkUserId: string;
    let expiresInSeconds: number | null = null;
    try {
      const tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: appId,
          redirect_uri: redirectUri,
          code,
          code_verifier: codeVerifier,
          device_id: deviceId,
        }),
      });
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        user_id?: string | number;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };
      if (!tokenRes.ok || !tokenData.access_token) {
        res.status(400).json({
          error: `VK kod almashinuvi muvaffaqiyatsiz: ${tokenData.error_description ?? tokenData.error ?? "noma'lum xato"}`,
        });
        return;
      }
      accessToken = tokenData.access_token;
      vkUserId = String(tokenData.user_id ?? "");
      expiresInSeconds = tokenData.expires_in ?? null;
    } catch {
      res.status(400).json({
        error: "VK API bilan bog'lanib bo'lmadi.",
      });
      return;
    }

    // 2) Fetch the account's basic profile via VK ID's user_info endpoint.
    let firstName = "";
    let lastName = "";
    let screenName = "";
    let photoUrl = "";
    try {
      const profileRes = await fetch("https://id.vk.com/oauth2/user_info", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          access_token: accessToken,
        }),
      });
      const profileData = (await profileRes.json()) as {
        user?: {
          user_id?: string;
          first_name?: string;
          last_name?: string;
          screen_name?: string;
          avatar?: string;
        };
        error?: unknown;
      };
      if (!profileRes.ok || profileData.error) {
        console.error(
          "[vk] profile fetch failed:",
          profileRes.status,
          profileData,
        );
      }
      const profile = profileData.user;
      firstName = profile?.first_name ?? "";
      lastName = profile?.last_name ?? "";
      screenName = profile?.screen_name ?? "";
      photoUrl = profile?.avatar ?? "";
      if (!vkUserId && profile?.user_id) vkUserId = profile.user_id;
    } catch (err) {
      console.error("[vk] profile fetch threw:", err);
      // Non-fatal — the connection is still saved without profile details.
    }

    const tokenExpiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null;

    // Same VK account re-connected: update the existing row instead of
    // creating a duplicate.
    const [already] = await db
      .select({ id: vkAccountsTable.id })
      .from(vkAccountsTable)
      .where(
        and(
          eq(vkAccountsTable.userId, userId),
          eq(vkAccountsTable.vkUserId, vkUserId),
        ),
      );

    const values = {
      userId,
      vkUserId,
      firstName,
      lastName,
      screenName,
      photoUrl,
      accessToken,
      tokenExpiresAt,
    };

    const [account] = already
      ? await db
          .update(vkAccountsTable)
          .set(values)
          .where(eq(vkAccountsTable.id, already.id))
          .returning()
      : await db.insert(vkAccountsTable).values(values).returning();

    res.json(toAccountResponse(account));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /connectors/vk/:id — disconnect an account.
// ---------------------------------------------------------------------------
router.delete(
  "/connectors/vk/:id",
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
      .delete(vkAccountsTable)
      .where(
        and(eq(vkAccountsTable.id, id), eq(vkAccountsTable.userId, userId)),
      )
      .returning({ id: vkAccountsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    res.status(204).end();
  }),
);

export default router;
