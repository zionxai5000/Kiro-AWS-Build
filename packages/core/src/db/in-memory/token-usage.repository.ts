/**
 * In-memory implementation of TokenUsageRepository.
 */

import { randomUUID } from 'node:crypto';
import type {
  TokenUsageRow,
  UsageAggregate,
  UsageByAgent,
  UsageByPillar,
  UsageByModel,
} from '../token-usage.repository.js';

export class InMemoryTokenUsageRepository {
  private readonly store: TokenUsageRow[] = [];

  async findById(_tenantId: string, id: string): Promise<TokenUsageRow | null> {
    return this.store.find((r) => r.id === id) ?? null;
  }

  async record(
    _tenantId: string,
    data: Omit<TokenUsageRow, 'id' | 'createdAt'>,
  ): Promise<TokenUsageRow> {
    const row: TokenUsageRow = {
      id: randomUUID(),
      tenantId: data.tenantId,
      agentId: data.agentId,
      pillar: data.pillar,
      provider: data.provider,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      costUsd: data.costUsd,
      taskType: data.taskType,
      createdAt: new Date(),
    };
    this.store.push(row);
    return row;
  }

  async getAggregate(
    _tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageAggregate> {
    const filtered = this.store.filter(
      (r) => r.createdAt >= dateRange.start && r.createdAt <= dateRange.end,
    );
    return {
      totalInputTokens: filtered.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: filtered.reduce((s, r) => s + r.outputTokens, 0),
      totalCostUsd: filtered.reduce((s, r) => s + r.costUsd, 0),
      count: filtered.length,
    };
  }

  async getDailyUsageByAgent(
    _tenantId: string,
    agentId: string,
    date: Date,
  ): Promise<UsageAggregate> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const filtered = this.store.filter(
      (r) =>
        r.agentId === agentId &&
        r.createdAt >= startOfDay &&
        r.createdAt <= endOfDay,
    );
    return {
      totalInputTokens: filtered.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: filtered.reduce((s, r) => s + r.outputTokens, 0),
      totalCostUsd: filtered.reduce((s, r) => s + r.costUsd, 0),
      count: filtered.length,
    };
  }

  async getUsageByAgent(
    _tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageByAgent[]> {
    const filtered = this.store.filter(
      (r) => r.createdAt >= dateRange.start && r.createdAt <= dateRange.end,
    );
    const map = new Map<string, UsageByAgent>();
    for (const r of filtered) {
      const existing = map.get(r.agentId) ?? {
        agentId: r.agentId,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      };
      existing.totalCostUsd += r.costUsd;
      existing.totalInputTokens += r.inputTokens;
      existing.totalOutputTokens += r.outputTokens;
      map.set(r.agentId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  }

  async getUsageByPillar(
    _tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageByPillar[]> {
    const filtered = this.store.filter(
      (r) => r.createdAt >= dateRange.start && r.createdAt <= dateRange.end,
    );
    const map = new Map<string, UsageByPillar>();
    for (const r of filtered) {
      const existing = map.get(r.pillar) ?? {
        pillar: r.pillar,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      };
      existing.totalCostUsd += r.costUsd;
      existing.totalInputTokens += r.inputTokens;
      existing.totalOutputTokens += r.outputTokens;
      map.set(r.pillar, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  }

  async getUsageByModel(
    _tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageByModel[]> {
    const filtered = this.store.filter(
      (r) => r.createdAt >= dateRange.start && r.createdAt <= dateRange.end,
    );
    const map = new Map<string, UsageByModel>();
    for (const r of filtered) {
      const key = `${r.provider}/${r.model}`;
      const existing = map.get(key) ?? {
        provider: r.provider,
        model: r.model,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      };
      existing.totalCostUsd += r.costUsd;
      existing.totalInputTokens += r.inputTokens;
      existing.totalOutputTokens += r.outputTokens;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  }
}
