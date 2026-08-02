// Debug script — NOT part of the app, safe to delete after use.
//
// Run from artifacts/api-server/ (or anywhere — it only needs the
// TELEGRAM_BOT_TOKEN and PUBLIC_APP_URL secrets and Node's built-in fetch):
//   node debug/check-telegram.mjs
//
// This asks Telegram's own servers what THEY think is going on — it does
// not touch your database or your server at all. In particular
// getWebhookInfo returns Telegram's own record of the last delivery
// failure (last_error_message / last_error_date), which is often the
// fastest way to find a webhook problem.

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

async function main() {
  console.log("=== 1) Environment ===");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) fail("TELEGRAM_BOT_TOKEN is not set in this shell.");
  ok("TELEGRAM_BOT_TOKEN is set.");

  const publicUrl = process.env.PUBLIC_APP_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  console.log(`   PUBLIC_APP_URL = ${publicUrl ?? "(not set)"}`);
  console.log(`   TELEGRAM_WEBHOOK_SECRET = ${webhookSecret ? "(set, hidden)" : "(not set)"}`);
  if (!publicUrl || !webhookSecret) {
    console.log(
      "⚠️  Without both of these, ensureTelegramWebhook() silently skips " +
        "registration on startup — this alone would explain nothing ever " +
        "reaching /api/telegram/webhook.",
    );
  }

  console.log("\n=== 2) Bot identity (getMe) ===");
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const me = await meRes.json();
  if (!me.ok) {
    console.error(me);
    fail("getMe failed — the bot token itself looks invalid.");
  }
  ok(`Bot is @${me.result.username} (id ${me.result.id})`);
  if (
    process.env.TELEGRAM_BOT_USERNAME &&
    process.env.TELEGRAM_BOT_USERNAME !== me.result.username
  ) {
    console.log(
      `⚠️  TELEGRAM_BOT_USERNAME secret ("${process.env.TELEGRAM_BOT_USERNAME}") does not ` +
        `match the token's actual bot ("${me.result.username}"). Deep links built from ` +
        "the wrong username would open the wrong bot chat entirely.",
    );
  }

  console.log("\n=== 3) Webhook status (getWebhookInfo) — Telegram's own record ===");
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoRes.json();
  if (!info.ok) {
    console.error(info);
    fail("getWebhookInfo failed.");
  }
  const w = info.result;
  console.log(`   url                  = ${w.url || "(EMPTY — no webhook registered at all!)"}`);
  console.log(`   pending_update_count = ${w.pending_update_count}`);
  console.log(`   has_custom_certificate = ${w.has_custom_certificate}`);
  console.log(`   allowed_updates      = ${JSON.stringify(w.allowed_updates ?? [])}`);
  if (w.ip_address) console.log(`   ip_address           = ${w.ip_address}`);

  if (!w.url) {
    fail(
      "Telegram has NO webhook registered for this bot right now. Nothing you do in " +
        "Telegram (my_chat_member, /start, anything) will ever reach your server until " +
        "this is set. Restart your server with PUBLIC_APP_URL and TELEGRAM_WEBHOOK_SECRET " +
        "correctly set so ensureTelegramWebhook() can run.",
    );
  }

  if (publicUrl && !w.url.startsWith(publicUrl)) {
    console.log(
      `⚠️  Registered webhook URL does not start with your current PUBLIC_APP_URL.\n` +
        `   Registered: ${w.url}\n` +
        `   Expected:   ${publicUrl}/api/telegram/webhook\n` +
        `   This usually means the app was last started with a different/older ` +
        `PUBLIC_APP_URL (e.g. a previous deployment URL) and Telegram is still trying ` +
        `to deliver there.`,
    );
  } else {
    ok("Registered webhook URL matches PUBLIC_APP_URL.");
  }

  if (w.last_error_message) {
    console.log(
      `\n❌ Telegram's last delivery attempt FAILED:\n` +
        `   last_error_date    = ${new Date(w.last_error_date * 1000).toISOString()}\n` +
        `   last_error_message = ${w.last_error_message}\n`,
    );
    console.log(
      "This message comes straight from Telegram and is usually the most direct " +
        "explanation (e.g. wrong secret token, TLS/certificate problem, connection " +
        "refused, timeout, wrong status code returned).",
    );
  } else {
    ok("No delivery errors recorded by Telegram since the webhook was last set.");
  }

  if (w.pending_update_count > 0) {
    console.log(
      `\n⚠️  ${w.pending_update_count} update(s) are queued and not yet delivered. ` +
        "If this number keeps growing, your server isn't returning 200 fast enough " +
        "or isn't reachable.",
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\n--- UNEXPECTED SCRIPT ERROR ---");
  console.error(err);
  process.exit(1);
});
