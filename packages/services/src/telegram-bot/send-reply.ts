/**
 * Send a reply to the King on Telegram.
 * Usage: npx tsx packages/services/src/telegram-bot/send-reply.ts "Your message here"
 */
import 'dotenv/config';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const KING_CHAT_ID = Number(process.env.KING_CHAT_ID || '7414829503');
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function main() {
  const message = process.argv.slice(2).join(' ');
  if (!message) {
    console.error('Usage: send-reply.ts "message text"');
    process.exit(1);
  }

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: KING_CHAT_ID, text: message }),
  });

  const data = await res.json() as any;
  if (data.ok) {
    console.log(`Sent to Telegram (message_id: ${data.result.message_id})`);
  } else {
    console.error('Failed:', data);
  }
}

main().catch(err => {
  console.error('Send error:', err);
  process.exit(1);
});
