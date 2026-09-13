import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, telegramChannelsTable } from "@workspace/db/schema";
import { and, eq, ne } from "drizzle-orm";
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
      const chat = update.message.chat;
      const chatId = chat?.id;
      const fromId = update.message.from?.id;

      // /start only carries a meaningful token in a private 1:1 chat with
      // the bot. If someone runs it inside a group/channel the bot is also
      // in, say so explicitly rather than silently mismatching state.
      if (chat?.type && chat.type !== "private") {
        await sendMessage(
          chatId,
          "Hisobni ulash uchun bu buyruqni menga shaxsiy xabarda (guruh yoki kanalda emas) yuborishingiz kerak.",
        );
        return;
      }

      const parts = String(update.message.text).trim().split(/\s+/);
      const token = parts[1];

      if (!token) {
        await sendMessage(
          chatId,
          "Salom! Bu yerga ilovadagi \"Telegram orqali ulash\" tugmasi orqali kelishingiz kerak — u orqali ulanish havolasini generatsiya qiladi. To'g'ridan-to'g'ri /start yozish hisobni ulamaydi.",
        );
        return;
      }

      if (!fromId) {
        // Telegram always sets `from` for a private-chat text message; if
        // it's somehow missing we can't know who to link, so say that
        // plainly instead of pretending it worked.
        console.error("[telegram webhook] /start message with no from.id", update);
        await sendMessage(
          chatId,
          "Kutilmagan xatolik: Telegram sizning foydalanuvchi ma'lumotingizni yubormadi, shuning uchun hisobni ulay olmadim. Birozdan so'ng qayta urinib ko'ring.",
        );
        return;
      }

      const result = await consumeLinkToken(token);

      if (result.status === "not_found") {
        await sendMessage(
          chatId,
          "Bu ulanish havolasi tanilmadi (noto'g'ri yoki eskirib, tizimdan o'chirilgan bo'lishi mumkin). Ilovaga qaytib, \"Telegram orqali ulash\"ni qaytadan bosing — yangi havola olasiz.",
        );
        return;
      }

      if (result.status === "expired") {
        await sendMessage(
          chatId,
          "Bu havola muddati tugagan (10 daqiqadan keyin eskiradi). Ilovaga qaytib, \"Telegram orqali ulash\"ni qaytadan bosing.",
        );
        return;
      }

      if (result.status === "already_used") {
        await sendMessage(
          chatId,
          "Bu havola allaqachon ishlatilgan. Agar hisobingiz allaqachon ulangan bo'lsa, hech narsa qilish shart emas — ilovadagi Connectors bo'limida tekshiring. Aks holda yangi havola oling.",
        );
        return;
      }

      // result.status === "ok" from here on.
      try {
        await db.transaction(async (tx) => {
          // A Telegram account can only be linked to one OneOffice account
          // at a time (telegramUserId is UNIQUE). Re-linking — testing
          // with the same Telegram account under a different OneOffice
          // login, or genuinely switching which account owns it — is a
          // normal thing to do, not an error: automatically detach it from
          // whichever account had it before, then attach it here. Both
          // updates run in one transaction so there's never a moment where
          // the unique constraint is violated.
          await tx
            .update(usersTable)
            .set({ telegramUserId: null })
            .where(
              and(
                eq(usersTable.telegramUserId, String(fromId)),
                ne(usersTable.id, result.userId),
              ),
            );

          await tx
            .update(usersTable)
            .set({ telegramUserId: String(fromId) })
            .where(eq(usersTable.id, result.userId));
        });
      } catch (err: any) {
        console.error("[telegram webhook] failed to save telegramUserId", err);
        await sendMessage(
          chatId,
          "Hisobni ulashda kutilmagan server xatoligi yuz berdi. Birozdan so'ng qayta urinib ko'ring; davom etsa, texnik yordamga murojaat qiling.",
        );
        return;
      }

      await sendMessage(
        chatId,
        "✅ Hisobingiz ulandi!\n\n" +
          "Men OneOffice AI botiman — sizning onlayn do'koningiz uchun ishlayman: yangi buyurtma tushganda shu yerga darhol xabar beraman, va kanalingizga admin qilib qo'shsangiz, mahsulot postlarini avtomatik joylashtiraman.\n\n" +
          "Bu xabarlarni istalgan vaqt to'xtatishingiz mumkin — meni bloklash yoki OneOffice AI ilovasida hisobni uzish orqali.\n\n" +
          "Keyingi qadam: istalgan kanalingizga meni administrator sifatida qo'shing — kanal ilovada avtomatik paydo bo'ladi.",
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
        // This is a common ordering mistake (promote-before-link), so we
        // log it loudly instead of failing silently, and let the promoter
        // know via a DM what to do next.
        if (!owner) {
          console.warn(
            `[telegram webhook] channel "${chat.title}" (${chat.id}) was promoted by unlinked Telegram user ${promoterTelegramId} — ignoring until they link their account`,
          );
          await sendMessage(
            promoterTelegramId,
            `Meni "${chat.title ?? "kanal"}" kanalida administrator qildingiz, lekin hisobingiz hali OneOffice AI'ga ulanmagan. Ilovada "Telegram orqali ulash"ni bosing, so'ng meni kanaldan olib tashlab qaytadan admin qiling — shunda kanal avtomatik ulanadi.`,
          );
          return;
        }

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
