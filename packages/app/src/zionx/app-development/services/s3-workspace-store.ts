/**
 * S3 Workspace Store — durable persistence layer for generated app projects.
 *
 * Why this exists
 * ---------------
 * Generated workspaces live on the Fargate container's ephemeral disk. Every
 * task restart (deploy, scale-in, OOM, host swap) wipes them. Users open the
 * dashboard the next day and see an empty project list. This module mirrors
 * every workspace write to S3 and hydrates every known project back to local
 * disk on boot, so workspaces survive restarts.
 *
 * Design
 * ------
 * The pipeline (EAS build, npm install, Hook 6, etc.) keeps using local
 * filesystem operations because shell-out subprocesses need a real directory.
 * S3 is therefore a write-through *backup* layer:
 *
 *   - mirrorFile(): every Workspace.writeFile() also fires this in the
 *     background. Failures are logged but never block the local write.
 *   - hydrateAll(): server boot calls this once. Every project key it finds
 *     in S3 is restored to local disk. After that, the live filesystem is the
 *     source of truth for the running process.
 *
 * S3 key layout
 * -------------
 *   workspaces/<projectId>/<filepath>
 *
 * Example:
 *   workspaces/proj-1779927357135-75738d00/app.json
 *   workspaces/proj-1779927357135-75738d00/app/_layout.tsx
 *   workspaces/proj-1779927357135-75738d00/.meta/project.json
 *
 * Failure modes
 * -------------
 * - S3 unreachable: mirrorFile() logs and returns. Local write already
 *   succeeded. Persistence is degraded but operation continues.
 * - Hydrate timeout: hydrateAll() returns whatever it pulled within its
 *   budget. Server boots with whatever projects it managed to restore.
 * - Bucket not configured: store is a no-op. Useful for local dev.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { writeFile as fsWriteFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface S3WorkspaceStoreConfig {
  bucketName: string;
  region?: string;
  /** S3 key prefix (defaults to "workspaces/"). */
  keyPrefix?: string;
  /** Optional pre-built S3 client (used in tests). */
  s3Client?: S3Client;
  /** Logger (defaults to console). */
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class S3WorkspaceStore {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly log: (msg: string, extra?: Record<string, unknown>) => void;

  constructor(config: S3WorkspaceStoreConfig) {
    this.bucket = config.bucketName;
    this.prefix = (config.keyPrefix ?? 'workspaces/').replace(/\/?$/, '/');
    this.s3 = config.s3Client ?? new S3Client({ region: config.region ?? 'us-east-1' });
    this.log = config.log ?? ((msg, extra) => console.log(`[s3-workspace] ${msg}`, extra ?? ''));
  }

  /** Build the S3 key for a project file. */
  keyFor(projectId: string, relativePath: string): string {
    // Normalize path separators — S3 uses forward slashes.
    const normalized = relativePath.replace(/\\/g, '/');
    return `${this.prefix}${projectId}/${normalized}`;
  }

  /** Build the S3 key prefix for an entire project. */
  prefixFor(projectId: string): string {
    return `${this.prefix}${projectId}/`;
  }

  /**
   * Mirror a file write to S3. Best-effort: errors are logged, never thrown.
   * The Workspace.writeFile call is the source of truth — this just creates
   * a durable copy.
   */
  async mirrorFile(projectId: string, relativePath: string, content: string | Buffer): Promise<void> {
    try {
      const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(projectId, relativePath),
        Body: body,
        ContentType: guessContentType(relativePath),
      }));
    } catch (err) {
      this.log('mirrorFile failed (non-fatal — local write already succeeded)', {
        projectId,
        relativePath,
        error: (err as Error).message,
      });
    }
  }

  /** List every project ID known to S3 (one common prefix per project). */
  async listProjects(): Promise<string[]> {
    const projects = new Set<string>();
    let continuationToken: string | undefined;
    let pages = 0;
    const maxPages = 100; // safety cap — 100 * 1000 keys = 100k workspaces

    do {
      let res: ListObjectsV2CommandOutput;
      try {
        res = await this.s3.send(new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix,
          Delimiter: '/',
          ContinuationToken: continuationToken,
        }));
      } catch (err) {
        this.log('listProjects failed', { error: (err as Error).message });
        return Array.from(projects);
      }
      for (const cp of res.CommonPrefixes ?? []) {
        if (!cp.Prefix) continue;
        // cp.Prefix looks like "workspaces/proj-12345-abc/"
        const projectId = cp.Prefix.slice(this.prefix.length).replace(/\/$/, '');
        if (projectId) projects.add(projectId);
      }
      continuationToken = res.NextContinuationToken;
      pages += 1;
    } while (continuationToken && pages < maxPages);

    return Array.from(projects);
  }

  /** List every file key for one project (returns paths relative to project root). */
  async listFilesForProject(projectId: string): Promise<string[]> {
    const projectPrefix = this.prefixFor(projectId);
    const files: string[] = [];
    let continuationToken: string | undefined;
    let pages = 0;
    const maxPages = 50;

    do {
      let res: ListObjectsV2CommandOutput;
      try {
        res = await this.s3.send(new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: projectPrefix,
          ContinuationToken: continuationToken,
        }));
      } catch (err) {
        this.log('listFilesForProject failed', { projectId, error: (err as Error).message });
        return files;
      }
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        const rel = obj.Key.slice(projectPrefix.length);
        if (rel) files.push(rel);
      }
      continuationToken = res.NextContinuationToken;
      pages += 1;
    } while (continuationToken && pages < maxPages);

    return files;
  }

  /** Read a single file's contents from S3. */
  async readFile(projectId: string, relativePath: string): Promise<Buffer | null> {
    try {
      const res = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(projectId, relativePath),
      }));
      if (!res.Body) return null;
      // res.Body in Node SDK v3 is a Readable stream that's also AsyncIterable.
      const chunks: Buffer[] = [];
      const body = res.Body as AsyncIterable<Buffer | string>;
      for await (const chunk of body) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (code === 'NoSuchKey' || code === 'NotFound') return null;
      this.log('readFile failed', { projectId, relativePath, error: (err as Error).message });
      return null;
    }
  }

  /**
   * Pull every file for one project from S3 to local disk.
   * Returns the count of files restored.
   */
  async hydrateProject(projectId: string, localProjectDir: string): Promise<number> {
    const files = await this.listFilesForProject(projectId);
    let restored = 0;
    for (const rel of files) {
      const buf = await this.readFile(projectId, rel);
      if (!buf) continue;
      const localPath = join(localProjectDir, rel);
      try {
        await mkdir(dirname(localPath), { recursive: true });
        await fsWriteFile(localPath, buf);
        restored += 1;
      } catch (err) {
        this.log('hydrateProject write failed', {
          projectId,
          relativePath: rel,
          error: (err as Error).message,
        });
      }
    }
    return restored;
  }

  /**
   * Pull every project's every file from S3 to local disk under workspaceRoot.
   * Returns an aggregate report.
   */
  async hydrateAll(workspaceRoot: string): Promise<{ projectsRestored: number; filesRestored: number; durationMs: number }> {
    const start = Date.now();
    const projectIds = await this.listProjects();
    let totalFiles = 0;
    for (const projectId of projectIds) {
      const localDir = join(workspaceRoot, projectId);
      const restored = await this.hydrateProject(projectId, localDir);
      totalFiles += restored;
    }
    const durationMs = Date.now() - start;
    this.log('hydrateAll complete', {
      projectsRestored: projectIds.length,
      filesRestored: totalFiles,
      durationMs,
    });
    return { projectsRestored: projectIds.length, filesRestored: totalFiles, durationMs };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessContentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'application/typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'application/javascript';
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'application/yaml';
  if (path.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}
