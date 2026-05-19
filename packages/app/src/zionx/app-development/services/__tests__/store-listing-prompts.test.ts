/**
 * Tests for store-listing-prompts.ts — LLM prompt templates.
 */

import { describe, it, expect } from 'vitest';
import {
  STORE_LISTING_SYSTEM_PROMPT,
  buildStoreListingUserPrompt,
} from '../store-listing-prompts.js';

describe('STORE_LISTING_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(STORE_LISTING_SYSTEM_PROMPT).toBeTruthy();
    expect(typeof STORE_LISTING_SYSTEM_PROMPT).toBe('string');
    expect(STORE_LISTING_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains the JSON output format specification', () => {
    expect(STORE_LISTING_SYSTEM_PROMPT).toContain('"name"');
    expect(STORE_LISTING_SYSTEM_PROMPT).toContain('"subtitle"');
    expect(STORE_LISTING_SYSTEM_PROMPT).toContain('"description"');
    expect(STORE_LISTING_SYSTEM_PROMPT).toContain('"keywords"');
    expect(STORE_LISTING_SYSTEM_PROMPT).toContain('"category"');
    expect(STORE_LISTING_SYSTEM_PROMPT).toContain('"privacyPolicyUrl"');
  });

  it('mentions the 100-character keyword limit', () => {
    expect(STORE_LISTING_SYSTEM_PROMPT).toContain('100 characters');
  });
});

describe('buildStoreListingUserPrompt', () => {
  it('interpolates all 4 fields correctly', () => {
    const result = buildStoreListingUserPrompt({
      appName: 'Workout Tracker',
      appDescription: 'Track your exercises and progress',
      bundleIdentifier: 'dev.zionxai.workouttracker',
      privacyPolicyUrl: 'https://zionxai5000.github.io/privacy-policies/',
    });

    expect(result).toContain('Workout Tracker');
    expect(result).toContain('Track your exercises and progress');
    expect(result).toContain('dev.zionxai.workouttracker');
    expect(result).toContain('https://zionxai5000.github.io/privacy-policies/');
  });

  it('handles empty description gracefully (returns valid string)', () => {
    const result = buildStoreListingUserPrompt({
      appName: 'My App',
      appDescription: '',
      bundleIdentifier: 'dev.zionxai.myapp',
      privacyPolicyUrl: 'https://example.com/privacy',
    });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(50);
    expect(result).toContain('My App');
  });
});
