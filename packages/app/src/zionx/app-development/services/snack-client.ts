/**
 * Expo Snack client — bundles a workspace into a Snack save and returns
 * an embed URL the dashboard renders in an iframe. This is what gives the
 * Studio its live preview (matches the VibeCode/Rork "see your app render"
 * behavior).
 *
 * Snack save endpoint: POST https://exp.host/--/api/v2/snack/save
 * Returns: { id: 'username/<hash>' or '<hash>' }
 * Embed: https://snack.expo.dev/embedded/<id>?platform=web&preview=true
 *
 * Saves are anonymous when no Expo bearer token is supplied. We optionally
 * authenticate with the operator's Expo token (from seraphim/expo) so the
 * snack ends up under the zionxai account and persists.
 */

const SNACK_SAVE_URL = 'https://exp.host/--/api/v2/snack/save';

export interface SnackSaveInput {
  name: string;
  description: string;
  /** path -> content for every file the snack should contain */
  files: Record<string, string>;
  /** package -> version map (from package.json's dependencies) */
  dependencies: Record<string, string>;
  /** Optional Expo SDK version override. Defaults to 54.0.0. */
  sdkVersion?: string;
  /** Optional Expo bearer token to associate the snack with an account. */
  expoToken?: string;
}

export interface SnackSaveResult {
  id: string;
  url: string;
  embedUrl: string;
}

/**
 * Create or update an Expo Snack from a workspace file set.
 *
 * Snack rejects some native packages on its web preview (Reanimated worklets
 * and Skia run partially; native modules like react-native-mmkv don't work
 * on web). For preview-only purposes we strip those from the dep list — the
 * actual TestFlight build still uses the full deps because EAS reads the
 * workspace's real package.json.
 */
