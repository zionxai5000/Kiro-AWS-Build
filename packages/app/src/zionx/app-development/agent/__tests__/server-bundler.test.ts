/**
 * Unit tests for server-bundler pure helpers.
 *
 * The full bundleAndServe() flow (npm install + expo export + sandbox
 * push) is exercised by the live production probes — it spawns real
 * subprocesses and isn't safe in vitest. Here we only verify the
 * deterministic helpers (skipPath + sanitize) that gate which files
 * make it into the staging dir and how the staging dir is named.
 */

import { describe, it, expect } from 'vitest';
import { __test__ } from '../../services/server-bundler.js';

describe('server-bundler helpers', () => {
  describe('skipPath', () => {
    it('skips node_modules', () => {
      expect(__test__.skipPath('node_modules/foo/index.js')).toBe(true);
    });
    it('skips .expo cache', () => {
      expect(__test__.skipPath('.expo/web-build/manifest.json')).toBe(true);
    });
    it('skips .meta', () => {
      expect(__test__.skipPath('.meta/project.json')).toBe(true);
    });
    it('skips dist', () => {
      expect(__test__.skipPath('dist/index.html')).toBe(true);
    });
    it('skips package-lock.json', () => {
      expect(__test__.skipPath('package-lock.json')).toBe(true);
    });
    it('keeps source files', () => {
      expect(__test__.skipPath('app/index.tsx')).toBe(false);
      expect(__test__.skipPath('src/components/Card.tsx')).toBe(false);
      expect(__test__.skipPath('package.json')).toBe(false);
      expect(__test__.skipPath('app.json')).toBe(false);
    });
  });

  describe('sanitize', () => {
    it('replaces special chars with underscores', () => {
      expect(__test__.sanitize('proj-1781032/abc')).toBe('proj-1781032_abc');
      expect(__test__.sanitize('foo bar baz')).toBe('foo_bar_baz');
    });
    it('preserves valid identifier chars', () => {
      expect(__test__.sanitize('proj-12345-abc')).toBe('proj-12345-abc');
    });
    it('truncates to 80 chars', () => {
      const long = 'a'.repeat(120);
      expect(__test__.sanitize(long).length).toBe(80);
    });
  });
});
