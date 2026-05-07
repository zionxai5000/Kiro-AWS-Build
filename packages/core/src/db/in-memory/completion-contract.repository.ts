/**
 * In-memory implementation of CompletionContractRepository.
 */

import { randomUUID } from 'node:crypto';
import type { CompletionContractRow } from '../completion-contract.repository.js';

export class InMemoryCompletionContractRepository {
  private readonly store = new Map<string, CompletionContractRow>();

  async findById(_tenantId: string, id: string): Promise<CompletionContractRow | null> {
    return this.store.get(id) ?? null;
  }

  async findByWorkflowAndVersion(
    _tenantId: string,
    workflowType: string,
    version: string,
  ): Promise<CompletionContractRow | null> {
    for (const row of this.store.values()) {
      if (row.workflowType === workflowType && row.version === version) return row;
    }
    return null;
  }

  async findLatestByWorkflow(
    _tenantId: string,
    workflowType: string,
  ): Promise<CompletionContractRow | null> {
    const matches = Array.from(this.store.values())
      .filter((r) => r.workflowType === workflowType)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async findAllByWorkflow(
    _tenantId: string,
    workflowType: string,
  ): Promise<CompletionContractRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.workflowType === workflowType)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(
    _tenantId: string,
    data: Partial<CompletionContractRow>,
  ): Promise<CompletionContractRow> {
    const row: CompletionContractRow = {
      id: data.id ?? randomUUID(),
      tenantId: _tenantId,
      workflowType: data.workflowType ?? '',
      version: data.version ?? '1.0.0',
      outputSchema: data.outputSchema ?? {},
      verificationSteps: data.verificationSteps ?? [],
      createdAt: data.createdAt ?? new Date(),
    };
    this.store.set(row.id, row);
    return row;
  }

  async delete(_tenantId: string, id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
