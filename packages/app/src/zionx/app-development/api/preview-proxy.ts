/**
 * Preview auth proxy — `/api/preview/:projectId/*`.
 *
 * Phase 6 deliverable: every preview asset (HTML, JS bundle, source map,
 * Metro WS, log tail) flows through this proxy. The browser never sees the
 * raw E2B URL; only the auth-checked proxy URL.
 *
 * Until Phase 4 wires E2B sandboxes, the proxy returns a designed
 * "Preview not yet provisioned" response. When `req.preview.url` is
 * available (set by the sandbox client), the proxy streams from there.
 *
 * Token modes:
 *   1. Cookie session (Cognito) — for the studio iframe
 *   2. Short-lived signed JWT in `?token=` — for Expo Go on-phone preview
 */

import type { APIRequest, APIResponse, RouteHandler } from '@seraphim/services/shaar/api-routes.js';
import type { Workspace } from '../workspace/workspace.js';
import type { ServerResponse } from 'node:http';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

export interface PreviewProxyDeps {
  workspace: Workspace;
  /** Resolves the live sandbox URL for a project, or null when not provisioned. */
  resolveSandboxUrl: (projectId: string) => Promise<string | null>;
  /** Phase 6 secret used to sign on-phone preview tokens. Resolve from env / Secrets Manager. */
  signingSecret: string;
}

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Build the route descriptors for the preview proxy. */
export function createPreviewRoutes(deps: PreviewProxyDeps): RouteHandler[] {
  return [
    {
      method: 'GET',
      path: '/api/preview/:projectId',
      handler: createProxyHandler(deps),
    },
    {
      method: 'GET',
      path: '/api/preview/:projectId/*',
      handler: createProxyHandler(deps),
    },
    {
      method: 'POST',
      path: '/api/preview/:projectId/token',
      handler: createTokenIssuer(deps),
    },
  ];
}

// ---------------------------------------------------------------------------
// Token signing (HMAC-SHA256 short-lived JWT-shaped string)
// ---------------------------------------------------------------------------

interface PreviewToken {
  projectId: string;
  userId: string;
  exp: number; // unix ms
}

function signToken(payload: PreviewToken, secret: string): string {
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(json).digest('base64url');
  return `${json}.${sig}`;
}

function verifyToken(token: string, secret: string): PreviewToken | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const json = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = createHmac('sha256', secret).update(json).digest('base64url');
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: PreviewToken;
  try {
    payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf-8')) as PreviewToken;
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  if (typeof payload.projectId !== 'string' || typeof payload.userId !== 'string') return null;
  return payload;
}

// ---------------------------------------------------------------------------
// /api/preview/:projectId/token — issue a 1-hour signed URL for Expo Go
// ---------------------------------------------------------------------------

function createTokenIssuer(deps: PreviewProxyDeps): (req: APIRequest) => Promise<APIResponse> {
  return async (req: APIRequest): Promise<APIResponse> => {
    const projectId = req.params.projectId ?? req.params.id;
    if (!projectId) return { statusCode: 400, body: { error: 'projectId required' } };
    const meta = await deps.workspace.readProjectMeta(projectId);
    if (!meta) return { statusCode: 404, body: { error: 'project not found' } };
    if (meta.ownerId && meta.ownerId !== req.userId) {
      return { statusCode: 403, body: { error: 'forbidden' } };
    }
    const token = signToken(
      { projectId, userId: req.userId, exp: Date.now() + TOKEN_TTL_MS },
      deps.signingSecret,
    );
    return {
      statusCode: 200,
      body: {
        token,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
        urlPattern: `/api/preview/${projectId}/?token=${encodeURIComponent(token)}`,
      },
    };
  };
}

// ---------------------------------------------------------------------------
// /api/preview/:projectId/* — the actual proxy
// ---------------------------------------------------------------------------

