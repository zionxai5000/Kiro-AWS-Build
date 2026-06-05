/**
 * @deprecated Phase 12 — Use the agent harness preview path instead.
 *
 * This module is the legacy preview path: workspace files → Expo Snack save
 * → iframe. The harness path (Phase 4+) provisions a real E2B sandbox per
 * project and serves the running app via the auth proxy at
 * `/api/preview/:projectId/*`. The harness path supports multi-screen
 * navigation, real Metro hot reload, on-phone preview via Expo Go, and the
 * full agent tool loop.
 *
 * Decommission plan: docs/zionx-agent-harness/DECOMMISSION-LEGACY.md.
 * Until that lands, the legacy `generateCode` handler still calls in here
 * for backward compatibility.
 *
 * --- ORIGINAL HEADER ---
 *
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

import * as babel from '@babel/core';

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
    '@expo-google-fonts/inter': EXPO_FONTS_SHIM,
    'moti': MOTI_SHIM,
    'phosphor-react-native': PHOSPHOR_SHIM,
    'zustand': ZUSTAND_SHIM,
    'zustand/middleware': ZUSTAND_MIDDLEWARE_SHIM,
    '@react-navigation/bottom-tabs': REACT_NAVIGATION_BOTTOM_TABS_SHIM,
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
    // Iterate longest first so subpath imports like `zustand/middleware`
    // get matched before the parent package `zustand`.
    const shimPkgs = Object.keys(SHIMS).sort((a, b) => b.length - a.length);
    for (const pkg of shimPkgs) {
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

  // ----------------------------------------------------------------
  // Strip markdown code-fence markers + transpile TypeScript via Babel.
  //
  // Snack's web bundler does not reliably apply @babel/preset-typescript
  // to user `.tsx` / `.ts` files — even when babel-preset-expo is in the
  // manifest, type-only syntax like `interface`, `type`, union types,
  // and `as` casts breaks the bundle. We pre-compile TS → JS server-side
  // using @babel/core with preset-typescript + preset-react, then rename
  // the file to `.js` / `.jsx`. Snack handles plain JS fine.
  //
  // The full TestFlight build is unaffected — EAS reads the workspace's
  // original .tsx files via the metro bundler.
  // ----------------------------------------------------------------
  for (const path of Object.keys(code)) {
    if (path.startsWith('shims/')) continue;
    let src = code[path]!.contents;
    const original = src;
    // Strip ```typescript ... ``` markdown fences if the LLM wrapped
    // file content (rare but observed).
    src = src.replace(/^```[a-zA-Z]*\s*\r?\n/m, '');
    src = src.replace(/\r?\n```\s*$/m, '');
    src = src.replace(/^```[a-zA-Z]*\s*$/gm, '');
    src = src.replace(/^```\s*$/gm, '');
    if (src !== original) code[path] = { type: 'CODE', contents: src };
  }
  // Babel-transpile every .ts / .tsx file → .js
  // We rename ALL transpiled output to `.js` (not `.jsx`) because Snack's
  // module resolver looks for `.js` first when an import has no extension
  // (e.g. `import Foo from './Foo'`). Using `.jsx` causes `Unable to
  // resolve module './Foo.js'` errors. The Babel-transpiled output is
  // plain JS regardless of original extension.
  const tsRenames: Record<string, string> = {};
  for (const path of Object.keys(code)) {
    if (path.startsWith('shims/')) continue;
    const isTs = path.endsWith('.ts');
    const isTsx = path.endsWith('.tsx');
    if (!isTs && !isTsx) continue;
    const newPath = path.replace(/\.tsx?$/, '.js');
    tsRenames[path] = newPath;
    let transformed: string;
    try {
      const result = babel.transformSync(code[path]!.contents, {
        filename: path,
        babelrc: false,
        configFile: false,
        compact: false,
        sourceMaps: false,
        presets: [
          ['@babel/preset-typescript', { isTSX: isTsx, allExtensions: true }],
        ],
      });
      transformed = result?.code ?? code[path]!.contents;
    } catch (err) {
      // If Babel fails (e.g. truly malformed source), pass the original
      // through. Snack will surface its own error which is still useful.
      transformed = code[path]!.contents;
    }
    code[newPath] = { type: 'CODE', contents: transformed };
    delete code[path];
  }
  // Rewrite explicit `.tsx`/`.ts` extensions in import paths → `.js`.
  for (const path of Object.keys(code)) {
    if (!/\.jsx?$/.test(path)) continue;
    const src = code[path]!.contents;
    const next = src
      .replace(/(['"`])([^'"`]+)\.tsx(['"`])/g, '$1$2.js$3')
      .replace(/(['"`])([^'"`]+)\.ts(['"`])/g, '$1$2.js$3');
    if (next !== src) code[path] = { type: 'CODE', contents: next };
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
    // Find the most-likely "main" screen file (after the .ts/.tsx → .js
    // transpile above). Priority:
    //   app/(tabs)/index.js → app/index.js → app/(tabs)/<other>.js
    //   → any screen-shaped file under app/.
    const allPaths = Object.keys(code);
    const candidates = [
      'app/(tabs)/index.js',
      'app/index.js',
      'app/(tabs)/game.js', 'app/(tabs)/home.js', 'app/(tabs)/main.js',
      'app/game.js', 'app/home.js', 'app/main.js',
    ];
    let mainScreen: string | null = null;
    for (const c of candidates) {
      if (code[c]) { mainScreen = c; break; }
    }
    // Fallback: any non-_layout file under app/
    if (!mainScreen) {
      mainScreen = allPaths.find((p) =>
        p.startsWith('app/') && /\.js$/.test(p) && !p.includes('_layout') && !p.includes('+not-found'),
      ) ?? null;
    }

    if (mainScreen) {
      // Copy the main screen to a root-level path. Snack's bundler can
      // be flaky with `app/(tabs)/...` paths because of the parens, so
      // having a paren-free copy at root is the safest path. After the
      // Babel transpile above, all source files are `.js`.
      const safeName = '_zionx_main.js';
      // Rewrite relative imports. The screen's ../../components/ui/Button
      // (from app/(tabs)/) becomes ./components/ui/Button (from root).
      const oldDepth = mainScreen.split('/').length - 1;
      const screenSrc = code[mainScreen]!.contents;
      let rewritten = screenSrc;
      for (let d = oldDepth; d >= 1; d--) {
        const ups = '\\.\\./'.repeat(d);
        const re = new RegExp(`(['"\`])${ups}`, 'g');
        rewritten = rewritten.replace(re, '$1./');
      }
      code[safeName] = { type: 'CODE', contents: rewritten };
      // safeName ends in .js — Snack's resolver finds it at the
      // extensionless import path `./_zionx_main`, so we drop the
      // extension here for cleanliness.
      const importPath = './' + safeName.replace(/\.js$/, '');
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
    // The dashboard renders this URL in its preview pane. /embedded/
    // is the player-only route; the dashboard CSS clips out the small
    // top/bottom chrome bands so only the running app shows.
    embedUrl: `https://snack.expo.dev/embedded/${id}?platform=web&preview=true&theme=dark&hideQueryParams=true`,
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
  '@expo-google-fonts/inter',
  'moti',
  'phosphor-react-native',
  'zustand',
]);

/**
 * Peer dependencies that Snack will warn about (and may refuse to bundle)
 * when they're missing from the manifest, even though the host package
 * declares them as `peerDependencies`. We inject these as `*` so Snack
 * picks a version that's compatible with the host.
 *
 * Source: Snack runtime warnings observed during acceptance probes.
 */
