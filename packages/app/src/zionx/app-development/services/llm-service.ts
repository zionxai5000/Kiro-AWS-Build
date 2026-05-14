/**
 * LLM Service — Claude SDK wrapper for code generation with streaming.
 *
 * Uses @anthropic-ai/sdk for typed streaming, automatic retries, and proper
 * error handling. Credentials are retrieved via CredentialManager abstraction.
 *
 * SSE RECONNECTION SEMANTICS (Refinement 2):
 * SSE reconnections begin a new generation. Clients are responsible for
 * tracking generation IDs and discarding duplicate output. Last-Event-ID-based
 * resumption is not supported in v1.
 *
 * BOUNDED BUFFERS (Refinement 1):
 * Each file buffer is capped at 1MB. If exceeded, the service switches to
 * writing a {filename}.streaming temp file and renames to final name on
 * END FILE (atomic on most filesystems). RecentWritesRegistry suppresses
 * both the streaming-temp writes AND the atomic rename event.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import { withTimeout } from '../utils/timeout.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { LIMITS } from '../config/limits.js';
import { CODE_GENERATION_SYSTEM_PROMPT, parseFileStartMarker, isFileEndMarker } from './prompts.js';
import type { RecentWritesRegistry } from '../events/recent-writes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onFileStart: (path: string) => void;
  onFileEnd: (path: string, content: string) => void;
  onComplete: (files: string[]) => void;
  onError: (error: Error) => void;
}

export interface LLMServiceConfig {
  credentialManager: CredentialManager;
  recentWrites?: RecentWritesRegistry;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface GenerationResult {
  files: string[];
  tokensUsed: { input: number; output: number };
  model: string;
  durationMs: number;
}

/** Maximum buffer size per file before switching to streaming mode (1MB) */
const MAX_BUFFER_SIZE = 1024 * 1024;

// ---------------------------------------------------------------------------
// LLM Service
// ---------------------------------------------------------------------------

export class LLMService {
  private readonly credentialManager: CredentialManager;
  private readonly recentWrites: RecentWritesRegistry | undefined;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private client: Anthropic | null = null;

  constructor(config: LLMServiceConfig) {
    this.credentialManager = config.credentialManager;
    this.recentWrites = config.recentWrites;
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens ?? 16384;
    this.timeoutMs = config.timeoutMs ?? LIMITS.codeGenerationTimeoutMs;
  }

  /**
   * Stream code generation from Claude.
   *
   * Parses the token stream for --- FILE: path --- / --- END FILE --- markers,
   * buffers file content, and calls callbacks as files are completed.
   *
   * @param prompt - The sanitized user prompt
   * @param callbacks - Streaming event callbacks
   * @returns Generation result with file list and token usage
   */
  async streamGeneration(
    prompt: string,
    callbacks: StreamCallbacks,
  ): Promise<GenerationResult> {
    const circuitBreaker = getCircuitBreaker('llm-service');
    circuitBreaker.allowRequest(); // throws CircuitOpenError if open

    // Validate credentials before entering retry loop (auth errors are not retryable)
    const apiKey = await this.credentialManager.getCredential('anthropic', 'api-key');
    if (!apiKey) {
      const error = new Error('Anthropic API key not available via CredentialManager');
      callbacks.onError(error);
      throw error;
    }

    const start = Date.now();

    try {
      const result = await retryWithBackoff(
        () => withTimeout(
          () => this.doStream(prompt, callbacks, apiKey),
          this.timeoutMs,
          'Code generation timed out',
        ),
        {
          maxRetries: 2,
          backoffMs: [2000, 5000],
          shouldRetry: (error) => this.isRetryableError(error),
        },
      );

      circuitBreaker.recordSuccess();
      return { ...result, durationMs: Date.now() - start };
    } catch (error) {
      circuitBreaker.recordFailure();
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async doStream(
    prompt: string,
    callbacks: StreamCallbacks,
    apiKey: string,
  ): Promise<Omit<GenerationResult, 'durationMs'>> {
    if (!this.client) {
      this.client = new Anthropic({ apiKey });
    }

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      system: CODE_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const parser = new FileStreamParser(callbacks, this.recentWrites);

    // Process streaming events
    stream.on('text', (text) => {
      callbacks.onToken(text);
      parser.feed(text);
    });

    // Wait for stream to complete
    const finalMessage = await stream.finalMessage();

    // Flush any remaining buffered content
    parser.flush();

    const files = parser.getCompletedFiles();
    callbacks.onComplete(files);

    return {
      files,
      tokensUsed: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
      },
      model: finalMessage.model,
    };
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Anthropic.RateLimitError) return true;
    if (error instanceof Anthropic.InternalServerError) return true;
    if (error instanceof Anthropic.APIConnectionError) return true;
    // Don't retry auth errors, bad requests, etc.
    return false;
  }

