/**
 * Zion Alpha Trading — Trade Decision Logging
 *
 * Logs every trade decision (entry, exit, hold) with reasoning, market data,
 * and outcome to XO Audit and Zikaron.
 *
 * Requirements: 13.4
 */

import type { XOAuditService } from '@seraphim/core/interfaces/xo-audit-service.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { TradingPlatform } from './strategy.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeDecision {
  action: 'entry' | 'exit' | 'hold' | 'entry_blocked';
  marketId: string;
  platform: TradingPlatform;
  reasoning: string;
  marketData: Record<string, unknown>;
  outcome: string;
  tradeId?: string;
}

export interface TradeLogEntry {
  id: string;
  decision: TradeDecision;
  timestamp: string;
  agentId: string;
}

// ---------------------------------------------------------------------------
// Trade Logger
// ---------------------------------------------------------------------------

export class TradeLogger {
  private readonly agentId = 'zion-alpha-trading';

  constructor(
    private readonly auditService: XOAuditService,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Log a trade decision to both XO Audit and Zikaron.
   */
  async logDecision(decision: TradeDecision): Promise<TradeLogEntry> {
    const entry: TradeLogEntry = {
      id: `trade-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      decision,
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
    };

    // Map trade outcome to audit outcome union type
    const auditOutcome: 'success' | 'failure' | 'blocked' =
      decision.action === 'entry_blocked' ? 'blocked'
        : decision.outcome === 'failure' ? 'failure'
          : 'success';

    // Log to XO Audit for accountability
    await this.auditService.recordAction({
      tenantId: 'system',
      actingAgentId: this.agentId,
      actingAgentName: 'Zion Alpha Trading',
      actionType: `trade_${decision.action}`,
      target: `${decision.platform}:${decision.marketId}`,
      authorizationChain: [],
      executionTokens: [],
      outcome: auditOutcome,
      details: {
        reasoning: decision.reasoning,
        marketData: decision.marketData,
        tradeId: decision.tradeId,
      },
    });

    // Map trade outcome to episodic outcome union type
    const episodicOutcome: 'success' | 'failure' | 'partial' =
      decision.outcome === 'failure' ? 'failure'
        : decision.action === 'entry_blocked' ? 'failure'
          : 'success';

    // Store in Zikaron episodic memory for pattern analysis
    await this.zikaronService.storeEpisodic({
      id: entry.id,
      tenantId: 'system',
      layer: 'episodic',
      content: `Trade ${decision.action} on ${decision.platform}:${decision.marketId} — ${decision.reasoning}. Outcome: ${decision.outcome}`,
      embedding: [],
      sourceAgentId: this.agentId,
      tags: ['trade', decision.action, decision.platform, decision.outcome],
      createdAt: new Date(),
      eventType: `trade_${decision.action}`,
      participants: [this.agentId],
      outcome: episodicOutcome,
      relatedEntities: [
        { entityId: decision.marketId, entityType: 'market', role: 'target' },
        ...(decision.tradeId ? [{ entityId: decision.tradeId, entityType: 'trade', role: 'subject' }] : []),
      ],
    });

    return entry;
  }

  /**
   * Log a hold decision (monitoring, no action taken).
   */
  async logHold(
    marketId: string,
    platform: TradingPlatform,
    reasoning: string,
    marketData: Record<string, unknown>,
    tradeId?: string,
  ): Promise<TradeLogEntry> {
    return this.logDecision({
      action: 'hold',
      marketId,
      platform,
      reasoning,
      marketData,
      outcome: 'monitoring',
      tradeId,
    });
  }
}
