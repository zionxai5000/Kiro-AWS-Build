/**
 * Store Listing Prompts — LLM prompt templates for generating
 * App Store / Google Play listing metadata via Claude.
 *
 * Used by Hook 8 (store-listing-writer) to produce a StoreListing
 * object from an app name + description.
 */

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

/**
 * System prompt for Claude when generating store listing metadata.
 * Instructs the model to output a JSON object matching the StoreListing interface.
 */
export const STORE_LISTING_SYSTEM_PROMPT = `You are a professional App Store copywriter. Generate compelling store listing metadata for a mobile app. Follow Apple App Store and Google Play guidelines.

CONSTRAINTS:
- App name: 2-30 characters (may differ from the internal project name)
- Subtitle: max 30 characters
- Description: 10-4000 characters. First 3 lines are most important (visible without "Read More")
- Keywords: max 100 characters total, comma-separated, no spaces after commas
- Category: choose from the Apple App Store category list below

VALID CATEGORIES:
BUSINESS, DEVELOPER_TOOLS, EDUCATION, ENTERTAINMENT, FINANCE, FOOD_AND_DRINK, GAMES, GRAPHICS_AND_DESIGN, HEALTH_AND_FITNESS, LIFESTYLE, MEDICAL, MUSIC, NAVIGATION, NEWS, PHOTO_AND_VIDEO, PRODUCTIVITY, REFERENCE, SHOPPING, SOCIAL_NETWORKING, SPORTS, TRAVEL, UTILITIES, WEATHER

OUTPUT FORMAT (strict JSON, no markdown fences, no commentary):
{
  "name": "...",
  "subtitle": "...",
  "description": "...",
  "keywords": "...",
  "category": "HEALTH_AND_FITNESS",
  "supportUrl": "...",
  "privacyPolicyUrl": "..."
}

RULES:
- Output ONLY the JSON object. No explanation, no markdown code fences.
- The "name" field is the App Store display name — make it catchy and memorable.
- Keywords should be relevant search terms users would type. No duplicates. No brand names.
- Description should open with a compelling hook, then list 3-5 key features, then close with a call to action.
- supportUrl and privacyPolicyUrl will be provided in the user prompt — use them exactly as given.`;

// ---------------------------------------------------------------------------
// User Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Build the user prompt for store listing generation.
 *
 * @param args.appName - The app's working name (may be refined by the LLM)
 * @param args.appDescription - The original user prompt or expanded description
 * @param args.bundleIdentifier - The iOS/Android bundle ID
 * @param args.privacyPolicyUrl - The verified privacy policy URL
 * @returns A formatted user prompt string ready to send to Claude
 */
export function buildStoreListingUserPrompt(args: {
  appName: string;
  appDescription: string;
  bundleIdentifier: string;
  privacyPolicyUrl: string;
}): string {
  return `Generate an App Store listing for this app:

App Name: ${args.appName}
Description: ${args.appDescription}
Bundle ID: ${args.bundleIdentifier}

Use these URLs exactly as provided:
- supportUrl: "https://zionxai5000.github.io/privacy-policies/"
- privacyPolicyUrl: "${args.privacyPolicyUrl}"

The app is built with React Native / Expo. Target audience: general consumers.
Tone: professional but approachable. Emphasize the key features mentioned in the description.`;
}