const SNACK_INJECT_PEER_DEPS: Record<string, string[]> = {};

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
  '@shopify/flash-list',
  '@react-native-async-storage/async-storage',
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
 * Skia shim — Skia's GPU-backed canvas doesn't run on web at all. But
 * we DO want the LLM-generated app to look polished in the preview, not
 * blank where gradients and decorative shapes should be. So we render
 * proxy components that map Skia primitives to web-compatible alternatives:
 *   - Canvas        → <View> with overflow:hidden, sized 200×200 by default
 *   - LinearGradient (inside Canvas) → expo-linear-gradient absolute fill
 *   - Circle/Rect/Path → soft-blurred colored <View>s positioned by props
 * Production EAS build uses real Skia and renders the actual shapes.
 */
const SKIA_SHIM = `// Auto-injected by ZionX Snack adapter — Skia → web-compatible visuals.
import React from 'react';
import { View } from 'react-native';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';

// Helper: extract LinearGradient children to use as Canvas background
const findGradient = (children) => {
  let colors = ['#6c8cff', '#4a6dff'];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type && child.type.__skiaGradient) {
      colors = child.props.colors || colors;
    }
    if (child.props && child.props.children) {
      const inner = findGradient(child.props.children);
      if (inner) colors = inner;
    }
  });
  return colors;
};

export const Canvas = React.forwardRef((props, ref) => {
  const { style, children, ...rest } = props;
  const colors = findGradient(children) || ['#6c8cff', '#4a6dff'];
  return React.createElement(View, {
    ref,
    style: [{ overflow: 'hidden', borderRadius: 14, minWidth: 80, minHeight: 80 }, style],
    ...rest,
  }, React.createElement(ExpoLinearGradient, {
    colors,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  }));
});

const NoOp = () => null;
export const Circle = NoOp;
export const Rect = NoOp;
export const RoundedRect = NoOp;
export const Group = ({ children }) => children;
export const Path = NoOp;

export const LinearGradient = (props) => {
  const Stub = () => null;
  Stub.__skiaGradient = true;
  Stub.props = props;
  return null;
};
LinearGradient.__skiaGradient = true;

export const RadialGradient = NoOp;
export const Mask = NoOp;
export const Image = NoOp;
export const Text = NoOp;
export const SkPaint = NoOp;
export const Skia = {
  Path: {
    Make: () => {
      const path = {
        moveTo: () => path,
        lineTo: () => path,
        close: () => path,
        addCircle: () => path,
        addArc: () => path,
        addRect: () => path,
        addOval: () => path,
        addRRect: () => path,
        addPath: () => path,
        cubicTo: () => path,
        quadTo: () => path,
        rMoveTo: () => path,
        rLineTo: () => path,
        rCubicTo: () => path,
        rQuadTo: () => path,
        arcToOval: () => path,
        arcToRotated: () => path,
        arcToTangent: () => path,
        offset: () => path,
        transform: () => path,
        reset: () => path,
        rewind: () => path,
        toSVGString: () => '',
        getBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      };
      return path;
    },
    MakeFromSVGString: () => null,
  },
  Color: (c) => c,
  RRectXY: (rect, rx, ry) => ({ rect, rx, ry }),
  XYWHRect: (x, y, w, h) => ({ x, y, width: w, height: h }),
  rrectXY: (rect, rx, ry) => ({ rect, rx, ry }),
};
export const vec = (x, y) => ({ x, y });
export const rect = (x, y, w, h) => ({ x, y, width: w, height: h });
export const useFont = () => null;
export const useImage = () => null;
export default { Canvas, Circle, Rect, Path, LinearGradient, vec };
`;


