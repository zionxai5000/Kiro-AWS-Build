import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMService, FileStreamParser, type StreamCallbacks } from '../llm-service.js';
import { RecentWritesRegistry } from '../../events/recent-writes.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK
// ---------------------------------------------------------------------------

const mockStream = {
  on: vi.fn(),
  finalMessage: vi.fn(),
};

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn(() => mockStream),
      };
      constructor(public config: { apiKey: string }) {}

      // Error classes for retry logic
      static RateLimitError = class extends Error { constructor() { super('rate limit'); } };
      static InternalServerError = class extends Error { constructor() { super('internal'); } };
      static APIConnectionError = class extends Error { constructor() { super('connection'); } };
      static AuthenticationError = class extends Error { constructor() { super('auth'); } };
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCredentialManager(apiKey = 'test-api-key'): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue(apiKey),
    rotateCredential: vi.fn().mockResolvedValue({ success: true, driverName: 'anthropic' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

function createMockCallbacks(): StreamCallbacks & { tokens: string[]; files: Array<{ path: string; content: string }>; completed: string[] | null; error: Error | null } {
  const result = {
    tokens: [] as string[],
    files: [] as Array<{ path: string; content: string }>,
    completed: null as string[] | null,
    error: null as Error | null,
    onToken: (text: string) => { result.tokens.push(text); },
    onFileStart: vi.fn(),
    onFileEnd: (path: string, content: string) => { result.files.push({ path, content }); },
    onComplete: (files: string[]) => { result.completed = files; },
    onError: (error: Error) => { result.error = error; },
  };

  return result;
}

/**
 * Simulate a streaming response by calling the 'text' handler with chunks.
 */
function simulateStream(chunks: string[], finalUsage = { input_tokens: 100, output_tokens: 200 }) {
  let textHandler: ((text: string) => void) | null = null;

  mockStream.on.mockImplementation((event: string, handler: (text: string) => void) => {
    if (event === 'text') textHandler = handler;
    return mockStream; // chaining
  });

  mockStream.finalMessage.mockImplementation(async () => {
    // Fire all chunks through the text handler (simulates streaming)
    for (const chunk of chunks) {
      if (textHandler) textHandler(chunk);
    }
    return {
      usage: finalUsage,
      model: 'claude-sonnet-4-20250514',
    };
  });
}

// ---------------------------------------------------------------------------
// Tests: LLMService
// ---------------------------------------------------------------------------

describe('LLMService', () => {
  let credentialManager: CredentialManager;

  beforeEach(() => {
    vi.clearAllMocks();
    credentialManager = createMockCredentialManager();
  });

  it('calls credentialManager.getCredential, not process.env', async () => {
    simulateStream(['Hello world']);
    const service = new LLMService({ credentialManager, timeoutMs: 5000 });
    const callbacks = createMockCallbacks();

    await service.streamGeneration('test prompt', callbacks);

    expect(credentialManager.getCredential).toHaveBeenCalledWith('anthropic', 'api-key');
  });

  it('throws if credential manager returns empty key', async () => {
    const emptyCredManager = createMockCredentialManager('');
    const service = new LLMService({ credentialManager: emptyCredManager, timeoutMs: 5000 });
    const callbacks = createMockCallbacks();

    await expect(service.streamGeneration('test', callbacks)).rejects.toThrow('API key not available');
  });

  it('calls onComplete with file list after stream ends', async () => {
    simulateStream([
      '--- FILE: app.json ---\n',
      '{"name":"test"}\n',
      '--- END FILE ---\n',
    ]);

    const service = new LLMService({ credentialManager, timeoutMs: 5000 });
    const callbacks = createMockCallbacks();

    await service.streamGeneration('build an app', callbacks);

    expect(callbacks.completed).toEqual(['app.json']);
  });

  it('returns token usage from final message', async () => {
    simulateStream(['hello'], { input_tokens: 50, output_tokens: 100 });

    const service = new LLMService({ credentialManager, timeoutMs: 5000 });
    const callbacks = createMockCallbacks();

    const result = await service.streamGeneration('test', callbacks);

    expect(result.tokensUsed).toEqual({ input: 50, output: 100 });
    expect(result.model).toBe('claude-sonnet-4-20250514');
  });
});

// ---------------------------------------------------------------------------
// Tests: FileStreamParser
// ---------------------------------------------------------------------------

describe('FileStreamParser', () => {
  let callbacks: ReturnType<typeof createMockCallbacks>;
  let recentWrites: RecentWritesRegistry;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    recentWrites = new RecentWritesRegistry({ ttlMs: 2000 });
  });

  it('parses a complete file from a single chunk', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: app.json ---\n{"expo":{}}\n--- END FILE ---\n');
    parser.flush();

    expect(callbacks.files).toHaveLength(1);
    expect(callbacks.files[0]!.path).toBe('app.json');
    expect(callbacks.files[0]!.content).toBe('{"expo":{}}');
  });

  it('parses multiple files', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: a.ts ---\nconst a = 1;\n--- END FILE ---\n--- FILE: b.ts ---\nconst b = 2;\n--- END FILE ---\n');
    parser.flush();

    expect(callbacks.files).toHaveLength(2);
    expect(callbacks.files[0]!.path).toBe('a.ts');
    expect(callbacks.files[1]!.path).toBe('b.ts');
  });

  it('handles markers split across chunks — "--- FI" + "LE: app.json ---"', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FI');
    parser.feed('LE: app.json ---\n');
    parser.feed('content\n');
    parser.feed('--- END FILE ---\n');
    parser.flush();

    expect(callbacks.files).toHaveLength(1);
    expect(callbacks.files[0]!.path).toBe('app.json');
    expect(callbacks.files[0]!.content).toBe('content');
  });

  it('handles end marker split across chunks — "--- END" + " FILE ---"', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: x.ts ---\ncode\n--- END');
    parser.feed(' FILE ---\n');
    parser.flush();

    expect(callbacks.files).toHaveLength(1);
    expect(callbacks.files[0]!.path).toBe('x.ts');
    expect(callbacks.files[0]!.content).toBe('code');
  });

  it('handles newline split from marker — "--- FILE: y.ts ---" + "\\n"', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: y.ts ---');
    parser.feed('\n');
    parser.feed('line1\nline2\n');
    parser.feed('--- END FILE ---\n');
    parser.flush();

    expect(callbacks.files).toHaveLength(1);
    expect(callbacks.files[0]!.path).toBe('y.ts');
    expect(callbacks.files[0]!.content).toBe('line1\nline2');
  });

  it('handles single-character chunks (worst case split)', () => {
    const input = '--- FILE: z.ts ---\nhi\n--- END FILE ---\n';
    const parser = new FileStreamParser(callbacks, recentWrites);
    for (const char of input) {
      parser.feed(char);
    }
    parser.flush();

    expect(callbacks.files).toHaveLength(1);
    expect(callbacks.files[0]!.path).toBe('z.ts');
    expect(callbacks.files[0]!.content).toBe('hi');
  });

  it('rejects absolute paths in file markers', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: /etc/passwd ---\nhacked\n--- END FILE ---\n');
    parser.flush();

    // Absolute path is rejected by parseFileStartMarker — content treated as non-file text
    expect(callbacks.files).toHaveLength(0);
  });

  it('rejects traversal paths in file markers', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: ../../etc/passwd ---\nhacked\n--- END FILE ---\n');
    parser.flush();

    expect(callbacks.files).toHaveLength(0);
  });

  it('registers completed files with RecentWritesRegistry', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: src/index.ts ---\nexport {}\n--- END FILE ---\n');
    parser.flush();

    expect(recentWrites.isOwnWrite('src/index.ts')).toBe(true);
  });

  it('emits partial file on flush if stream ends mid-file', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: incomplete.ts ---\npartial content');
    parser.flush();

    expect(callbacks.files).toHaveLength(1);
    expect(callbacks.files[0]!.path).toBe('incomplete.ts.partial');
    expect(callbacks.files[0]!.content).toBe('partial content');
  });

  it('handles bounded buffer — marks oversized files in RecentWritesRegistry', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: big.ts ---\n');

    // Feed content that exceeds 1MB
    const bigLine = 'x'.repeat(1024) + '\n'; // 1KB per line
    for (let i = 0; i < 1025; i++) { // 1025KB > 1MB
      parser.feed(bigLine);
    }

    parser.feed('--- END FILE ---\n');
    parser.flush();

    // File should still be emitted (content accumulated)
    expect(callbacks.files).toHaveLength(1);
    expect(callbacks.files[0]!.path).toBe('big.ts');

    // The .streaming temp path should be registered
    expect(recentWrites.isOwnWrite('big.ts.streaming')).toBe(true);
    // The final path should also be registered
    expect(recentWrites.isOwnWrite('big.ts')).toBe(true);
  });

  it('calls onFileStart for each file', () => {
    const parser = new FileStreamParser(callbacks, recentWrites);
    parser.feed('--- FILE: a.ts ---\na\n--- END FILE ---\n--- FILE: b.ts ---\nb\n--- END FILE ---\n');
    parser.flush();

    expect(callbacks.onFileStart).toHaveBeenCalledTimes(2);
    expect(callbacks.onFileStart).toHaveBeenCalledWith('a.ts');
    expect(callbacks.onFileStart).toHaveBeenCalledWith('b.ts');
  });
});
