/**
 * S3WorkspaceStore tests.
 *
 * We mock the S3Client so the test runs without real AWS access. The mock
 * keeps an in-memory map keyed by S3 key so we can verify mirror, list,
 * read, and hydrate end-to-end without touching the network.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3WorkspaceStore } from '../s3-workspace-store.js';
import type { S3Client } from '@aws-sdk/client-s3';

interface MockObject {
  body: Buffer;
  contentType?: string;
}

class MockS3Client {
  store = new Map<string, MockObject>();

  async send(command: { constructor: { name: string }; input: Record<string, unknown> }): Promise<unknown> {
    const cls = command.constructor.name;
    const input = command.input;

    if (cls === 'PutObjectCommand') {
      const body = input['Body'] as Buffer;
      const key = input['Key'] as string;
      this.store.set(key, { body, contentType: input['ContentType'] as string | undefined });
      return { ETag: '"mock-etag"' };
    }

    if (cls === 'GetObjectCommand') {
      const key = input['Key'] as string;
      const obj = this.store.get(key);
      if (!obj) {
        const err = new Error('NoSuchKey');
        (err as { name?: string }).name = 'NoSuchKey';
        throw err;
      }
      // Provide an AsyncIterable yielding the buffer once.
      const body = (async function* () {
        yield obj.body;
      })();
      return { Body: body };
    }

    if (cls === 'ListObjectsV2Command') {
      const prefix = (input['Prefix'] as string | undefined) ?? '';
      const delimiter = input['Delimiter'] as string | undefined;
      const allKeys = Array.from(this.store.keys()).filter((k) => k.startsWith(prefix));

      if (delimiter) {
        const commonPrefixes = new Set<string>();
        const objects: Array<{ Key: string }> = [];
        for (const k of allKeys) {
          const rest = k.slice(prefix.length);
          const idx = rest.indexOf(delimiter);
          if (idx === -1) {
            objects.push({ Key: k });
          } else {
            commonPrefixes.add(prefix + rest.slice(0, idx + 1));
          }
        }
        return {
          CommonPrefixes: Array.from(commonPrefixes).map((Prefix) => ({ Prefix })),
          Contents: objects,
        };
      }

      return { Contents: allKeys.map((Key) => ({ Key })) };
    }

    throw new Error(`Mock S3: unsupported command ${cls}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('S3WorkspaceStore', () => {
  let mock: MockS3Client;
  let store: S3WorkspaceStore;
  let tmpRoot: string;

  beforeEach(() => {
    mock = new MockS3Client();
    store = new S3WorkspaceStore({
      bucketName: 'test-bucket',
      s3Client: mock as unknown as S3Client,
      log: () => {}, // silence
    });
    tmpRoot = mkdtempSync(join(tmpdir(), 's3-store-test-'));
  });

  it('builds keys with the workspaces/ prefix', () => {
    expect(store.keyFor('proj-1', 'app.json')).toBe('workspaces/proj-1/app.json');
    expect(store.keyFor('proj-1', 'app/_layout.tsx')).toBe('workspaces/proj-1/app/_layout.tsx');
  });

  it('mirrors a string file to S3', async () => {
    await store.mirrorFile('proj-1', 'app.json', '{"hello":1}');
    const obj = mock.store.get('workspaces/proj-1/app.json');
    expect(obj).toBeDefined();
    expect(obj!.body.toString('utf-8')).toBe('{"hello":1}');
    expect(obj!.contentType).toBe('application/json');
  });

  it('mirrors a Buffer file to S3', async () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    await store.mirrorFile('proj-1', 'assets/icon.png', buf);
    const obj = mock.store.get('workspaces/proj-1/assets/icon.png');
    expect(obj).toBeDefined();
    expect(obj!.body.equals(buf)).toBe(true);
    expect(obj!.contentType).toBe('image/png');
  });

  it('lists projects via common prefixes', async () => {
    await store.mirrorFile('proj-a', 'app.json', '{}');
    await store.mirrorFile('proj-b', 'app.json', '{}');
    await store.mirrorFile('proj-c', 'package.json', '{}');
    const ids = await store.listProjects();
    expect(ids.sort()).toEqual(['proj-a', 'proj-b', 'proj-c']);
  });

  it('lists files for a single project (paths relative to project root)', async () => {
    await store.mirrorFile('proj-1', 'app.json', '{}');
    await store.mirrorFile('proj-1', 'app/_layout.tsx', '// layout');
    await store.mirrorFile('proj-1', '.meta/project.json', '{}');
    await store.mirrorFile('proj-2', 'app.json', '{}');
    const files = await store.listFilesForProject('proj-1');
    expect(files.sort()).toEqual(['.meta/project.json', 'app.json', 'app/_layout.tsx']);
  });

  it('returns null when reading a missing file', async () => {
    expect(await store.readFile('proj-1', 'missing.json')).toBeNull();
  });

  it('reads a previously mirrored file', async () => {
    await store.mirrorFile('proj-1', 'app.json', '{"x":42}');
    const buf = await store.readFile('proj-1', 'app.json');
    expect(buf?.toString('utf-8')).toBe('{"x":42}');
  });

  it('hydrates a single project to local disk', async () => {
    await store.mirrorFile('proj-1', 'app.json', '{"x":1}');
    await store.mirrorFile('proj-1', 'app/_layout.tsx', '// hi');
    const localDir = join(tmpRoot, 'proj-1');
    const restored = await store.hydrateProject('proj-1', localDir);
    expect(restored).toBe(2);
    expect(readFileSync(join(localDir, 'app.json'), 'utf-8')).toBe('{"x":1}');
    expect(readFileSync(join(localDir, 'app', '_layout.tsx'), 'utf-8')).toBe('// hi');
  });

  it('hydrates every known project under a workspace root', async () => {
    await store.mirrorFile('proj-a', 'app.json', '{}');
    await store.mirrorFile('proj-a', 'app/_layout.tsx', 'A');
    await store.mirrorFile('proj-b', 'app.json', '{}');
    const report = await store.hydrateAll(tmpRoot);
    expect(report.projectsRestored).toBe(2);
    expect(report.filesRestored).toBe(3);
    expect(existsSync(join(tmpRoot, 'proj-a', 'app.json'))).toBe(true);
    expect(existsSync(join(tmpRoot, 'proj-a', 'app', '_layout.tsx'))).toBe(true);
    expect(existsSync(join(tmpRoot, 'proj-b', 'app.json'))).toBe(true);
  });

  it('hydrates an empty bucket without error', async () => {
    const report = await store.hydrateAll(tmpRoot);
    expect(report.projectsRestored).toBe(0);
    expect(report.filesRestored).toBe(0);
  });

  it('mirrorFile swallows S3 errors (non-fatal — local write is source of truth)', async () => {
    const failingMock = {
      send: async () => { throw new Error('S3 down'); },
    };
    const failingStore = new S3WorkspaceStore({
      bucketName: 'test-bucket',
      s3Client: failingMock as unknown as S3Client,
      log: () => {},
    });
    // Must NOT throw
    await expect(failingStore.mirrorFile('proj-1', 'app.json', '{}')).resolves.toBeUndefined();
  });
});
