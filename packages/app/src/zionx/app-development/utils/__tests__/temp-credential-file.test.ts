import { describe, it, expect } from 'vitest';
import { writeTempCredentialFile, cleanupTempCredentialFile, withTempCredentialFile } from '../temp-credential-file.js';
import { existsSync, readFileSync, statSync } from 'node:fs';

describe('temp-credential-file', () => {
  describe('writeTempCredentialFile + cleanupTempCredentialFile', () => {
    it('creates a file with the given content', () => {
      const result = writeTempCredentialFile('-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----');
      try {
        expect(existsSync(result.path)).toBe(true);
        const content = readFileSync(result.path, 'utf-8');
        expect(content).toBe('-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----');
      } finally {
        cleanupTempCredentialFile(result);
      }
    });

    it('creates file in a unique directory', () => {
      const r1 = writeTempCredentialFile('content1');
      const r2 = writeTempCredentialFile('content2');
      try {
        expect(r1.dir).not.toBe(r2.dir);
        expect(r1.path).not.toBe(r2.path);
      } finally {
        cleanupTempCredentialFile(r1);
        cleanupTempCredentialFile(r2);
      }
    });

    it('cleanup removes the file and directory', () => {
      const result = writeTempCredentialFile('secret');
      expect(existsSync(result.path)).toBe(true);
      expect(existsSync(result.dir)).toBe(true);

      cleanupTempCredentialFile(result);

      expect(existsSync(result.path)).toBe(false);
      expect(existsSync(result.dir)).toBe(false);
    });

    it('cleanup does not throw if file already deleted', () => {
      const result = writeTempCredentialFile('secret');
      cleanupTempCredentialFile(result); // first cleanup
      expect(() => cleanupTempCredentialFile(result)).not.toThrow(); // second cleanup — no error
    });

    it('uses custom filename when provided', () => {
      const result = writeTempCredentialFile('key-content', 'AuthKey_ABC123.p8');
      try {
        expect(result.path).toContain('AuthKey_ABC123.p8');
      } finally {
        cleanupTempCredentialFile(result);
      }
    });

    it('sets restrictive file permissions (Unix)', () => {
      const result = writeTempCredentialFile('secret');
      try {
        if (process.platform !== 'win32') {
          const stat = statSync(result.path);
          const mode = stat.mode & 0o777;
          expect(mode).toBe(0o600);
        }
      } finally {
        cleanupTempCredentialFile(result);
      }
    });
  });

  describe('withTempCredentialFile', () => {
    it('provides file path to function and cleans up after', async () => {
      let capturedPath = '';

      await withTempCredentialFile('test-content', async (path) => {
        capturedPath = path;
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, 'utf-8')).toBe('test-content');
      });

      // After withTempCredentialFile returns, file should be cleaned up
      expect(existsSync(capturedPath)).toBe(false);
    });

    it('returns the function return value', async () => {
      const result = await withTempCredentialFile('key', async () => {
        return 'build-success';
      });
      expect(result).toBe('build-success');
    });

    it('cleans up even if function throws', async () => {
      let capturedPath = '';

      await expect(
        withTempCredentialFile('secret', async (path) => {
          capturedPath = path;
          throw new Error('build failed');
        }),
      ).rejects.toThrow('build failed');

      // File must be cleaned up despite the error
      expect(existsSync(capturedPath)).toBe(false);
    });

    it('propagates the thrown error without wrapping', async () => {
      const originalError = new Error('specific failure');
      try {
        await withTempCredentialFile('x', async () => { throw originalError; });
      } catch (err) {
        expect(err).toBe(originalError);
      }
    });
  });
});
