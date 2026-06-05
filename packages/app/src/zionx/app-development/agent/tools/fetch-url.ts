/**
 * Fetch-url tool — the agent occasionally needs to look up framework docs
 * (Expo, React Native, Anthropic). We allowlist a small set of trusted
 * hosts. Anything else is rejected.
 */

import type { Tool, ToolResult } from '../types.js';

const ALLOWED_HOSTS: readonly string[] = [
  'docs.expo.dev',
  'reactnative.dev',
  'react.dev',
  'docs.anthropic.com',
  'docs.npmjs.com',
  'developer.apple.com',
  'developer.android.com',
  'github.com',
  'raw.githubusercontent.com',
] as const;

const MAX_RESPONSE_BYTES = 200_000; // 200KB cap

interface Input { url: string; }

export const fetchUrlTool: Tool<Input, { status: number; body: string }> = {
  name: 'fetch_url',
  description:
    'Fetch a documentation URL from an allowlisted host (' +
    ALLOWED_HOSTS.join(', ') +
    '). Returns up to 200KB of text. Use sparingly — this is for filling specific knowledge gaps, not browsing.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute https URL on an allowlisted host.' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  async run({ url }, _ctx): Promise<ToolResult<{ status: number; body: string }>> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { content: `fetch_url: invalid URL "${url}"`, isError: true };
    }
    if (parsed.protocol !== 'https:') {
      return { content: `fetch_url: only https is allowed (got ${parsed.protocol})`, isError: true };
    }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return {
        content: `fetch_url: host "${parsed.hostname}" not allowlisted. Allowed: ${ALLOWED_HOSTS.join(', ')}`,
        isError: true,
      };
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'zionx-agent-harness/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      return { content: `fetch_url: ${(err as Error).message}`, isError: true };
    }

    let body: string;
    try {
      const buf = await res.arrayBuffer();
      const truncated = buf.byteLength > MAX_RESPONSE_BYTES;
      body = new TextDecoder().decode(truncated ? buf.slice(0, MAX_RESPONSE_BYTES) : buf);
      if (truncated) body += `\n\n[truncated to ${MAX_RESPONSE_BYTES} bytes]`;
    } catch (err) {
      return { content: `fetch_url: failed to read body — ${(err as Error).message}`, isError: true };
    }

    return {
      content: `HTTP ${res.status} ${parsed.href}\n\n${body}`,
      data: { status: res.status, body },
      isError: !res.ok,
    };
  },
};
