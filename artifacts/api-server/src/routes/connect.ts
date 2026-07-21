import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { ConnectUserBody } from "@workspace/api-zod";

const router = Router();

router.post("/connect", async (req, res) => {
  const parsed = ConnectUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { firstName, lastName, telegramUsername, company, channelUsername, botToken } = parsed.data;

  // Verify bot token with Telegram getMe
  let botUsername: string;
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = await meRes.json() as { ok: boolean; result?: { username?: string }; description?: string };
    if (!meData.ok) {
      res.status(400).json({ error: `Invalid bot token: ${meData.description || "Telegram rejected the token"}` });
      return;
    }
    botUsername = meData.result?.username ?? "unknown_bot";
  } catch {
    res.status(400).json({ error: "Failed to reach Telegram API. Check your internet connection." });
    return;
  }

  // Resolve channel via getChat
  const channelHandle = channelUsername.startsWith("@") ? channelUsername : `@${channelUsername}`;
  let channelId: string;
  try {
    const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(channelHandle)}`);
    const chatData = await chatRes.json() as { ok: boolean; result?: { id?: number }; description?: string };
    if (!chatData.ok) {
      res.status(400).json({ error: `Channel not found: ${chatData.description || "Make sure the channel username is correct"}` });
      return;
    }
    channelId = String(chatData.result?.id ?? "");
  } catch {
    res.status(400).json({ error: "Failed to resolve channel from Telegram." });
    return;
  }

  // Verify bot is admin in the channel
  try {
    const memberRes = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(channelHandle)}&user_id=${encodeURIComponent(botUsername)}`);
    const memberData = await memberRes.json() as { ok: boolean; result?: { status?: string } };
    if (memberData.ok && memberData.result) {
      const status = memberData.result.status;
      if (status !== "administrator" && status !== "creator") {
        res.status(400).json({ error: "The bot is not an administrator in the channel. Please add it as admin with Post Messages permission." });
        return;
      }
    }
    // If getChatMember fails (e.g. private channel nuance), proceed anyway — the publish step will surface the real error
  } catch {
    // Non-fatal — proceed
  }

  // Store user in DB
  const [user] = await db
    .insert(usersTable)
    .values({ firstName, lastName, telegramUsername, company, channelUsername, channelId, botToken, botUsername })
    .returning({ id: usersTable.id });

  res.json({ id: user.id, channelId, botUsername });
});

export default router;
