/**
 * Asset Generation Prompt Templates — Phase 7
 *
 * Converts appName + appDescription into image generation prompts
 * for each asset type. Designed for OpenAI gpt-image-1-mini.
 *
 * Each prompt is crafted to produce images suitable for Expo SDK 52
 * production builds without post-processing.
 */

// ---------------------------------------------------------------------------
// Asset Definitions
// ---------------------------------------------------------------------------

export interface AssetSpec {
  /** File name relative to assets/ directory */
  filename: string;
  /** Image dimensions (must be OpenAI-supported: 1024x1024, 1536x1024, 1024x1536) */
  size: '1024x1024' | '1536x1024' | '1024x1536';
  /** Background mode: opaque for iOS icon, transparent for splash/notification */
  background: 'opaque' | 'transparent';
  /** Human-readable purpose for logging */
  purpose: string;
}

/**
 * The 4 assets generated for every project.
 * All at 1024x1024 (Expo handles resizing at build time).
 */
export const ASSET_SPECS: readonly AssetSpec[] = [
  {
    filename: 'icon.png',
    size: '1024x1024',
    background: 'opaque',
    purpose: 'App icon (iOS + Android)',
  },
  {
    filename: 'splash-icon.png',
    size: '1024x1024',
    background: 'transparent',
    purpose: 'Splash screen icon',
  },
  {
    filename: 'adaptive-icon.png',
    size: '1024x1024',
    background: 'opaque',
    purpose: 'Android adaptive icon foreground',
  },
  {
    filename: 'notification-icon.png',
    size: '1024x1024',
    background: 'transparent',
    purpose: 'Android notification icon',
  },
] as const;

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

/**
 * Build the image generation prompt for the main app icon.
 * Requirements: square, no alpha (opaque), recognizable at small sizes, no text.
 */
export function buildIconPrompt(appName: string, appDescription?: string): string {
  const desc = appDescription ? `, which is ${appDescription}` : '';
  return (
    `A modern, minimalist app icon for an app called "${appName}"${desc}. ` +
    'Clean vector-style design with a single centered symbol or object. ' +
    'Bold, vibrant colors on a solid colored background. ' +
    'No text, no letters, no words. No gradients that look muddy at small sizes. ' +
    'Professional quality suitable for iOS App Store and Google Play Store. ' +
    'Square composition filling the entire frame. Simple and instantly recognizable.'
  );
}

/**
 * Build the image generation prompt for the splash screen icon.
 * Requirements: transparent background, centered, works on solid color backgrounds.
 */
export function buildSplashIconPrompt(appName: string, appDescription?: string): string {
  const desc = appDescription ? `, which is ${appDescription}` : '';
  return (
    `A clean, centered logo symbol for an app called "${appName}"${desc}. ` +
    'Simple, recognizable icon designed to appear centered on a solid color background. ' +
    'Just the icon itself with no background elements. ' +
    'Minimal detail, works well at various sizes. ' +
    'Modern and professional. No text or lettering.'
  );
}

/**
 * Build the image generation prompt for the Android adaptive icon foreground.
 * Requirements: opaque, centered within safe zone (center 66%), works with any mask shape.
 */
export function buildAdaptiveIconPrompt(appName: string, appDescription?: string): string {
  const desc = appDescription ? `, which is ${appDescription}` : '';
  return (
    `A foreground icon element for an Android adaptive icon for "${appName}"${desc}. ` +
    'Single centered symbol with clear edges on a solid colored background. ' +
    'Designed to work when masked into circle, squircle, or rounded square shapes. ' +
    'Keep the important content within the center 66% of the image (safe zone). ' +
    'Bold, simple design. No text, no fine details that disappear at small sizes.'
  );
}

/**
 * Build the image generation prompt for the notification icon.
 * Requirements: monochrome white silhouette on transparent background, simple shape.
 */
export function buildNotificationIconPrompt(appName: string, appDescription?: string): string {
  const desc = appDescription ? ` representing ${appDescription}` : '';
  return (
    `A simple monochrome notification icon${desc} for an app called "${appName}". ` +
    'Pure white silhouette shape on a transparent background. ' +
    'Single simple geometric shape, instantly recognizable at 24x24 pixels. ' +
    'No color, no gradients, no fine details, no text. ' +
    'Flat design with solid white fill. Similar style to Material Design system icons.'
  );
}

// ---------------------------------------------------------------------------
// Prompt Dispatcher
// ---------------------------------------------------------------------------

/**
 * Build the appropriate prompt for a given asset spec.
 */
export function buildPromptForAsset(
  spec: AssetSpec,
  appName: string,
  appDescription?: string,
): string {
  switch (spec.filename) {
    case 'icon.png':
      return buildIconPrompt(appName, appDescription);
    case 'splash-icon.png':
      return buildSplashIconPrompt(appName, appDescription);
    case 'adaptive-icon.png':
      return buildAdaptiveIconPrompt(appName, appDescription);
    case 'notification-icon.png':
      return buildNotificationIconPrompt(appName, appDescription);
    default:
      return buildIconPrompt(appName, appDescription);
  }
}
