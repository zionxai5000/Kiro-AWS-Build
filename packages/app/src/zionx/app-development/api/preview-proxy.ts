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

/** Build the route descriptors for the preview proxy.
 *
 * Note: paths are registered WITHOUT the `/api` prefix because the
 * production router (production-server.ts:529) strips `/api` from the
 * incoming path before route matching. The public URLs are still
 * `/api/preview/:projectId/*`.
 */
export function createPreviewRoutes(deps: PreviewProxyDeps): RouteHandler[] {
  return [
    {
      method: 'GET',
      path: '/preview/:projectId',
      handler: createProxyHandler(deps),
    },
    {
      method: 'GET',
      path: '/preview/:projectId/*',
      handler: createProxyHandler(deps),
    },
    {
      method: 'POST',
      path: '/preview/:projectId/token',
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

    // Auth: any of three sources is sufficient (defense-in-depth):
    //   1. Cognito session (`req.userId`) — for direct dashboard requests
    //   2. Signed token in `?token=` — for Expo Go phone preview / iframe load
    //   3. `zionx_preview_<projectId>` cookie — set after successful #1 or #2
    //      so subsequent same-origin asset requests inside the iframe carry
    //      auth automatically (the browser doesn't add Authorization headers
    //      to img/script/link requests, so we need a cookie).
    const queryToken = req.query['token'];
    const cookieHeader = req.headers['cookie'] ?? '';
    const cookieToken = parseCookieToken(cookieHeader, projectId);

    let resolvedUserId: string | null = req.userId || null;
    let mintedFromToken = false;

    if (!resolvedUserId) {
      const candidate = queryToken || cookieToken;
      if (candidate) {
        const payload = verifyToken(candidate, deps.signingSecret);
        if (!payload || payload.projectId !== projectId) {
          return { statusCode: 401, body: { error: 'invalid or expired preview token' } };
        }
        resolvedUserId = payload.userId;
        mintedFromToken = true;
      }
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

    // Forward to the upstream sandbox URL. The production router strips the
    // `/api` prefix before route matching, so `req.path` here looks like
    // `/preview/:id/...`. Strip that to get the upstream tail.
    //
    // With the new rest-wildcard matchPath, `req.params['*']` already holds
    // the tail segments joined with `/` (when the route was `/preview/:id/*`).
    // For the bare `/preview/:id` route there's no '*' param — tail is empty
    // and we fetch the upstream root.
    const restParam = (req.params['*'] ?? '').replace(/^\/+/, '');
    const tail = restParam ? `/${restParam}` : '';
    const target = `${sandboxUrl}${tail || '/'}`;
    const headers: Record<string, string> = { ...req.headers };
    delete headers['authorization'];
    delete headers['cookie'];
    delete headers['host'];
    // Sandbox http.server is happier with no compressed responses (we
    // need raw HTML so we can inject <base href>).
    delete headers['accept-encoding'];

    console.log(`[preview-proxy][${projectId.slice(-8)}] ${req.method} ${req.path} → ${target}`);

    // If we authenticated this request via the query token (the iframe's
    // initial load), we should set a same-origin cookie that subsequent
    // asset requests can use. The cookie carries the same signed payload
    // as the URL token; the auth check above accepts both.
    const setCookie = mintedFromToken && (queryToken || cookieToken)
      ? buildPreviewCookie(projectId, (queryToken ?? cookieToken)!)
      : null;

    return {
      statusCode: 200,
      body: null,
      streamHandler: (res: ServerResponse) => {
        if (setCookie) res.setHeader('Set-Cookie', setCookie);
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
    if (['transfer-encoding', 'connection', 'content-encoding', 'content-length'].includes(lk)) return;
    outHeaders[k] = v;
  });
  // Marker so debugging is obvious.
  outHeaders['x-zionx-preview-project'] = projectId;

  // If the upstream is HTML for this project (i.e., the index page),
  // rewrite absolute asset paths and inject a <base href> so all asset
  // URLs route back through the auth-proxy. Without this, the iframe
  // loads index.html but every script/stylesheet 404s against the API
  // origin (because `<base href>` only affects relative URLs, NOT
  // path-absolute ones like `/_expo/static/...`).
  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') && upstream.body) {
    const text = await upstream.text();
    const proxyBase = `/api/preview/${projectId}`;

    // 1. Inject <base href> so any genuinely-relative URLs route through
    //    the proxy too.
    // 2. Inject a tiny URL-rewriter that runs before any other JS. It
    //    intercepts fetch / XHR / Image.src so that runtime-generated
    //    absolute asset paths (`/assets/...`, `/static/...`, etc.) — which
    //    the JS bundle emits at runtime and which static HTML rewrites
    //    can't catch — get routed through the proxy too.
    const interceptor = `<script>
(function(){
  var PREFIX=${JSON.stringify(proxyBase)};
  var PATTERNS=[/^\\/assets\\//,/^\\/_expo\\//,/^\\/static\\//,/^\\/fonts\\//];
  function rewrite(u){if(typeof u!=='string')return u;for(var i=0;i<PATTERNS.length;i++){if(PATTERNS[i].test(u))return PREFIX+u;}return u;}
  var of=window.fetch;window.fetch=function(input,init){if(typeof input==='string')input=rewrite(input);else if(input&&input.url)input=new Request(rewrite(input.url),input);return of.call(this,input,init);};
  var oo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=Array.prototype.slice.call(arguments);a[1]=rewrite(u);return oo.apply(this,a);};
  try{var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');if(d&&d.set){Object.defineProperty(HTMLImageElement.prototype,'src',{set:function(v){d.set.call(this,rewrite(v));},get:function(){return d.get.call(this);},configurable:true});}}catch(e){}
})();
</script>`;
    const baseTag = `<base href="${proxyBase}/">`;
    const headInjection = baseTag + interceptor;

    let patched = text;
    if (patched.includes('<head>')) {
      patched = patched.replace('<head>', `<head>${headInjection}`);
    } else if (patched.match(/<head[^>]*>/)) {
      patched = patched.replace(/<head([^>]*)>/, `<head$1>${headInjection}`);
    } else {
      patched = headInjection + patched;
    }

    // 3. Rewrite absolute asset paths in the static HTML (script src,
    //    link href, etc.). The runtime interceptor above handles JS-emitted
    //    URLs; this catches the static `<script src="/_expo/...">` cases.
    const ASSET_PREFIXES = ['/_expo/', '/assets/', '/static/', '/fonts/'];
    for (const prefix of ASSET_PREFIXES) {
      const escaped = prefix.replace(/\//g, '\\/');
      const re = new RegExp(`(=["'])${escaped}`, 'g');
      patched = patched.replace(re, `$1${proxyBase}${prefix}`);
    }

    const buf = Buffer.from(patched, 'utf-8');
    outHeaders['content-length'] = String(buf.byteLength);
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
    console.log(`[preview-proxy][${projectId.slice(-8)}] HTML rewrite: <base href> + URL interceptor + asset paths (${buf.byteLength}b)`);
    return;
  }

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

/**
 * Per-project cookie name. Scoping the cookie to the project keeps it
 * narrow — viewing project A doesn't grant access to project B even if
 * an attacker steals the cookie.
 */
function previewCookieName(projectId: string): string {
  // Cookie names can't contain certain characters; project IDs use
  // [a-zA-Z0-9-] which is safe. Prepend a marker for grep-ability.
  return `zionx_preview_${projectId}`;
}

/**
 * Build a Set-Cookie header value for the preview token.
 * 1 hour TTL matches the token lifetime. SameSite=Lax so the cookie
 * is sent for same-origin asset requests inside the iframe but not for
 * unrelated cross-site navigations. HttpOnly so JS can't read it.
 */
function buildPreviewCookie(projectId: string, token: string): string {
  const oneHour = 60 * 60;
  return [
    `${previewCookieName(projectId)}=${encodeURIComponent(token)}`,
    `Path=/api/preview/${projectId}`,
    `Max-Age=${oneHour}`,
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ');
}

/**
 * Extract the per-project token from the Cookie header, if present.
 * Returns null when missing or unparseable.
 */
function parseCookieToken(cookieHeader: string, projectId: string): string | null {
  if (!cookieHeader) return null;
  const target = previewCookieName(projectId);
  const parts = cookieHeader.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === target) {
      try { return decodeURIComponent(part.slice(eq + 1)); } catch { return null; }
    }
  }
  return null;
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