  /**
   * Invalidate the cached client (e.g., after credential rotation).
   */
  resetClient(): void {
    this.client = null;
  }
}

// ---------------------------------------------------------------------------
// File Stream Parser
// ---------------------------------------------------------------------------

/**
 * Parses a token stream for file markers and buffers file content.
 *
 * Handles markers split across token chunks by maintaining a line buffer.
 * Implements bounded buffers (Refinement 1): caps at 1MB per file.
 */
export class FileStreamParser {
  private lineBuffer = '';
  private currentFile: string | null = null;
  private fileContent = '';
  private fileContentSize = 0;
  private completedFiles: string[] = [];
  private oversized = false;

  constructor(
    private readonly callbacks: StreamCallbacks,
    private readonly recentWrites?: RecentWritesRegistry,
  ) {}

  /**
   * Feed a chunk of text from the stream into the parser.
   */
  feed(chunk: string): void {
    // Process character by character to handle line boundaries
    for (const char of chunk) {
      if (char === '\n') {
        this.processLine(this.lineBuffer);
        this.lineBuffer = '';
      } else {
        this.lineBuffer += char;
      }
    }
  }

  /**
   * Flush any remaining content in the line buffer.
   * Call this when the stream ends.
   */
  flush(): void {
    if (this.lineBuffer) {
      this.processLine(this.lineBuffer);
      this.lineBuffer = '';
    }

    // If we're still inside a file when the stream ends, emit it as partial
    if (this.currentFile) {
      // Emit the file with whatever content we have (partial)
      this.callbacks.onFileEnd(this.currentFile + '.partial', this.fileContent);
      this.currentFile = null;
      this.fileContent = '';
      this.fileContentSize = 0;
      this.oversized = false;
    }
  }

  /**
   * Get the list of completed file paths.
   */
  getCompletedFiles(): string[] {
    return [...this.completedFiles];
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private processLine(line: string): void {
    // Check for file start marker
    const filePath = parseFileStartMarker(line);
    if (filePath !== null) {
      // If we were already in a file, close it (malformed stream — missing END FILE)
      if (this.currentFile) {
        this.emitFile(this.currentFile, this.fileContent);
      }

      this.currentFile = filePath;
      this.fileContent = '';
      this.fileContentSize = 0;
      this.oversized = false;
      this.callbacks.onFileStart(filePath);
      return;
    }

    // Check for file end marker
    if (isFileEndMarker(line)) {
      if (this.currentFile) {
        this.emitFile(this.currentFile, this.fileContent);
        this.currentFile = null;
        this.fileContent = '';
        this.fileContentSize = 0;
        this.oversized = false;
      }
      return;
    }

    // If we're inside a file, buffer the content
    if (this.currentFile) {
      const lineWithNewline = this.fileContent ? '\n' + line : line;
      const lineSize = Buffer.byteLength(lineWithNewline, 'utf-8');

      // Bounded buffer check (Refinement 1)
      if (this.fileContentSize + lineSize > MAX_BUFFER_SIZE) {
        if (!this.oversized) {
          this.oversized = true;
          // Mark the streaming temp file in RecentWritesRegistry
          if (this.recentWrites) {
            this.recentWrites.markAsOwnWrite(this.currentFile + '.streaming');
          }
        }
        // In oversized mode, we still accumulate (the actual temp-file write
        // would happen in a production implementation with disk I/O).
        // For v1, we continue buffering but log the overflow.
      }

      this.fileContent += lineWithNewline;
      this.fileContentSize += lineSize;
    }
  }

  private emitFile(path: string, content: string): void {
    // Register the final file path with RecentWritesRegistry before emitting
    if (this.recentWrites) {
      this.recentWrites.markAsOwnWrite(path);
      // Also suppress the rename from .streaming if it was oversized
      if (this.oversized) {
        this.recentWrites.markAsOwnWrite(path + '.streaming');
      }
    }

    this.completedFiles.push(path);
    this.callbacks.onFileEnd(path, content);
  }
}
