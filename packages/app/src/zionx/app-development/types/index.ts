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
  id: string;
  projectId: string;
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  promotionalText: string;
  category: string;
  privacyPolicyUrl: string;
  eulaUrl: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export interface SubmissionChecklist {
  projectId: string;
  items: SubmissionChecklistItem[];
  allConfirmed: boolean;
  confirmedAt?: string;
}

export interface SubmissionChecklistItem {
  id: string;
  label: string;
  description: string;
  confirmed: boolean;
  confirmedAt?: string;
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