/**
 * @expo-google-fonts/inter shim — Snack's snackager fails to fetch
 * the web build of this package at any version (`Unable to fetch
 * module snackager-1-2/@expo-google-fonts~inter@x.y.z for web`). We
 * stub `useFonts` to return [true] (fonts loaded) immediately and
 * export the named font constants as empty objects so any code that
 * passes them to <Text style={{ fontFamily: Inter_400Regular }}> just
 * falls back to the platform default. The full TestFlight build uses
 * the real package and renders Inter.
 */
const EXPO_FONTS_SHIM = `// Auto-injected by ZionX Snack adapter — no-op fonts stub for web preview.
export const useFonts = () => [true, null];
export const Inter_100Thin = 'Inter-Thin';
export const Inter_200ExtraLight = 'Inter-ExtraLight';
export const Inter_300Light = 'Inter-Light';
export const Inter_400Regular = 'Inter-Regular';
export const Inter_500Medium = 'Inter-Medium';
export const Inter_600SemiBold = 'Inter-SemiBold';
export const Inter_700Bold = 'Inter-Bold';
export const Inter_800ExtraBold = 'Inter-ExtraBold';
export const Inter_900Black = 'Inter-Black';
export default { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold };
`;

/**
 * moti shim — moti is an animation library built on react-native-reanimated.
 * Snack's snackager fetches `moti@0.30.0` regardless of the manifest's `*`
 * and that version has no web build. We stub `MotiView` / `MotiText` /
 * `MotiPressable` as plain `View` / `Text` / `Pressable` so the iframe
 * preview boots — animations are silently dropped, but the layout and
 * tap interactions still work. Production EAS build uses real moti.
 */
