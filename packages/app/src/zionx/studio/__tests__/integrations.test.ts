/**
 * Unit tests for ZionX App Development Studio — Integration Panel Service
 *
 * Validates: Requirements 42e.13, 42e.14, 42e.15
 *
 * Tests integration listing, enable/disable with SDK code generation,
 * credential storage via Otzar, and config management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultIntegrationPanelService,
  INTEGRATIONS,
} from '../integrations.js';
import type {
  CredentialStore,
  SDKCodeGenerator,
  IntegrationPanelService,
  IntegrationDefinition,
} from '../integrations.js';
import type { FileChange } from '../types.js';

// ---------------------------------------------------------------------------
// Mock Implementations
// ---------------------------------------------------------------------------

function createMockCredentialStore(): CredentialStore {
  const storage = new Map<string, Map<string, string>>();

  return {
    store: vi.fn(async (sessionId: string, key: string, value: string) => {
      if (!storage.has(sessionId)) {
        storage.set(sessionId, new Map());
      }
      storage.get(sessionId)!.set(key, value);
    }),
    retrieve: vi.fn(async (sessionId: string, key: string) => {
      return storage.get(sessionId)?.get(key) ?? null;
    }),
    delete: vi.fn(async (sessionId: string, key: string) => {
      storage.get(sessionId)?.delete(key);
    }),
    listKeys: vi.fn(async (sessionId: string) => {
      const sessionStore = storage.get(sessionId);
      if (!sessionStore) return [];
      return Array.from(sessionStore.keys());
    }),
  };
}

function createMockCodeGenerator(): SDKCodeGenerator {
  return {
    generateIntegrationCode: vi.fn(
      async (integration: IntegrationDefinition, _config: Record<string, unknown>): Promise<FileChange[]> => {
        return [
          {
            path: `src/integrations/${integration.id}.ts`,
            previousContent: '',
            newContent: `// Generated SDK code for ${integration.name}`,
            type: 'create',
          },
          {
            path: `src/integrations/${integration.id}.config.json`,
            previousContent: '',
            newContent: `{}`,
            type: 'create',
          },
        ];
      },
    ),
    removeIntegrationCode: vi.fn(
      async (integration: IntegrationDefinition): Promise<FileChange[]> => {
        return [
          {
            path: `src/integrations/${integration.id}.ts`,
            previousContent: `// Generated SDK code for ${integration.name}`,
            newContent: '',
            type: 'delete',
          },
          {
            path: `src/integrations/${integration.id}.config.json`,
            previousContent: `{}`,
            newContent: '',
            type: 'delete',
          },
        ];
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultIntegrationPanelService', () => {
  let service: IntegrationPanelService;
  let credentialStore: CredentialStore;
  let codeGenerator: SDKCodeGenerator;

  beforeEach(() => {
    credentialStore = createMockCredentialStore();
    codeGenerator = createMockCodeGenerator();
    service = new DefaultIntegrationPanelService(credentialStore, codeGenerator);
  });

  describe('listAvailableIntegrations', () => {
    it('returns all 18 integrations', () => {
      const integrations = service.listAvailableIntegrations();
      expect(integrations).toHaveLength(18);
    });

    it('includes all expected integration names', () => {
      const integrations = service.listAvailableIntegrations();
      const names = integrations.map((i) => i.name);

      expect(names).toContain('Preview');
      expect(names).toContain('Code');
      expect(names).toContain('Design');
      expect(names).toContain('Files');
      expect(names).toContain('Images');
      expect(names).toContain('Audio');
      expect(names).toContain('API');
      expect(names).toContain('Environment Variables');
      expect(names).toContain('Database');
      expect(names).toContain('Payments');
      expect(names).toContain('Prompts');
      expect(names).toContain('Haptics');
      expect(names).toContain('Logs');
      expect(names).toContain('Network Requests');
      expect(names).toContain('Store Assets');
      expect(names).toContain('Ad Studio');
      expect(names).toContain('Revenue');
      expect(names).toContain('Deployments');
    });

    it('returns a copy (not a reference to the internal array)', () => {
      const first = service.listAvailableIntegrations();
      const second = service.listAvailableIntegrations();
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe('enableIntegration', () => {
    it('generates SDK code and returns generated file paths', async () => {
      const result = await service.enableIntegration('session-1', 'preview');

      expect(result.success).toBe(true);
      expect(result.generatedFiles).toHaveLength(2);
      expect(result.generatedFiles).toContain('src/integrations/preview.ts');
      expect(result.generatedFiles).toContain('src/integrations/preview.config.json');
    });

    it('calls code generator with integration definition and merged config', async () => {
      await service.enableIntegration('session-1', 'preview', { autoReload: false });

      expect(codeGenerator.generateIntegrationCode).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'preview', name: 'Preview' }),
        expect.objectContaining({ autoReload: false, deviceProfile: 'iphone-15-pro' }),
      );
    });

    it('returns error for unknown integration', async () => {
      const result = await service.enableIntegration('session-1', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown integration');
      expect(result.generatedFiles).toEqual([]);
    });

    it('returns error when required credentials are missing', async () => {
      const result = await service.enableIntegration('session-1', 'payments');

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires credentials');
      expect(result.generatedFiles).toEqual([]);
    });

    it('succeeds when required credentials are stored', async () => {
      // Store a credential with the integration prefix
      await credentialStore.store('session-1', 'payments_api_key', 'rc_test_key_123');

      const result = await service.enableIntegration('session-1', 'payments', {
        provider: 'revenuecat',
      });

      expect(result.success).toBe(true);
      expect(result.generatedFiles).toHaveLength(2);
    });

    it('merges user config with template defaults', async () => {
      await service.enableIntegration('session-1', 'preview', { autoReload: false });

      const states = await service.getSessionIntegrations('session-1');
      const previewState = states.find((s) => s.integrationId === 'preview');

      expect(previewState).toBeDefined();
      expect(previewState!.config).toEqual({
        autoReload: false,
        deviceProfile: 'iphone-15-pro',
      });
    });
  });

  describe('disableIntegration', () => {
    it('removes SDK code and returns removed file paths', async () => {
      // First enable
      await service.enableIntegration('session-1', 'preview');

      // Then disable
      const result = await service.disableIntegration('session-1', 'preview');

      expect(result.success).toBe(true);
      expect(result.removedFiles).toHaveLength(2);
      expect(result.removedFiles).toContain('src/integrations/preview.ts');
    });

    it('calls removeIntegrationCode on the code generator', async () => {
      await service.enableIntegration('session-1', 'preview');
      await service.disableIntegration('session-1', 'preview');

      expect(codeGenerator.removeIntegrationCode).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'preview', name: 'Preview' }),
      );
    });

    it('returns error for unknown integration', async () => {
      const result = await service.disableIntegration('session-1', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown integration');
    });

    it('returns error when integration is not enabled', async () => {
      const result = await service.disableIntegration('session-1', 'preview');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('marks integration as disabled in session state', async () => {
      await service.enableIntegration('session-1', 'preview');
      await service.disableIntegration('session-1', 'preview');

      const states = await service.getSessionIntegrations('session-1');
      const previewState = states.find((s) => s.integrationId === 'preview');

      expect(previewState).toBeDefined();
      expect(previewState!.enabled).toBe(false);
    });
  });

  describe('storeCredential', () => {
    it('stores credential via CredentialStore without exposing values', async () => {
      await service.storeCredential('session-1', 'payments_api_key', 'secret_value_123');

      expect(credentialStore.store).toHaveBeenCalledWith(
        'session-1',
        'payments_api_key',
        'secret_value_123',
      );
    });

    it('does not return or expose the credential value', async () => {
      await service.storeCredential('session-1', 'db_password', 'super_secret');

      // listCredentialKeys should only return keys, never values
      const keys = await service.listCredentialKeys('session-1');
      expect(keys).toContain('db_password');
      // Verify no value leakage — keys array contains only strings that are key names
      expect(keys.every((k) => !k.includes('super_secret'))).toBe(true);
    });
  });

  describe('listCredentialKeys', () => {
    it('returns keys but never values', async () => {
      await service.storeCredential('session-1', 'api_key', 'value1');
      await service.storeCredential('session-1', 'db_url', 'value2');

      const keys = await service.listCredentialKeys('session-1');

      expect(keys).toContain('api_key');
      expect(keys).toContain('db_url');
      expect(keys).not.toContain('value1');
      expect(keys).not.toContain('value2');
    });

    it('returns empty array for session with no credentials', async () => {
      const keys = await service.listCredentialKeys('empty-session');
      expect(keys).toEqual([]);
    });
  });

  describe('getSessionIntegrations', () => {
    it('returns current state for a session', async () => {
      await service.enableIntegration('session-1', 'preview');
      await service.enableIntegration('session-1', 'code');

      const states = await service.getSessionIntegrations('session-1');

      expect(states).toHaveLength(2);
      expect(states.map((s) => s.integrationId).sort()).toEqual(['code', 'preview']);
      expect(states.every((s) => s.enabled)).toBe(true);
    });

    it('returns empty array for session with no integrations', async () => {
      const states = await service.getSessionIntegrations('new-session');
      expect(states).toEqual([]);
    });

    it('includes credential keys in state (without values)', async () => {
      await credentialStore.store('session-1', 'payments_api_key', 'secret');
      await service.enableIntegration('session-1', 'payments');

      const states = await service.getSessionIntegrations('session-1');
      const paymentsState = states.find((s) => s.integrationId === 'payments');

      expect(paymentsState).toBeDefined();
      expect(paymentsState!.credentialKeys).toContain('payments_api_key');
    });
  });

  describe('updateConfig', () => {
    it('merges config updates into existing state', async () => {
      await service.enableIntegration('session-1', 'preview');
      await service.updateConfig('session-1', 'preview', { deviceProfile: 'iphone-16' });

      const states = await service.getSessionIntegrations('session-1');
      const previewState = states.find((s) => s.integrationId === 'preview');

      expect(previewState!.config).toEqual({
        autoReload: true,
        deviceProfile: 'iphone-16',
      });
    });

    it('throws for non-existent session', async () => {
      await expect(
        service.updateConfig('nonexistent', 'preview', {}),
      ).rejects.toThrow('No integrations found');
    });

    it('throws for non-existent integration in session', async () => {
      await service.enableIntegration('session-1', 'preview');

      await expect(
        service.updateConfig('session-1', 'code', {}),
      ).rejects.toThrow('Integration not found');
    });
  });
});
