import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, telegramChannelsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { consumeLinkToken, getBotIdentity, getBotToken } from "../telegram/bot";

const router = Router();

async function sendMessage(chatId: number | string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${getBotToken()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Best-effort — a failed confirmation message shouldn't fail the whole
    // webhook handler.
  }
}

// ---------------------------------------------------------------------------
// POST /telegram/webhook — every update from the single global bot lands
// here. Two things it does, both fully automatic (no token/id typed by
// anyone):
//
// 1) "/start <token>" — links the sender's Telegram account to whichever
//    OneOffice account requested that one-time token (see
//    POST /connectors/telegram/link).
//
// 2) my_chat_member — fires whenever the bot's own membership status
//    changes in a chat. When someone promotes the bot to administrator in
//    a channel, this tells us exactly who did it (`from`) and everything
//    about the channel (`chat`) — if `from` maps to a linked OneOffice
//    user, the channel is connected automatically. Demoting/removing the
//    bot flips the row back to inactive instead of deleting history.
// ---------------------------------------------------------------------------

router.post("/telegram/webhook", async (req, res) => {
  // Always 200 quickly — Telegram retries aggressively on non-2xx, and we
  // don't want a slow/failed DB write to trigger a retry storm.
  res.status(200).end();

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const gotSecret = req.get("X-Telegram-Bot-Api-Secret-Token");
  if (expectedSecret && gotSecret !== expectedSecret) {
    console.warn("[telegram webhook] rejected: bad secret token");
    return;
  }

  const update = req.body as any;

  try {
    if (update?.message?.text?.startsWith?.("/start")) {
      const parts = String(update.message.text).trim().split(/\s+/);
      const token = parts[1];
      const chatId = update.message.chat?.id;
      const fromId = update.message.from?.id;

      if (!token) {
        await sendMessage(
          chatId,
          "Salom! OneOffice AI hisobingizni ulash uchun ilovadagi \"Telegram orqali ulash\" tugmasini bosing.",
        );
        return;
      }

      const userId = consumeLinkToken(token);
      if (!userId || !fromId) {
        await sendMessage(
          chatId,
          "Havola muddati tugagan yoki noto'g'ri. Ilovaga qaytib, \"Telegram orqali ulash\"ni qayta bosing.",
        );
        return;
      }

      await db
        .update(usersTable)
        .set({ telegramUserId: String(fromId) })
        .where(eq(usersTable.id, userId));

      await sendMessage(
        chatId,
        "Hisobingiz ulandi! Endi istalgan kanalingizga meni administrator sifatida qo'shing — kanal OneOffice AI'da avtomatik paydo bo'ladi.",
      );
      return;
    }

    if (update?.my_chat_member) {
      const { chat, from, new_chat_member } = update.my_chat_member;
      if (!chat || chat.type !== "channel") return;

      const bot = await getBotIdentity();
      if (!bot || new_chat_member?.user?.id !== bot.id) return;

      const status: string = new_chat_member?.status;
      const promoterTelegramId = from?.id ? String(from.id) : null;

      if (status === "administrator" || status === "creator") {
        if (!promoterTelegramId) return;

        const [owner] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.telegramUserId, promoterTelegramId))
          .limit(1);

        // Bot was made admin by someone whose Telegram account isn't
        // linked to any OneOffice account yet — nothing to attach it to.
        if (!owner) return;

        const channelId = String(chat.id);
        const [existing] = await db
          .select({ id: telegramChannelsTable.id })
          .from(telegramChannelsTable)
          .where(
            and(
              eq(telegramChannelsTable.userId, owner.id),
              eq(telegramChannelsTable.channelId, channelId),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(telegramChannelsTable)
            .set({
              channelTitle: chat.title ?? "",
              channelUsername: chat.username ?? null,
              isActive: true,
            })
            .where(eq(telegramChannelsTable.id, existing.id));
        } else {
          await db.insert(telegramChannelsTable).values({
            userId: owner.id,
            channelId,
            channelUsername: chat.username ?? null,
            channelTitle: chat.title ?? "",
            isActive: true,
          });
        }
        return;
      }

      // Demoted or removed — deactivate rather than delete, so any past
      // posts that reference this channel still resolve.
      if (
        status === "left" ||
        status === "kicked" ||
        status === "member" ||
        status === "restricted"
      ) {
        const channelId = String(chat.id);
        await db
          .update(telegramChannelsTable)
          .set({ isActive: false })
          .where(eq(telegramChannelsTable.channelId, channelId));
      }
    }
  } catch (err) {
    console.error("[telegram webhook]", err);
  }
});

export default router;
