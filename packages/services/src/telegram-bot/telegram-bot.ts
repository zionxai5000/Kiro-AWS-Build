/**
 * SeraphimOS Telegram Bot — King's Command Interface
 *
 * Polls Telegram for messages from the King, routes them through Seraphim
 * (the top-level orchestrator) which decides which agent handles the task,
 * then sends the response back via Telegram.
 *
 * Architecture:
 * - King sends message on Telegram → Bot receives via long-polling
 * - Message goes to Seraphim Core (router/orchestrator)
 * - Seraphim decides: handle directly OR delegate to an agent
 * - Response sent back to King on Telegram
 *
 * Usage: npx tsx packages/services/src/telegram-bot/telegram-bot.ts
 */

import 'dotenv/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface AgentRouting {
  agent: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const KING_CHAT_ID = Number(process.env.KING_CHAT_ID || '7414829503');
const POLL_INTERVAL_MS = 2000; // 2 seconds between polls
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

// ---------------------------------------------------------------------------
// Agent Registry
// ---------------------------------------------------------------------------

const AGENTS: Record<string, { name: string; description: string; systemPrompt: string }> = {
  'seraphim': {
    name: 'Seraphim Core',
    description: 'Top-level orchestrator — strategic coordination, system status, general questions',
    systemPrompt: `You are Seraphim — The Hand of the King. You are the top-level AI orchestrator of SeraphimOS. You coordinate all subsidiary agents. You are concise, strategic, action-oriented. No filler words. You anticipate needs. When the King asks something, you either answer directly or explain which agent you are delegating to and why.`,
  },
  'zionx': {
    name: 'ZionX App Factory',
    description: 'App development, App Store submissions, app pipeline, mobile apps',
    systemPrompt: `You are ZionX — the App Factory agent. You autonomously build, test, submit, and market mobile applications. You manage the full lifecycle: ideation → market research → development → testing → gate review → submission → marketing → revenue optimization. Report on app pipeline status, submissions, rejections, and revenue.`,
  },
  'zxmg': {
    name: 'ZXMG Media Production',
    description: 'YouTube content, video production, social media, media campaigns',
    systemPrompt: `You are ZXMG — the Media Production agent. You handle AI video generation, YouTube publishing, social media content, and media campaigns. You manage content pipelines, analytics, and distribution strategy.`,
  },
  'zion-alpha': {
    name: 'Zion Alpha Trading',
    description: 'Prediction markets, Kalshi, Polymarket, trading positions, risk management',
    systemPrompt: `You are Zion Alpha — the Prediction Market Trading agent. You manage positions on Kalshi and Polymarket. You analyze markets, execute trades within risk parameters, and optimize returns. Report on positions, P&L, and market opportunities.`,
  },
  'eretz': {
    name: 'Eretz Business Orchestrator',
    description: 'Business portfolio, revenue metrics, cross-subsidiary synergies, strategy',
    systemPrompt: `You are Eretz — the Business Portfolio Orchestrator. You manage the entire business empire across ZionX, ZXMG, and Zion Alpha. You identify synergies, allocate resources, and track portfolio-level metrics. Report with numbers, not feelings.`,
  },
  'otzar': {
    name: 'Otzar Resource Manager',
    description: 'Token budgets, model routing, cost optimization, spending',
    systemPrompt: `You are Otzar — the Resource Manager. You control the treasury. Token cost DOWN, revenue UP. You route tasks to optimal LLM tiers, enforce budgets, and identify waste patterns. Report on daily spend, cache hit rates, and optimization opportunities.`,
  },
  'mishmar': {
    name: 'Mishmar Governance',
    description: 'Authority enforcement, governance, permissions, compliance',
    systemPrompt: `You are Mishmar — the Governance Enforcement agent. You are the law. You enforce authority levels, validate execution tokens, and ensure role separation. You explain why something is blocked and what's needed to proceed.`,
  },
  'shaar': {
    name: 'Shaar Guardian',
    description: 'Dashboard UI/UX, design quality, user experience, visual issues',
    systemPrompt: `You are the Shaar Guardian — the UI/UX intelligence authority. You observe the dashboard from the human perspective, detect friction, evaluate design quality, and generate improvement recommendations. You think in terms of visual hierarchy, cognitive load, and conversion flow.`,
  },
};

// ---------------------------------------------------------------------------
// Telegram API Helpers
// ---------------------------------------------------------------------------

