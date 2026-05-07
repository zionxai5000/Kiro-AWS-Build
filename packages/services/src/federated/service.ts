/**
 * Federated Intelligence
 *
 * Publish, evaluate, and adopt anonymized improvement patterns across instances.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4
 */

export interface SharedPattern {
  id: string;
  taskType: string;
  description: string;
  fix: Record<string, unknown>;
  confidence: number;
  adoptionCount: number;
  effectiveness: number;
  publishedAt: string;
  anonymized: boolean;
}

export interface AnonymizationResult {
  clean: boolean;
  issues: string[];
  strippedFields: string[];
}

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // phone
  /\b(?:sk-|pk_|rk_|ak_)[a-zA-Z0-9]{20,}\b/, // API keys
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // credit card
  /\btenant-[a-z0-9-]+\b/i, // tenant IDs
];

export class FederatedIntelligenceService {
  private patterns = new Map<string, SharedPattern>();

  /**
   * Publish an anonymized pattern to the shared registry.
   */
  async publishPattern(
    taskType: string,
    description: string,
    fix: Record<string, unknown>,
    confidence: number,
  ): Promise<SharedPattern | null> {
    const anonymization = this.checkAnonymization(JSON.stringify(fix) + description);
    if (!anonymization.clean) return null;

    const pattern: SharedPattern = {
      id: `fp-${Date.now()}`,
      taskType,
      description,
      fix,
      confidence,
      adoptionCount: 0,
      effectiveness: 0,
      publishedAt: new Date().toISOString(),
      anonymized: true,
    };
    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Evaluate a pattern's applicability to the local instance.
   */
  async evaluatePattern(patternId: string, localTaskTypes: string[]): Promise<{ applicable: boolean; score: number }> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return { applicable: false, score: 0 };
    const applicable = localTaskTypes.includes(pattern.taskType);
    return { applicable, score: applicable ? pattern.confidence : 0 };
  }

  /**
   * Adopt a pattern.
   */
  async adoptPattern(patternId: string): Promise<boolean> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;
    pattern.adoptionCount++;
    return true;
  }

  /**
   * Get pattern metrics.
   */
  getPatternMetrics(): { total: number; avgConfidence: number; totalAdoptions: number } {
    const all = Array.from(this.patterns.values());
    return {
      total: all.length,
      avgConfidence: all.length > 0 ? all.reduce((s, p) => s + p.confidence, 0) / all.length : 0,
      totalAdoptions: all.reduce((s, p) => s + p.adoptionCount, 0),
    };
  }

  /**
   * Check that content is properly anonymized (no PII, credentials, tenant data).
   */
  checkAnonymization(content: string): AnonymizationResult {
    const issues: string[] = [];
    const strippedFields: string[] = [];

    for (const pattern of PII_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(`Contains potentially sensitive data matching: ${pattern.source}`);
        strippedFields.push(pattern.source);
      }
    }

    return { clean: issues.length === 0, issues, strippedFields };
  }
}