const MOTI_SHIM = `// Auto-injected by ZionX Snack adapter — moti → static-end-state on web.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// Apply moti's animate-target as a static style so the visual end state
// shows immediately (no animation, but the app doesn't render mid-transition).
const passthrough = (Component) => React.forwardRef((props, ref) => {
  const { from, animate, exit, transition, exitTransition, style, ...rest } = props;
  const animatedStyle = animate || {};
  // Convert moti shorthand (translateX, scale, opacity) into RN style transforms.
  const transforms = [];
  if (animatedStyle.translateX !== undefined) transforms.push({ translateX: animatedStyle.translateX });
  if (animatedStyle.translateY !== undefined) transforms.push({ translateY: animatedStyle.translateY });
  if (animatedStyle.scale !== undefined) transforms.push({ scale: animatedStyle.scale });
  if (animatedStyle.rotate !== undefined) transforms.push({ rotate: animatedStyle.rotate });
  const flatStyle = StyleSheet.flatten([style, animatedStyle]);
  delete flatStyle.translateX;
  delete flatStyle.translateY;
  delete flatStyle.scale;
  delete flatStyle.rotate;
  if (transforms.length) flatStyle.transform = transforms;
  return React.createElement(Component, { ref, style: flatStyle, ...rest });
});
export const MotiView = passthrough(View);
export const MotiText = passthrough(Text);
export const MotiPressable = passthrough(Pressable);
export const MotiImage = passthrough(View);
export const AnimatePresence = ({ children }) => children;
export const useAnimationState = () => ({ transitionTo: () => {}, current: null });
export const useDynamicAnimation = (fn) => ({ animateTo: () => {}, current: typeof fn === 'function' ? fn() : (fn ?? {}) });
export default { MotiView, MotiText, MotiPressable, AnimatePresence };
`;

/**
 * phosphor-react-native shim — exports any imported icon component as
 * a tiny View placeholder. Phosphor's web build is not on snackager
 * (`Unable to fetch module phosphor-react-native@x.y.z for web`). The
 * iframe preview doesn't strictly need the icons rendered to verify
 * tap behavior, so a Proxy that returns a stub for ANY named export
 * lets the bundle compile and the screen mount.
 *
 * Production EAS build uses the real package and renders actual icons.
 */
