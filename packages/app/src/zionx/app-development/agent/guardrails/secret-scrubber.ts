/**
 * Secret scrubber — strips obvious secret patterns from tool results before
 * the model ever sees them. The model can echo what it sees in chat or
 * subsequent tool calls; we never want a leaked AWS key to round-trip
 * through the conversation log.
 *
 * This is a defense-in-depth layer; the primary defense is keeping the
 * sandbox's environment from containing user-facing secrets in the first
 * place.
 */

interface Pattern {
  /** Stable id for telemetry. */
  id: string;
  /** Regex to detect. Use captures `(prefix)(secret)` so the prefix stays visible. */
  re: RegExp;
  /** Replacement uses $1 for the kept prefix. */
  redact: string;
}

const PATTERNS: Pattern[] = [
  // Anthropic API keys
  { id: 'anthropic',  re: /(sk-ant-)[A-Za-z0-9_-]{20,}/g, redact: '$1<redacted>' },
  // OpenAI keys (modern + legacy)
  { id: 'openai',     re: /(sk-)(?:proj-)?[A-Za-z0-9_-]{20,}/g, redact: '$1<redacted>' },
  // GitHub PATs / fine-grained
  { id: 'github',     re: /(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}/g, redact: '$1<redacted>' },
  // AWS access key ids
  { id: 'aws-akid',   re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, redact: '$1<redacted>' },
  // AWS secret keys live in `aws_secret_access_key = ...` lines or as 40-char strings.
  // We only redact when the surrounding context labels it.
  { id: 'aws-secret', re: /(aws_secret_access_key\s*[:=]\s*)["']?[A-Za-z0-9/+=]{30,}["']?/gi, redact: '$1<redacted>' },
  // Google service-account private keys
  { id: 'gcp-key',    re: /(-----BEGIN PRIVATE KEY-----)[\s\S]+?(-----END PRIVATE KEY-----)/g, redact: '$1<redacted>$2' },
  // Slack tokens
  { id: 'slack',      re: /(xox[bopas]-)[A-Za-z0-9-]+/g, redact: '$1<redacted>' },
  // Stripe live keys
  { id: 'stripe',     re: /(sk_live_|rk_live_|pk_live_)[A-Za-z0-9]{20,}/g, redact: '$1<redacted>' },
  // Generic JWT (3 base64 segments) — too many false positives, so only match
  // when prefixed with "Bearer " or assignment context.
  { id: 'bearer-jwt', re: /(Bearer\s+)eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, redact: '$1<redacted>' },
];

export interface ScrubResult {
  text: string;
  /** Pattern ids that matched at least once. */
  hits: string[];
}

/** Strip recognized secret patterns. Always safe to call; no-ops on plain text. */
export function scrubSecrets(input: string): ScrubResult {
  let text = input;
  const hits: string[] = [];
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      text = text.replace(new RegExp(p.re.source, p.re.flags), p.redact);
      hits.push(p.id);
    }
  }
  return { text, hits };
}
