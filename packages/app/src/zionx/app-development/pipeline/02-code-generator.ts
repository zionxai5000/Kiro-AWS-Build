/**
 * Pipeline Hook 02: Code Generator
 *
 * Trigger: Sanitized prompt ready for generation
 * Action: Call Claude API via LLMService, stream response, write files to workspace.
 * Failure mode: NOTIFY — show error, keep prompt for retry.
 * Timeout: 120s
 * Concurrency: 1 per projectId, 5 globally
 *
 * This hook is called by the SSE handler in api/handlers.ts which manages
 * the streaming response. The hook itself orchestrates the LLM call and
 * workspace writes.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { LLMService, type StreamCallbacks } from '../services/llm-service.js';
import { Workspace } from '../workspace/workspace.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { RecentWritesRegistry } from '../events/recent-writes.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { GeneratedFile } from '../types/index.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'code-generator',
  name: 'Code Generator',
  triggerType: 'file_event',
  failureMode: 'notify',
  timeoutMs: LIMITS.codeGenerationTimeoutMs,
  maxConcurrent: 5,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface CodeGeneratorInput {
  promptId: string;
  projectId: string;
  sanitizedPrompt: string;
  credentialManager: CredentialManager;
  recentWrites?: RecentWritesRegistry;
  /** Optional callbacks for SSE streaming (passed from handler) */
  streamCallbacks?: StreamCallbacks;
}

export interface CodeGeneratorOutput {
  files: GeneratedFile[];
  tokensUsed: { input: number; output: number };
  model: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: CodeGeneratorInput,
  ctx: HookContext,
): Promise<HookResult<CodeGeneratorOutput>> {
  const start = Date.now();

  // Kill switch check
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { files: [], tokensUsed: { input: 0, output: 0 }, model: 'none', durationMs: 0 },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  // Dry-run path
  if (dryRun) {
    ctx.log(
      `[${HOOK_METADATA.id}] DRY RUN — would generate code for project "${input.projectId}" ` +
      `from prompt (${input.sanitizedPrompt.length} chars)`
    );
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { files: [], tokensUsed: { input: 0, output: 0 }, model: 'claude-sonnet-4-20250514', durationMs: 0 },
      durationMs: Date.now() - start,
    };
  }

  // Circuit breaker check
  const circuitBreaker = getCircuitBreaker(HOOK_METADATA.id);
  circuitBreaker.allowRequest();

  ctx.log(`[${HOOK_METADATA.id}] Generating code for project "${input.projectId}"`);

  // Create LLM service
  const llmService = new LLMService({
    credentialManager: input.credentialManager,
    recentWrites: input.recentWrites,
    timeoutMs: HOOK_METADATA.timeoutMs,
  });

  // Set up workspace for file writes
  const workspace = new Workspace();
  await workspace.ensureProjectDir(input.projectId);

  // Track generated files
  const generatedFiles: GeneratedFile[] = [];

  // Build callbacks — delegate to stream callbacks if provided, plus write to workspace
  const callbacks: StreamCallbacks = {
    onToken: (text) => {
      input.streamCallbacks?.onToken(text);
    },
    onFileStart: (path) => {
      input.streamCallbacks?.onFileStart(path);
    },
    onFileEnd: async (path, content) => {
      // Write to workspace
      await workspace.writeFile(input.projectId, path, content);
      generatedFiles.push({
        path,
        content,
        language: inferLanguage(path),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      input.streamCallbacks?.onFileEnd(path, content);
    },
    onComplete: (files) => {
      input.streamCallbacks?.onComplete(files);
    },
    onError: (error) => {
      input.streamCallbacks?.onError(error);
    },
  };

  try {
    const result = await llmService.streamGeneration(input.sanitizedPrompt, callbacks);

    circuitBreaker.recordSuccess();
    ctx.log(`[${HOOK_METADATA.id}] Complete — ${result.files.length} files, ${result.tokensUsed.input + result.tokensUsed.output} tokens`);

    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      data: {
        files: generatedFiles,
        tokensUsed: result.tokensUsed,
        model: result.model,
        durationMs: result.durationMs,
      },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    circuitBreaker.recordFailure();
    ctx.log(`[${HOOK_METADATA.id}] FAILED — ${(error as Error).message}`);

    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: (error as Error).message,
      data: {
        files: generatedFiles,
        tokensUsed: { input: 0, output: 0 },
        model: 'unknown',
        durationMs: Date.now() - start,
      },
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
  };
  return map[ext] ?? 'text';
}