const PHOSPHOR_ICON_NAMES = [
  'House','HouseSimple','Heart','HeartStraight','Star','Gear','User','UserCircle',
  'Plus','Minus','X','XCircle','Check','CheckCircle','ArrowLeft','ArrowRight',
  'ArrowUp','ArrowDown','CaretLeft','CaretRight','CaretUp','CaretDown',
  'Bell','Calendar','Clock','MagnifyingGlass','Eye','EyeSlash','PencilSimple',
  'Trash','TrashSimple','Share','ShareNetwork','Camera','Image','Folder',
  'Circle','Square','Triangle','Hexagon','SmileyXEyes','Trophy','Medal',
  'Lightning','Sparkle','Flame','Sun','Moon','MoonStars','Cloud','Rainbow',
  'Barbell','Bicycle','PersonSimpleRun','Brain','Book','BookOpen','Notebook',
  'Pencil','PencilLine','PaperPlaneTilt','Microphone','Headphones','MusicNote',
  'Play','Pause','Stop','SkipBack','SkipForward','Speaker','SpeakerHigh',
  'Hamburger','ForkKnife','Cookie','Coffee','Beer','WineBottle','Pizza',
  'ShoppingCart','ShoppingBag','CreditCard','Wallet','Coin','CurrencyDollar',
  'List','ListBullets','ListChecks','Kanban','Table','GridFour','SquaresFour',
  'Lock','LockOpen','Key','ShieldCheck','Warning','WarningCircle','Info',
  'Question','QuestionMark','LightbulbFilament','Lightbulb','Target',
  'TrendUp','TrendDown','ChartBar','ChartLine','ChartPie','ChartDonut',
  'Phone','PhoneCall','EnvelopeSimple','Envelope','ChatCircle','ChatTeardrop',
  'GameController','PuzzlePiece','Cube','CubeFocus','Lego',
  'PaintBrush','PaintBucket','PaintRoller','Palette','Eyedropper',
  'GitBranch','GitFork','GitCommit','Code','Terminal','Browser',
  'Globe','MapPin','MapTrifold','Compass','NavigationArrow',
  'CloudSun','CloudRain','Snowflake','ThermometerSimple','Wind',
  // Aliases / additions for habit-tracker / fitness / common app domains
  'Fire','Walking','Activity','Pulse','Bookmark','BookmarkSimple',
  'CalendarBlank','CalendarCheck','CalendarPlus','CheckSquare','CheckSquareOffset',
  'TimerSimple','Timer','Repeat','RepeatOnce','ArrowsClockwise','ArrowClockwise',
  'Plant','Tree','Mountains','DropHalf','Glasses','Eyeglasses',
  'Ruler','Scales','BatteryFull','BatteryHigh','BatteryMedium',
  'Sparkles','Confetti','Crown','Diamond','Gem','Smiley','SmileyMeh',
  'Bookmarks','Books','BookmarkSimpleSlash',
  'PaperPlaneRight','PaperPlane','Note','NotePencil','NoteBlank',
  'Article','ListPlus','TextAa','TextB','TextItalic',
  'BookOpenText','GraduationCap','Student','Backpack',
  'Stethoscope','FirstAid','HeartPulse','Pill','Syringe',
  'PersonSimple','PersonSimpleWalk','PersonSimpleBike','PersonSimpleSwim',
  'CarSimple','Bus','Train','Airplane',
  'WashingMachine','Bathtub','Bed','Couch',
  'LeafyGreens','Egg','Bread','Cake',
  'StarHalf','StarFour','StarSix','StarOfDavid',
  'Drop',
];

