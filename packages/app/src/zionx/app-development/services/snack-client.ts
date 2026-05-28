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

  // Filter dependencies for Snack web compatibility.
  const filteredDeps = filterSnackDependencies(input.dependencies);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Snack-Api-Version': '3.0.0',
  };
  if (input.expoToken) {
    headers['Authorization'] = `Bearer ${input.expoToken}`;
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
    throw new Error(`Snack save failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as { id?: string; hashId?: string };
  const id = data.id ?? data.hashId;
  if (!id) {
    throw new Error('Snack save returned no id');
  }

  return {
    id,
    url: `https://snack.expo.dev/${id}`,
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
]);

function filterSnackDependencies(deps: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pkg, version] of Object.entries(deps)) {
    if (SNACK_WEB_INCOMPATIBLE.has(pkg)) continue;
    out[pkg] = version;
  }
  return out;
}
