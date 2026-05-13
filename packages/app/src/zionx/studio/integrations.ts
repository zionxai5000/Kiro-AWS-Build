/**
 * ZionX App Development Studio — Integration Panel Service
 *
 * Manages the vertical integration menu where the King can connect services.
 * When an integration is enabled, the system generates the required SDK code
 * and configuration. Credentials are stored securely via Otzar (never exposed
 * in the UI).
 *
 * Requirements: 42e.13, 42e.14, 42e.15
 */

import type { FileChange } from './types.js';

// ---------------------------------------------------------------------------
// Integration Definition
// ---------------------------------------------------------------------------

export type IntegrationCategory =
  | 'core'
  | 'services'
  | 'monetization'
  | 'analytics'
  | 'media'
  | 'development';

export interface IntegrationDefinition {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  icon: string;
  requiresCredentials: boolean;
  sdkPackages?: string[];
  configTemplate?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Integration State (per session)
// ---------------------------------------------------------------------------

export interface IntegrationState {
  integrationId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  credentialKeys?: string[];
  generatedFiles?: string[];
}

// ---------------------------------------------------------------------------
// Credential Store Interface (Otzar abstraction)
// ---------------------------------------------------------------------------

export interface CredentialStore {
  store(sessionId: string, key: string, value: string): Promise<void>;
  retrieve(sessionId: string, key: string): Promise<string | null>;
  delete(sessionId: string, key: string): Promise<void>;
  listKeys(sessionId: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// SDK Code Generator Interface
// ---------------------------------------------------------------------------

export interface SDKCodeGenerator {
  generateIntegrationCode(
    integration: IntegrationDefinition,
    config: Record<string, unknown>,
  ): Promise<FileChange[]>;
  removeIntegrationCode(integration: IntegrationDefinition): Promise<FileChange[]>;
}

// ---------------------------------------------------------------------------
// Integration Panel Service Interface
// ---------------------------------------------------------------------------

export interface IntegrationPanelService {
  listAvailableIntegrations(): IntegrationDefinition[];
  getSessionIntegrations(sessionId: string): Promise<IntegrationState[]>;
  enableIntegration(
    sessionId: string,
    integrationId: string,
    config?: Record<string, unknown>,
  ): Promise<{ success: boolean; generatedFiles: string[]; error?: string }>;
  disableIntegration(
    sessionId: string,
    integrationId: string,
  ): Promise<{ success: boolean; removedFiles: string[]; error?: string }>;
  storeCredential(sessionId: string, key: string, value: string): Promise<void>;
  listCredentialKeys(sessionId: string): Promise<string[]>;
  updateConfig(
    sessionId: string,
    integrationId: string,
    config: Record<string, unknown>,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Built-in Integration Definitions
// ---------------------------------------------------------------------------

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: 'preview',
    name: 'Preview',
    category: 'core',
    description: 'Live preview settings for real-time app rendering',
    icon: 'eye',
    requiresCredentials: false,
    configTemplate: { autoReload: true, deviceProfile: 'iphone-15-pro' },
  },
  {
    id: 'code',
    name: 'Code',
    category: 'development',
    description: 'Code editor settings and language configuration',
    icon: 'code',
    requiresCredentials: false,
    configTemplate: { language: 'typescript', formatter: 'prettier' },
  },
  {
    id: 'design',
    name: 'Design',
    category: 'core',
    description: 'Design system configuration and theme management',
    icon: 'palette',
    requiresCredentials: false,
    configTemplate: { theme: 'default', colorMode: 'light' },
  },
  {
    id: 'files',
    name: 'Files',
    category: 'development',
    description: 'File management and project structure',
    icon: 'folder',
    requiresCredentials: false,
    configTemplate: { showHidden: false, sortBy: 'name' },
  },
  {
    id: 'images',
    name: 'Images',
    category: 'media',
    description: 'Image asset management and optimization',
    icon: 'image',
    requiresCredentials: false,
    configTemplate: { optimization: true, maxWidth: 2048 },
  },
  {
    id: 'audio',
    name: 'Audio',
    category: 'media',
    description: 'Audio and sound configuration for the app',
    icon: 'volume',
    requiresCredentials: false,
    configTemplate: { format: 'aac', sampleRate: 44100 },
  },
  {
    id: 'api',
    name: 'API',
    category: 'services',
    description: 'External API connections and endpoint management',
    icon: 'globe',
    requiresCredentials: true,
    configTemplate: { baseUrl: '', timeout: 30000 },
  },
  {
    id: 'environment-variables',
    name: 'Environment Variables',
    category: 'development',
    description: 'Environment variable management for build configurations',
    icon: 'key',
    requiresCredentials: true,
    configTemplate: { variables: {} },
  },
  {
    id: 'database',
    name: 'Database',
    category: 'services',
    description: 'Database connection (Supabase, Firebase, etc.)',
    icon: 'database',
    requiresCredentials: true,
    sdkPackages: ['@supabase/supabase-js'],
    configTemplate: { provider: 'supabase', url: '', anonKey: '' },
  },
  {
    id: 'payments',
    name: 'Payments',
    category: 'monetization',
    description: 'RevenueCat payment and subscription integration',
    icon: 'credit-card',
    requiresCredentials: true,
    sdkPackages: ['react-native-purchases'],
    configTemplate: { provider: 'revenuecat', apiKey: '', entitlements: [] },
  },
  {
    id: 'prompts',
    name: 'Prompts',
    category: 'development',
    description: 'AI prompt templates for code generation',
    icon: 'message-square',
    requiresCredentials: false,
    configTemplate: { templates: [] },
  },
  {
    id: 'haptics',
    name: 'Haptics',
    category: 'media',
    description: 'Haptic feedback configuration for touch interactions',
    icon: 'vibrate',
    requiresCredentials: false,
    configTemplate: { enabled: true, intensity: 'medium' },
  },
  {
    id: 'logs',
    name: 'Logs',
    category: 'development',
    description: 'Logging configuration and log viewer',
    icon: 'file-text',
    requiresCredentials: false,
    configTemplate: { level: 'info', persist: false },
  },
  {
    id: 'network-requests',
    name: 'Network Requests',
    category: 'development',
    description: 'Network request debugging and monitoring',
    icon: 'wifi',
    requiresCredentials: false,
    configTemplate: { interceptEnabled: true, logRequests: true },
  },
  {
    id: 'store-assets',
    name: 'Store Assets',
    category: 'core',
    description: 'App Store and Play Store screenshot and asset management',
    icon: 'shopping-bag',
    requiresCredentials: false,
    configTemplate: { platforms: ['ios', 'android'], screenshotSizes: [] },
  },
  {
    id: 'ad-studio',
    name: 'Ad Studio',
    category: 'monetization',
    description: 'Ad creative management and placement configuration',
    icon: 'megaphone',
    requiresCredentials: true,
    sdkPackages: ['react-native-google-mobile-ads'],
    configTemplate: { provider: 'admob', adUnitIds: {} },
  },
  {
    id: 'revenue',
    name: 'Revenue',
    category: 'analytics',
    description: 'Revenue tracking and analytics dashboard',
    icon: 'trending-up',
    requiresCredentials: true,
    configTemplate: { trackingEnabled: true, currency: 'USD' },
  },
  {
    id: 'deployments',
    name: 'Deployments',
    category: 'core',
    description: 'Build and deployment management for app stores',
    icon: 'rocket',
    requiresCredentials: true,
    configTemplate: { autoSubmit: false, targets: ['ios', 'android'] },
  },
];

// ---------------------------------------------------------------------------
// Default Implementation (In-Memory)
// ---------------------------------------------------------------------------

export class DefaultIntegrationPanelService implements IntegrationPanelService {
  private readonly sessionStates: Map<string, Map<string, IntegrationState>> = new Map();
  private readonly credentialStore: CredentialStore;
  private readonly codeGenerator: SDKCodeGenerator;

  constructor(credentialStore: CredentialStore, codeGenerator: SDKCodeGenerator) {
    this.credentialStore = credentialStore;
    this.codeGenerator = codeGenerator;
  }

  listAvailableIntegrations(): IntegrationDefinition[] {
    return [...INTEGRATIONS];
  }

  async getSessionIntegrations(sessionId: string): Promise<IntegrationState[]> {
    const states = this.sessionStates.get(sessionId);
    if (!states) {
      return [];
    }
    return Array.from(states.values());
  }

  async enableIntegration(
    sessionId: string,
    integrationId: string,
    config?: Record<string, unknown>,
  ): Promise<{ success: boolean; generatedFiles: string[]; error?: string }> {
    const definition = INTEGRATIONS.find((i) => i.id === integrationId);
    if (!definition) {
      return { success: false, generatedFiles: [], error: `Unknown integration: ${integrationId}` };
    }

    // Check if credentials are required but not yet stored
    if (definition.requiresCredentials) {
      const storedKeys = await this.credentialStore.listKeys(sessionId);
      const requiredPrefix = `${integrationId}_`;
      const hasCredentials = storedKeys.some((k) => k.startsWith(requiredPrefix));
      if (!hasCredentials) {
        return {
          success: false,
          generatedFiles: [],
          error: `Integration "${definition.name}" requires credentials. Store credentials with key prefix "${requiredPrefix}" before enabling.`,
        };
      }
    }

    // Merge config with template defaults
    const mergedConfig = { ...(definition.configTemplate ?? {}), ...(config ?? {}) };

    // Generate SDK code
    let generatedFiles: string[] = [];
    try {
      const fileChanges = await this.codeGenerator.generateIntegrationCode(definition, mergedConfig);
      generatedFiles = fileChanges.map((fc) => fc.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code generation failed';
      return { success: false, generatedFiles: [], error: message };
    }

    // Get credential keys for this integration
    const allKeys = await this.credentialStore.listKeys(sessionId);
    const credentialKeys = allKeys.filter((k) => k.startsWith(`${integrationId}_`));

    // Store integration state
    const state: IntegrationState = {
      integrationId,
      enabled: true,
      config: mergedConfig,
      credentialKeys: credentialKeys.length > 0 ? credentialKeys : undefined,
      generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
    };

    if (!this.sessionStates.has(sessionId)) {
      this.sessionStates.set(sessionId, new Map());
    }
    this.sessionStates.get(sessionId)!.set(integrationId, state);

    return { success: true, generatedFiles };
  }

  async disableIntegration(
    sessionId: string,
    integrationId: string,
  ): Promise<{ success: boolean; removedFiles: string[]; error?: string }> {
    const definition = INTEGRATIONS.find((i) => i.id === integrationId);
    if (!definition) {
      return { success: false, removedFiles: [], error: `Unknown integration: ${integrationId}` };
    }

    const states = this.sessionStates.get(sessionId);
    const currentState = states?.get(integrationId);
    if (!currentState || !currentState.enabled) {
      return { success: false, removedFiles: [], error: `Integration "${definition.name}" is not enabled` };
    }

    // Remove SDK code
    let removedFiles: string[] = [];
    try {
      const fileChanges = await this.codeGenerator.removeIntegrationCode(definition);
      removedFiles = fileChanges.map((fc) => fc.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code removal failed';
      return { success: false, removedFiles: [], error: message };
    }

    // Update state to disabled
    currentState.enabled = false;
    currentState.generatedFiles = undefined;

    return { success: true, removedFiles };
  }

  async storeCredential(sessionId: string, key: string, value: string): Promise<void> {
    await this.credentialStore.store(sessionId, key, value);
  }

  async listCredentialKeys(sessionId: string): Promise<string[]> {
    return this.credentialStore.listKeys(sessionId);
  }

  async updateConfig(
    sessionId: string,
    integrationId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const states = this.sessionStates.get(sessionId);
    if (!states) {
      throw new Error(`No integrations found for session: ${sessionId}`);
    }

    const state = states.get(integrationId);
    if (!state) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    state.config = { ...state.config, ...config };
  }
}