const PHOSPHOR_SHIM = `// Auto-injected by ZionX Snack adapter — phosphor icons → Unicode glyphs.
import React from 'react';
import { View, Text } from 'react-native';

// Phosphor icon names → Unicode/emoji stand-ins. Not pixel-identical but
// renders visible glyphs so the app looks like an app, not a wireframe.
const ICON_GLYPHS = {
  House: '\\u{1F3E0}', HouseSimple: '\\u{1F3E0}',
  Heart: '\\u2665', HeartStraight: '\\u2665',
  Star: '\\u2605', Trophy: '\\u{1F3C6}', Medal: '\\u{1F3C5}',
  Gear: '\\u2699', GearSix: '\\u2699',
  User: '\\u{1F464}', UserCircle: '\\u{1F464}',
  Plus: '+', Minus: '\\u2212',
  X: '\\u2715', XCircle: '\\u2715', XSquare: '\\u2715',
  Check: '\\u2713', CheckCircle: '\\u2713',
  ArrowLeft: '\\u2190', ArrowRight: '\\u2192', ArrowUp: '\\u2191', ArrowDown: '\\u2193',
  CaretLeft: '\\u2039', CaretRight: '\\u203A',
  Bell: '\\u{1F514}', Calendar: '\\u{1F4C5}', Clock: '\\u{1F550}',
  MagnifyingGlass: '\\u{1F50D}', Eye: '\\u{1F441}',
  PencilSimple: '\\u270E', Pencil: '\\u270E',
  Trash: '\\u{1F5D1}',
  Share: '\\u2197',
  Camera: '\\u{1F4F7}', Image: '\\u{1F5BC}', Folder: '\\u{1F4C1}',
  Circle: '\\u25CB', Square: '\\u25A1', Triangle: '\\u25B3',
  Lightning: '\\u26A1', Sparkle: '\\u2728', Flame: '\\u{1F525}', Fire: '\\u{1F525}',
  Drop: '\\u{1F4A7}', DropHalf: '\\u{1F4A7}',
  Trophy: '\\u{1F3C6}', Medal: '\\u{1F3C5}', Crown: '\\u{1F451}',
  Activity: '\\u26A1', Pulse: '\\u{1F493}', HeartPulse: '\\u{1F493}',
  Walking: '\\u{1F6B6}', PersonSimpleWalk: '\\u{1F6B6}', PersonSimpleRun: '\\u{1F3C3}',
  Bookmark: '\\u{1F516}', BookmarkSimple: '\\u{1F516}', Bookmarks: '\\u{1F4D1}',
  CheckSquare: '\\u2611', CheckSquareOffset: '\\u2611',
  TimerSimple: '\\u23F1', Timer: '\\u23F1',
  Repeat: '\\u{1F501}', RepeatOnce: '\\u{1F502}', ArrowsClockwise: '\\u{1F504}', ArrowClockwise: '\\u{1F504}',
  Note: '\\u{1F4DD}', NotePencil: '\\u{1F4DD}', NoteBlank: '\\u{1F4C4}',
  Article: '\\u{1F4D6}', GraduationCap: '\\u{1F393}',
  Sun: '\\u2600', Moon: '\\u263E', Cloud: '\\u2601',
  Brain: '\\u{1F9E0}', Book: '\\u{1F4D6}', Notebook: '\\u{1F4D3}',
  PaperPlaneTilt: '\\u2708', Microphone: '\\u{1F3A4}', Headphones: '\\u{1F3A7}',
  Play: '\\u25B6', Pause: '\\u23F8', Stop: '\\u25A0',
  ShoppingCart: '\\u{1F6D2}', ShoppingBag: '\\u{1F6CD}', CreditCard: '\\u{1F4B3}',
  CurrencyDollar: '$',
  List: '\\u2630', ListBullets: '\\u2630', ListChecks: '\\u2630',
  Lock: '\\u{1F512}', LockOpen: '\\u{1F513}', Key: '\\u{1F511}',
  Warning: '\\u26A0', Info: '\\u2139',
  Lightbulb: '\\u{1F4A1}', LightbulbFilament: '\\u{1F4A1}', Target: '\\u25CE',
  TrendUp: '\\u2197', TrendDown: '\\u2198', ChartBar: '\\u{1F4CA}',
  Phone: '\\u{1F4DE}', EnvelopeSimple: '\\u2709', Envelope: '\\u2709',
  ChatCircle: '\\u{1F4AC}',
  GameController: '\\u{1F3AE}', PuzzlePiece: '\\u{1F9E9}',
  PaintBrush: '\\u{1F58C}', Palette: '\\u{1F3A8}',
  Globe: '\\u{1F310}', MapPin: '\\u{1F4CD}',
};

const IconStub = React.forwardRef((props, ref) => {
  const size = props.size ?? 24;
  const color = props.color ?? '#666';
  const name = props.__iconName ?? '';
  const glyph = ICON_GLYPHS[name] || '\\u25C6';
  return React.createElement(View, {
    ref,
    style: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
    accessible: false,
  }, React.createElement(Text, {
    style: { fontSize: size * 0.7, lineHeight: size, color, textAlign: 'center' },
  }, glyph));
});

const makeIcon = (name) => React.forwardRef((props, ref) =>
  React.createElement(IconStub, Object.assign({}, props, { __iconName: name, ref }))
);

export default IconStub;
${Array.from(new Set(PHOSPHOR_ICON_NAMES)).map((n) => `export const ${n} = makeIcon('${n}');`).join('\n')}
`;


