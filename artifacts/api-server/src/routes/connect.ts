import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { ConnectUserBody } from "@workspace/api-zod";
import { ilike } from "drizzle-orm";

const router = Router();

// ---------------------------------------------------------------------------
// Sign in — look up an existing account by the Telegram username they signed
// up with, so returning users don't have to redo the whole connect wizard.
// ---------------------------------------------------------------------------

router.post("/login", async (req, res) => {
  const { telegramUsername } = req.body as { telegramUsername?: string };

  if (!telegramUsername || !telegramUsername.trim()) {
    res.status(400).json({ error: "Telegram username kiritilishi shart." });
    return;
  }

  const handle = telegramUsername.replace(/^@/, "").trim();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.telegramUsername, handle))
    .limit(1);

  if (!user) {
    res.status(404).json({
      error: "Bunday foydalanuvchi topilmadi. Avval ro'yxatdan o'ting.",
    });
    return;
  }

  res.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    telegramUsername: user.telegramUsername,
    company: user.company,
    channelUsername: user.channelUsername,
    channelId: user.channelId,
    botToken: user.botToken,
    botUsername: user.botUsername,
  });
});

router.post("/connect", async (req, res) => {
  const parsed = ConnectUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const {
    firstName,
    lastName,
    telegramUsername,
    company,
    channelUsername,
    botToken,
  } = parsed.data;

  // Verify bot token with Telegram getMe
  let botUsername: string;
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = (await meRes.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!meData.ok) {
      res.status(400).json({
        error: `Invalid bot token: ${meData.description || "Telegram rejected the token"}`,
      });
      return;
    }
    botUsername = meData.result?.username ?? "unknown_bot";
  } catch {
    res.status(400).json({
      error: "Failed to reach Telegram API. Check your internet connection.",
    });
    return;
  }

  // Resolve channel via getChat
  // The bot must be added as admin to the channel BEFORE this step,
  // otherwise Telegram returns "chat not found" for private channels.
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

  // Verify bot is admin in the channel using its numeric user ID from getMe
  // We already know botUsername from getMe; fetch numeric id separately for getChatMember
  try {
    const meRes2 = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData2 = (await meRes2.json()) as {
      ok: boolean;
      result?: { id?: number };
    };
    const botNumericId = meData2.ok ? meData2.result?.id : undefined;

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

  // Store user in DB
  const [user] = await db
    .insert(usersTable)
    .values({
      firstName,
      lastName,
      telegramUsername,
      company,
      channelUsername,
      channelId,
      botToken,
      botUsername,
    })
    .returning({ id: usersTable.id });

  res.json({ id: user.id, channelId, botUsername });
});

export default router;
