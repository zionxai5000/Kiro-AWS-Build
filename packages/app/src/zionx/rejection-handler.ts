/**
 * ZionX App Factory — Rejection Handler
 *
 * Parses Apple App Store and Google Play rejection reasons, creates new Gate
 * checks to prevent recurrence, and stores learned patterns in Zikaron
 * procedural memory so the system never repeats the same mistake.
 *
 * Requirements: 11.4
 */

import type { GateDefinition } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { RejectionReason } from '@seraphim/drivers';
import type { GooglePlayRejectionReason } from '@seraphim/drivers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StorePlatform = 'apple' | 'google';

export interface RejectionEvent {
  appId: string;
  platform: StorePlatform;
  submissionId: string;
  rejectionCodes: string[];
  rawResponse?: string;
  rejectedAt: string;
}

export interface ParsedRejection {
  appId: string;
  platform: StorePlatform;
  submissionId: string;
  reasons: RejectionReasonDetail[];
  newGates: GateDefinition[];
  remediationPlan: RemediationStep[];
  parsedAt: string;
}

export interface RejectionReasonDetail {
  code: string;
  category: string;
  description: string;
  guidelineSection?: string;
  remediationHint: string;
}

export interface RemediationStep {
  order: number;
  action: string;
  description: string;
  gateId?: string;
  estimatedEffort: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Apple Rejection Reason Map (mirrors driver definitions)
// ---------------------------------------------------------------------------

const APPLE_REJECTION_MAP: Record<string, RejectionReasonDetail> = {
  GUIDELINE_2_1: {
    code: 'GUIDELINE_2_1',
    category: 'guideline_violation',
    description: 'App completeness — app crashed or had obvious bugs during review',
    guidelineSection: '2.1',
    remediationHint: 'Ensure the app is fully tested and does not crash during normal usage flows.',
  },
  GUIDELINE_2_3: {
    code: 'GUIDELINE_2_3',
    category: 'metadata_issue',
    description: 'Accurate metadata — app description does not match functionality',
    guidelineSection: '2.3',
    remediationHint: 'Update the app description to accurately reflect the app functionality.',
  },
  GUIDELINE_3_1_1: {
    code: 'GUIDELINE_3_1_1',
    category: 'guideline_violation',
    description: 'In-App Purchase — digital content must use IAP, not external payment',
    guidelineSection: '3.1.1',
    remediationHint: 'Use Apple In-App Purchase for all digital goods and subscriptions.',
  },
  GUIDELINE_4_0: {
    code: 'GUIDELINE_4_0',
    category: 'design_issue',
    description: 'Design — app does not meet minimum quality or design standards',
    guidelineSection: '4.0',
    remediationHint: 'Improve the app UI/UX to meet Apple Human Interface Guidelines.',
  },
  GUIDELINE_5_1_1: {
    code: 'GUIDELINE_5_1_1',
    category: 'legal_issue',
    description: 'Data collection and storage — privacy policy missing or inadequate',
    guidelineSection: '5.1.1',
    remediationHint: 'Add a comprehensive privacy policy URL and ensure data handling disclosures are accurate.',
  },
  METADATA_MISSING_SCREENSHOTS: {
    code: 'METADATA_MISSING_SCREENSHOTS',
    category: 'metadata_issue',
    description: 'Required screenshots are missing for one or more device sizes',
    remediationHint: 'Upload screenshots for all required device sizes.',
  },
  BINARY_CRASH_ON_LAUNCH: {
    code: 'BINARY_CRASH_ON_LAUNCH',
    category: 'binary_issue',
    description: 'The binary crashed on launch during review',
    remediationHint: 'Test the release build on a physical device and fix any launch crashes.',
  },
};

// ---------------------------------------------------------------------------
// Google Play Rejection Reason Map
// ---------------------------------------------------------------------------

const GOOGLE_REJECTION_MAP: Record<string, RejectionReasonDetail> = {
  POLICY_DECEPTIVE_BEHAVIOR: {
    code: 'POLICY_DECEPTIVE_BEHAVIOR',
    category: 'policy_violation',
    description: 'App engages in deceptive behavior',
    policyReference: 'Deceptive Behavior Policy',
    remediationHint: 'Remove any misleading claims, hidden functionality, or deceptive UI patterns.',
  } as RejectionReasonDetail & { policyReference?: string },
  POLICY_INAPPROPRIATE_CONTENT: {
    code: 'POLICY_INAPPROPRIATE_CONTENT',
    category: 'content_issue',
    description: 'App contains content that violates Google Play content policies',
    remediationHint: 'Review and remove content that violates Google Play content guidelines.',
  },
  CONTENT_RATING_MISMATCH: {
    code: 'CONTENT_RATING_MISMATCH',
    category: 'content_issue',
    description: 'App content does not match the declared content rating',
    remediationHint: 'Complete the content rating questionnaire accurately.',
  },
  TECHNICAL_CRASH_RATE: {
    code: 'TECHNICAL_CRASH_RATE',
    category: 'technical_issue',
    description: 'App has an excessive crash rate',
    remediationHint: 'Fix crash-causing bugs and add proper error handling.',
  },
  TECHNICAL_PERMISSIONS: {
    code: 'TECHNICAL_PERMISSIONS',
    category: 'technical_issue',
    description: 'App requests permissions not justified by its functionality',
    remediationHint: 'Remove unnecessary permission requests.',
  },
  METADATA_MISLEADING_SCREENSHOTS: {
    code: 'METADATA_MISLEADING_SCREENSHOTS',
    category: 'metadata_issue',
    description: 'Screenshots do not accurately represent the app experience',
    remediationHint: 'Update screenshots to accurately reflect the current app UI.',
  },
  SECURITY_DATA_SAFETY: {
    code: 'SECURITY_DATA_SAFETY',
    category: 'security_issue',
    description: 'Data safety section is inaccurate or incomplete',
    remediationHint: 'Review and update the data safety form.',
  },
};

// ---------------------------------------------------------------------------
// Rejection Handler
// ---------------------------------------------------------------------------

export class RejectionHandler {
  constructor(private readonly zikaronService: ZikaronService) {}