/**
 * zustand shim — provides a minimal zustand-compatible API so the
 * generated game store works in the Snack web preview.
 *
 * `zustand` itself COULD bundle on web, but its subpath imports
 * (zustand/middleware, zustand/shallow) don't resolve through Snack's
 * snackager. Rather than ship multiple files we shim both as one
 * adapter. The tic-tac-toe store calls `create()` and (often) wraps
 * with `persist(...)`; both work here as plain in-memory stores.
 *
 * Production EAS build uses the real zustand package.
 */
const ZUSTAND_SHIM = `// Auto-injected by ZionX Snack adapter — minimal zustand for web preview.
import { useEffect, useState } from 'react';

function createStoreImpl(initializer) {
  let state;
  const listeners = new Set();
  const setState = (partial, replace) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    if (Object.is(next, state)) return;
    state = replace ? next : Object.assign({}, state, next);
    listeners.forEach((l) => l(state));
  };
  const getState = () => state;
  const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
  const destroy = () => listeners.clear();
  const api = { setState, getState, subscribe, destroy };
  state = initializer(setState, getState, api);
  return api;
}

function useStoreSelector(api, selector) {
  const sel = selector ?? ((s) => s);
  const [val, setVal] = useState(() => sel(api.getState()));
  useEffect(() => api.subscribe((s) => setVal(sel(s))), []);
  return val;
}

export function create(initializer) {
  // create()(initializer) curried form
  if (initializer === undefined) {
    return (init) => create(init);
  }
  const api = createStoreImpl(initializer);
  const useStore = (selector) => useStoreSelector(api, selector);
  Object.assign(useStore, api);
  return useStore;
}

export default create;
`;

/**
 * zustand/middleware shim — exports persist/devtools/subscribeWithSelector
 * /immer as identity wrappers so user code wrapping a creator with
 * `persist(set => ({ ... }))` keeps the same callable shape.
 *
 * We deliberately drop persistence on the web preview — state lives in
 * memory for the session only. The full TestFlight build uses real
 * zustand/middleware with AsyncStorage persistence.
 */
const ZUSTAND_MIDDLEWARE_SHIM = `// Auto-injected by ZionX Snack adapter — middleware no-ops for web preview.
const identity = (creator) => creator;
export const persist = (creator, _options) => creator;
export const devtools = (creator, _options) => creator;
export const subscribeWithSelector = (creator) => creator;
export const immer = (creator) => creator;
export const combine = (initial, creator) => (set, get, api) => Object.assign({}, initial, creator(set, get, api));
export const redux = (reducer, initial) => (set, get) => ({ dispatch: (action) => set((s) => reducer(s, action)), ...initial });
// AsyncStorage-style createJSONStorage stub for persist()
export const createJSONStorage = () => undefined;
export default { persist, devtools, subscribeWithSelector, immer, combine, redux, createJSONStorage };
`;

/**
 * @react-navigation/bottom-tabs shim — the agent occasionally imports
 * { useBottomTabBarHeight, BottomTabBarHeightContext } from this package
 * from inside screens to compensate for the tab bar's height. The web
 * preview uses a single-screen adapter (no real tabs), so we stub all
 * common exports to safe no-ops:
 *  - useBottomTabBarHeight() -> 0
 *  - BottomTabBarHeightContext -> a React context with default value 0
 *  - createBottomTabNavigator() -> a fake navigator that just renders
 *    the first screen child (in case some other code path hits it)
 */
const REACT_NAVIGATION_BOTTOM_TABS_SHIM = `// Auto-injected by ZionX Snack adapter — bottom-tabs stubs for web preview.
import React from 'react';
export const useBottomTabBarHeight = () => 0;
export const BottomTabBarHeightContext = React.createContext(0);
export const BottomTabBarHeightCallbackContext = React.createContext(() => {});
export function createBottomTabNavigator() {
  return {
    Navigator: ({ children }) => React.createElement(React.Fragment, null, children),
    Screen: ({ children }) => React.createElement(React.Fragment, null, typeof children === 'function' ? children({}) : children),
    Group: ({ children }) => React.createElement(React.Fragment, null, children),
  };
}
export default { useBottomTabBarHeight, BottomTabBarHeightContext, createBottomTabNavigator };
`;
