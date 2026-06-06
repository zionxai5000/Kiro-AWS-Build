/**
 * Phase 11.7 — on-phone preview via Expo Go QR (programmatic chain probe).
 *
 * The actual phone scan needs King's hand. This script verifies every other
 * link in the chain so when the phone scans, we know the rest works.
 *
 * Chain:
 *   1. Caller authenticates against the dashboard (Cognito session).
 *   2. Caller calls POST /api/preview/:projectId/token, gets back
 *      { token, urlPattern, expiresAt } with a 1-hour signed token.
 *   3. The QR encodes urlPattern (e.g. /api/preview/<id>/?token=<sig>).
 *   4. Phone scans → opens the URL → server validates the token via
 *      preview-proxy's verifyToken → forwards to the live E2B sandbox URL.
 *
 * What this probe verifies (no phone):
 *   • token sign / verify round-trip with the same secret prefix
 *   • the proxy accepts the token from an anonymous (no Cognito) caller
 *   • the proxy rejects a token signed for a different project
 *   • the proxy rejects an expired token
 *   • the proxy passes through to the upstream sandbox URL when the token is valid
 *
 * What ONLY a phone can verify:
 *   • the QR image itself renders correctly on the studio
 *   • Expo Go on the phone can load the URL and run the bundle
 *
 * Cost: zero — this is all in-process unit-test-shaped probing.
 */

import { createPreviewRoutes, __test__ } from '../packages/app/dist/zionx/app-development/api/preview-proxy.js';

const SECRET = 'zionx-on-phone-preview-probe-secret';
const PROJECT = 'phone-probe-project';
const OWNER = 'king';

class Workspace {
  meta = { ownerId: OWNER };
  async readProjectMeta() { return this.meta; }
  async writeProjectMeta(_id, m) { this.meta = m; }
  async readFile() { throw new Error('not used'); }
  async writeFile() { /* noop */ }
  async listFiles() { return []; }
  async exists() { return true; }
  async delete() { /* noop */ }
}

const ws = new Workspace();
let resolveCalls = 0;
const routes = createPreviewRoutes({
  workspace: ws,
  resolveSandboxUrl: async (id) => {
    resolveCalls++;
    if (id === PROJECT) return 'https://8081-fake.e2b.app';
    return null;
  },
  signingSecret: SECRET,
});

const tokenIssuer = routes.find((r) => r.method === 'POST');
const proxy = routes.find((r) => r.method === 'GET' && r.path.endsWith('*'));

const checks = {};

// 1. Issue a token (the studio's Cognito-authenticated path).
const issueRes = await tokenIssuer.handler({
  method: 'POST',
  path: `/preview/${PROJECT}/token`,
  params: { projectId: PROJECT },
  query: {},
  body: null,
  headers: {},
  tenantId: 't1',
  userId: OWNER,
  role: 'king',
});
checks.issuerOK = issueRes.statusCode === 200;
const body = issueRes.body;
checks.tokenPresent = typeof body?.token === 'string' && body.token.length > 20;
checks.urlPatternHasToken = body?.urlPattern?.includes('token=');
checks.urlPatternHasProjectId = body?.urlPattern?.includes(PROJECT);

console.log('[phone-probe] issued token');
console.log(`             token=${body.token.slice(0, 12)}...${body.token.slice(-12)}`);
console.log(`             urlPattern=${body.urlPattern}`);
console.log(`             expiresAt=${body.expiresAt}`);

// 2. Use the token from an ANONYMOUS caller (the phone has no Cognito session).
const proxyRes = await proxy.handler({
  method: 'GET',
  path: `/preview/${PROJECT}/`,
  params: { projectId: PROJECT },
  query: { token: body.token },
  body: null,
  headers: {},
  tenantId: '',
  userId: '',
  role: '',
});
checks.anonymousProxyAccepted = proxyRes.statusCode === 200;
checks.proxyResolvedSandboxUrl = resolveCalls === 1;

// 3. Token signed for a DIFFERENT project must be rejected.
const otherProjectToken = __test__.signToken(
  { projectId: 'OTHER', userId: OWNER, exp: Date.now() + 60_000 },
  SECRET,
);
const wrongProjectRes = await proxy.handler({
  method: 'GET',
  path: `/preview/${PROJECT}/`,
  params: { projectId: PROJECT },
  query: { token: otherProjectToken },
  body: null,
  headers: {},
  tenantId: '',
  userId: '',
  role: '',
});
checks.wrongProjectRejected = wrongProjectRes.statusCode === 401;

// 4. Expired token must be rejected.
const expiredToken = __test__.signToken(
  { projectId: PROJECT, userId: OWNER, exp: Date.now() - 1 },
  SECRET,
);
const expiredRes = await proxy.handler({
  method: 'GET',
  path: `/preview/${PROJECT}/`,
  params: { projectId: PROJECT },
  query: { token: expiredToken },
  body: null,
  headers: {},
  tenantId: '',
  userId: '',
  role: '',
});
checks.expiredTokenRejected = expiredRes.statusCode === 401;

// 5. Tampered token must be rejected.
const tampered = body.token.slice(0, -5) + 'XXXXX';
const tamperRes = await proxy.handler({
  method: 'GET',
  path: `/preview/${PROJECT}/`,
  params: { projectId: PROJECT },
  query: { token: tampered },
  body: null,
  headers: {},
  tenantId: '',
  userId: '',
  role: '',
});
checks.tamperedTokenRejected = tamperRes.statusCode === 401;

// ---- report ----
console.log('\n[phone-probe] verification:');
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? '✓' : '✗'} ${k}: ${v}`);
}
const passed = Object.values(checks).every(Boolean);
console.log(`\n[phone-probe] ${passed ? 'PASS' : 'FAIL'} — chain verified end-to-end (no phone).`);
console.log('[phone-probe] To complete on-phone test, King scans the QR rendered by the studio with Expo Go.');
process.exit(passed ? 0 : 1);