  /**
   * Parse a rejection event, create new gate checks, and store the pattern
   * in Zikaron procedural memory for future prevention.
   */
  async handleRejection(event: RejectionEvent): Promise<ParsedRejection> {
    // 1. Parse rejection codes into structured reasons
    const reasons = this.parseRejectionCodes(event.platform, event.rejectionCodes);

    // 2. Generate new gate checks to prevent recurrence
    const newGates = this.createPreventionGates(event.platform, reasons);

    // 3. Build remediation plan
    const remediationPlan = this.buildRemediationPlan(reasons, newGates);

    // 4. Store pattern in Zikaron procedural memory
    await this.storeRejectionPattern(event, reasons, newGates);

    return {
      appId: event.appId,
      platform: event.platform,
      submissionId: event.submissionId,
      reasons,
      newGates,
      remediationPlan,
      parsedAt: new Date().toISOString(),
    };
  }

  /**
   * Parse rejection codes into structured reason details.
   */
  parseRejectionCodes(
    platform: StorePlatform,
    codes: string[],
  ): RejectionReasonDetail[] {
    const map = platform === 'apple' ? APPLE_REJECTION_MAP : GOOGLE_REJECTION_MAP;

    return codes.map((code) => {
      const known = map[code];
      if (known) return known;

      // Unknown rejection code — create a generic entry
      return {
        code,
        category: 'unknown',
        description: `Unknown rejection code: ${code}`,
        remediationHint: 'Review the rejection details in the store console for specific guidance.',
      };
    });
  }

  /**
   * Create new GateDefinition entries that will prevent the same rejection
   * from happening again on future submissions.
   */
  createPreventionGates(
    platform: StorePlatform,
    reasons: RejectionReasonDetail[],
  ): GateDefinition[] {
    return reasons.map((reason, idx) => ({
      id: `gate-prevention-${platform}-${reason.code.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${idx}`,
      name: `Prevention: ${reason.description.slice(0, 60)}`,
      type: 'validation' as const,
      config: {
        rejectionCode: reason.code,
        category: reason.category,
        platform,
        checkDescription: reason.remediationHint,
        createdFromRejection: true,
      },
      required: true,
    }));
  }

  /**
   * Build an ordered remediation plan from rejection reasons and new gates.
   */
  buildRemediationPlan(
    reasons: RejectionReasonDetail[],
    gates: GateDefinition[],
  ): RemediationStep[] {
    return reasons.map((reason, idx) => ({
      order: idx + 1,
      action: `fix_${reason.category}`,
      description: reason.remediationHint,
      gateId: gates[idx]?.id,
      estimatedEffort: this.estimateEffort(reason.category),
    }));
  }

  /**
   * Store the rejection pattern in Zikaron procedural memory so the system
   * learns from past rejections and prevents recurrence across all apps.
   */
  private async storeRejectionPattern(
    event: RejectionEvent,
    reasons: RejectionReasonDetail[],
    gates: GateDefinition[],
  ): Promise<void> {
    await this.zikaronService.storeProcedural({
      id: `rejection-pattern-${event.appId}-${Date.now()}`,
      tenantId: 'system',
      layer: 'procedural',
      content: `Rejection pattern for ${event.platform}: ${reasons.map((r) => r.code).join(', ')}`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: [
        'rejection',
        event.platform,
        ...reasons.map((r) => r.category),
      ],
      createdAt: new Date(),
      workflowPattern: `store_rejection_${event.platform}`,
      successRate: 0,
      executionCount: 1,
      prerequisites: [],
      steps: reasons.map((reason, idx) => ({
        order: idx + 1,
        action: `check_${reason.code}`,
        description: reason.remediationHint,
        expectedOutcome: `Gate ${gates[idx]?.id ?? 'unknown'} passes`,
      })),
    });
  }

  /**
   * Estimate remediation effort based on rejection category.
   */
  private estimateEffort(
    category: string,
  ): 'low' | 'medium' | 'high' {
    switch (category) {
      case 'metadata_issue':
        return 'low';
      case 'content_issue':
      case 'legal_issue':
        return 'medium';
      case 'guideline_violation':
      case 'design_issue':
      case 'binary_issue':
      case 'technical_issue':
      case 'policy_violation':
      case 'security_issue':
        return 'high';
      default:
        return 'medium';
    }
  }
}
