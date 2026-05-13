/**
 * Unit tests for the MCP Tool Registry.
 *
 * Requirements: 36c.10, 36c.11, 36c.12
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MCPToolRegistryImpl } from './tool-registry.js';
import type { MCPToolDefinition } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(overrides: Partial<MCPToolDefinition> = {}): MCPToolDefinition {
  return {
    name: 'test-tool',
    description: 'A test tool for unit testing',
    inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
    requiredAuthority: 'L4',
    handler: async () => ({ success: true, output: 'ok' }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPToolRegistryImpl', () => {
  let registry: MCPToolRegistryImpl;

  beforeEach(() => {
    registry = new MCPToolRegistryImpl();
  });

  // -------------------------------------------------------------------------
  // Internal Tool Registration
  // -------------------------------------------------------------------------

  describe('registerInternalTools', () => {
    it('should register internal tools for an agent', () => {
      const tools = [
        makeTool({ name: 'file-read', description: 'Read a file' }),
        makeTool({ name: 'file-write', description: 'Write a file' }),
      ];

      registry.registerInternalTools('seraphim', tools);

      const all = registry.listAllTools();
      expect(all).toHaveLength(2);
      expect(all[0].source).toBe('internal');
      expect(all[0].agentId).toBe('seraphim');
      expect(all[0].toolId).toBe('internal:seraphim:file-read');
      expect(all[1].toolId).toBe('internal:seraphim:file-write');
    });

    it('should validate tools have name, description, and inputSchema', () => {
      const tools = [
        makeTool({ name: '', description: 'No name' }),
        makeTool({ name: 'valid', description: '' }),
        makeTool({ name: 'also-valid', description: 'Has all fields' }),
      ];

      registry.registerInternalTools('agent-1', tools);

      const all = registry.listAllTools();
      // Only the valid tool should be registered
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('also-valid');
    });

    it('should throw if agentId is empty', () => {
      expect(() => registry.registerInternalTools('', [makeTool()])).toThrow(
        'agentId is required',
      );
    });

    it('should set availability to available on registration', () => {
      registry.registerInternalTools('agent-1', [makeTool()]);

      const all = registry.listAllTools();
      expect(all[0].availability).toBe('available');
    });

    it('should set registeredAt timestamp', () => {
      const before = new Date();
      registry.registerInternalTools('agent-1', [makeTool()]);
      const after = new Date();

      const all = registry.listAllTools();
      expect(all[0].registeredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(all[0].registeredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // External Server Registration
  // -------------------------------------------------------------------------

  describe('registerExternalServer', () => {
    it('should register tools from an external server', () => {
      const tools = [
        makeTool({ name: 'db-query', description: 'Query a database' }),
      ];

      registry.registerExternalServer('https://mcp.example.com', tools);

      const all = registry.listAllTools();
      expect(all).toHaveLength(1);
      expect(all[0].source).toBe('external');
      expect(all[0].serverUrl).toBe('https://mcp.example.com');
      expect(all[0].toolId).toBe('external:https://mcp.example.com:db-query');
    });

    it('should throw if serverUrl is empty', () => {
      expect(() => registry.registerExternalServer('', [makeTool()])).toThrow(
        'serverUrl is required',
      );
    });

    it('should set lastHealthCheck on external tools', () => {
      registry.registerExternalServer('https://mcp.example.com', [makeTool()]);

      const all = registry.listAllTools();
      expect(all[0].lastHealthCheck).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // Tool Listing
  // -------------------------------------------------------------------------

  describe('listAllTools', () => {
    it('should return all registered tools from all sources', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'tool-a', description: 'Tool A' }),
      ]);
      registry.registerExternalServer('https://server.com', [
        makeTool({ name: 'tool-b', description: 'Tool B' }),
      ]);

      const all = registry.listAllTools();
      expect(all).toHaveLength(2);
    });

    it('should return empty array when no tools registered', () => {
      expect(registry.listAllTools()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  describe('searchTools', () => {
    beforeEach(() => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'file-read', description: 'Read contents of a file from the filesystem' }),
        makeTool({ name: 'file-write', description: 'Write content to a file on disk' }),
        makeTool({ name: 'http-get', description: 'Make an HTTP GET request to a URL' }),
      ]);
    });

    it('should find tools matching keyword in name', () => {
      const results = registry.searchTools('file');

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name)).toContain('file-read');
      expect(results.map((r) => r.name)).toContain('file-write');
    });

    it('should find tools matching keyword in description', () => {
      const results = registry.searchTools('HTTP request');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('http-get');
    });

    it('should return empty array for empty query', () => {
      expect(registry.searchTools('')).toHaveLength(0);
    });

    it('should return empty array for no matches', () => {
      const results = registry.searchTools('kubernetes deploy');
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Get Tool Schema
  // -------------------------------------------------------------------------

  describe('getToolSchema', () => {
    it('should return the correct entry by tool ID', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'my-tool', description: 'My tool' }),
      ]);

      const entry = registry.getToolSchema('internal:agent-1:my-tool');

      expect(entry).toBeDefined();
      expect(entry!.name).toBe('my-tool');
      expect(entry!.description).toBe('My tool');
      expect(entry!.inputSchema).toEqual({
        type: 'object',
        properties: { input: { type: 'string' } },
      });
    });

    it('should return undefined for unknown tool ID', () => {
      expect(registry.getToolSchema('internal:agent-1:nonexistent')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Capability Matching
  // -------------------------------------------------------------------------

  describe('findByCapability', () => {
    beforeEach(() => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'file-read', description: 'Read contents of a file from the filesystem' }),
        makeTool({ name: 'file-write', description: 'Write content to a file on disk' }),
        makeTool({ name: 'http-get', description: 'Make an HTTP GET request to a URL' }),
        makeTool({ name: 'db-query', description: 'Query a database with SQL statements' }),
      ]);
    });

    it('should return tools matching capability description sorted by score', () => {
      const matches = registry.findByCapability('read file contents');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entry.name).toBe('file-read');
      expect(matches[0].relevanceScore).toBeGreaterThan(0);
      expect(matches[0].relevanceScore).toBeLessThanOrEqual(1);
    });

    it('should sort results by relevance score descending', () => {
      const matches = registry.findByCapability('file operations');

      // file-read and file-write should both match
      const fileTools = matches.filter((m) => m.entry.name.startsWith('file'));
      expect(fileTools.length).toBe(2);

      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].relevanceScore).toBeGreaterThanOrEqual(matches[i + 1].relevanceScore);
      }
    });

    it('should return empty array for empty description', () => {
      expect(registry.findByCapability('')).toHaveLength(0);
    });

    it('should return empty array for no matches', () => {
      const matches = registry.findByCapability('deploy kubernetes cluster');
      expect(matches).toHaveLength(0);
    });

    it('should match partial keywords', () => {
      const matches = registry.findByCapability('database query');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entry.name).toBe('db-query');
    });
  });

  // -------------------------------------------------------------------------
  // Dynamic Registration
  // -------------------------------------------------------------------------

  describe('dynamic registration', () => {
    it('should make tools immediately available after registration', () => {
      // Start with no tools
      expect(registry.listAllTools()).toHaveLength(0);

      // Register tools dynamically
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'new-tool', description: 'Dynamically added tool' }),
      ]);

      // Immediately available
      const all = registry.listAllTools();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('new-tool');

      // Also searchable immediately
      const results = registry.searchTools('dynamically');
      expect(results).toHaveLength(1);
    });

    it('should allow registering additional tools after initial registration', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'tool-1', description: 'First tool' }),
      ]);

      // Register more tools later
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'tool-2', description: 'Second tool' }),
      ]);

      expect(registry.listAllTools()).toHaveLength(2);
    });

    it('should allow registering external servers at any time', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'internal-tool', description: 'Internal' }),
      ]);

      // Add external server later
      registry.registerExternalServer('https://new-server.com', [
        makeTool({ name: 'external-tool', description: 'External' }),
      ]);

      const all = registry.listAllTools();
      expect(all).toHaveLength(2);
      expect(all.find((t) => t.source === 'external')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Unregistration
  // -------------------------------------------------------------------------

  describe('unregisterAgent', () => {
    it('should remove all tools for a given agent', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'tool-a', description: 'Tool A' }),
        makeTool({ name: 'tool-b', description: 'Tool B' }),
      ]);
      registry.registerInternalTools('agent-2', [
        makeTool({ name: 'tool-c', description: 'Tool C' }),
      ]);

      registry.unregisterAgent('agent-1');

      const all = registry.listAllTools();
      expect(all).toHaveLength(1);
      expect(all[0].agentId).toBe('agent-2');
    });

    it('should not affect other agents or external servers', () => {
      registry.registerInternalTools('agent-1', [makeTool({ name: 'a' })]);
      registry.registerExternalServer('https://server.com', [makeTool({ name: 'b' })]);

      registry.unregisterAgent('agent-1');

      const all = registry.listAllTools();
      expect(all).toHaveLength(1);
      expect(all[0].source).toBe('external');
    });
  });

  describe('unregisterServer', () => {
    it('should remove all tools for a given server', () => {
      registry.registerExternalServer('https://server-1.com', [
        makeTool({ name: 'tool-a', description: 'Tool A' }),
      ]);
      registry.registerExternalServer('https://server-2.com', [
        makeTool({ name: 'tool-b', description: 'Tool B' }),
      ]);

      registry.unregisterServer('https://server-1.com');

      const all = registry.listAllTools();
      expect(all).toHaveLength(1);
      expect(all[0].serverUrl).toBe('https://server-2.com');
    });

    it('should not affect internal tools', () => {
      registry.registerInternalTools('agent-1', [makeTool({ name: 'a' })]);
      registry.registerExternalServer('https://server.com', [makeTool({ name: 'b' })]);

      registry.unregisterServer('https://server.com');

      const all = registry.listAllTools();
      expect(all).toHaveLength(1);
      expect(all[0].source).toBe('internal');
    });
  });

  // -------------------------------------------------------------------------
  // Availability Updates
  // -------------------------------------------------------------------------

  describe('updateAvailability', () => {
    it('should update a tool availability status', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'my-tool', description: 'My tool' }),
      ]);

      registry.updateAvailability('internal:agent-1:my-tool', 'degraded');

      const entry = registry.getToolSchema('internal:agent-1:my-tool');
      expect(entry!.availability).toBe('degraded');
    });

    it('should support setting to unavailable', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'my-tool', description: 'My tool' }),
      ]);

      registry.updateAvailability('internal:agent-1:my-tool', 'unavailable');

      const entry = registry.getToolSchema('internal:agent-1:my-tool');
      expect(entry!.availability).toBe('unavailable');
    });

    it('should throw for unknown tool ID', () => {
      expect(() => registry.updateAvailability('unknown:id:tool', 'degraded')).toThrow(
        'Tool not found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tool Count
  // -------------------------------------------------------------------------

  describe('getToolCount', () => {
    it('should report correct counts by source', () => {
      registry.registerInternalTools('agent-1', [
        makeTool({ name: 'tool-a' }),
        makeTool({ name: 'tool-b' }),
      ]);
      registry.registerExternalServer('https://server.com', [
        makeTool({ name: 'tool-c' }),
      ]);

      const counts = registry.getToolCount();

      expect(counts.internal).toBe(2);
      expect(counts.external).toBe(1);
      expect(counts.total).toBe(3);
    });

    it('should return zeros when no tools registered', () => {
      const counts = registry.getToolCount();

      expect(counts.internal).toBe(0);
      expect(counts.external).toBe(0);
      expect(counts.total).toBe(0);
    });

    it('should update after unregistration', () => {
      registry.registerInternalTools('agent-1', [makeTool({ name: 'tool-a' })]);
      registry.registerExternalServer('https://server.com', [makeTool({ name: 'tool-b' })]);

      registry.unregisterAgent('agent-1');

      const counts = registry.getToolCount();
      expect(counts.internal).toBe(0);
      expect(counts.external).toBe(1);
      expect(counts.total).toBe(1);
    });
  });
});
