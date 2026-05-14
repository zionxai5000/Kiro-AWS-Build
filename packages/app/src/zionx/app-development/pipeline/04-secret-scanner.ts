/**
 * Pipeline Hook 04: Secret Scanner
 *
 * Trigger: Save of any file in /generated/
 * Action: Scan file content for accidentally-leaked secrets in Claude's output.
 * Failure mode: HALT — quarantine file if secrets found.
 * Timeout: 5s (not applied — detectSecrets is in-memory and fast)
 * Concurrency: 10 globally
 *
 * Reuses the Phase 3 sanitizer's detector regexes via detectSecrets().
 * Skips .partial files (interrupted generation) and binary extensions.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { detectSecrets, type SanitizeWarning } from '../utils/sanitizer.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'secret-scanner',
  name: 'Secret Scanner',
  triggerType: 'file_event',
  failureMode: 'halt',
  timeoutMs: LIMITS.secretScanTimeoutMs,
  maxConcurrent: 10,
} as const;

// ---------------------------------------------------------------------------
// Binary file extensions to skip (can't contain text secrets meaningfully)
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.doc', '.docx',
  '.exe', '.dll', '.so', '.dylib',
]);

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface SecretScannerInput {
  projectId: string;
  filePath: string;
  content: string;
}

export interface SecretScannerOutput {
  clean: boolean;
  filePath: string;
  warnings: SanitizeWarning[];
  skipped: boolean;
  skipReason?: string;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: SecretScannerInput,
  ctx: HookContext,
): Promise<HookResult<SecretScannerOutput>> {
  const start = Date.now();

  // Kill switch check
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { clean: true, filePath: input.filePath, warnings: [], skipped: true, skipReason: 'hook_disabled' },
      durationMs: Date.now() - start,
    };
  }

  // Skip .partial files (interrupted generation artifacts)
  if (input.filePath.endsWith('.partial')) {
    ctx.log(`[${HOOK_METADATA.id}] Skipping .partial file: ${input.filePath}`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { clean: true, filePath: input.filePath, warnings: [], skipped: true, skipReason: 'partial_file' },
      durationMs: Date.now() - start,
    };
  }

  // Skip binary file extensions
  const ext = getExtension(input.filePath);
  if (ext && BINARY_EXTENSIONS.has(ext)) {
    ctx.log(`[${HOOK_METADATA.id}] Skipping binary file: ${input.filePath}`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { clean: true, filePath: input.filePath, warnings: [], skipped: true, skipReason: 'binary_extension' },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  // Dry-run path
  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would scan "${input.filePath}" (${input.content.length} chars) in project "${input.projectId}"`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { clean: true, filePath: input.filePath, warnings: [], skipped: false },
      durationMs: Date.now() - start,
    };
  }

  // Circuit breaker
  const cb = getCircuitBreaker(HOOK_METADATA.id);
  cb.allowRequest();

  ctx.log(`[${HOOK_METADATA.id}] Scanning "${input.filePath}" (${input.content.length} chars)`);

  // Run detection
  const warnings = detectSecrets(input.content);

  if (warnings.length === 0) {
    cb.recordSuccess();
    ctx.log(`[${HOOK_METADATA.id}] CLEAN — no secrets in "${input.filePath}"`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      data: { clean: true, filePath: input.filePath, warnings: [], skipped: false },
      durationMs: Date.now() - start,
    };
  }

  // Check severity levels
  const haltWarnings = warnings.filter(w => w.severity === 'halt');
  const warnWarnings = warnings.filter(w => w.severity === 'warn');

  if (haltWarnings.length > 0) {
    cb.recordSuccess(); // Detection worked correctly — not a hook failure
    const types = haltWarnings.map(w => w.type).join(', ');
    ctx.log(`[${HOOK_METADATA.id}] HALT — ${haltWarnings.length} secret(s) in "${input.filePath}": ${types}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: `Secret(s) detected in ${input.filePath}: ${types}`,
      data: { clean: false, filePath: input.filePath, warnings, skipped: false },
      durationMs: Date.now() - start,
    };
  }

  // Warn-only — pass with logged warnings
  cb.recordSuccess();
  ctx.log(`[${HOOK_METADATA.id}] WARN — ${warnWarnings.length} warn-severity item(s) in "${input.filePath}" (non-blocking)`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: { clean: true, filePath: input.filePath, warnings, skipped: false },
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(filePath: string): string | null {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) return null;
  return filePath.slice(lastDot).toLowerCase();
}