export async function createSnack(input: SnackSaveInput): Promise<SnackSaveResult> {
  const sdkVersion = input.sdkVersion ?? '54.0.0';

  // Translate workspace files into Snack's "code" map.
  const code: Record<string, { contents: string; type: 'CODE' }> = {};
  for (const [path, content] of Object.entries(input.files)) {
    code[path] = { type: 'CODE', contents: content };
  }

  // ----------------------------------------------------------------
  // Web-incompatible package shims for the Snack web preview.
  //
  // Some packages the generated app imports (Sentry, MMKV, Skia) don't
  // have a working web fallback — Snack's bundler can't resolve them
  // and the app fails to boot, leaving the device pane stuck on an
  // "Unable to resolve module" error.
  //
  // We solve this by:
  //   1. Stripping the dep from the Snack manifest (so npm doesn't try
  //      to install it — see filterSnackDependencies below).
  //   2. Injecting a shim FILE under shims/<pkg>.js that exports a
  //      stub matching the surface the generated code uses.
  //   3. Rewriting every `import ... from '<pkg>'` line in user code
  //      to point at the local shim.
  //
  // The full TestFlight build is unaffected — EAS reads the original
  // workspace file straight from disk, never these shims. This applies
  // ONLY to the Snack save we POST for the live preview.
  // ----------------------------------------------------------------
  const SHIMS: Record<string, string> = {
    '@sentry/react-native': SENTRY_SHIM,
    'react-native-mmkv': MMKV_SHIM,
    '@shopify/react-native-skia': SKIA_SHIM,
  };

  // Inject the shim files. The path is relative to project root.
  for (const [pkg, shimSource] of Object.entries(SHIMS)) {
    const shimPath = `shims/${pkg.replace(/[/@]/g, '_')}.js`;
    code[shimPath] = { type: 'CODE', contents: shimSource };
  }

  // Rewrite imports in every user .ts / .tsx / .js / .jsx file so the
  // shimmed packages resolve to local files. We compute the relative
  // path from each importing file to the shim to keep the rewrite
  // robust for nested directories like `app/(tabs)/index.tsx`.
  for (const [path, file] of Object.entries(code)) {
    if (path.startsWith('shims/')) continue;
    if (!/\.(t|j)sx?$/.test(path)) continue;
    let src = file.contents;
    let touched = false;
    for (const pkg of Object.keys(SHIMS)) {
      if (!src.includes(pkg)) continue;
      const shimRelPath = relativeShimPath(path, pkg);
      // Match both:  from '@sentry/react-native'   and  require('@sentry/react-native')
      const importRe = new RegExp(
        `(from\\s+['"\`])${escapeRegex(pkg)}(['"\`])`,
        'g',
      );
      const requireRe = new RegExp(
        `(require\\(\\s*['"\`])${escapeRegex(pkg)}(['"\`]\\s*\\))`,
        'g',
      );
      const next = src.replace(importRe, `$1${shimRelPath}$2`).replace(requireRe, `$1${shimRelPath}$2`);
      if (next !== src) { src = next; touched = true; }
    }
    if (touched) code[path] = { type: 'CODE', contents: src };
  }

  // Snack REQUIRES App.js (or App.tsx) at the root as the entry point.
  // LLM-generated apps use expo-router with `app/_layout.tsx` instead, which
  // Snack's web preview doesn't natively understand. Inject a stub App.js
  // that delegates to expo-router/entry so the routes still resolve.
  const hasAppJs = code['App.js'] !== undefined;
  const hasAppTsx = code['App.tsx'] !== undefined;
  if (!hasAppJs && !hasAppTsx) {
    const usesExpoRouter = Object.keys(code).some((p) => p.startsWith('app/') && (p.endsWith('.tsx') || p.endsWith('.ts')));
    if (usesExpoRouter) {
      // Bootstrap expo-router on Snack web preview
      code['App.js'] = {
        type: 'CODE',
        contents:
          "// Auto-generated by ZionX Snack adapter — bootstraps expo-router\n" +
          "// for Snack's web preview which doesn't read package.json's `main`.\n" +
          "import 'expo-router/entry';\n",
      };
    } else {
      // Fallback: write a tiny placeholder so the snack at least loads
      code['App.js'] = {
        type: 'CODE',
        contents:
          "import React from 'react';\n" +
          "import { View, Text, StyleSheet } from 'react-native';\n" +
          "export default function App() {\n" +
          "  return (\n" +
          "    <View style={styles.container}>\n" +
          `      <Text style={styles.title}>${(input.name || 'ZionX App').replace(/[<>"']/g, '')}</Text>\n` +
          "      <Text>Snack preview placeholder — your generated screens are in the project files.</Text>\n" +
          "    </View>\n" +
          "  );\n" +
          "}\n" +
          "const styles = StyleSheet.create({\n" +
          "  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },\n" +
          "  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },\n" +
          "});\n",
      };
    }
  }

  // Filter dependencies for Snack web compatibility.
  const filteredDeps = filterSnackDependencies(input.dependencies);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Snack-Api-Version': '3.0.0',
  };
  // Only attach an Expo bearer token if it's a clean token string (no
  // newlines, no whitespace, no JSON noise — Headers.append rejects those).
  if (input.expoToken && /^[A-Za-z0-9._\-]+$/.test(input.expoToken.trim())) {
    headers['Authorization'] = `Bearer ${input.expoToken.trim()}`;
  }

  const body = {
    manifest: {
      name: input.name,
      slug: slugify(input.name),
      sdkVersion,
      description: input.description,
      dependencies: filteredDeps,
    },
    code,
    dependencies: Object.fromEntries(
      Object.entries(filteredDeps).map(([k, v]) => [k, { version: v }]),
    ),
  };

  const response = await fetch(SNACK_SAVE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Pass the full Snack error JSON through so the dashboard can surface
    // it — Snack's "VALIDATION_ERROR" messages are actionable (missing file,
    // bad SDK version, etc.) and getting truncated at 200 chars hid them.
    throw new Error(`Snack save failed: ${response.status} ${text.slice(0, 600)}`);
  }

  const data = (await response.json()) as { id?: string; hashId?: string };
  const id = data.id ?? data.hashId;
  if (!id) {
    throw new Error('Snack save returned no id');
  }

  return {
    id,
    url: `https://snack.expo.dev/${id}`,
    // Use the NON-embedded Snack URL with platform=web&preview=true so the
    // device pane is always visible at any iframe width. The /embedded/<id>
    // path is responsive — it collapses to code-editor-only below ~500px,
    // which is why a narrow dashboard preview column shows code instead of
    // the running app. The non-embedded URL with these params shows the
    // device frame full-width inside the iframe.
    embedUrl: `https://snack.expo.dev/${id}?platform=web&preview=true&theme=dark&hideQueryParams=true`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'zionx-app';
}

