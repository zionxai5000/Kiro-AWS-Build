/**
 * Pipeline Hook 09: Submission Prep
 *
 * Trigger: Manual API call "Ready to Submit"
 * Action: Validate workspace state against submission requirements.
 *         Returns a checklist with pass/fail/warn per item.
 * Failure mode: HALT — never bypass user confirmation.
 * Timeout: 30s
 * Concurrency: 1 per user
 *
 * CRITICAL: This hook does NOT auto-submit. It produces a review checklist and
 * requires an explicit confirmation API call (C5) before the actual submission.
 *
 * Pure workspace-state validation — no API calls, no credential fetches, no LLM.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { Workspace } from '../workspace/workspace.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { SubmissionChecklist, ChecklistItem, StoreListing } from '../types/index.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'submission-prep',
  name: 'Submission Prep',
  triggerType: 'api_request',
  failureMode: 'halt',
  timeoutMs: LIMITS.submissionPrepTimeoutMs,
  maxConcurrent: 1,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface SubmissionPrepInput {
  projectId: string;
  platform: 'ios' | 'android';
}

export interface SubmissionPrepOutput {
  checklist: SubmissionChecklist;
  readyForConfirmation: boolean;
  missingItems: string[];
  ascAppId?: string;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: SubmissionPrepInput,
  ctx: HookContext,
): Promise<HookResult<SubmissionPrepOutput>> {
  const start = Date.now();
  const { projectId, platform } = input;

  // Kill switch
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: {
        checklist: { projectId, platform, items: [], allPassed: false },
        readyForConfirmation: false,
        missingItems: ['Hook disabled'],
      },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would validate ${platform} submission for project "${projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: {
        checklist: { projectId, platform, items: [], allPassed: false },
        readyForConfirmation: false,
        missingItems: [],
      },
      durationMs: Date.now() - start,
    };
  }

  const workspace = new Workspace();
  ctx.log(`[${HOOK_METADATA.id}] Validating ${platform} submission for project "${projectId}"...`);

  // Load workspace state
  const state = await loadWorkspaceState(workspace, projectId);

  // Build checklist per platform
  const items: ChecklistItem[] = platform === 'ios'
    ? buildIosChecklist(state)
    : buildAndroidChecklist(state);

  const allPassed = items.every((item) => item.status !== 'fail');
  const missingItems = items
    .filter((item) => item.status === 'fail')
    .map((item) => `${item.label}: ${item.detail ?? 'Required'}`);

  const checklist: SubmissionChecklist = { projectId, platform, items, allPassed };

  ctx.log(`[${HOOK_METADATA.id}] Checklist: ${items.filter(i => i.status === 'pass').length} pass, ${items.filter(i => i.status === 'warn').length} warn, ${items.filter(i => i.status === 'fail').length} fail`);

  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: {
      checklist,
      readyForConfirmation: allPassed,
      missingItems,
      ascAppId: state.ascAppId ?? undefined,
    },
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Workspace State Loading
// ---------------------------------------------------------------------------

interface WorkspaceState {
  ascAppId: string | null;
  easProjectId: string | null;
  listing: StoreListing | null;
  listingMissingFields: string[];
  iconExists: boolean;
  screenshotCount: number;
}

async function loadWorkspaceState(workspace: Workspace, projectId: string): Promise<WorkspaceState> {
  // Read eas.json
  let ascAppId: string | null = null;
  let easProjectId: string | null = null;
  try {
    const easJsonContent = await workspace.readFile(projectId, 'eas.json');
    const easJson = JSON.parse(easJsonContent);
    ascAppId = easJson?.submit?.production?.ios?.ascAppId ?? null;
    // eas.json exists and parses — project is configured for builds
    // (Hook 9 doesn't verify the actual build artifact — that happens
    //  at eas submit in the C5 confirm endpoint)
    easProjectId = 'linked';
  } catch {
    // eas.json doesn't exist
  }

  // Read store-listing.json
  let listing: StoreListing | null = null;
  const listingMissingFields: string[] = [];
  try {
    const listingContent = await workspace.readFile(projectId, 'store-listing.json');
    listing = JSON.parse(listingContent) as StoreListing;
    // Validate required fields
    if (!listing.name) listingMissingFields.push('name');
    if (!listing.description) listingMissingFields.push('description');
    if (!listing.keywords) listingMissingFields.push('keywords');
    if (!listing.privacyPolicyUrl) listingMissingFields.push('privacyPolicyUrl');
    if (!listing.supportUrl) listingMissingFields.push('supportUrl');
    if (!listing.category) listingMissingFields.push('category');
  } catch {
    // store-listing.json doesn't exist
  }

  // Check icon
  const iconExists = await workspace.exists(projectId, 'assets/icon.png');

  // Count screenshots
  let screenshotCount = 0;
  try {
    const allFiles = await workspace.listFiles(projectId);
    screenshotCount = allFiles.filter((f) => f.startsWith('assets/screenshots/') && f.endsWith('.png')).length;
  } catch {
    // No files
  }

  return {
    ascAppId,
    easProjectId,
    listing,
    listingMissingFields,
    iconExists,
    screenshotCount,
  };
}

// ---------------------------------------------------------------------------
// iOS Checklist (8 items)
// ---------------------------------------------------------------------------

function buildIosChecklist(state: WorkspaceState): ChecklistItem[] {
  return [
    {
      id: 'build_exists',
      label: 'Build pipeline configured',
      status: state.easProjectId ? 'pass' : 'fail',
      detail: state.easProjectId ? undefined : 'eas.json not found — run Hook 6 (build) to configure EAS project',
    },
    {
      id: 'asc_app_exists',
      label: 'App Store Connect app registered',
      status: state.ascAppId ? 'pass' : 'fail',
      detail: state.ascAppId ? undefined : 'Run Hook 8 (store listing) — ASC app not yet registered',
    },
    {
      id: 'listing_complete',
      label: 'Store listing complete',
      ...getListingStatus(state),
    },
    {
      id: 'screenshots_uploaded',
      label: 'Screenshots available',
      ...getScreenshotStatus(state, 3),
    },
    {
      id: 'icon_exists',
      label: 'App icon present',
      status: state.iconExists ? 'pass' : 'fail',
      detail: state.iconExists ? undefined : 'App icon missing — run Hook 7 (asset generation)',
    },
    {
      id: 'privacy_policy_url',
      label: 'Privacy policy URL set',
      status: state.listing?.privacyPolicyUrl?.startsWith('https://') ? 'pass' : 'fail',
      detail: state.listing?.privacyPolicyUrl?.startsWith('https://') ? undefined : 'Privacy policy URL missing or invalid in store listing',
    },
    {
      id: 'support_url',
      label: 'Support URL set',
      status: state.listing?.supportUrl?.startsWith('https://') ? 'pass' : 'fail',
      detail: state.listing?.supportUrl?.startsWith('https://') ? undefined : 'Support URL missing or invalid in store listing',
    },
    {
      id: 'category_set',
      label: 'Primary category set',
      status: state.listing?.category ? 'pass' : 'fail',
      detail: state.listing?.category ? undefined : 'Category not set in store listing',
    },
  ];
}

// ---------------------------------------------------------------------------
// Android Checklist (5 items)
// ---------------------------------------------------------------------------

function buildAndroidChecklist(state: WorkspaceState): ChecklistItem[] {
  return [
    {
      id: 'build_exists',
      label: 'Build pipeline configured',
      status: state.easProjectId ? 'pass' : 'fail',
      detail: state.easProjectId ? undefined : 'eas.json not found — run Hook 6 (build) to configure EAS project',
    },
    {
      id: 'first_release_done',
      label: 'First release on Google Play',
      status: 'warn',
      detail: 'First release on Google Play must be manual. Subsequent releases are automated via eas submit.',
    },
    {
      id: 'listing_complete',
      label: 'Store listing complete',
      ...getListingStatus(state),
    },
    {
      id: 'screenshots_exist',
      label: 'Screenshots available',
      ...getScreenshotStatus(state, 2),
    },
    {
      id: 'service_account_key',
      label: 'Google Play service account configured',
      status: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET ? 'pass' : 'warn',
      detail: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET
        ? undefined
        : 'Using default secret name "seraphim/googleplay". Set GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET env var to override.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

function getListingStatus(state: WorkspaceState): { status: 'pass' | 'fail' | 'warn'; detail?: string } {
  if (!state.listing) {
    return { status: 'fail', detail: 'Run Hook 8 first — store-listing.json not found' };
  }
  if (state.listingMissingFields.length > 0) {
    return { status: 'fail', detail: `Listing incomplete — missing fields: ${state.listingMissingFields.join(', ')}` };
  }
  return { status: 'pass' };
}

function getScreenshotStatus(state: WorkspaceState, minRequired: number): { status: 'pass' | 'fail' | 'warn'; detail?: string } {
  if (state.screenshotCount < minRequired) {
    return { status: 'fail', detail: `Need ≥${minRequired} screenshots before submission` };
  }
  // Screenshots exist but they're placeholders
  return {
    status: 'warn',
    detail: 'Placeholder screenshots present. Replace with real captures before App Store review.',
  };
}
