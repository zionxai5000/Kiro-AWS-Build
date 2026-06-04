import { describe, it, expect, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../14-spec-card.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import type { HookContext } from '../types.js';

function ctx(): HookContext {
  return { executionId: 't', projectId: 'p', log: () => {}, metric: () => {}, dryRun: false } as unknown as HookContext;
}

const FULL_CARD = `<spec>
{
  "domain": "Habit tracker for daily routines",
  "userGoal": "Tap a habit to complete it today",
  "screens": ["app/(tabs)/index.tsx — Today", "app/(tabs)/history.tsx — History"],
  "stateModel": "stores/habit-store.ts: Habit { id, name, completions[] }",
  "seed": "[Drink water, Walk 10k, Read 30 min]",
  "persistence": "zustand persist + AsyncStorage with key 'habits-v1'",
  "visualAnchor": "Accent #10b981, gradient #ecfdf5 to #d1fae5, flame motif",
  "hero": "Tap habit row -> ring fills + haptic",
  "emptyState": "Flame icon, 'Start your first habit', subtitle, +Add CTA",
  "failCheck": "Confirmed all 7 final checks"
}
</spec>
import React from 'react';
// rest of code emission follows
`;

const MISSING_KEYS = `<spec>
{
  "domain": "Habit tracker",
  "userGoal": "Tap to complete"
}
</spec>`;

const INVALID_JSON = `<spec>{ "domain": "broken</spec>`;

const NO_SPEC = `import React from 'react';\nexport default function App() { return null; }\n`;

describe('Hook 14: Spec Card', () => {
  beforeEach(() => {
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['spec-card'] = { enabled: true, dryRun: false };
  });

  it('passes a complete 10-key spec card', async () => {
    const r = await run({ streamPrefix: FULL_CARD }, ctx());
    expect(r.success).toBe(true);
    expect(r.data!.found).toBe(true);
    expect(r.data!.spec!.domain).toContain('Habit');
    expect(r.data!.missingKeys.length).toBe(0);
  });

  it('reports missing keys', async () => {
    const r = await run({ streamPrefix: MISSING_KEYS }, ctx());
    expect(r.success).toBe(false);
    expect(r.data!.missingKeys).toContain('seed');
    expect(r.data!.missingKeys).toContain('persistence');
  });

  it('rejects invalid JSON', async () => {
    const r = await run({ streamPrefix: INVALID_JSON }, ctx());
    expect(r.success).toBe(false);
    expect(r.error).toBe('spec_card_invalid_json');
  });

  it('rejects when no spec block at all', async () => {
    const r = await run({ streamPrefix: NO_SPEC }, ctx());
    expect(r.success).toBe(false);
    expect(r.error).toBe('spec_card_missing');
  });

  it('accepts spec wrapped in json fence', async () => {
    const inner = `{"domain":"Habit tracker","userGoal":"Tap habit","screens":["app/index.tsx — Today"],"stateModel":"store","seed":"3 habits","persistence":"AsyncStorage","visualAnchor":"emerald","hero":"tap to fill","emptyState":"flame icon","failCheck":"all 7 passed"}`;
    const fenced = '<spec>\n```json\n' + inner + '\n```\n</spec>';
    const r = await run({ streamPrefix: fenced }, ctx());
    expect(r.data!.found).toBe(true);
  });

  it('has correct metadata', () => {
    expect(HOOK_METADATA.id).toBe('spec-card');
  });
});
