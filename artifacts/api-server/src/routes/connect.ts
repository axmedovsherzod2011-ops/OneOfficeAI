import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { ConnectUserBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router = Router();

// ---------------------------------------------------------------------------
// Current user's app-specific business profile (Telegram channel, bot,
// etc). Identity itself (who is signed in) is entirely handled by Firebase
// Authentication — this just looks up "our" data for whichever Firebase
// user made the request.
//
// 404 means the person is signed in with Firebase but hasn't completed the
// onboarding wizard yet (first time here) — the client shows the wizard.
// ---------------------------------------------------------------------------

router.get("/me", async (req, res) => {
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
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

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

  // Store the business profile, keyed by the signed-in Firebase user.
  // Running the wizard again (e.g. to reconnect a different bot) updates
  // the same row instead of creating a duplicate.
  const [user] = await db
    .insert(usersTable)
    .values({
      firebaseUid,
      firstName,
      lastName,
      telegramUsername,
      company,
      channelUsername,
      channelId,
      botToken,
      botUsername,
    })
    .onConflictDoUpdate({
      target: usersTable.firebaseUid,
      set: {
        firstName,
        lastName,
        telegramUsername,
        company,
        channelUsername,
        channelId,
        botToken,
        botUsername,
      },
    })
    .returning({ id: usersTable.id });

  res.json({ id: user.id, channelId, botUsername });
});

export default router;
