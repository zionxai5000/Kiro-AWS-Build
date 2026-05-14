import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runEasCommand, parseLastJsonLine } from '../eas-cli-wrapper.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// Mock child_process.spawn
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

function createMockProcess(exitCode = 0, stdout = '', stderr = '') {
  const proc = new EventEmitter() as any;
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.kill = vi.fn();

  // Schedule output and close
  setTimeout(() => {
    if (stdout) proc.stdout.push(Buffer.from(stdout));
    proc.stdout.push(null);
    if (stderr) proc.stderr.push(Buffer.from(stderr));
    proc.stderr.push(null);
    proc.emit('close', exitCode);
  }, 10);

  return proc;
}

// ---------------------------------------------------------------------------
// Tests: parseLastJsonLine
// ---------------------------------------------------------------------------

describe('parseLastJsonLine', () => {
  it('parses JSON from a single-line output', () => {
    const result = parseLastJsonLine('{"buildId":"abc-123","status":"queued"}');
    expect(result).toEqual({ buildId: 'abc-123', status: 'queued' });
  });

  it('extracts JSON from output with progress lines before it', () => {
    const output = [
      '⠋ Compressing project files...',
      '⠙ Uploading to EAS...',
      '✓ Build submitted',
      '{"buildId":"def-456","status":"queued","platform":"ios"}',
    ].join('\n');

    const result = parseLastJsonLine(output);
    expect(result).toEqual({ buildId: 'def-456', status: 'queued', platform: 'ios' });
  });

  it('handles Windows line endings (\\r\\n)', () => {
    const output = 'progress...\r\n{"id":"win-build"}\r\n';
    const result = parseLastJsonLine(output);
    expect(result).toEqual({ id: 'win-build' });
  });

  it('returns null for empty output', () => {
    expect(parseLastJsonLine('')).toBeNull();
    expect(parseLastJsonLine('   ')).toBeNull();
  });

  it('returns null for output with no JSON', () => {
    expect(parseLastJsonLine('Build complete!\nDone.')).toBeNull();
  });

  it('parses JSON array output', () => {
    const output = 'listing builds...\n[{"id":"b1"},{"id":"b2"}]';
    const result = parseLastJsonLine(output);
    expect(result).toEqual([{ id: 'b1' }, { id: 'b2' }]);
  });

  it('skips invalid JSON lines and finds the valid one', () => {
    const output = '{invalid json\n{"valid":"json"}';
    const result = parseLastJsonLine(output);
    expect(result).toEqual({ valid: 'json' });
  });

  it('parses multi-line JSON (entire stdout is one JSON object)', () => {
    const output = '{\n  "buildId": "multi",\n  "status": "done"\n}';
    const result = parseLastJsonLine(output);
    expect(result).toEqual({ buildId: 'multi', status: 'done' });
  });
});

// ---------------------------------------------------------------------------
// Tests: runEasCommand
// ---------------------------------------------------------------------------

describe('runEasCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns npx eas with correct arguments', async () => {
    mockSpawn.mockReturnValue(createMockProcess(0, '{"ok":true}'));

    await runEasCommand(['build', '--platform', 'ios', '--json'], {
      cwd: '/project',
      expoToken: 'test-token',
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [binary, args, opts] = mockSpawn.mock.calls[0]!;
    expect(args).toEqual(['eas', 'build', '--platform', 'ios', '--json']);
    expect(opts.cwd).toBe('/project');
    expect(opts.shell).toBe(false);
  });

  it('sets EXPO_TOKEN in child env only', async () => {
    mockSpawn.mockReturnValue(createMockProcess(0, '{}'));

    await runEasCommand(['whoami'], {
      cwd: '/project',
      expoToken: 'secret-expo-token',
    });

    const opts = mockSpawn.mock.calls[0]![2];
    expect(opts.env.EXPO_TOKEN).toBe('secret-expo-token');
    expect(opts.env.CI).toBe('1');
    // process.env should NOT have EXPO_TOKEN
    expect(process.env.EXPO_TOKEN).toBeUndefined();
  });

  it('returns parsed JSON from stdout', async () => {
    mockSpawn.mockReturnValue(createMockProcess(0, '{"buildId":"xyz"}'));

    const result = await runEasCommand(['build:view', 'xyz', '--json'], {
      cwd: '/project',
      expoToken: 'token',
    });

    expect(result.exitCode).toBe(0);
    expect(result.parsedJson).toEqual({ buildId: 'xyz' });
  });

  it('throws on non-zero exit code', async () => {
    mockSpawn.mockReturnValue(createMockProcess(1, '', 'Error: not authenticated'));

    await expect(
      runEasCommand(['build'], { cwd: '/project', expoToken: 'bad-token' }),
    ).rejects.toThrow('EAS CLI exited with code 1');
  });

  it('throws on timeout', async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new Readable({ read() {} });
    proc.stderr = new Readable({ read() {} });
    proc.kill = vi.fn();
    // Never emits 'close' — simulates a hanging process

    mockSpawn.mockReturnValue(proc);

    await expect(
      runEasCommand(['build'], { cwd: '/project', expoToken: 'token', timeoutMs: 50 }),
    ).rejects.toThrow('timed out');

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('throws on spawn error', async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new Readable({ read() {} });
    proc.stderr = new Readable({ read() {} });
    proc.kill = vi.fn();

    mockSpawn.mockReturnValue(proc);

    const promise = runEasCommand(['build'], { cwd: '/project', expoToken: 'token' });

    // Simulate spawn error
    setTimeout(() => proc.emit('error', new Error('ENOENT: npx not found')), 10);

    await expect(promise).rejects.toThrow('Failed to spawn EAS CLI');
  });

  it('passes additional env vars to child process', async () => {
    mockSpawn.mockReturnValue(createMockProcess(0, '{}'));

    await runEasCommand(['build'], {
      cwd: '/project',
      expoToken: 'token',
      env: {
        EXPO_APPLE_APP_STORE_CONNECT_API_KEY_KEY_ID: 'ABC123',
        EXPO_APPLE_APP_STORE_CONNECT_API_KEY_ISSUER_ID: 'issuer-uuid',
      },
    });

    const opts = mockSpawn.mock.calls[0]![2];
    expect(opts.env.EXPO_APPLE_APP_STORE_CONNECT_API_KEY_KEY_ID).toBe('ABC123');
    expect(opts.env.EXPO_APPLE_APP_STORE_CONNECT_API_KEY_ISSUER_ID).toBe('issuer-uuid');
  });
});
