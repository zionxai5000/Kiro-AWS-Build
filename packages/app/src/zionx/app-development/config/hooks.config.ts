/**
 * Master hook configuration — kill switches for all App Development pipeline hooks.
 *
 * Rules:
 * - If globalKillSwitch === true, NO hook fires regardless of individual settings.
 * - Each hook has enabled (on/off) and dryRun (log-only vs live).
 * - All hooks ship with dryRun: true initially per steering doc Section 0.
 * - The pipeline degrades gracefully when hooks are disabled.
 */

import type { HookConfig } from '../types/index.js';

export interface HooksConfigMap {
  globalKillSwitch: boolean;
  hooks: Record<string, HookConfig>;
}

export const HOOKS_CONFIG: HooksConfigMap = {
  globalKillSwitch: false,
  hooks: {
    'prompt-sanitizer':     { enabled: true, dryRun: true },
    'code-generator':       { enabled: true, dryRun: true },
    'dependency-validator': { enabled: true, dryRun: true },
    'secret-scanner':       { enabled: true, dryRun: true },
    'preview-refresher':    { enabled: true, dryRun: true },
    'build-preparer':       { enabled: true, dryRun: true },
    'asset-generator':      { enabled: true, dryRun: true },
    'store-listing-writer': { enabled: true, dryRun: true },
    'submission-prep':      { enabled: true, dryRun: true },
    'crash-watcher':        { enabled: true, dryRun: true },
  },
};

/**
 * Check if a specific hook is allowed to fire.
 * Returns false if global kill switch is on OR the hook is individually disabled.
 */
export function isHookEnabled(hookId: string): boolean {
  if (HOOKS_CONFIG.globalKillSwitch) return false;
  const hook = HOOKS_CONFIG.hooks[hookId];
  if (!hook) return false;
  return hook.enabled;
}

/**
 * Check if a hook is in dry-run mode.
 * In dry-run, the hook logs what it would do but takes no real action.
 */
export function isHookDryRun(hookId: string): boolean {
  const hook = HOOKS_CONFIG.hooks[hookId];
  if (!hook) return true; // unknown hooks default to dry-run
  return hook.dryRun;
}
