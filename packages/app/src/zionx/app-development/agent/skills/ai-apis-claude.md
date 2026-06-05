---
name: ai-apis-claude
description: Load when the generated app integrates Claude (chat, summarization, agent features). Server-only keys, streaming, prompt caching, error handling.
---

# Integrating Claude in a generated app

If the user asks for an AI feature (chat, summarize, suggest, generate text),
the call MUST go through a server endpoint. The Anthropic API key NEVER ships
to the device.

## Architecture

```
device  →  POST /api/<app>/chat  →  shaar handler  →  Anthropic API
device  ←  SSE stream of tokens  ←  shaar handler  ←  Anthropic API
```

The shaar server (this monorepo's backend) reads `seraphim/anthropic` from
AWS Secrets Manager, NOT a client-side env var.

## Server handler (in shaar)

```ts
// packages/services/src/shaar/handlers/<app>-chat.ts
import Anthropic from '@anthropic-ai/sdk';

export async function handleChat(req, res) {
  const apiKey = await secrets.get('seraphim/anthropic');
  const client = new Anthropic({ apiKey });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },  // PROMPT CACHE
    ],
    messages: req.body.messages,
  });

  stream.on('text', (text) => {
    res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
  });
  await stream.finalMessage();
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}
```

**Prompt caching is on**: the `cache_control` block on the system prompt
slashes input cost by ~90% on subsequent calls. Always cache the static
system prompt.

## Client-side streaming consumer (token batching)

```tsx
// In the generated app
import { useState } from 'react';

const [text, setText] = useState('');

async function send(prompt: string) {
  setText('');
  const res = await fetch('/api/<app>/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingText = '';
  let raf = 0;

  // Token batching: accumulate over a frame, flush via RAF.
  const flush = () => {
    setText((t) => t + pendingText);
    pendingText = '';
    raf = 0;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const evt = JSON.parse(line.slice(6));
      if (evt.type === 'text') {
        pendingText += evt.text;
        if (!raf) raf = requestAnimationFrame(flush);
      }
    }
  }
  if (pendingText) flush();
}
```

**Why batching matters**: re-rendering on every token freezes the UI.
Accumulating into one RAF flush keeps animation/scroll at 60fps.

## Errors users actually see

Generic `try { } catch { alert('error') }` is forbidden. Designed states:

| Error | UI |
|---|---|
| Network offline | Cached chat history + "You're offline" pill at top, retry button |
| API rate limit | "Slow down a sec" empty state with a 5s countdown auto-retry |
| Invalid auth | Sign-in screen, NOT a generic error |
| Model unavailable | "We're having trouble — try again in a moment" with retry |

Show errors inline in the chat as a subtle gray bubble, never a system
`Alert.alert`.

## Abort / interrupt

The user must be able to stop a streaming response. Pass an `AbortSignal`
to `fetch`, surface a "Stop" button while a response is streaming. Cancel
on unmount.

## Don't ship without

- [ ] API key resolved from `seraphim/anthropic` server-side ONLY.
- [ ] System prompt marked `cache_control: { type: 'ephemeral' }`.
- [ ] Token batching via `requestAnimationFrame` (or React Native equivalent).
- [ ] Designed offline / rate-limit / auth-error states.
- [ ] Stop / abort wired and visible during a stream.
- [ ] No `console.log` of API responses (PII risk).
