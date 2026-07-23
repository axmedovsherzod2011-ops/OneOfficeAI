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
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res
      .status(404)
      .json({ error: "User not found. Please reconnect your account." });
    return;
  }

  const channelId = user.channelId;
  const botToken = user.botToken;

  let telegramMessageId: number | undefined;

  try {
    if (imageUrl) {
      let imageBuffer: ArrayBuffer | Buffer | null = null;
      let contentType = "";

      if (imageUrl.startsWith("data:")) {
        // AI-generated image — already have the bytes, just decode base64.
        const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentType = match[1];
          imageBuffer = Buffer.from(match[2], "base64");
        }
      } else {
        // External URL (legacy/fallback) — download it ourselves first.
        // Passing an external URL straight to Telegram's sendPhoto makes
        // Telegram's servers fetch it, and many scraped/hotlink-protected
        // image URLs return HTML or get blocked, producing "Bad Request:
        // wrong type of the web page content". Uploading the bytes avoids that.
        try {
          const imgRes = await fetch(imageUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "image/*",
            },
          });
          contentType = imgRes.headers.get("content-type") || "";
          if (imgRes.ok && contentType.startsWith("image/")) {
            imageBuffer = await imgRes.arrayBuffer();
          }
        } catch {
          imageBuffer = null;
        }
      }

      if (imageBuffer) {
        // Upload the image bytes directly (multipart/form-data)
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : "jpg";
        const form = new FormData();
        form.append("chat_id", channelId);
        form.append("caption", text);
        form.append(
          "photo",
          new Blob([imageBuffer], { type: contentType }),
          `photo.${ext}`,
        );

        const tgRes = await fetch(
          `https://api.telegram.org/bot${botToken}/sendPhoto`,
          { method: "POST", body: form },
        );
        const tgData = (await tgRes.json()) as {
          ok: boolean;
          result?: { message_id?: number };
          description?: string;
        };
        if (!tgData.ok) {
          res.status(400).json({
            error: `Telegram error: ${tgData.description || "Failed to send photo"}`,
          });
          return;
        }
        telegramMessageId = tgData.result?.message_id;
      } else {
        // Couldn't fetch a valid image — fall back to a text-only post
        // rather than failing the whole publish.
        const tgRes = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: channelId,
              text,
              parse_mode: "HTML",
            }),
          },
        );
        const tgData = (await tgRes.json()) as {
          ok: boolean;
          result?: { message_id?: number };
          description?: string;
        };
        if (!tgData.ok) {
          res.status(400).json({
            error: `Telegram error: ${tgData.description || "Failed to send message"}`,
          });
          return;
        }
        telegramMessageId = tgData.result?.message_id;
      }
    } else {
      // Send text message
      const tgRes = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: channelId,
            text,
            parse_mode: "HTML",
          }),
        },
      );
      const tgData = (await tgRes.json()) as {
        ok: boolean;
        result?: { message_id?: number };
        description?: string;
      };
      if (!tgData.ok) {
        res.status(400).json({
          error: `Telegram error: ${tgData.description || "Failed to send message"}`,
        });
        return;
      }
      telegramMessageId = tgData.result?.message_id;
    }
  } catch {
    res.status(400).json({
      error: "Failed to reach Telegram API. Check your internet connection.",
    });
    return;
  }

  // Extract product name/price from text for DB record
  const parts = text.split(" — ");
  const name = parts[0]?.trim() ?? text.substring(0, 50);
  const price = parts[1]?.trim() ?? "";

  // Save post record to DB
  const [post] = await db
    .insert(postsTable)
    .values({
      userId,
      name,
      price,
      category: "General",
      status: "Published",
      telegramMessageId: telegramMessageId ?? null,
    })
    .returning({ id: postsTable.id });

  res.json({ success: true, messageId: post.id });
});

export default router;
