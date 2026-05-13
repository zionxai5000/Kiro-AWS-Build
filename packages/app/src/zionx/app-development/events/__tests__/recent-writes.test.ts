import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecentWritesRegistry } from '../recent-writes.js';

describe('RecentWritesRegistry', () => {
  let registry: RecentWritesRegistry;

  beforeEach(() => {
    registry = new RecentWritesRegistry({ ttlMs: 500 });
  });

  describe('markAsOwnWrite + isOwnWrite', () => {
    it('returns true for a recently marked path', () => {
      registry.markAsOwnWrite('/workspaces/proj-1/src/index.ts');
      expect(registry.isOwnWrite('/workspaces/proj-1/src/index.ts')).toBe(true);
    });

    it('returns false for an unmarked path', () => {
      expect(registry.isOwnWrite('/workspaces/proj-1/src/other.ts')).toBe(false);
    });

    it('normalizes backslashes to forward slashes', () => {
      registry.markAsOwnWrite('C:\\workspaces\\proj-1\\src\\index.ts');
      expect(registry.isOwnWrite('C:/workspaces/proj-1/src/index.ts')).toBe(true);
    });

    it('is case-sensitive on path', () => {
      registry.markAsOwnWrite('/workspaces/proj-1/SRC/Index.ts');
      expect(registry.isOwnWrite('/workspaces/proj-1/src/index.ts')).toBe(false);
    });
  });

  describe('TTL expiry', () => {
    it('returns false after TTL expires', () => {
      vi.useFakeTimers();
      registry.markAsOwnWrite('/workspaces/proj-1/file.ts');
      expect(registry.isOwnWrite('/workspaces/proj-1/file.ts')).toBe(true);

      vi.advanceTimersByTime(501);
      expect(registry.isOwnWrite('/workspaces/proj-1/file.ts')).toBe(false);
      vi.useRealTimers();
    });

    it('returns true just before TTL expires', () => {
      vi.useFakeTimers();
      registry.markAsOwnWrite('/workspaces/proj-1/file.ts');

      vi.advanceTimersByTime(499);
      expect(registry.isOwnWrite('/workspaces/proj-1/file.ts')).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('size', () => {
    it('returns 0 for empty registry', () => {
      expect(registry.size()).toBe(0);
    });

    it('returns count of active entries', () => {
      registry.markAsOwnWrite('/a');
      registry.markAsOwnWrite('/b');
      registry.markAsOwnWrite('/c');
      expect(registry.size()).toBe(3);
    });

    it('excludes expired entries', () => {
      vi.useFakeTimers();
      registry.markAsOwnWrite('/a');
      vi.advanceTimersByTime(501);
      registry.markAsOwnWrite('/b');
      expect(registry.size()).toBe(1); // /a expired, /b active
      vi.useRealTimers();
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      registry.markAsOwnWrite('/a');
      registry.markAsOwnWrite('/b');
      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.isOwnWrite('/a')).toBe(false);
    });
  });

  describe('overwrite behavior', () => {
    it('refreshes TTL on re-mark', () => {
      vi.useFakeTimers();
      registry.markAsOwnWrite('/a');
      vi.advanceTimersByTime(400);
      // Re-mark refreshes the timestamp
      registry.markAsOwnWrite('/a');
      vi.advanceTimersByTime(400);
      // 400ms after re-mark, still within TTL
      expect(registry.isOwnWrite('/a')).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('default TTL', () => {
    it('uses 2000ms when no options provided', () => {
      vi.useFakeTimers();
      const defaultRegistry = new RecentWritesRegistry();
      defaultRegistry.markAsOwnWrite('/a');
      vi.advanceTimersByTime(1999);
      expect(defaultRegistry.isOwnWrite('/a')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(defaultRegistry.isOwnWrite('/a')).toBe(false);
      vi.useRealTimers();
    });
  });
});
