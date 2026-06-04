import { describe, it, expect, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../15-onboarding-auditor.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import type { HookContext } from '../types.js';

function ctx(): HookContext {
  return { executionId: 't', projectId: 'p', log: () => {}, metric: () => {}, dryRun: false } as unknown as HookContext;
}

const ONBOARDING_FILE = `
import { useEffect } from 'react';
export default function OnboardingFlow() {
  return null;
}
`;

const ROOT_LAYOUT = `
import { Stack, useRouter } from 'expo-router';
import { useStore } from '../store/app-store';
export default function RootLayout() {
  const router = useRouter();
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);
  useEffect(() => {
    if (!hasCompletedOnboarding) {
      router.replace('/onboarding');
    }
  }, [hasCompletedOnboarding]);
  return <Stack />;
}
function Skip() { return <Pressable>Skip</Pressable>; }
`;

describe('Hook 15: Onboarding Auditor', () => {
  beforeEach(() => {
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['onboarding-auditor'] = { enabled: true, dryRun: false };
  });

  it('passes a project with full onboarding wiring', async () => {
    const r = await run({
      projectId: 'p',
      files: {
        'src/onboarding/OnboardingFlow.tsx': ONBOARDING_FILE,
        'app/_layout.tsx': ROOT_LAYOUT,
      },
    }, ctx());
    expect(r.data!.score.passed).toBe(true);
    expect(r.data!.score.total).toBe(100);
  });

  it('fails when no onboarding component exists', async () => {
    const r = await run({
      projectId: 'p',
      files: { 'app/_layout.tsx': ROOT_LAYOUT },
    }, ctx());
    expect(r.data!.score.passed).toBe(false);
    expect(r.data!.score.failedChecks.find((c) => c.id === 'onboarding-component')).toBeDefined();
  });

  it('fails when no hasCompletedOnboarding flag is declared', async () => {
    const r = await run({
      projectId: 'p',
      files: { 'src/onboarding/OnboardingFlow.tsx': ONBOARDING_FILE },
    }, ctx());
    expect(r.data!.score.passed).toBe(false);
    expect(r.data!.score.failedChecks.find((c) => c.id === 'onboarding-flag')).toBeDefined();
  });

  it('has correct metadata', () => {
    expect(HOOK_METADATA.id).toBe('onboarding-auditor');
  });
});
