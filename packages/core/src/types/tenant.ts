/**
 * Tenant and user data models.
 */

import type { AuthorityLevel } from './enums.js';

// ---------------------------------------------------------------------------
// VPC Config
// ---------------------------------------------------------------------------

export interface VPCConfig {
  vpcId: string;
  securityGroupIds: string[];
  subnetIds: string[];
}

// ---------------------------------------------------------------------------
// Budget Config
// ---------------------------------------------------------------------------

export interface BudgetConfig {
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  alertThresholdPercent: number;
}

// ---------------------------------------------------------------------------
// Auth Profile
// ---------------------------------------------------------------------------

export interface AuthProfile {
  userId: string;
  role: 'king' | 'queen' | 'viewer';
  allowedPillars: string[];
  allowedActions: string[];
  authorityLevel: AuthorityLevel;
}

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  type: 'king' | 'queen' | 'platform_user';
  /** For Queen tenants */
  parentTenantId?: string;

  // Isolation
  vpcConfig: VPCConfig;

  // Resources
  pillars: string[];
  otzarBudget: BudgetConfig;

  // Auth
  authProfile: AuthProfile;

  createdAt: Date;
  status: 'active' | 'suspended' | 'provisioning';
}
