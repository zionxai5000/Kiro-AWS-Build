/**
 * Wake-state store — persists per-project sandbox wake state to S3
 * so all ECS tasks see the same view.
 *
 * The bug it fixes: the dashboard's POST /sandbox/wake hits ALB-balanced
 * task A (kicks off a fresh bundle in task A's in-memory map). The
 * follow-up GET /sandbox is balanced to task B, which has its OWN
 * in-memory map possibly holding stale "ready" state from a previous
 * session that points to a long-dead E2B sandbox URL. The user sees a
 * "sandbox 8081 closed" page even though their fresh build is happily
 * progressing in task A.
 *
 * Layout: s3://<bucket>/wake-state/<projectId>.json
 *
 * Each handler still keeps an in-memory copy for the same task's
 * sub-second responses; the S3 write/read is a coherence layer for
 * cross-task visibility.
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface WakeStateRecord {
  projectId: string;
  state: 'building' | 'ready' | 'error';
  startedAt: string;
  updatedAt: string;
  publicUrl: string | null;
  error: string | null;
  phase: string;
}

export interface WakeStateStoreConfig {
  bucketName: string;
  region?: string;
  keyPrefix?: string;
  s3Client?: S3Client;
}

export class WakeStateStore {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: WakeStateStoreConfig) {
    this.bucket = config.bucketName;
    this.prefix = (config.keyPrefix ?? 'wake-state/').replace(/\/?$/, '/');
    this.s3 = config.s3Client ?? new S3Client({ region: config.region ?? 'us-east-1' });
  }

  private keyFor(projectId: string): string {
    return `${this.prefix}${projectId}.json`;
  }

  /** Read the current wake state for a project. Returns null if missing. */
  async read(projectId: string): Promise<WakeStateRecord | null> {
    try {
      const out = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(projectId),
      }));
      const text = await out.Body?.transformToString('utf-8');
      if (!text) return null;
      return JSON.parse(text) as WakeStateRecord;
    } catch (err) {
      const code = (err as { name?: string; Code?: string }).name ?? (err as { Code?: string }).Code;
      if (code === 'NoSuchKey' || code === 'NotFound') return null;
      // Other errors: log and return null (degraded mode — handlers fall
      // back to in-memory state).
      console.warn(`[wake-state] read ${projectId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Write/replace the wake state for a project. */
  async write(record: WakeStateRecord): Promise<void> {
    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(record.projectId),
        Body: JSON.stringify(record),
        ContentType: 'application/json',
      }));
    } catch (err) {
      console.warn(`[wake-state] write ${record.projectId}: ${(err as Error).message}`);
    }
  }

  /** Delete the wake state for a project (e.g. on hibernate). */
  async clear(projectId: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(projectId),
      }));
    } catch (err) {
      console.warn(`[wake-state] clear ${projectId}: ${(err as Error).message}`);
    }
  }
}

/**
 * Singleton helper. Production-server wires the bucket name once and exposes
 * the store via globalThis. Handlers grab it through this getter rather than
 * threading the dep through 12 layers.
 */
export function getWakeStateStore(): WakeStateStore | null {
  return (globalThis as unknown as { __zionxWakeStateStore?: WakeStateStore | null })
    .__zionxWakeStateStore ?? null;
}

export function setWakeStateStore(store: WakeStateStore): void {
  (globalThis as unknown as { __zionxWakeStateStore: WakeStateStore }).__zionxWakeStateStore = store;
}

/**
 * Quick reachability check: HTTP GET the cached public URL with a short
 * timeout. Returns true if it responded with anything other than a 5xx /
 * connection failure (the E2B "closed port" page returns 502, so we
 * treat 502 as dead).
 */
export async function isPreviewReachable(url: string, timeoutMs = 4000): Promise<boolean> {
  if (!url || !url.startsWith('http')) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
