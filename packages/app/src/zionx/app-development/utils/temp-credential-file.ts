/**
 * Temporary Credential File — write sensitive content to a temp file, use it, clean up.
 *
 * Used for Apple App Store Connect .p8 key files that EAS CLI needs as a file path.
 * Each call gets a unique subdirectory to avoid race conditions on concurrent invocations.
 *
 * Security:
 * - File permissions set to 600 (owner read/write only) on Unix
 * - On Windows, chmod is best-effort (POSIX semantics don't fully apply)
 * - Cleanup happens in a finally block regardless of success/failure
 * - Path uses crypto.randomUUID() for uniqueness
 */

import { mkdirSync, writeFileSync, unlinkSync, rmdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TempCredentialFileResult {
  /** Absolute path to the temp file */
  path: string;
  /** Directory containing the temp file (for cleanup) */
  dir: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Write credential content to a temporary file.
 * Returns the path. Caller is responsible for cleanup via cleanupTempCredentialFile().
 *
 * For most use cases, prefer withTempCredentialFile() which handles cleanup automatically.
 */
export function writeTempCredentialFile(content: string, filename = 'key.p8'): TempCredentialFileResult {
  const dir = join(tmpdir(), `seraphim-cred-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, filename);
  writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 });

  // Best-effort chmod (effective on Unix, limited on Windows)
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Windows may not support this — documented as best-effort
  }

  return { path: filePath, dir };
}

/**
 * Clean up a temporary credential file and its directory.
 */
export function cleanupTempCredentialFile(result: TempCredentialFileResult): void {
  try {
    unlinkSync(result.path);
  } catch {
    // File may already be deleted
  }
  try {
    rmdirSync(result.dir);
  } catch {
    // Directory may not be empty or already deleted
  }
}

/**
 * Execute a function with a temporary credential file, cleaning up afterward.
 *
 * The file is written before fn() is called and deleted in a finally block
 * regardless of whether fn() succeeds or throws.
 *
 * @param content - The credential content to write (e.g., .p8 key)
 * @param fn - Function that receives the temp file path
 * @param filename - Optional filename (default: 'key.p8')
 * @returns The return value of fn
 */
export async function withTempCredentialFile<T>(
  content: string,
  fn: (filePath: string) => Promise<T>,
  filename = 'key.p8',
): Promise<T> {
  const tempFile = writeTempCredentialFile(content, filename);
  try {
    return await fn(tempFile.path);
  } finally {
    cleanupTempCredentialFile(tempFile);
  }
}
