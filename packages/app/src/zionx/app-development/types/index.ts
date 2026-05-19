/**
 * Core type definitions for the App Development pipeline.
 * All entities used across pipeline stages, services, and API handlers.
 */

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export type ProjectStatus =
  | 'idle'
  | 'prompting'
  | 'sanitizing'
  | 'generating'
  | 'previewing'
  | 'validating'
  | 'building'
  | 'asset-generating'
  | 'store-prep'
  | 'submitted'
  | 'error';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  platform: 'ios' | 'android' | 'both';
  files: GeneratedFile[];
  buildId?: string;
  storeListingId?: string;
  error?: ProjectError;
}

// ---------------------------------------------------------------------------
// Generated Files
// ---------------------------------------------------------------------------

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export interface PendingPrompt {
  id: string;
  raw: string;
  timestamp: string;
  projectId?: string;
}

export interface SanitizedPrompt {
  id: string;
  original: string;
  sanitized: string;
  strippedItems: StrippedItem[];
  timestamp: string;
  projectId?: string;
}

export interface StrippedItem {
  type: 'api_key' | 'credit_card' | 'ssn' | 'email' | 'secret' | 'unknown';
  original: string;
  replacement: string;
  position: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Chat / Messages
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenerationRequest {
  promptId: string;
  projectId: string;
  model: string;
  systemPrompt: string;
  timestamp: string;
}

export interface GenerationResult {
  projectId: string;
  files: GeneratedFile[];
  tokensUsed: number;
  durationMs: number;
  model: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export type BuildStatus =
  | 'queued'
  | 'preparing'
  | 'building'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface BuildJob {
  id: string;
  projectId: string;
  platform: 'ios' | 'android';
  status: BuildStatus;
  easBuildId?: string;
  artifactUrl?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface AssetSet {
  projectId: string;
  icon: AssetVariant[];
  splash: AssetVariant[];
  screenshots: AssetVariant[];
  generatedAt: string;
}

export interface AssetVariant {
  path: string;
  width: number;
  height: number;
  purpose: string;
}

// ---------------------------------------------------------------------------
// Store Listing
// ---------------------------------------------------------------------------

export interface StoreListing {
  name: string;              // 2-30 chars (App Store display name)
  subtitle: string;          // max 30 chars
  description: string;       // 10-4000 chars
  keywords: string;          // max 100 chars, comma-separated
  category: string;          // Apple category ID (e.g., "HEALTH_AND_FITNESS")
  supportUrl: string;
  privacyPolicyUrl: string;
  marketingUrl?: string;
  whatsNew?: string;         // For updates only
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export interface SubmissionChecklist {
  projectId: string;
  platform: 'ios' | 'android';
  items: ChecklistItem[];
  allPassed: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

// ---------------------------------------------------------------------------
// App Store Connect — App Entity
// ---------------------------------------------------------------------------

export interface AscAppInfo {
  ascAppId: string;          // Numeric Apple ID (the "Apple ID" in ASC)
  bundleId: string;          // e.g., "dev.zionxai.workouttracker"
  name: string;              // Display name as registered in ASC
  sku: string;               // Internal SKU (not visible to users)
  primaryLocale: string;     // e.g., "en-US"
}

// ---------------------------------------------------------------------------
// Hook System
// ---------------------------------------------------------------------------

export type HookFailureMode = 'silent' | 'notify' | 'halt';

export interface HookConfig {
  enabled: boolean;
  dryRun: boolean;
}

export interface HookExecution {
  hookId: string;
  startedAt: string;
  completedAt?: string;
  success: boolean;
  dryRun: boolean;
  error?: string;
  duration?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ProjectError {
  code: string;
  message: string;
  hookId?: string;
  timestamp: string;
  retryable: boolean;
  retryCount: number;
}