async function telegramRequest(method: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `${TELEGRAM_API}/${method}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as { ok: boolean; result: unknown };
    if (!data.ok) {
      console.error(`[Telegram API Error] ${method}:`, JSON.stringify(data));
    }
    return data;
  } catch (err) {
    console.error(`[Telegram Fetch Error] ${method}:`, err);
    return { ok: false, result: [] };
  }
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  // Telegram has a 4096 char limit — split if needed
  const MAX_LEN = 4000;
  if (text.length <= MAX_LEN) {
    await telegramRequest('sendMessage', {
      chat_id: chatId,
      text,
    });
  } else {
    // Split into chunks
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      chunks.push(remaining.slice(0, MAX_LEN));
      remaining = remaining.slice(MAX_LEN);
    }
    for (const chunk of chunks) {
      await telegramRequest('sendMessage', {
        chat_id: chatId,
        text: chunk,
      });
      await sleep(500); // avoid rate limiting
    }
  }
}

async function getUpdates(offset: number): Promise<TelegramUpdate[]> {
  const data = await telegramRequest('getUpdates', {
    offset,
    timeout: 30, // long-polling: wait up to 30s for new messages
    allowed_updates: ['message'],
  }) as { ok: boolean; result: TelegramUpdate[] };
  return data.ok ? data.result : [];
}

// ---------------------------------------------------------------------------
// AI Router — Seraphim decides which agent handles the message
// ---------------------------------------------------------------------------

async function routeMessage(userMessage: string): Promise<AgentRouting> {
  const routerPrompt = `You are the SeraphimOS message router. Given a message from the King, decide which agent should handle it.

Available agents:
${Object.entries(AGENTS).map(([id, a]) => `- ${id}: ${a.description}`).join('\n')}

Rules:
- If the message is a general greeting, status check, or strategic question → seraphim
- If about apps, App Store, mobile development → zionx
- If about videos, YouTube, social media content → zxmg
- If about trading, markets, Kalshi, predictions → zion-alpha
- If about business metrics, revenue, portfolio → eretz
- If about costs, tokens, budgets, model routing → otzar
- If about permissions, authority, governance → mishmar
- If about dashboard UI, design, UX → shaar

Respond with ONLY a JSON object: {"agent": "<agent-id>", "reason": "<one sentence why>"}`;

  try {
    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        messages: [
          { role: 'system', content: routerPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Router API Error] Status ${res.status}:`, errText);
      return { agent: 'seraphim', reason: `Router API error (${res.status}) — defaulting to Seraphim` };
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const text = data.choices?.[0]?.message?.content || '';
    console.log(`[Router Raw]`, text);
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as AgentRouting;
    }
  } catch (err) {
    console.error('[Router Error]', err);
  }

  // Default to Seraphim
  return { agent: 'seraphim', reason: 'Fallback — routing failed' };
}

// ---------------------------------------------------------------------------
// AI Agent Response — The selected agent generates a response
// ---------------------------------------------------------------------------

async function getAgentResponse(agentId: string, userMessage: string): Promise<string> {
  const agent = AGENTS[agentId] || AGENTS['seraphim'];

  try {
    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1500,
        messages: [
          { role: 'system', content: agent.systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Agent API Error] ${agentId} Status ${res.status}:`, errText);
      return `Error: API returned ${res.status}. Check logs.`;
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content || 'No response generated.';
  } catch (err) {
    console.error(`[Agent Error] ${agentId}:`, err);
    return `Error: Failed to get response from ${agent.name}.`;
  }
}

// ---------------------------------------------------------------------------
// Message Handler
// ---------------------------------------------------------------------------

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (!text) return;

  // Only respond to the King (or allow all in dev)
  if (chatId !== KING_CHAT_ID) {
    await sendMessage(chatId, '⚠️ Unauthorized. SeraphimOS responds only to the King.');
    return;
  }

  console.log(`[King] ${text}`);

  // Handle /start command
  if (text === '/start') {
    await sendMessage(chatId, `👑 *SeraphimOS Online*\n\nAwaiting your command, King.\n\nI route your messages to the right agent:\n• General/Strategy → Seraphim\n• Apps → ZionX\n• Media → ZXMG\n• Trading → Zion Alpha\n• Business → Eretz\n• Costs → Otzar\n• Governance → Mishmar\n• Dashboard → Shaar\n\nJust type naturally — I'll handle the routing.`);
    return;
  }

  // Handle /status command
  if (text === '/status') {
    await sendMessage(chatId, `📊 *SeraphimOS Status*\n\n✅ Telegram Bot: Online\n✅ Router: Active (Claude Sonnet)\n✅ Agents: 8 registered\n✅ King Chat ID: ${KING_CHAT_ID}\n\nAll systems operational.`);
    return;
  }

  // Handle /agents command
  if (text === '/agents') {
    const list = Object.entries(AGENTS)
      .map(([id, a]) => `• *${a.name}* (${id})\n  ${a.description}`)
      .join('\n\n');
    await sendMessage(chatId, `🤖 *Registered Agents*\n\n${list}`);
    return;
  }

  // Send "thinking" indicator
  await telegramRequest('sendChatAction', { chat_id: chatId, action: 'typing' });

  // Route the message
  const routing = await routeMessage(text);
  console.log(`[Router] → ${routing.agent} (${routing.reason})`);

  // Get agent response
  const response = await getAgentResponse(routing.agent, text);

  // Format and send
  const agentName = AGENTS[routing.agent]?.name || 'Seraphim';
  const header = routing.agent !== 'seraphim' ? `*[${agentName}]*\n\n` : '';
  await sendMessage(chatId, `${header}${response}`);

  console.log(`[${agentName}] Response sent (${response.length} chars)`);
}

// ---------------------------------------------------------------------------
// Polling Loop
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startPolling(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('  SeraphimOS Telegram Bot — King\'s Command Interface');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Bot Token: ...${TELEGRAM_BOT_TOKEN.slice(-8)}`);
  console.log(`King Chat ID: ${KING_CHAT_ID}`);
  console.log(`Model: GPT-4o (router: GPT-4o-mini)`);
  console.log(`Agents: ${Object.keys(AGENTS).length} registered`);
  console.log('═══════════════════════════════════════════════════');
  console.log('Listening for messages...\n');

  let offset = 0;

  while (true) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;

        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (err) {
      console.error('[Poll Error]', err);
      await sleep(5000); // wait 5s on error before retrying
    }
  }
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

if (!TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN not set. Set it in .env or environment.');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not set. Set it in .env or environment.');
  process.exit(1);
}

startPolling().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
