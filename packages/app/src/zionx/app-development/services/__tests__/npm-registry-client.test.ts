import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NpmRegistryClient } from '../npm-registry-client.js';
import { resetAllCircuitBreakers } from '../../utils/circuit-breaker.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  resetAllCircuitBreakers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRegistryResponse(versions: string[]) {
  const versionsObj: Record<string, object> = {};
  for (const v of versions) {
    versionsObj[v] = {}; // Real response has full package metadata per version; we only need keys
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ name: 'test-pkg', versions: versionsObj }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NpmRegistryClient', () => {
  let client: NpmRegistryClient;

  beforeEach(() => {
    client = new NpmRegistryClient({ timeoutMs: 5000 });
  });

  describe('checkPackage', () => {
    it('returns exists: true when package is found', async () => {
      mockFetch.mockResolvedValueOnce(createRegistryResponse(['18.0.0', '18.2.0', '18.3.1']));

      const result = await client.checkPackage('react');

      expect(result.exists).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns exists: true, versionSatisfied: true when range matches', async () => {
      mockFetch.mockResolvedValueOnce(createRegistryResponse(['18.0.0', '18.2.0', '18.3.1']));

      const result = await client.checkPackage('react', '^18.0.0');

      expect(result.exists).toBe(true);
      expect(result.versionSatisfied).toBe(true);
      expect(result.matchedVersion).toBe('18.3.1');
    });

    it('returns exists: true, versionSatisfied: false when no version matches range', async () => {
      mockFetch.mockResolvedValueOnce(createRegistryResponse(['17.0.0', '17.0.2']));

      const result = await client.checkPackage('react', '^18.0.0');

      expect(result.exists).toBe(true);
      expect(result.versionSatisfied).toBe(false);
      expect(result.matchedVersion).toBeUndefined();
    });

    it('returns exists: false on 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await client.checkPackage('@fake/nonexistent-pkg');

      expect(result.exists).toBe(false);
    });

    it('throws on 500 server error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(client.checkPackage('some-pkg')).rejects.toThrow('500');
    });

    it('throws on network error (retried, then exhausted)', async () => {
      mockFetch.mockRejectedValue(new Error('fetch failed: network error'));

      await expect(client.checkPackage('some-pkg')).rejects.toThrow('Retry exhausted');
    });

    it('throws on malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'pkg' }), // missing 'versions' field
      });

      await expect(client.checkPackage('some-pkg')).rejects.toThrow('Malformed');
    });

    it('sets User-Agent header', async () => {
      mockFetch.mockResolvedValueOnce(createRegistryResponse(['1.0.0']));

      await client.checkPackage('test-pkg');

      const callArgs = mockFetch.mock.calls[0]!;
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['User-Agent']).toBe('seraphim-app-dev/1.0');
    });

    it('only extracts version keys from response (not full metadata)', async () => {
      // Simulate a response with large per-version metadata
      const bigResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'lodash',
          versions: {
            '4.17.21': { dist: { tarball: 'https://...' }, dependencies: { a: '1' } },
            '4.17.20': { dist: { tarball: 'https://...' }, dependencies: { b: '2' } },
          },
        }),
      };
      mockFetch.mockResolvedValueOnce(bigResponse);

      const result = await client.checkPackage('lodash', '^4.0.0');

      // Should work — we only need the version keys
      expect(result.exists).toBe(true);
      expect(result.versionSatisfied).toBe(true);
      expect(result.matchedVersion).toBe('4.17.21');
    });

    it('handles scoped packages correctly', async () => {
      mockFetch.mockResolvedValueOnce(createRegistryResponse(['52.0.0', '52.0.1']));

      await client.checkPackage('@expo/vector-icons', '~52.0.0');

      // Find the call that was for @expo/vector-icons (may not be the first if other tests ran)
      const calls = mockFetch.mock.calls;
      const lastUrl = calls[calls.length - 1]![0] as string;
      expect(lastUrl).toContain('@expo');
    });
  });
});
