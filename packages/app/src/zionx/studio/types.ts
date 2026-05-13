/**
 * ZionX App Development Studio — Types
 *
 * All studio-specific types for the in-browser app development experience.
 * These types define the data structures for session management, project state,
 * file tree, build status, edit commands, and preview connections.
 *
 * Requirements: 42a.1, 42c.8, 42d.11
 */

// ---------------------------------------------------------------------------
// Design System Types
// ---------------------------------------------------------------------------

export interface DesignSystem {
  colorPalette: Record<string, string>;
  typography: Record<string, string>;
  spacing: Record<string, number>;
  components: string[];
  iconography: string;
  animations: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Screen and Navigation Types
// ---------------------------------------------------------------------------

export interface ScreenDefinition {
  id: string;
  name: string;
  route: string;
  components: string[];
  layout: string;
}

export interface NavigationConfig {
  type: 'stack' | 'tab' | 'drawer';
  screens: string[];
  initialRoute: string;
}

// ---------------------------------------------------------------------------
// Integration and Monetization Types
// ---------------------------------------------------------------------------

export interface IntegrationConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface MonetizationConfig {
  model: 'subscription' | 'freemium' | 'ads' | 'hybrid';
  products?: string[];
  paywallScreen?: string;
}

// ---------------------------------------------------------------------------
// Project State
// ---------------------------------------------------------------------------

export interface ProjectState {
  appName: string;
  appDescription: string;
  designSystem: DesignSystem;
  screens: ScreenDefinition[];
  navigation: NavigationConfig;
  integrations: IntegrationConfig[];
  monetization: MonetizationConfig;
  targetPlatforms: ('ios' | 'android')[];
}

// ---------------------------------------------------------------------------
// File Tree
// ---------------------------------------------------------------------------

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
  language?: string;
}

// ---------------------------------------------------------------------------
// Build Status
// ---------------------------------------------------------------------------

export interface PlatformBuildStatus {
  status: 'idle' | 'building' | 'success' | 'failed';
  progress?: number;
  error?: string;
  buildId?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BuildStatus {
  ios: PlatformBuildStatus;
  android: PlatformBuildStatus;
}

// ---------------------------------------------------------------------------
// Edit Commands and Results
// ---------------------------------------------------------------------------

export interface FileChange {
  path: string;
  previousContent: string;
  newContent: string;
  type: 'create' | 'modify' | 'delete';
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

export interface EditCommand {
  id: string;
  timestamp: Date;
  description: string;
  fileChanges: FileChange[];
  testResults?: TestResult[];
}

export interface EditResult {
  success: boolean;
  editCommand?: EditCommand;
  error?: string;
  testsPassed?: boolean;
}

// ---------------------------------------------------------------------------
// Preview Connection
// ---------------------------------------------------------------------------

export interface PreviewConnection {
  status: 'disconnected' | 'connecting' | 'connected';
  deviceProfile?: string;
  lastRenderAt?: Date;
}

// ---------------------------------------------------------------------------
// Studio Session
// ---------------------------------------------------------------------------

export interface StudioSession {
  sessionId: string;
  tenantId: string;
  appId: string;
  projectState: ProjectState;
  fileTree: FileNode[];
  buildStatus: BuildStatus;
  previewConnection: PreviewConnection;
  undoStack: EditCommand[];
  redoStack: EditCommand[];
  createdAt: Date;
  lastActivityAt: Date;
}
