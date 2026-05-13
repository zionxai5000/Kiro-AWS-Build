/**
 * Prompt Sanitizer — stub implementation.
 *
 * Scans prompts for sensitive data (API keys, credit cards, SSNs, emails)
 * and strips them before passing to LLM services.
 *
 * This is a STUB for Phase 1. Real implementation comes in Phase 3.
 * Currently returns input unchanged with empty warnings.
 */

// TODO Phase 3: implement actual secret detection regexes
// for API keys (sk-, AIza, ghp_, AKIA), credit cards, SSNs,
// emails, JWT tokens.
// Until then, this is a passthrough — DO NOT rely on it
// for safety.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SanitizeResult {
  /** The sanitized prompt text (sensitive data replaced) */
  sanitized: string;
  /** Warnings about what was found and stripped */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Implementation (STUB — Phase 3 will add real logic)
// ---------------------------------------------------------------------------

/**
 * Sanitize a prompt by scanning for and removing sensitive data.
 *
 * STUB: Returns input unchanged. Real implementation in Phase 3 will:
 * - Regex sweep for API key patterns (sk-, AIza, ghp_, AWS keys, etc.)
 * - Detect credit card numbers (Luhn check)
 * - Detect SSN patterns
 * - Detect email addresses
 * - Replace with [REDACTED_TYPE] placeholders
 * - Return warnings listing what was found
 *
 * @param input - The raw prompt text to sanitize.
 * @returns The sanitized text and any warnings.
 */
export function sanitizePrompt(input: string): SanitizeResult {
  return {
    sanitized: input,
    warnings: [],
  };
}