/** Web-incompatible packages we strip from the Snack manifest. */
const SNACK_WEB_INCOMPATIBLE = new Set([
  'react-native-mmkv',
  '@shopify/react-native-skia',
  '@sentry/react-native',
]);

function filterSnackDependencies(deps: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pkg, version] of Object.entries(deps)) {
    if (SNACK_WEB_INCOMPATIBLE.has(pkg)) continue;
    out[pkg] = version;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shim helpers + sources
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compute the relative path from an importing file to the shim file.
 * Example:
 *   importing = "app/(tabs)/index.tsx", pkg = "@sentry/react-native"
 *   shim path = "shims/_sentry_react-native.js"
 *   returns:    "../../shims/_sentry_react-native"
 *
 * We strip the .js extension because TS/JS imports usually omit it; the
 * Snack bundler resolves it either way.
 */
function relativeShimPath(importingFile: string, pkg: string): string {
  const shimBase = `shims/${pkg.replace(/[/@]/g, '_')}`;
  const segments = importingFile.split('/');
  // segments.length - 1 directory levels to climb out
  const climb = '../'.repeat(Math.max(0, segments.length - 1));
  return `${climb}${shimBase}`;
}

/**
 * Sentry shim — exports the surface the generated layout code uses
 * (`init`, `wrap`, `addBreadcrumb`, `captureException`, etc.) as no-ops.
 * Real Sentry telemetry still works in production builds because the
 * shim is only injected for the Snack web preview.
 */
const SENTRY_SHIM = `// Auto-injected by ZionX Snack adapter — no-op shim for web preview.
// The full TestFlight build uses the real @sentry/react-native package.
const noop = () => {};
const passthrough = (x) => x;
export const init = noop;
export const wrap = passthrough;
export const captureException = noop;
export const captureMessage = noop;
export const addBreadcrumb = noop;
export const setTag = noop;
export const setUser = noop;
export const setContext = noop;
export const flush = async () => true;
export const close = async () => true;
export const ReactNativeTracing = function () {};
export const ReactNavigationInstrumentation = function () {};
export default { init, wrap, captureException, captureMessage, addBreadcrumb, setTag, setUser, setContext, flush, close };
`;

/**
 * MMKV shim — generates code typically uses MMKV via a hook like
 * usePersistedStore that wraps `new MMKV()`. We expose a fake instance
 * with set/get/delete/clearAll methods backed by an in-memory Map so
 * the app boots and reads/writes data per-session.
 */
const MMKV_SHIM = `// Auto-injected by ZionX Snack adapter — in-memory MMKV stub for web preview.
const memory = new Map();
export class MMKV {
  constructor() {}
  set(key, value) { memory.set(key, value); }
  getString(key) { const v = memory.get(key); return typeof v === 'string' ? v : undefined; }
  getNumber(key) { const v = memory.get(key); return typeof v === 'number' ? v : undefined; }
  getBoolean(key) { const v = memory.get(key); return typeof v === 'boolean' ? v : undefined; }
  delete(key) { memory.delete(key); }
  clearAll() { memory.clear(); }
  contains(key) { return memory.has(key); }
  getAllKeys() { return Array.from(memory.keys()); }
}
export default { MMKV };
`;

/**
 * Skia shim — Skia's GPU-backed canvas doesn't run on web. We export
 * inert React components so any Canvas/Circle/LinearGradient etc renders
 * to nothing instead of crashing the bundle.
 */
const SKIA_SHIM = `// Auto-injected by ZionX Snack adapter — no-op Skia stubs for web preview.
import React from 'react';
const Empty = (props) => null;
export const Canvas = Empty;
export const Circle = Empty;
export const Rect = Empty;
export const RoundedRect = Empty;
export const Group = Empty;
export const Path = Empty;
export const LinearGradient = Empty;
export const RadialGradient = Empty;
export const Mask = Empty;
export const Image = Empty;
export const Text = Empty;
export const SkPaint = Empty;
export const Skia = { Path: { Make: () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {} }) } };
export const vec = (x, y) => ({ x, y });
export const rect = (x, y, w, h) => ({ x, y, width: w, height: h });
export const useFont = () => null;
export const useImage = () => null;
export default { Canvas, Circle, Rect, Path, LinearGradient, vec };
`;

