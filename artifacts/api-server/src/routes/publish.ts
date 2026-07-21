import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, postsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { PublishPostBody } from "@workspace/api-zod";

const router = Router();

router.post("/publish", async (req, res) => {
  const parsed = PublishPostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { userId, text, imageUrl } = parsed.data;

  // Retrieve user and their bot token from DB
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found. Please reconnect your account." });
    return;
  }

  const channelId = user.channelId;
  const botToken = user.botToken;

  let telegramMessageId: number | undefined;

  try {
    if (imageUrl) {
      // Send photo with caption
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: channelId, photo: imageUrl, caption: text }),
      });
      const tgData = await tgRes.json() as { ok: boolean; result?: { message_id?: number }; description?: string };
      if (!tgData.ok) {
        res.status(400).json({ error: `Telegram error: ${tgData.description || "Failed to send photo"}` });
        return;
      }
      telegramMessageId = tgData.result?.message_id;
    } else {
      // Send text message
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: channelId, text, parse_mode: "HTML" }),
      });
      const tgData = await tgRes.json() as { ok: boolean; result?: { message_id?: number }; description?: string };
      if (!tgData.ok) {
        res.status(400).json({ error: `Telegram error: ${tgData.description || "Failed to send message"}` });
        return;
      }
      telegramMessageId = tgData.result?.message_id;
    }
  } catch {
    res.status(400).json({ error: "Failed to reach Telegram API. Check your internet connection." });
    return;
  }

  // Extract product name/price from text for DB record
  const parts = text.split(" — ");
  const name = parts[0]?.trim() ?? text.substring(0, 50);
  const price = parts[1]?.trim() ?? "";

  // Save post record to DB
  const [post] = await db
    .insert(postsTable)
    .values({ userId, name, price, category: "General", status: "Published", telegramMessageId: telegramMessageId ?? null })
    .returning({ id: postsTable.id });

  res.json({ success: true, messageId: post.id });
});

export default router;
