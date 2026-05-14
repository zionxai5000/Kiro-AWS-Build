/**
 * Prompt Sanitizer — detects and redacts secrets, credentials, and sensitive data.
 *
 * 8 detectors (v1):
 * 1. OpenAI API keys (sk-[a-zA-Z0-9]{20,})
 * 2. Anthropic API keys (sk-ant-[a-zA-Z0-9-]{20,})
 * 3. Google API keys (AIza[a-zA-Z0-9_-]{35})
 * 4. GitHub PATs (ghp_[a-zA-Z0-9]{36})
 * 5. AWS Access Key IDs (AKIA[A-Z0-9]{16})
 * 6. JWTs (eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)
 * 7. Credit card numbers (Luhn-validated, 13-19 digits)
 * 8. Email addresses
 *
 * Severity:
 * - halt: keys, PATs, AWS keys, JWTs, credit cards (pipeline rejects the prompt)
 * - warn: emails (pipeline logs warning, passes through)
 *
 * Position math (Refinement 3):
 * Warnings record positions against the ORIGINAL string.
 * Replacements are applied RIGHT-TO-LEFT so earlier positions remain stable.
 * After sanitization, each warning's position+length identifies the [REDACTED_*]
 * token in the OUTPUT string.
 *
 * Skipped for v1: SSNs, phone numbers, addresses, names (too many false positives).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SanitizeWarning {
  type: string;
  severity: 'halt' | 'warn';
  position: number;
  length: number;
}

export interface SanitizeResult {
  sanitized: string;
  warnings: SanitizeWarning[];
}

// ---------------------------------------------------------------------------
// Detector Definitions
// ---------------------------------------------------------------------------

export interface Detector {
  type: string;
  severity: 'halt' | 'warn';
  regex: RegExp;
  /** Optional validator for candidates (e.g., Luhn check for credit cards) */
  validate?: (match: string) => boolean;
}

export const DETECTORS: Detector[] = [
  // Order matters: more specific patterns first to avoid partial matches
  {
    type: 'anthropic_key',
    severity: 'halt',
    regex: /sk-ant-[a-zA-Z0-9_\-]{20,}/g,
  },
  {
    type: 'openai_key',
    severity: 'halt',
    regex: /sk-[a-zA-Z0-9]{20,}/g,
  },
  {
    type: 'google_key',
    severity: 'halt',
    regex: /AIza[a-zA-Z0-9_\-]{35}/g,
  },
  {
    type: 'github_pat',
    severity: 'halt',
    regex: /ghp_[a-zA-Z0-9]{36}/g,
  },
  {
    type: 'aws_key',
    severity: 'halt',
    regex: /AKIA[A-Z0-9]{16}/g,
  },
  {
    type: 'jwt',
    severity: 'halt',
    regex: /eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g,
  },
  {
    type: 'credit_card',
    severity: 'halt',
    // Match sequences of 13-19 digits (possibly separated by spaces or dashes)
    regex: /\b(?:\d[ \-]*?){13,19}\b/g,
    validate: (match: string) => {
      const digits = match.replace(/[\s\-]/g, '');
      if (digits.length < 13 || digits.length > 19) return false;
      if (!/^\d+$/.test(digits)) return false;
      return luhnCheck(digits);
    },
  },
  {
    type: 'email',
    severity: 'warn',
    // Standard email pattern — requires a TLD of 2+ chars to reduce false positives
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  },
];

// ---------------------------------------------------------------------------
// Luhn Algorithm
// ---------------------------------------------------------------------------

/**
 * Validate a credit card number using the Luhn algorithm.
 */
function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface RawMatch {
  type: string;
  severity: 'halt' | 'warn';
  start: number;
  end: number;
  original: string;
}

/**
 * Sanitize a prompt by detecting and redacting secrets.
 *
 * Returns the sanitized text and warnings. The pipeline checks for halt-severity
 * warnings and rejects the prompt if any are found.
 *
 * Position math: warnings record positions in the OUTPUT string (after replacement).
 * Replacements are applied right-to-left so positions remain stable.
 */
export function sanitizePrompt(input: string): SanitizeResult {
  if (!input) {
    return { sanitized: '', warnings: [] };
  }

  // Phase 1: Collect all matches from all detectors
  const matches: RawMatch[] = [];

  for (const detector of DETECTORS) {
    // Reset regex lastIndex for global patterns
    detector.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = detector.regex.exec(input)) !== null) {
      const candidate = match[0];

      // Run optional validator (e.g., Luhn for credit cards)
      if (detector.validate && !detector.validate(candidate)) {
        continue;
      }

      matches.push({
        type: detector.type,
        severity: detector.severity,
        start: match.index,
        end: match.index + candidate.length,
        original: candidate,
      });
    }
  }

  if (matches.length === 0) {
    return { sanitized: input, warnings: [] };
  }

  // Phase 2: Deduplicate overlapping matches (keep the longer/earlier one)
  const deduped = deduplicateMatches(matches);

  // Phase 3: Sort right-to-left for stable position replacement
  deduped.sort((a, b) => b.start - a.start);

  // Phase 4: Apply replacements right-to-left
  let sanitized = input;
  const warnings: SanitizeWarning[] = [];

  for (const m of deduped) {
    const replacement = `[REDACTED_${m.type.toUpperCase()}]`;
    sanitized = sanitized.slice(0, m.start) + replacement + sanitized.slice(m.end);
  }

  // Phase 5: Calculate output positions (now that all replacements are applied)
  // Re-sort left-to-right for position calculation
  deduped.sort((a, b) => a.start - b.start);

  let offset = 0;
  for (const m of deduped) {
    const replacement = `[REDACTED_${m.type.toUpperCase()}]`;
    const outputPosition = m.start + offset;
    warnings.push({
      type: m.type,
      severity: m.severity,
      position: outputPosition,
      length: replacement.length,
    });
    // Offset adjusts for the difference between original and replacement lengths
    offset += replacement.length - (m.end - m.start);
  }

  return { sanitized, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove overlapping matches. When two matches overlap, keep the one that
 * starts earlier. If they start at the same position, keep the longer one.
 */
function deduplicateMatches(matches: RawMatch[]): RawMatch[] {
  if (matches.length <= 1) return matches;

  // Sort by start position, then by length descending
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const result: RawMatch[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = result[result.length - 1]!;

    // Skip if current overlaps with the last kept match
    if (current.start < last.end) {
      continue;
    }

    result.push(current);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Detection Only (no redaction) — for file content scanning
// ---------------------------------------------------------------------------

/**
 * Detect secrets in arbitrary content without modifying it.
 *
 * Used by Hook 4 (secret-scanner) to scan generated file contents.
 * Returns warnings with positions in the ORIGINAL content (no replacement).
 *
 * @param content - The file content to scan.
 * @returns Array of warnings. Empty if no secrets found.
 */
export function detectSecrets(content: string): SanitizeWarning[] {
  if (!content) return [];

  const matches: RawMatch[] = [];

  for (const detector of DETECTORS) {
    detector.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = detector.regex.exec(content)) !== null) {
      const candidate = match[0];

      if (detector.validate && !detector.validate(candidate)) {
        continue;
      }

      matches.push({
        type: detector.type,
        severity: detector.severity,
        start: match.index,
        end: match.index + candidate.length,
        original: candidate,
      });
    }
  }

  if (matches.length === 0) return [];

  // Deduplicate overlapping matches
  const deduped = deduplicateMatches(matches);

  // Return warnings with original positions (no offset calculation needed)
  return deduped.map(m => ({
    type: m.type,
    severity: m.severity,
    position: m.start,
    length: m.end - m.start,
  }));
}
