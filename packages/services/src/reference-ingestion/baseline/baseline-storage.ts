/**
 * Baseline Storage — persists quality baselines to Zikaron procedural memory
 * and publishes update events to the Event Bus.
 *
 * Key behaviors:
 * - Routes app baselines to ZionX Domain_Expertise_Profile
 * - Routes video baselines to ZXMG Domain_Expertise_Profile
 * - Retains full version history (each store creates a new version)
 * - Tags entries with: reference type, source URL, domain category, extraction timestamp
 * - Publishes `baseline.updated` event on every store/update
 * - Supports querying baselines by domain category
 */

import { randomUUID } from 'node:crypto';

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { EventBusService } from '@seraphim/core/interfaces/event-bus-service.js';
import type { ProceduralEntry } from '@seraphim/core/types/memory.js';

import type { QualityBaseline, AppQualityBaseline, VideoQualityBaseline } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Agent ID for ZionX (app domain expertise) */
const ZIONX_AGENT_ID = 'zionx';

/** Agent ID for ZXMG (video domain expertise) */
const ZXMG_AGENT_ID = 'zxmg';

/** Memory profile tag for domain expertise */
const DOMAIN_EXPERTISE_PROFILE = 'Domain_Expertise_Profile';

/** Event source identifier */
const EVENT_SOURCE = 'seraphim.baseline-storage';

/** Event type for baseline updates */
const BASELINE_UPDATED_EVENT = 'baseline.updated';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stored baseline version entry */
export interface StoredBaselineVersion {
  entryId: string;
  baseline: QualityBaseline;
  agentId: string;
  version: number;
  storedAt: Date;
}

// ---------------------------------------------------------------------------
// Baseline Storage
// ---------------------------------------------------------------------------

export class BaselineStorage {
  /** In-memory version history indexed by domain category */
  private readonly versionHistory = new Map<string, StoredBaselineVersion[]>();

  constructor(
    private readonly zikaronService: ZikaronService,
    private readonly eventBusService: EventBusService,
  ) {}

  /**
   * Stores a quality baseline in Zikaron procedural memory.
   * Routes to the appropriate agent's Domain_Expertise_Profile based on type.
   * Creates a new version entry, retaining full history.
   */
  async store(baseline: QualityBaseline, agentId: string): Promise<string> {
    const targetAgentId = this.resolveAgentId(baseline);
    const tags = this.buildTags(baseline);

    const entry: ProceduralEntry = {
      id: randomUUID(),
      tenantId: 'seraphim',
      layer: 'procedural',
      content: JSON.stringify(baseline),
      embedding: [],
      sourceAgentId: targetAgentId,
      tags,
      createdAt: new Date(),
      workflowPattern: `${DOMAIN_EXPERTISE_PROFILE}:${baseline.domainCategory}`,
      successRate: baseline.overallConfidence,
      executionCount: baseline.version,
      prerequisites: [],
      steps: [],
    };

    const entryId = await this.zikaronService.storeProcedural(entry);

    // Track version history
    const version: StoredBaselineVersion = {
      entryId,
      baseline,
      agentId: targetAgentId,
      version: baseline.version,
      storedAt: new Date(),
    };

    const history = this.versionHistory.get(baseline.domainCategory) ?? [];
    history.push(version);
    this.versionHistory.set(baseline.domainCategory, history);

    // Publish baseline.updated event
    await this.publishBaselineUpdatedEvent(baseline);

    return entryId;
  }

  /**
   * Retrieves the applicable baseline for a given domain category.
   * Returns the latest version stored for that category.
   */
  async queryByCategory(category: string): Promise<QualityBaseline | null> {
    const history = this.versionHistory.get(category);
    if (!history || history.length === 0) {
      return null;
    }

    // Return the latest version
    return history[history.length - 1].baseline;
  }

  /**
   * Returns the full version history for a domain category.
   */
  getVersionHistory(category: string): StoredBaselineVersion[] {
    return this.versionHistory.get(category) ?? [];
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Resolves the target agent ID based on baseline type.
   * App baselines → ZionX, Video baselines → ZXMG.
   */
  private resolveAgentId(baseline: QualityBaseline): string {
    return baseline.type === 'app' ? ZIONX_AGENT_ID : ZXMG_AGENT_ID;
  }

  /**
   * Builds domain-specific tags for the procedural memory entry.
   * Includes: reference type, source URLs, domain category, extraction timestamp.
   */
  private buildTags(baseline: QualityBaseline): string[] {
    const tags: string[] = [
      DOMAIN_EXPERTISE_PROFILE,
      `type:${baseline.type}`,
      `domain:${baseline.domainCategory}`,
      `version:${baseline.version}`,
      `timestamp:${new Date().toISOString()}`,
    ];

    // Add source URLs as tags
    for (const source of baseline.sources) {
      tags.push(`source:${source.url}`);
    }

    return tags;
  }

  /**
   * Publishes a `baseline.updated` event to the Event Bus with:
   * - affected domain category
   * - baseline version
   * - changed dimensions
   */
  private async publishBaselineUpdatedEvent(baseline: QualityBaseline): Promise<void> {
    const changedDimensions = baseline.dimensions.map(d => d.name);

    await this.eventBusService.publish({
      source: EVENT_SOURCE,
      type: BASELINE_UPDATED_EVENT,
      detail: {
        domainCategory: baseline.domainCategory,
        version: baseline.version,
        baselineType: baseline.type,
        changedDimensions,
        overallConfidence: baseline.overallConfidence,
      },
      metadata: {
        tenantId: 'seraphim',
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });
  }
}
