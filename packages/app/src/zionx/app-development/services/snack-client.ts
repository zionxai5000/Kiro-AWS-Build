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
  // LLM-generated apps use expo-router with `app/_layout.tsx` for production,
  // but Snack's web preview doesn't reliably bootstrap expo-router (it
  // crashes with "TypeError: '' is not a function" when expo-router/entry
  // tries to mount on web). To get a real, tappable preview in the iframe
  // we bypass expo-router entirely and instead import the main screen
  // directly. The full TestFlight / EAS build is unaffected — it uses
  // the real workspace package.json + app/_layout.tsx + expo-router.
  const hasAppJs = code['App.js'] !== undefined;
  const hasAppTsx = code['App.tsx'] !== undefined;
  if (!hasAppJs && !hasAppTsx) {
    // Find the most-likely "main" screen file. Priority:
    //   app/(tabs)/index.tsx → app/index.tsx → app/(tabs)/<other>.tsx
    //   → any screen-shaped file under app/.
    const allPaths = Object.keys(code);
    const candidates = [
      'app/(tabs)/index.tsx', 'app/(tabs)/index.ts',
      'app/index.tsx', 'app/index.ts',
      'app/(tabs)/game.tsx', 'app/(tabs)/home.tsx', 'app/(tabs)/main.tsx',
      'app/game.tsx', 'app/home.tsx', 'app/main.tsx',
    ];
    let mainScreen: string | null = null;
    for (const c of candidates) {
      if (code[c]) { mainScreen = c; break; }
    }
    // Fallback: any non-_layout file under app/
    if (!mainScreen) {
      mainScreen = allPaths.find((p) =>
        p.startsWith('app/') && /\.tsx?$/.test(p) && !p.includes('_layout') && !p.includes('+not-found'),
      ) ?? null;
    }

    if (mainScreen) {
      // Snack's bundler chokes on directory names with parentheses (e.g.
      // "app/(tabs)/index.tsx" — the parens upset its require-resolver and
      // can manifest as cryptic Babel "Missing semicolon" or "is not a
      // function" errors. To avoid that, COPY the screen content to a
      // safe path at the project root (preserving extension) and import
      // FROM THAT COPY in App.js. The original file is left in place so
      // production EAS builds (which read the workspace, not the Snack
      // code map) are unaffected.
      const safeName = '_zionx_main' + mainScreen.match(/\.[a-z]+$/i)?.[0]; // _zionx_main.tsx
      // Rewrite relative imports from the screen's original directory
      // (e.g. app/(tabs)/) up to the project root. Each level deeper
      // adds one '../' that we now need to drop. We compute the depth
      // from `mainScreen` and replace `'../<n>...'` → `'./...'`.
      const depth = mainScreen.split('/').length - 1; // app/(tabs)/index.tsx → 2
      const upPattern = '\\.\\.' + '/'.repeat(0); // start with one ..
      // Build a regex that matches between 1 and `depth` consecutive `../`
      // at the start of a quoted import path.
      const screenSrc = code[mainScreen]!.contents;
      let rewritten = screenSrc;
      // For each depth starting from highest, replace that many ../ with ./
      for (let d = depth; d >= 1; d--) {
        const ups = '\\.\\./'.repeat(d);
        const re = new RegExp(`(['"\`])${ups}`, 'g');
        rewritten = rewritten.replace(re, '$1./');
      }
      code[safeName] = { type: 'CODE', contents: rewritten };

      const importPath = './' + safeName.replace(/\.(t|j)sx?$/, '');
      code['App.js'] = {
        type: 'CODE',
        contents:
          "// Auto-generated by ZionX Snack adapter for the WEB PREVIEW ONLY.\n" +
          "// We bypass expo-router because Snack's web bundle of expo-router\n" +
          "// can fail with cryptic 'is not a function' errors when the\n" +
          "// (tabs) layout tries to mount BlurView/etc. The production build\n" +
          "// uses real expo-router via the workspace's app/_layout.tsx.\n" +
          "import React from 'react';\n" +
          "import { GestureHandlerRootView } from 'react-native-gesture-handler';\n" +
          "import { SafeAreaProvider } from 'react-native-safe-area-context';\n" +
          `import MainScreen from '${importPath}';\n` +
          "export default function App() {\n" +
          "  return (\n" +
          "    <GestureHandlerRootView style={{ flex: 1 }}>\n" +
          "      <SafeAreaProvider>\n" +
          "        <MainScreen />\n" +
          "      </SafeAreaProvider>\n" +
          "    </GestureHandlerRootView>\n" +
          "  );\n" +
          "}\n",
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

  // ALSO rewrite the `package.json` file inside the Snack code map so its
  // dependencies match `filteredDeps`. Snack's snackager resolves package
  // versions from the file's package.json (not just the manifest) — when
  // the file has `"expo-blur": "~15.0.8"` and the manifest has
  // `"expo-blur": "*"`, snackager picks the pinned version and fails to
  // fetch the web bundle. Keeping both in sync fixes "Unable to fetch
  // module ... for web" errors at runtime. EAS production builds are
  // unaffected because they read the workspace's on-disk package.json,
  // not this Snack-only rewritten copy.
  if (code['package.json']) {
    try {
      const pkgJson = JSON.parse(code['package.json'].contents);
      pkgJson.dependencies = filteredDeps;
      code['package.json'] = {
        type: 'CODE',
        contents: JSON.stringify(pkgJson, null, 2),
      };
    } catch {
      /* if package.json is malformed, leave it alone — Snack will surface a parse error */
    }
  }

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
    // Use the non-embedded Snack URL — the `/embedded/<id>` route refuses
    // to bundle anonymous-saved snacks (returns 400 "Open full editor to
    // add new dependencies"). The non-embedded route bundles correctly
    // and renders the running app in a nested iframe.
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

/**
 * Peer dependencies that Snack will warn about (and may refuse to bundle)
 * when they're missing from the manifest, even though the host package
 * declares them as `peerDependencies`. We inject these as `*` so Snack
 * picks a version that's compatible with the host.
 *
 * Source: Snack runtime warnings observed during acceptance probes.
 */
const SNACK_INJECT_PEER_DEPS: Record<string, string[]> = {
  'zustand': ['immer', '@types/react'],
};

function filterSnackDependencies(deps: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pkg, version] of Object.entries(deps)) {
    if (SNACK_WEB_INCOMPATIBLE.has(pkg)) continue;
    // Snack's snackager CDN sometimes can't fetch arbitrary versions for
    // its web preview. For Expo-family packages we pass "*" so Snack uses
    // its SDK-aligned default (equivalent to `expo install <pkg>`),
    // matching the runtime's actual support matrix. Generated package.json
    // (with the LLM's pinned versions) is unaffected — it lives on disk
    // and EAS reads it for the real production build.
    if (SNACK_AUTOVERSION_PACKAGES.has(pkg)) {
      out[pkg] = '*';
      continue;
    }
    out[pkg] = version;
  }
  // Inject peer dependencies that the host packages declare but which
  // the LLM didn't include. Without these, Snack throws a peer-dep
  // warning that can prevent the bundle from loading.
  for (const [host, peers] of Object.entries(SNACK_INJECT_PEER_DEPS)) {
    if (!(host in out)) continue;
    for (const peer of peers) {
      if (!(peer in out)) out[peer] = '*';
    }
  }
  return out;
}

/**
 * Packages where we let Snack pick the SDK-aligned version. The LLM emits
 * exact ranges (~3.0.0, ~14.0.0, etc) that don't always have a build on
 * Snack's web snackager CDN — letting Snack auto-resolve fixes those
 * "Unable to fetch module foo@x.y.z for web" errors without changing the
 * production build.
 */
const SNACK_AUTOVERSION_PACKAGES = new Set([
  'expo',
  'expo-asset',
  'expo-blur',
  'expo-constants',
  'expo-font',
  'expo-haptics',
  'expo-image',
  'expo-linear-gradient',
  'expo-linking',
  'expo-router',
  'expo-splash-screen',
  'expo-status-bar',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  '@expo/vector-icons',
  // Third-party packages we've observed snackager fail to resolve at the
  // LLM's pinned versions but which DO have working web builds at "*".
  'phosphor-react-native',
  'moti',
  '@shopify/flash-list',
  '@react-native-async-storage/async-storage',
  '@expo-google-fonts/inter',
  'zustand',
]);

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