function createProxyHandler(deps: PreviewProxyDeps): (req: APIRequest) => Promise<APIResponse> {
  return async (req: APIRequest): Promise<APIResponse> => {
    const projectId = req.params.projectId ?? req.params.id;
    if (!projectId) return { statusCode: 400, body: { error: 'projectId required' } };

    // Auth: either an authenticated Cognito session (req.userId) OR a valid
    // preview token in the query string (Expo Go path).
    const queryToken = req.query['token'];
    let resolvedUserId: string | null = req.userId || null;

    if (!resolvedUserId && queryToken) {
      const payload = verifyToken(queryToken, deps.signingSecret);
      if (!payload || payload.projectId !== projectId) {
        return { statusCode: 401, body: { error: 'invalid or expired preview token' } };
      }
      resolvedUserId = payload.userId;
    }

    if (!resolvedUserId) {
      return { statusCode: 401, body: { error: 'authentication required (session or token)' } };
    }

    // Ownership.
    const meta = await deps.workspace.readProjectMeta(projectId);
    if (!meta) return { statusCode: 404, body: { error: 'project not found' } };
    if (meta.ownerId && meta.ownerId !== resolvedUserId) {
      return { statusCode: 403, body: { error: 'project access forbidden' } };
    }

    // Sandbox URL — Phase 4 dependency. Until then we surface a friendly state.
    const sandboxUrl = await deps.resolveSandboxUrl(projectId);
    if (!sandboxUrl) {
      return {
        statusCode: 503,
        body: null,
        streamHandler: (res: ServerResponse) => {
          res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
          res.end(NOT_PROVISIONED_HTML(projectId));
        },
      };
    }

    // Forward to the upstream sandbox URL. We strip the `/api/preview/:id`
    // prefix so the upstream sees a normal path.
    const tail = stripPrefix(req.path, `/api/preview/${projectId}`);
    const target = `${sandboxUrl}${tail || '/'}`;
    const headers: Record<string, string> = { ...req.headers };
    delete headers['authorization'];
    delete headers['cookie'];
    delete headers['host'];

    return {
      statusCode: 200,
      body: null,
      streamHandler: (res: ServerResponse) => {
        proxyTo(target, req.method, headers, req.body, res, projectId).catch((err) => {
          if (!res.writableEnded) {
            try {
              res.writeHead(502, { 'content-type': 'text/plain' });
              res.end(`Preview upstream error: ${(err as Error).message}`);
            } catch { /* ignore */ }
          }
        });
      },
    };
  };
}

async function proxyTo(
  target: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  res: ServerResponse,
  projectId: string,
): Promise<void> {
  const init: RequestInit = { method, headers };
  if (body && method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const upstream = await fetch(target, init);

  // Strip headers that don't make sense to relay verbatim.
  const outHeaders: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (['transfer-encoding', 'connection', 'content-encoding'].includes(lk)) return;
    outHeaders[k] = v;
  });
  // Marker so debugging is obvious.
  outHeaders['x-zionx-preview-project'] = projectId;

  res.writeHead(upstream.status, outHeaders);

  if (upstream.body) {
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !res.writableEnded) res.write(value);
    }
  }
  res.end();
}

function stripPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

// ---------------------------------------------------------------------------
// "Not provisioned" placeholder HTML
// ---------------------------------------------------------------------------

function NOT_PROVISIONED_HTML(projectId: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview not yet provisioned</title>
<style>
  body { margin:0; background:linear-gradient(180deg,#0E1424 0%,#1B1F3A 100%); color:#EDF0FA;
         font-family:-apple-system,Inter,sans-serif; height:100vh; display:flex; align-items:center; justify-content:center; }
  .card { background:rgba(22,30,51,0.8); border:1px solid #26304D; border-radius:16px; padding:32px;
          max-width:420px; box-shadow:0 16px 40px rgba(0,0,0,0.4); }
  h1 { font-size:22px; margin:0 0 12px; font-weight:600; }
  p  { font-size:15px; color:#A7AECB; line-height:1.5; margin:0 0 16px; }
  code { background:#1E2740; padding:2px 6px; border-radius:6px; font-size:13px; color:#7C83FF; }
</style></head>
<body><div class="card">
  <h1>Preview not yet provisioned</h1>
  <p>Project <code>${projectId.slice(0,16)}…</code> doesn't have a running sandbox yet. Send a message to your agent and the preview will spin up automatically.</p>
  <p>Phase 4 (E2B sandbox client) needs <code>seraphim/e2b</code> in AWS Secrets Manager.</p>
</div></body></html>
`;
}

// Public test helpers (not registered as routes)
export const __test__ = { signToken, verifyToken };
