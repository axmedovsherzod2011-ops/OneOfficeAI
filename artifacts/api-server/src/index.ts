import app from "./app";
import { logger } from "./lib/logger";
import { ensureTelegramWebhook } from "./telegram/bot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Registers (or re-registers) this server's URL with Telegram so
  // my_chat_member / message updates actually reach /api/telegram/webhook.
  // Without this call, promoting the bot to admin in a channel is
  // invisible to the server — Telegram has nowhere to send that event.
  void ensureTelegramWebhook();
});
