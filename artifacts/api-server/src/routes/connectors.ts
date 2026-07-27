import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  telegramChannelsTable,
  MAX_TELEGRAM_CHANNELS_PER_USER,
} from "@workspace/db/schema";
import { ConnectTelegramChannelBody } from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";

const router = Router();

async function getProfileOr404(
  firebaseUid: string,
): Promise<{ id: number } | null> {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  return user ?? null;
}

function toChannelResponse(c: typeof telegramChannelsTable.$inferSelect) {
  return {
    id: c.id,
    channelUsername: c.channelUsername,
    channelId: c.channelId,
    botUsername: c.botUsername,
  };
}

// ---------------------------------------------------------------------------
// GET /api/connectors/telegram — list channels connected by the signed-in
// user (0-3).
// ---------------------------------------------------------------------------
router.get("/connectors/telegram", async (req, res) => {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const user = await getProfileOr404(firebaseUid);
  if (!user) {
    res.status(404).json({ error: "Profil hali sozlanmagan." });
    return;
  }

  const channels = await db
    .select()
    .from(telegramChannelsTable)
    .where(eq(telegramChannelsTable.userId, user.id));

  res.json(channels.map(toChannelResponse));
});

// ---------------------------------------------------------------------------
// POST /api/connectors/telegram — verify the bot token + channel via
// Telegram, then store the connection. Up to MAX_TELEGRAM_CHANNELS_PER_USER
// channels may be connected at once; the person removes one first to add a
// new one beyond that.
// ---------------------------------------------------------------------------
router.post("/connectors/telegram", async (req, res) => {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const user = await getProfileOr404(firebaseUid);
  if (!user) {
    res.status(404).json({ error: "Profil hali sozlanmagan." });
    return;
  }

  const parsed = ConnectTelegramChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { channelUsername, botToken } = parsed.data;

  const existing = await db
    .select({ id: telegramChannelsTable.id })
    .from(telegramChannelsTable)
    .where(eq(telegramChannelsTable.userId, user.id));

  if (existing.length >= MAX_TELEGRAM_CHANNELS_PER_USER) {
    res.status(400).json({
      error: `Siz eng ko'pi bilan ${MAX_TELEGRAM_CHANNELS_PER_USER} ta Telegram kanal ulashingiz mumkin. Yangisini ulash uchun avval birontasini o'chiring.`,
    });
    return;
  }

  // Verify bot token with Telegram getMe
  let botUsername: string;
  let botNumericId: number | undefined;
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = (await meRes.json()) as {
      ok: boolean;
      result?: { username?: string; id?: number };
      description?: string;
    };
    if (!meData.ok) {
      res.status(400).json({
        error: `Invalid bot token: ${meData.description || "Telegram rejected the token"}`,
      });
      return;
    }
    botUsername = meData.result?.username ?? "unknown_bot";
    botNumericId = meData.result?.id;
  } catch {
    res.status(400).json({
      error: "Failed to reach Telegram API. Check your internet connection.",
    });
    return;
  }

  // Resolve channel via getChat. The bot must already be added as admin to
  // the channel, otherwise Telegram returns "chat not found" for private
  // channels.
  const channelHandle = channelUsername.startsWith("@")
    ? channelUsername
    : `@${channelUsername}`;
  let channelId: string;
  try {
    const chatRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(channelHandle)}`,
    );
    const chatData = (await chatRes.json()) as {
      ok: boolean;
      result?: { id?: number };
      description?: string;
    };
    if (!chatData.ok) {
      res.status(400).json({
        error: `Kanal topilmadi. Iltimos, botni kanalingizga admin sifatida qo'shib, keyin ulanishni bosing. (${chatData.description ?? "chat not found"})`,
      });
      return;
    }
    channelId = String(chatData.result?.id ?? "");
  } catch {
    res.status(400).json({
      error:
        "Telegram API bilan bog'lanib bo'lmadi. Internet aloqangizni tekshiring.",
    });
    return;
  }

  // Verify the bot is an admin in the channel.
  try {
    if (botNumericId) {
      const memberRes = await fetch(
        `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(channelId)}&user_id=${botNumericId}`,
      );
      const memberData = (await memberRes.json()) as {
        ok: boolean;
        result?: { status?: string };
      };
      if (memberData.ok && memberData.result) {
        const status = memberData.result.status;
        if (status !== "administrator" && status !== "creator") {
          res.status(400).json({
            error:
              "Bot kanalda admin emas. Botni kanalga admin sifatida qo'shing va 'Post Messages' ruxsatini bering.",
          });
          return;
        }
      }
    }
    // If getChatMember lookup fails, proceed — publish step will surface the real error
  } catch {
    // Non-fatal — proceed
  }

  const [channel] = await db
    .insert(telegramChannelsTable)
    .values({
      userId: user.id,
      channelUsername,
      channelId,
      botToken,
      botUsername,
    })
    .returning();

  res.json(toChannelResponse(channel));
});

// ---------------------------------------------------------------------------
// DELETE /api/connectors/telegram/:id — disconnect a channel. Scoped to the
// signed-in user so nobody can remove someone else's connection by guessing
// an id.
// ---------------------------------------------------------------------------
router.delete("/connectors/telegram/:id", async (req, res) => {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const user = await getProfileOr404(firebaseUid);
  if (!user) {
    res.status(404).json({ error: "Profil hali sozlanmagan." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid channel id" });
    return;
  }

  const deleted = await db
    .delete(telegramChannelsTable)
    .where(
      and(
        eq(telegramChannelsTable.id, id),
        eq(telegramChannelsTable.userId, user.id),
      ),
    )
    .returning({ id: telegramChannelsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  res.status(204).end();
});

export default router;
