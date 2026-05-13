import { describe, it, expect } from 'vitest';
import { sanitizePrompt } from '../sanitizer.js';

describe('sanitizePrompt (stub)', () => {
  it('returns input unchanged', () => {
    const input = 'Build me a todo app with React Native';
    const result = sanitizePrompt(input);
    expect(result.sanitized).toBe(input);
  });

  it('returns empty warnings array', () => {
    const result = sanitizePrompt('anything');
    expect(result.warnings).toEqual([]);
  });

  it('handles empty string', () => {
    const result = sanitizePrompt('');
    expect(result.sanitized).toBe('');
    expect(result.warnings).toEqual([]);
  });

  it('handles string with potential secrets (stub does not strip yet)', () => {
    const input = 'Use API key sk-ant-api03-abc123 for auth';
    const result = sanitizePrompt(input);
    // Stub: returns unchanged. Phase 3 will make this fail and strip the key.
    expect(result.sanitized).toBe(input);
    expect(result.warnings).toEqual([]);
  });
});
