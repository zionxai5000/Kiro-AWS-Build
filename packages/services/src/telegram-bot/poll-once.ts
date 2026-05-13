/**
 * Poll Telegram once for new messages and output them.
 * Used by the Kiro hook to inject Telegram messages into the conversation.
 */
import 'dotenv/config';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const OFFSET_FILE = 'packages/services/src/telegram-bot/.last-offset';

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

async function main() {
  let offset = 0;
  if (existsSync(OFFSET_FILE)) {
    offset = parseInt(readFileSync(OFFSET_FILE, 'utf-8').trim(), 10) || 0;
  }

  const res = await fetch(`${TELEGRAM_API}/getUpdates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset, timeout: 0, allowed_updates: ['message'] }),
  });

  const data = await res.json() as any;
  if (!data.ok || !data.result?.length) {
    console.log('No new Telegram messages.');
    return;
  }

  for (const update of data.result) {
    offset = update.update_id + 1;
    if (update.message?.text) {
      const from = update.message.from;
      const name = from.first_name + (from.last_name ? ` ${from.last_name}` : '');
      console.log(`[TELEGRAM from ${name} (@${from.username})]: ${update.message.text}`);
    }
  }

  writeFileSync(OFFSET_FILE, String(offset));
}

main().catch(err => {
  console.error('Poll error:', err);
  process.exit(1);
});
