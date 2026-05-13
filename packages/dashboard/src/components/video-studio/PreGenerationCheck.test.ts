/**
 * Unit tests for ZXMG Video Studio — Pre-Generation Compliance Check
 *
 * Validates: Requirements 44b.7, 44c.12
 *
 * Tests compliance check display, pass/fail states, suggestions,
 * override, accept suggestion, and all-pass auto-proceed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PreGenerationComplianceCheck,
  type PreGenerationCheckData,
  type DiversityCheck,
} from './PreGenerationCheck.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestData(overrides?: Partial<PreGenerationCheckData>): PreGenerationCheckData {
  return {
    videoTitle: 'Tech Review Episode 42',
    checks: [
      { id: 'chk-avatar', category: 'Avatar', status: 'pass', currentSelection: 'Avatar Gamma' },
      { id: 'chk-voice', category: 'Voice', status: 'fail', currentSelection: 'Voice Deep', lastUsedVideoIndex: 2, suggestedAlternative: 'Voice Bright' },
      { id: 'chk-background', category: 'Background', status: 'pass', currentSelection: 'Office Scene' },
      { id: 'chk-style', category: 'Style', status: 'fail', currentSelection: 'Neon', lastUsedVideoIndex: 1, suggestedAlternative: 'Minimal' },
    ],
    ...overrides,
  };
}

function createAllPassData(): PreGenerationCheckData {
  return {
    videoTitle: 'Cooking Tips Episode 10',
    checks: [
      { id: 'chk-avatar', category: 'Avatar', status: 'pass', currentSelection: 'Avatar Delta' },
      { id: 'chk-voice', category: 'Voice', status: 'pass', currentSelection: 'Voice Warm' },
      { id: 'chk-background', category: 'Background', status: 'pass', currentSelection: 'Kitchen' },
      { id: 'chk-style', category: 'Style', status: 'pass', currentSelection: 'Cozy' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let container: HTMLElement;

beforeEach(() => {
  container = createContainer();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Compliance Check Appears Before Render Trigger
// ---------------------------------------------------------------------------

describe('PreGenerationComplianceCheck — Display', () => {
  it('should render compliance check modal on mount', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    expect(container.querySelector('.pre-gen-check')).toBeTruthy();
    expect(container.querySelector('.pre-gen-check__title')?.textContent).toContain('Pre-Generation Compliance Check');
  });

  it('should display video title', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    expect(container.querySelector('.pre-gen-check__subtitle')?.textContent).toContain('Tech Review Episode 42');
  });
});

// ---------------------------------------------------------------------------
// All Diversity Checks Display Pass/Fail Correctly
// ---------------------------------------------------------------------------

describe('PreGenerationComplianceCheck — Check Display', () => {
  it('should render all checks with correct status', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    const checks = container.querySelectorAll('.pre-gen-check__check');
    expect(checks.length).toBe(4);

    const passChecks = container.querySelectorAll('.pre-gen-check__check--pass');
    expect(passChecks.length).toBe(2);

    const failChecks = container.querySelectorAll('.pre-gen-check__check--fail');
    expect(failChecks.length).toBe(2);
  });

  it('should show pass icon for passing checks', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    const passCheck = container.querySelector('[data-check-id="chk-avatar"]');
    expect(passCheck?.querySelector('.pre-gen-check__check-icon')?.textContent).toBe('✓');
  });

  it('should show fail icon for failing checks', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    const failCheck = container.querySelector('[data-check-id="chk-voice"]');
    expect(failCheck?.querySelector('.pre-gen-check__check-icon')?.textContent).toBe('✗');
  });
});

// ---------------------------------------------------------------------------
// Failed Check Shows Specific Suggestion with Alternative
// ---------------------------------------------------------------------------

describe('PreGenerationComplianceCheck — Suggestions', () => {
  it('should show warning with usage info on failed checks', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    const failCheck = container.querySelector('[data-check-id="chk-voice"]');
    expect(failCheck?.querySelector('.pre-gen-check__check-warning')?.textContent).toContain('2 videos ago');
  });

  it('should display suggested alternatives for failed checks', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    const suggestions = container.querySelectorAll('.pre-gen-check__suggestion');
    expect(suggestions.length).toBe(2);

    const voiceSuggestion = container.querySelector('[data-suggestion-check="chk-voice"]');
    expect(voiceSuggestion?.querySelector('.pre-gen-check__suggestion-alt')?.textContent).toBe('Voice Bright');
  });

  it('should show failure count', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData());
    check.mount();

    const result = container.querySelector('.pre-gen-check__result--fail');
    expect(result?.textContent).toContain('2 checks failed');
  });
});

// ---------------------------------------------------------------------------
// Override Proceeds with Original Selection
// ---------------------------------------------------------------------------

describe('PreGenerationComplianceCheck — Override', () => {
  it('should call onOverride when override button is clicked', () => {
    const onOverride = vi.fn();
    const check = new PreGenerationComplianceCheck(container, createTestData(), { onOverride });
    check.mount();

    const overrideBtn = container.querySelector('[data-action="override"]') as HTMLElement;
    overrideBtn.click();

    expect(onOverride).toHaveBeenCalled();
  });

  it('should hide modal after override', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData(), { onOverride: vi.fn() });
    check.mount();

    const overrideBtn = container.querySelector('[data-action="override"]') as HTMLElement;
    overrideBtn.click();

    expect(container.querySelector('.pre-gen-check')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Accept Suggestion Swaps to Recommended Alternative
// ---------------------------------------------------------------------------

describe('PreGenerationComplianceCheck — Accept Suggestion', () => {
  it('should call onAcceptSuggestion for each failed check with alternative', () => {
    const onAcceptSuggestion = vi.fn();
    const check = new PreGenerationComplianceCheck(container, createTestData(), { onAcceptSuggestion });
    check.mount();

    const acceptBtn = container.querySelector('[data-action="accept"]') as HTMLElement;
    acceptBtn.click();

    expect(onAcceptSuggestion).toHaveBeenCalledWith('chk-voice', 'Voice Bright');
    expect(onAcceptSuggestion).toHaveBeenCalledWith('chk-style', 'Minimal');
  });

  it('should hide modal after accepting suggestions', () => {
    const check = new PreGenerationComplianceCheck(container, createTestData(), { onAcceptSuggestion: vi.fn() });
    check.mount();

    const acceptBtn = container.querySelector('[data-action="accept"]') as HTMLElement;
    acceptBtn.click();

    expect(container.querySelector('.pre-gen-check')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// All-Pass State Shows Green Confirmation
// ---------------------------------------------------------------------------

describe('PreGenerationComplianceCheck — All Pass', () => {
  it('should show green confirmation when all checks pass', () => {
    const check = new PreGenerationComplianceCheck(container, createAllPassData());
    check.mount();

    const result = container.querySelector('.pre-gen-check__result--pass');
    expect(result).toBeTruthy();
    expect(result?.textContent).toContain('All diversity checks passed');
  });

  it('should show proceed button when all pass', () => {
    const check = new PreGenerationComplianceCheck(container, createAllPassData());
    check.mount();

    expect(container.querySelector('[data-action="proceed"]')).toBeTruthy();
    expect(container.querySelector('[data-action="override"]')).toBeNull();
  });

  it('should call onAllPass when proceed is clicked', () => {
    const onAllPass = vi.fn();
    const check = new PreGenerationComplianceCheck(container, createAllPassData(), { onAllPass });
    check.mount();

    const proceedBtn = container.querySelector('[data-action="proceed"]') as HTMLElement;
    proceedBtn.click();

    expect(onAllPass).toHaveBeenCalled();
  });
});
