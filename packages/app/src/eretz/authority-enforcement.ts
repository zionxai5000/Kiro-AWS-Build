/**
 * Eretz Operational Authority Enforcement
 *
 * Enforces SEMP (Seraphim Enterprise Management Protocol) compliance across
 * all business subsidiaries. Provides output rejection with specific feedback,
 * resource reallocation subject to Otzar budget constraints and Mishmar
 * governance rules, and logs all authority exercises to XO Audit.
 *
 * Requirements: 29f.20, 29f.21, 29f.22
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService, OtzarService, MishmarService } from '@seraphim/core';
import type { SubsidiaryResult, QualityStandard } from './agent-program.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SEMPComplianceCheck {
  subsidiary: string;
  outputId: string;
  compliant: boolean;
  violations: SEMPViolation[];
  checkedAt: Date;
}

export interface SEMPViolation {
  category: 'quality_standards' | 'process_adherence' | 'reporting_cadence' | 'governance';
  description: string;
  severity: 'critical' | 'major' | 'minor';
  standard: string;
  actual: string;
  expected: string;
}

export interface OutputRejection {
  outputId: string;
  subsidiary: string;
  rejectedAt: Date;
  reason: string;
  violations: SEMPViolation[];
  remediationRequirements: RemediationRequirement[];
}

export interface RemediationRequirement {
  id: string;
  description: string;
  category: string;
  deadline: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ResourceReallocation {
  id: string;
  sourceSubsidiary: string;
  targetSubsidiary: string;
  amount: number;
  reason: string;
  approvedBy: string;
  status: 'approved' | 'rejected' | 'pending';
  budgetCheckPassed: boolean;
  governanceCheckPassed: boolean;
  executedAt?: Date;
}

export interface AuthorityExerciseLog {
  exerciseType: 'semp_compliance_check' | 'output_rejection' | 'resource_reallocation';
  subsidiary: string;
  action: string;
  outcome: string;
  reason: string;
}

export interface AuthorityEnforcementConfig {
  eventBus: EventBusService;
  otzarService: OtzarService;
  mishmarService: MishmarService;
}

// ---------------------------------------------------------------------------
// SEMP Quality Standards (default set)
// ---------------------------------------------------------------------------

const DEFAULT_SEMP_STANDARDS: QualityStandard[] = [
  {
    id: 'semp-quality-min',
    name: 'Minimum Quality Score',
    threshold: 0.6,
    description: 'Output must meet minimum business quality threshold',
  },
  {
    id: 'semp-metrics-required',
    name: 'Metrics Reporting',
    threshold: 1.0,
    description: 'Output must include quantitative metrics',
  },
  {
    id: 'semp-outcome-required',
    name: 'Outcome Documentation',
    threshold: 1.0,
    description: 'Output must include documented outcome data',
  },
  {
    id: 'semp-timeliness',
    name: 'Timeliness',
    threshold: 1.0,
    description: 'Output must be completed within expected timeframe',
  },
];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AuthorityEnforcementImpl {
  private readonly eventBus: EventBusService;
  private readonly otzarService: OtzarService;
  private readonly mishmarService: MishmarService;

  constructor(config: AuthorityEnforcementConfig) {
    this.eventBus = config.eventBus;
    this.otzarService = config.otzarService;
    this.mishmarService = config.mishmarService;
  }

  /**
   * Check SEMP compliance for a subsidiary output.
   * Validates against quality standards, process adherence, reporting cadence,
   * and governance requirements.
   *
   * Requirement 29f.20
   */
  async checkSEMPCompliance(result: SubsidiaryResult): Promise<SEMPComplianceCheck> {
    const violations: SEMPViolation[] = [];

    // Quality standards check
    this.checkQualityStandards(result, violations);

    // Process adherence check
    this.checkProcessAdherence(result, violations);

    // Reporting cadence check
    this.checkReportingCadence(result, violations);

    // Governance requirements check
    this.checkGovernanceRequirements(result, violations);

    const compliant = violations.length === 0;

    const check: SEMPComplianceCheck = {
      subsidiary: result.subsidiary,
      outputId: result.id,
      compliant,
      violations,
      checkedAt: new Date(),
    };

    // Log authority exercise
    await this.logAuthorityExercise({
      exerciseType: 'semp_compliance_check',
      subsidiary: result.subsidiary,
      action: 'compliance_check',
      outcome: compliant ? 'compliant' : 'non_compliant',
      reason: compliant
        ? 'All SEMP standards met'
        : `${violations.length} violation(s) found: ${violations.map((v) => v.category).join(', ')}`,
    });

    return check;
  }

  /**
   * Reject subsidiary output that fails business quality standards.
   * Provides specific feedback and remediation requirements.
   *
   * Requirement 29f.21
   */
  async rejectOutput(
    result: SubsidiaryResult,
    violations: SEMPViolation[],
  ): Promise<OutputRejection> {
    const remediationRequirements = this.generateRemediationRequirements(violations);

    const rejection: OutputRejection = {
      outputId: result.id,
      subsidiary: result.subsidiary,
      rejectedAt: new Date(),
      reason: `Output rejected: ${violations.length} SEMP violation(s) detected`,
      violations,
      remediationRequirements,
    };

    // Log authority exercise
    await this.logAuthorityExercise({
      exerciseType: 'output_rejection',
      subsidiary: result.subsidiary,
      action: 'reject_output',
      outcome: 'rejected',
      reason: `${violations.length} violation(s): ${violations.map((v) => v.description).join('; ')}`,
    });

    return rejection;
  }

  /**
   * Reallocate resources between subsidiaries based on portfolio priorities.
   * Subject to Otzar budget constraints and Mishmar governance rules.
   *
   * Requirement 29f.22
   */
  async reallocateResources(request: {
    sourceSubsidiary: string;
    targetSubsidiary: string;
    amount: number;
    reason: string;
  }): Promise<ResourceReallocation> {
    const reallocationId = randomUUID();

    // Check Otzar budget constraints
    const budgetCheck = await this.otzarService.checkBudget(
      request.targetSubsidiary,
      request.amount,
    );

    // Check Mishmar governance rules
    const governanceCheck = await this.mishmarService.authorize({
      agentId: 'eretz',
      action: 'reallocate_resources',
      target: request.targetSubsidiary,
      authorityLevel: 'L3',
      context: {
        sourceSubsidiary: request.sourceSubsidiary,
        targetSubsidiary: request.targetSubsidiary,
        amount: request.amount,
        reason: request.reason,
      },
    });

    const budgetCheckPassed = budgetCheck.allowed;
    const governanceCheckPassed = governanceCheck.authorized;
    const approved = budgetCheckPassed && governanceCheckPassed;

    const reallocation: ResourceReallocation = {
      id: reallocationId,
      sourceSubsidiary: request.sourceSubsidiary,
      targetSubsidiary: request.targetSubsidiary,
      amount: request.amount,
      reason: request.reason,
      approvedBy: approved ? 'eretz' : 'none',
      status: approved ? 'approved' : 'rejected',
      budgetCheckPassed,
      governanceCheckPassed,
      executedAt: approved ? new Date() : undefined,
    };

    // Log authority exercise
    await this.logAuthorityExercise({
      exerciseType: 'resource_reallocation',
      subsidiary: request.targetSubsidiary,
      action: 'reallocate_resources',
      outcome: approved ? 'approved' : 'rejected',
      reason: !budgetCheckPassed
        ? `Budget constraint: ${budgetCheck.reason ?? 'insufficient budget'}`
        : !governanceCheckPassed
          ? `Governance rule: ${governanceCheck.reason}`
          : `Reallocated ${request.amount} from ${request.sourceSubsidiary} to ${request.targetSubsidiary}`,
    });

    return reallocation;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private checkQualityStandards(result: SubsidiaryResult, violations: SEMPViolation[]): void {
    // Check outcome completeness
    if (!result.outcome || Object.keys(result.outcome).length === 0) {
      violations.push({
        category: 'quality_standards',
        description: 'Output missing outcome data',
        severity: 'critical',
        standard: DEFAULT_SEMP_STANDARDS[2].name,
        actual: 'no outcome data',
        expected: 'documented outcome with relevant fields',
      });
    }

    // Check metrics presence
    if (!result.metrics || Object.keys(result.metrics).length === 0) {
      violations.push({
        category: 'quality_standards',
        description: 'Output missing quantitative metrics',
        severity: 'major',
        standard: DEFAULT_SEMP_STANDARDS[1].name,
        actual: 'no metrics reported',
        expected: 'quantitative metrics (MRR impact, downloads, retention, etc.)',
      });
    }
  }

  private checkProcessAdherence(result: SubsidiaryResult, violations: SEMPViolation[]): void {
    // Check that directive reference exists
    if (!result.directiveId) {
      violations.push({
        category: 'process_adherence',
        description: 'Output not linked to a directive',
        severity: 'major',
        standard: 'Directive Traceability',
        actual: 'no directive reference',
        expected: 'valid directive ID linking output to originating directive',
      });
    }

    // Check action is specified
    if (!result.action || result.action.trim() === '') {
      violations.push({
        category: 'process_adherence',
        description: 'Output missing action classification',
        severity: 'minor',
        standard: 'Action Classification',
        actual: 'no action specified',
        expected: 'clear action classification for the output',
      });
    }
  }

  private checkReportingCadence(result: SubsidiaryResult, violations: SEMPViolation[]): void {
    // Check completion timestamp exists
    if (!result.completedAt) {
      violations.push({
        category: 'reporting_cadence',
        description: 'Output missing completion timestamp',
        severity: 'major',
        standard: 'Timeliness Reporting',
        actual: 'no completion timestamp',
        expected: 'valid completion timestamp for cadence tracking',
      });
    }
  }

  private checkGovernanceRequirements(
    result: SubsidiaryResult,
    violations: SEMPViolation[],
  ): void {
    // Check subsidiary identification
    if (!result.subsidiary || result.subsidiary.trim() === '') {
      violations.push({
        category: 'governance',
        description: 'Output missing subsidiary identification',
        severity: 'critical',
        standard: 'Subsidiary Identification',
        actual: 'no subsidiary identified',
        expected: 'valid subsidiary identifier (zionx, zxmg, zion_alpha)',
      });
    }
  }

  private generateRemediationRequirements(
    violations: SEMPViolation[],
  ): RemediationRequirement[] {
    return violations.map((violation, index) => ({
      id: `rem-${randomUUID().slice(0, 8)}`,
      description: `Fix: ${violation.description}. Expected: ${violation.expected}`,
      category: violation.category,
      deadline: violation.severity === 'critical' ? '24h' : violation.severity === 'major' ? '48h' : '72h',
      priority: violation.severity === 'critical' ? 'critical' : violation.severity === 'major' ? 'high' : 'medium',
    }));
  }

  private async logAuthorityExercise(log: AuthorityExerciseLog): Promise<void> {
    await this.eventBus.publish({
      source: 'eretz',
      type: `authority.${log.exerciseType}`,
      detail: {
        exerciseType: log.exerciseType,
        subsidiary: log.subsidiary,
        action: log.action,
        outcome: log.outcome,
        reason: log.reason,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });
  }
}
