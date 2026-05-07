/**
 * Database layer — connection pool, base repository, and concrete repositories.
 */

export { ConnectionPoolManager } from './connection.js';
export type { DatabaseCredentials, ConnectionPoolOptions } from './connection.js';

export { BaseRepository } from './repository.js';
export type { PaginationOptions, QueryResult } from './repository.js';

export { TenantRepository } from './tenant.repository.js';
export type { TenantRow } from './tenant.repository.js';

export { AgentProgramRepository } from './agent-program.repository.js';
export type { AgentProgramRow } from './agent-program.repository.js';

export {
  StateMachineDefinitionRepository,
  StateMachineInstanceRepository,
} from './state-machine.repository.js';
export type {
  StateMachineDefinitionRow,
  StateMachineInstanceRow,
} from './state-machine.repository.js';

export { MemoryRepository } from './memory.repository.js';
export type {
  MemoryEntryRow,
  MemorySearchOptions,
  MemorySearchResult,
} from './memory.repository.js';

export { TokenUsageRepository } from './token-usage.repository.js';
export type {
  TokenUsageRow,
  UsageAggregate,
  UsageByAgent,
  UsageByPillar,
  UsageByModel,
} from './token-usage.repository.js';

export { CompletionContractRepository } from './completion-contract.repository.js';
export type { CompletionContractRow } from './completion-contract.repository.js';

// In-memory implementations for local development
export {
  InMemoryAgentProgramRepository,
  InMemoryStateMachineDefinitionRepository,
  InMemoryStateMachineInstanceRepository,
  InMemoryMemoryRepository,
  InMemoryTokenUsageRepository,
  InMemoryCompletionContractRepository,
  InMemoryTenantRepository,
} from './in-memory/index.js';
