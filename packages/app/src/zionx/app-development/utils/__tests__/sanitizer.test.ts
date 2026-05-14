import { describe, it, expect } from 'vitest';
import { sanitizePrompt } from '../sanitizer.js';

describe('sanitizePrompt', () => {
  // =========================================================================
  // Individual detector tests
  // =========================================================================

  describe('OpenAI key detection', () => {
    it('detects sk- keys with 20+ chars', () => {
      const input = 'Use key sk-abc123def456ghi789jkl012mno345pqr678';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('openai_key');
      expect(result.warnings[0]!.severity).toBe('halt');
      expect(result.sanitized).toContain('[REDACTED_OPENAI_KEY]');
      expect(result.sanitized).not.toContain('sk-abc');
    });

    it('does NOT match short sk- strings (< 20 chars after prefix)', () => {
      const input = 'variable sk-short is fine';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(0);
      expect(result.sanitized).toBe(input);
    });
  });

  describe('Anthropic key detection', () => {
    it('detects sk-ant- keys', () => {
      const input = 'key: sk-ant-api03-4xESCuJ_FMOCYNDU7EYXGQ';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('anthropic_key');
      expect(result.warnings[0]!.severity).toBe('halt');
      expect(result.sanitized).toContain('[REDACTED_ANTHROPIC_KEY]');
    });

    it('anthropic key takes priority over openai key pattern', () => {
      // sk-ant- matches both patterns, but anthropic is more specific and runs first
      const input = 'sk-ant-abcdefghijklmnopqrstuvwxyz';
      const result = sanitizePrompt(input);
      // Should only have one warning (deduplication removes overlap)
      expect(result.warnings.length).toBeLessThanOrEqual(1);
      if (result.warnings.length === 1) {
        expect(result.warnings[0]!.type).toBe('anthropic_key');
      }
    });
  });

  describe('Google key detection', () => {
    it('detects AIza keys with exactly 35 trailing chars', () => {
      const input = 'google: AIzaSyD-abcdefghijklmnopqrstuvwxyz12345';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('google_key');
      expect(result.warnings[0]!.severity).toBe('halt');
    });
  });

  describe('GitHub PAT detection', () => {
    it('detects ghp_ tokens with 36 chars', () => {
      const input = 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('github_pat');
      expect(result.warnings[0]!.severity).toBe('halt');
    });
  });

  describe('AWS key detection', () => {
    it('detects AKIA keys with 16 uppercase alphanumeric chars', () => {
      const input = 'aws_key: AKIAYGDVRECH55QALWEQ';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('aws_key');
      expect(result.warnings[0]!.severity).toBe('halt');
    });
  });

  describe('JWT detection', () => {
    it('detects JWT tokens (three base64url segments)', () => {
      const input = 'bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('jwt');
      expect(result.warnings[0]!.severity).toBe('halt');
    });
  });

  describe('Credit card detection (Luhn)', () => {
    it('detects valid Visa number', () => {
      const input = 'card: 4111111111111111';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('credit_card');
      expect(result.warnings[0]!.severity).toBe('halt');
    });

    it('detects valid card with spaces', () => {
      const input = 'card: 4111 1111 1111 1111';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('credit_card');
    });

    it('detects valid card with dashes', () => {
      const input = 'card: 4111-1111-1111-1111';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('credit_card');
    });

    it('rejects invalid Luhn number', () => {
      const input = 'not a card: 4111111111111112';
      const result = sanitizePrompt(input);
      // 4111111111111112 fails Luhn check
      expect(result.warnings).toHaveLength(0);
    });

    it('does NOT match short digit sequences', () => {
      const input = 'port 8080 and id 123456';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Email detection', () => {
    it('detects standard email addresses', () => {
      const input = 'contact user@example.com for help';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('email');
      expect(result.warnings[0]!.severity).toBe('warn');
    });

    it('does NOT match user@localhost (no TLD)', () => {
      const input = 'send to admin@localhost';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(0);
    });

    it('detects emails with subdomains', () => {
      const input = 'email: king@mail.seraphim.io';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe('email');
    });
  });

  // =========================================================================
  // Multi-secret and position math tests (Refinement 3)
  // =========================================================================

  describe('multiple secrets in one prompt', () => {
    it('detects all secrets', () => {
      const input = 'keys: sk-abcdefghijklmnopqrstuvwxyz123 and AKIAYGDVRECH55QALWEQ and user@test.com';
      const result = sanitizePrompt(input);
      expect(result.warnings.length).toBeGreaterThanOrEqual(3);
    });

    it('position+length correctly identifies REDACTED tokens in output (Refinement 3)', () => {
      // Three secrets at known positions
      const input = 'A sk-abcdefghijklmnopqrstuvwxyz123 B AKIAYGDVRECH55QALWEQ C user@example.com D';
      const result = sanitizePrompt(input);

      // Verify each warning's position+length extracts the redacted token from the output
      for (const warning of result.warnings) {
        const extracted = result.sanitized.slice(warning.position, warning.position + warning.length);
        expect(extracted).toMatch(/^\[REDACTED_[A-Z_]+\]$/);
      }
    });

    it('handles adjacent secrets without corruption', () => {
      const input = 'AKIAYGDVRECH55QALWEQ ghp_abcdefghijklmnopqrstuvwxyz0123456789';
      const result = sanitizePrompt(input);
      expect(result.warnings.length).toBe(2);
      expect(result.sanitized).toContain('[REDACTED_AWS_KEY]');
      expect(result.sanitized).toContain('[REDACTED_GITHUB_PAT]');
    });
  });

  // =========================================================================
  // False positive tests
  // =========================================================================

  describe('false positive avoidance', () => {
    it('does NOT flag normal code with sk- in variable names', () => {
      const input = 'const task-id = "sk-1"; // short';
      const result = sanitizePrompt(input);
      // "sk-1" is only 4 chars, well under the 20-char minimum
      expect(result.warnings).toHaveLength(0);
    });

    it('does NOT flag normal numbers that look like cards but fail Luhn', () => {
      const input = 'timestamp: 1234567890123456';
      const result = sanitizePrompt(input);
      // This 16-digit number likely fails Luhn
      const warnings = result.warnings.filter(w => w.type === 'credit_card');
      expect(warnings).toHaveLength(0);
    });

    it('does NOT flag package versions or semver', () => {
      const input = '"@anthropic-ai/sdk": "^0.24.0"';
      const result = sanitizePrompt(input);
      expect(result.warnings).toHaveLength(0);
    });

    it('does NOT flag base64 strings that are not JWTs (missing 3 segments)', () => {
      const input = 'data: eyJhbGciOiJIUzI1NiJ9.incomplete';
      const result = sanitizePrompt(input);
      // Only 2 segments, not a valid JWT
      expect(result.warnings.filter(w => w.type === 'jwt')).toHaveLength(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = sanitizePrompt('');
      expect(result.sanitized).toBe('');
      expect(result.warnings).toHaveLength(0);
    });

    it('handles string with no secrets', () => {
      const input = 'Build me a todo app with React Native and Expo SDK 52';
      const result = sanitizePrompt(input);
      expect(result.sanitized).toBe(input);
      expect(result.warnings).toHaveLength(0);
    });

    it('handles string that is entirely a secret', () => {
      const input = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
      const result = sanitizePrompt(input);
      expect(result.sanitized).toBe('[REDACTED_OPENAI_KEY]');
      expect(result.warnings).toHaveLength(1);
    });

    it('preserves surrounding text', () => {
      const input = 'before AKIAYGDVRECH55QALWEQ after';
      const result = sanitizePrompt(input);
      expect(result.sanitized).toBe('before [REDACTED_AWS_KEY] after');
    });
  });
});


// ===========================================================================
// detectSecrets — file content scanning (no redaction)
// ===========================================================================

import { detectSecrets } from '../sanitizer.js';

describe('detectSecrets', () => {
  describe('detects secrets in file content', () => {
    it('detects API key in a TypeScript file', () => {
      const content = `import { config } from './config';\nconst key = "sk-ant-api03-4xESCuJ_FMOCYNDU7EYXGQ";\nexport default key;`;
      const warnings = detectSecrets(content);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.some(w => w.type === 'anthropic_key')).toBe(true);
    });

    it('detects JWT in a config file', () => {
      const content = `{\n  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"\n}`;
      const warnings = detectSecrets(content);
      expect(warnings.some(w => w.type === 'jwt')).toBe(true);
    });

    it('detects AWS key in environment config', () => {
      const content = `AWS_ACCESS_KEY_ID=AKIAYGDVRECH55QALWEQ\nAWS_SECRET_ACCESS_KEY=someSecret`;
      const warnings = detectSecrets(content);
      expect(warnings.some(w => w.type === 'aws_key')).toBe(true);
    });

    it('detects multiple secrets in one file', () => {
      const content = `const api = "sk-abcdefghijklmnopqrstuvwxyz123";\nconst aws = "AKIAYGDVRECH55QALWEQ";`;
      const warnings = detectSecrets(content);
      expect(warnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('does NOT modify the input', () => {
    it('returns warnings without changing content', () => {
      const content = `const key = "AKIAYGDVRECH55QALWEQ";`;
      const warnings = detectSecrets(content);
      // detectSecrets doesn't return sanitized text — just warnings
      expect(warnings.length).toBe(1);
      expect(warnings[0]!.type).toBe('aws_key');
      // Position points to the original location in the unchanged content
      const extracted = content.slice(warnings[0]!.position, warnings[0]!.position + warnings[0]!.length);
      expect(extracted).toBe('AKIAYGDVRECH55QALWEQ');
    });
  });

  describe('false positive avoidance in file content', () => {
    it('does NOT flag normal import statements', () => {
      const content = `import { useState } from 'react';\nimport { StyleSheet } from 'react-native';`;
      const warnings = detectSecrets(content);
      expect(warnings).toHaveLength(0);
    });

    it('does NOT flag short variable names with sk- prefix', () => {
      const content = `const taskId = "sk-123";\nconst skip = true;`;
      const warnings = detectSecrets(content);
      expect(warnings).toHaveLength(0);
    });

    it('does NOT flag package versions', () => {
      const content = `"dependencies": {\n  "react": "^18.2.0",\n  "expo": "~52.0.0"\n}`;
      const warnings = detectSecrets(content);
      expect(warnings).toHaveLength(0);
    });

    it('does NOT flag base64 image data that looks like JWT segments', () => {
      // Only 2 segments, not 3 — not a JWT
      const content = `const img = "data:image/png;base64,eyJhbGciOiJIUzI1NiJ9.incomplete";`;
      const warnings = detectSecrets(content);
      expect(warnings.filter(w => w.type === 'jwt')).toHaveLength(0);
    });
  });

  describe('multi-line file content', () => {
    it('handles files with many lines', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `const line${i} = ${i};`);
      lines[50] = `const secret = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";`;
      const content = lines.join('\n');

      const warnings = detectSecrets(content);
      expect(warnings.some(w => w.type === 'github_pat')).toBe(true);
    });

    it('handles files with backslashes (Windows paths in code)', () => {
      const content = `const path = "C:\\\\Users\\\\admin\\\\project";\nconst x = 1;`;
      const warnings = detectSecrets(content);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('empty and clean content', () => {
    it('returns empty array for empty string', () => {
      expect(detectSecrets('')).toEqual([]);
    });

    it('returns empty array for clean code', () => {
      const content = `export function hello() {\n  return "Hello, World!";\n}`;
      expect(detectSecrets(content)).toEqual([]);
    });
  });
});
