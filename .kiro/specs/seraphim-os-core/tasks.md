# Implementation Plan: SeraphimOS Core Platform

## Overview

This implementation plan breaks SeraphimOS into five phases, each building on the previous. Phase 1 establishes the deployable AWS infrastructure and kernel foundation. Phase 2 adds system services (memory, governance, audit, resource management). Phase 3 builds the application layer and external service drivers. Phase 4 delivers the interface layer and end-to-end integration. Phase 5 adds advanced features (learning engine, marketplace, federated intelligence). Each task is concrete, implementable by a coding agent, and references specific requirements for traceability.

## Tasks

- [x] 1. Phase 1 — Core Infrastructure and Kernel Foundation
  - [x] 1.1 Initialize monorepo project structure and tooling
    - Create TypeScript monorepo with workspaces: `packages/core`, `packages/services`, `packages/drivers`, `packages/app`, `packages/infra`, `packages/dashboard`
    - Configure `tsconfig.json` with strict mode, path aliases, and project references
    - Set up ESLint, Prettier, and Vitest as the test runner
    - Add `package.json` scripts for build, test, lint across all packages
    - _Requirements: 15.1, 15.6, 19.3_

  - [x] 1.2 Define core TypeScript interfaces and shared types
    - Create `packages/core/src/interfaces/` with all interfaces from the design: `AgentRuntime`, `StateMachineEngine`, `MishmarService`, `ZikaronService`, `OtzarService`, `EventBusService`, `XOAuditService`, `Driver`, `LearningEngine`
    - Create `packages/core/src/types/` with all data models: `AgentProgram`, `StateMachineDefinition`, `MemoryEntry` (all 4 layers), `AuditRecord`, `Tenant`, `AuthProfile`, `CompletionContract`, `SystemEvent`, `SeraphimEvent`
    - Create `packages/core/src/types/enums.ts` with `MemoryLayer`, `DriverStatus`, `AgentState`, `AuthorityLevel` enums
    - _Requirements: 1.1, 1.4, 2.3, 3.7, 4.1, 5.1, 6.5, 7.1, 10.1_

  - [x] 1.3 Write unit tests for shared types and validation
    - Write Vitest tests validating type guards and runtime validation for all core data models
    - Test `AgentProgram` schema validation, `StateMachineDefinition` structure validation, `SeraphimEvent` envelope validation
    - _Requirements: 19.1, 6.5_

  - [x] 1.4 Create AWS CDK infrastructure stack — networking and data layer
    - Create `packages/infra/src/stacks/networking-stack.ts` with VPC (public + private subnets across 2 AZs), NAT Gateway, security groups for compute and data tiers
    - Create `packages/infra/src/stacks/data-stack.ts` with Aurora PostgreSQL Serverless v2 cluster (Multi-AZ), pgvector extension enabled, DynamoDB tables (`seraphim-audit-trail` with GSIs for actionType, agentId, pillar; `seraphim-events` with GSIs for eventType, correlationId), S3 buckets for artifacts and logs
    - Create `packages/infra/src/stacks/secrets-stack.ts` with Secrets Manager entries for all external service credentials (placeholder values)
    - Enable encryption at rest (KMS) on Aurora, DynamoDB, and S3
    - _Requirements: 15.1, 15.2, 20.1, 20.4_

  - [x] 1.5 Write CDK snapshot tests for infrastructure stacks
    - Write snapshot tests for networking, data, and secrets stacks to catch unintended infrastructure changes
    - _Requirements: 15.6, 19.3_

  - [x] 1.6 Create database migration system and initial schema
    - Set up a migration tool (e.g., `node-pg-migrate` or `kysely` migrations) in `packages/infra/src/migrations/`
    - Implement the initial migration with all tables from the design: `tenants`, `agent_programs`, `state_machine_definitions`, `state_machine_instances`, `memory_entries` (with pgvector column and HNSW index), `completion_contracts`, `token_usage`
    - Include row-level security policies filtering by `tenant_id` on all tables
    - _Requirements: 4.1, 14.1, 20.4_

  - [x] 1.7 Implement database connection pool and repository base
    - Create `packages/core/src/db/connection.ts` with a connection pool manager using `pg` library, reading connection string from Secrets Manager at runtime
    - Create `packages/core/src/db/repository.ts` with a base repository class that enforces `tenant_id` filtering on all queries
    - Create repository implementations: `AgentProgramRepository`, `StateMachineRepository`, `MemoryRepository`, `TenantRepository`, `TokenUsageRepository`, `CompletionContractRepository`
    - _Requirements: 14.1, 20.1, 20.4_

  - [x] 1.8 Write unit tests for repository layer
    - Write Vitest tests for each repository using a test database or mocked pg client
    - Test tenant isolation (queries always include `tenant_id`), CRUD operations, and error handling
    - _Requirements: 19.1, 14.1_

  - [x] 1.9 Implement the State Machine Engine
    - Create `packages/core/src/state-machine/engine.ts` implementing the `StateMachineEngine` interface
    - Implement `register()` to store versioned state machine definitions in `state_machine_definitions` table
    - Implement `createInstance()` to instantiate a state machine for an entity, persisting to `state_machine_instances`
    - Implement `transition()` with gate evaluation: load definition, check current state, evaluate all `GateDefinition` conditions, execute transition only if all required gates pass, persist new state, return `TransitionResult` with gate results
    - Implement `update()` for definition versioning with migration of existing instances (map old states to new states)
    - Implement `getHistory()` returning all transition records for an instance from the audit trail
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.10 Write unit tests for State Machine Engine
    - Test gate evaluation (all gates pass → transition succeeds, any required gate fails → transition rejected)
    - Test state machine definition registration and versioning
    - Test instance creation with initial state
    - Test transition history recording
    - Test definition migration without data loss
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 19.1_

  - [x] 1.11 Implement the Agent Runtime core
    - Create `packages/core/src/agent-runtime/runtime.ts` implementing the `AgentRuntime` interface
    - Implement `deploy()`: validate `AgentProgram`, create agent state machine instance, register in agent registry (in-memory + Aurora), return `AgentInstance`
    - Implement `execute()`: check permissions via Mishmar interface (stubbed initially), check budget via Otzar interface (stubbed), execute task, record result
    - Implement `upgrade()`: rolling transition — deploy new version, migrate state and memory references, terminate old version
    - Implement `terminate()`: transition agent to `terminated` state, log to audit, clean up resources
    - Implement `getState()` and `listAgents()` for registry queries
    - Implement `getHealth()` returning agent health based on heartbeat and error rate
    - Implement heartbeat mechanism: agents send heartbeat every 30 seconds, runtime detects stale agents after 90 seconds
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.12 Write unit tests for Agent Runtime
    - Test agent deployment lifecycle (deploy → ready → executing → terminated)
    - Test agent upgrade with state preservation
    - Test degraded state transition on unrecoverable error
    - Test permission enforcement (agent cannot exceed defined permissions)
    - Test heartbeat detection and stale agent handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 19.1_

  - [x] 1.13 Create AWS CDK compute stack — ECS Fargate and Lambda
    - Create `packages/infra/src/stacks/compute-stack.ts` with ECS Fargate cluster, task definitions for agent runtime containers, Lambda functions for event handlers
    - Configure ECS service with health checks (10-second interval), auto-scaling based on CPU/memory thresholds
    - Configure Lambda functions with SQS event source mappings for each queue
    - Set up IAM roles: ECS task role (access Aurora, DynamoDB, S3, Secrets Manager, EventBridge), Lambda execution role (access Aurora, DynamoDB, SQS)
    - _Requirements: 15.1, 15.3, 20.4_

  - [x] 1.14 Create AWS CDK API and messaging stack
    - Create `packages/infra/src/stacks/api-stack.ts` with API Gateway (REST + WebSocket), Cognito User Pool for authentication, Cognito authorizer on API Gateway
    - Create `packages/infra/src/stacks/messaging-stack.ts` with EventBridge event bus (`seraphim-events`), SQS queues (audit-events, memory-events, alert-events, workflow-events, learning-events), dead-letter queue, EventBridge rules for content-based routing to SQS queues
    - Configure FIFO queues for audit and state transition events, standard queues for others
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 15.1, 20.2_

  - [x] 1.15 Write CDK snapshot tests for compute, API, and messaging stacks
    - Snapshot tests for compute, API, and messaging stacks
    - _Requirements: 15.6, 19.3_

  - [x] 1.16 Implement Event Bus service
    - Create `packages/services/src/event-bus/service.ts` implementing the `EventBusService` interface
    - Implement `publish()`: validate event against `SeraphimEvent` schema, put event to EventBridge bus, store event in DynamoDB `seraphim-events` table
    - Implement `publishBatch()`: batch put to EventBridge (max 10 per batch)
    - Implement `subscribe()`: create EventBridge rule with content-based pattern matching, target SQS queue
    - Implement `getDeadLetterMessages()` and `retryDeadLetter()` for DLQ management
    - Implement message schema validation using JSON Schema (Ajv library) before accepting events
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.17 Write unit tests for Event Bus service
    - Test event schema validation (valid events accepted, malformed rejected)
    - Test publish and batch publish
    - Test dead-letter queue routing after retry exhaustion
    - Test message ordering within topic partition
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 19.1_

  - [x] 1.18 Create CDK pipeline stack and CI/CD configuration
    - Create `packages/infra/src/stacks/pipeline-stack.ts` with CDK Pipelines: source (GitHub), build (TypeScript compile + lint), test (Vitest), synth (CDK), deploy stages (dev → staging → prod)
    - Create `.github/workflows/ci.yml` with GitHub Actions: lint, type-check, unit tests, CDK synth on every PR
    - Add gate verification step between staging and production deployment
    - _Requirements: 15.1, 15.6, 19.3_

- [x] 2. Checkpoint — Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: monorepo builds, CDK synths without errors, database migrations run, State Machine Engine and Agent Runtime pass unit tests, Event Bus service passes unit tests

- [x] 3. Phase 2 — System Services
  - [x] 3.1 Implement XO Audit Service
    - Create `packages/services/src/xo-audit/service.ts` implementing the `XOAuditService` interface
    - Implement `recordAction()`: write audit entry to DynamoDB `seraphim-audit-trail` table with SHA-256 hash chain (each record's `hash` includes `previousHash` for integrity)
    - Implement `recordGovernanceDecision()` and `recordStateTransition()` as specialized audit entry types
    - Implement `query()` with filtering by agentId (GSI2), actionType (GSI1), pillar (GSI3), time range, and outcome
    - Implement `verifyIntegrity()`: walk the hash chain for a record and verify no tampering
    - Set DynamoDB TTL to 365 days minimum as per requirements
    - Publish `audit.entry.created` events to Event Bus for real-time monitoring
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 3.2 Write unit tests for XO Audit Service
    - Test hash chain integrity (each record links to previous)
    - Test immutability (verify no modification or deletion API exists)
    - Test query filtering by agent, time range, action type, pillar, outcome
    - Test 365-day TTL configuration
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 19.1_

  - [x] 3.3 Implement Mishmar Governance Service
    - Create `packages/services/src/mishmar/service.ts` implementing the `MishmarService` interface
    - Implement `authorize()`: check agent's authority level against action requirements, enforce L1-L4 authority matrix (L1 = King approval, L2 = designated authority, L3 = peer verification, L4 = autonomous within bounds), return `AuthorizationResult` with escalation if denied
    - Implement `validateSeparation()`: enforce that no agent both decides and executes the same controlled action within a single workflow
    - Implement `requestToken()` and `validateToken()`: generate and validate `ExecutionToken` artifacts requiring both authorizing agent and Otzar approval
    - Implement `validateCompletion()`: validate workflow outputs against `CompletionContract` JSON schema using Ajv, return specific schema violations on failure
    - Log all governance decisions to XO Audit via the audit service
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.4 Write unit tests for Mishmar Governance Service
    - Test authority level enforcement (L1 through L4 escalation paths)
    - Test role separation (same agent cannot decide and execute)
    - Test execution token generation and validation (requires both authorizer and Otzar)
    - Test completion contract validation (valid outputs pass, invalid outputs return specific violations)
    - Test blocked action logging to XO Audit
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 19.1_

  - [x] 3.5 Implement Zikaron Memory Service
    - Create `packages/services/src/zikaron/service.ts` implementing the `ZikaronService` interface
    - Implement `storeEpisodic()`: store event with embedding vector (call LLM embedding API via Otzar), auto-extract entities and relationships into semantic memory
    - Implement `storeSemantic()`: store facts and relationships with embedding
    - Implement `storeProcedural()`: store learned workflow patterns with success rate tracking
    - Implement `storeWorking()`: store active task context per agent session
    - Implement `query()`: vector similarity search using pgvector `<=>` operator (cosine distance), filter by tenant_id, layer, agent, date range, return results sorted by similarity score
    - Implement `loadAgentContext()`: load agent's working memory, recent episodic entries (last 7 days), and applicable procedural patterns (top 5 by success rate)
    - Implement `flagConflict()`: mark conflicting entries with metadata, retain both entries
    - Implement embedding generation using text-embedding-3-small (1536 dimensions) via the LLM provider driver
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 3.6 Write unit tests for Zikaron Memory Service
    - Test 4-layer storage (episodic, semantic, procedural, working)
    - Test vector similarity search returns results sorted by relevance
    - Test automatic entity extraction from episodic to semantic layer
    - Test agent context loading (working memory + recent episodic + procedural patterns)
    - Test cross-agent memory queries with tenant isolation
    - Test conflict flagging retains both entries
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 19.1_

  - [x] 3.7 Implement Otzar Resource Manager and Model Router
    - Create `packages/services/src/otzar/service.ts` implementing the `OtzarService` interface
    - Implement task classifier: classify incoming tasks by type (`summarization`, `classification`, `code_generation`, `analysis`, `creative`, `novel_reasoning`, etc.) and complexity (`low`, `medium`, `high`) using input length, output structure, domain specificity, historical failure rate, and dependency chain signals
    - Implement `routeTask()`: apply routing decision flow — classify task → check budget → check pillar policy → check performance history → select model from appropriate tier (Tier 1: GPT-4o-mini/Haiku, Tier 2: GPT-4o/Sonnet, Tier 3: Opus/GPT-4.5) → log decision rationale
    - Implement `checkBudget()`: enforce daily and monthly token budgets per agent, per pillar, and system-wide by querying `token_usage` table aggregates
    - Implement `recordUsage()`: write token usage to `token_usage` table with provider, model, input/output tokens, cost
    - Implement `getCostReport()` and `getDailyOptimizationReport()`: aggregate cost data with waste pattern detection
    - Implement `checkCache()` and `storeCache()`: semantic task cache using hash of (taskType + normalized input), with TTL by task type (classification: 24h, data_extraction: 1h, code_generation: 30m, novel_reasoning: no cache)
    - Implement pillar-level routing policies (`PillarRoutingPolicy`) with cost sensitivity, tier constraints, and task-specific overrides
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.8 Write unit tests for Otzar Resource Manager
    - Test task classification across all task types and complexity levels
    - Test model routing selects correct tier based on task type and complexity
    - Test budget enforcement blocks requests exceeding daily/monthly limits
    - Test cache hit/miss behavior with correct TTLs per task type
    - Test pillar policy overrides (e.g., Zion Alpha forces minimum Tier 2)
    - Test cost report aggregation accuracy
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 19.1_

  - [x] 3.9 Implement Credential Manager
    - Create `packages/services/src/credentials/manager.ts` implementing the `CredentialManager` interface
    - Implement `getCredential()`: retrieve credentials from AWS Secrets Manager at runtime, cache in memory with short TTL (5 minutes), never log credential values
    - Implement `rotateCredential()`: trigger Secrets Manager rotation for a driver's credentials with zero-downtime (dual-version during rotation)
    - Implement `getRotationSchedule()`: return configured rotation schedules (default 90 days)
    - Log every credential access to XO Audit (key name only, never the value)
    - _Requirements: 20.1, 20.5_

  - [x] 3.10 Write unit tests for Credential Manager
    - Test credential retrieval from Secrets Manager (mocked)
    - Test in-memory cache with TTL expiration
    - Test rotation triggers zero-downtime rotation
    - Test audit logging records key name but never credential value
    - _Requirements: 20.1, 20.5, 19.1_

  - [x] 3.11 Wire Agent Runtime to system services
    - Update `packages/core/src/agent-runtime/runtime.ts` to inject real service implementations: Mishmar for authorization checks before every controlled action, Otzar for budget checks and model routing before LLM calls, Zikaron for memory load on agent start and memory persist on task completion, XO Audit for action logging, Event Bus for publishing agent lifecycle events
    - Implement the agent execution flow: receive task → check Mishmar authorization → check Otzar budget → route to LLM model → execute → record usage → store results in Zikaron → publish completion event → log to XO Audit
    - Implement error handling: transient errors → retry with backoff, operational errors → log and continue, systemic errors → transition to degraded state
    - _Requirements: 1.1, 1.3, 1.4, 3.5, 5.1_

  - [x] 3.12 Write integration tests for Agent Runtime with services
    - Test full agent execution flow: deploy → authorize → budget check → execute → audit
    - Test Mishmar blocks unauthorized actions
    - Test Otzar blocks over-budget requests
    - Test agent transitions to degraded state on unrecoverable error
    - _Requirements: 1.1, 1.3, 1.4, 3.5, 5.1, 19.2_

  - [x] 3.13 Implement Lambda event handlers
    - Create `packages/services/src/handlers/audit-handler.ts`: process audit events from SQS audit queue, write to DynamoDB with hash chain
    - Create `packages/services/src/handlers/memory-handler.ts`: process memory events, trigger entity extraction for episodic entries, store in Aurora
    - Create `packages/services/src/handlers/alert-handler.ts`: process alert events, format notifications, deliver through configured channels (initially just logging, Shaar integration in Phase 4)
    - Create `packages/services/src/handlers/workflow-handler.ts`: process workflow events, trigger next steps in state machines
    - Make all handlers idempotent using event `id` as deduplication key
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 4.3_

  - [x] 3.14 Write unit tests for Lambda event handlers
    - Test each handler processes events correctly
    - Test idempotency (duplicate events are safely ignored)
    - Test DLQ routing after retry exhaustion
    - _Requirements: 6.1, 6.2, 19.1_

- [x] 4. Checkpoint — Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: XO Audit records and queries correctly, Mishmar enforces authority levels and completion contracts, Zikaron stores and retrieves across all 4 memory layers with vector search, Otzar routes tasks to correct model tiers and enforces budgets, Event Bus delivers messages with schema validation, all Lambda handlers process events idempotently

- [x] 5. Phase 3 — Application Layer and Driver Layer
  - [x] 5.1 Implement the uniform Driver base class and interface
    - Create `packages/drivers/src/base/driver.ts` implementing the `Driver<TConfig>` interface from the design
    - Implement base `connect()`, `execute()`, `verify()`, `disconnect()` lifecycle with status tracking (`disconnected` → `connecting` → `ready` → `executing` → `error`)
    - Implement built-in retry with exponential backoff (1s, 2s, 4s, 8s, 16s, max 5 attempts) in the base class
    - Implement circuit breaker pattern in the base class: closed → open (after 5 consecutive failures) → half-open (after 60s) → test one request → closed or open
    - Implement `healthCheck()` in the base class using the connection status and last successful operation timestamp
    - Implement session state management to avoid redundant authentication across operations
    - Implement idempotency key support for safe retries
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 5.2 Write unit tests for Driver base class
    - Test retry with exponential backoff (verify delays and max attempts)
    - Test circuit breaker state transitions (closed → open → half-open → closed)
    - Test session state persistence across operations
    - Test health check reflects actual connection status
    - Test idempotency key prevents duplicate operations
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 19.1_

  - [x] 5.3 Implement LLM Provider drivers
    - Create `packages/drivers/src/llm/anthropic-driver.ts`: Anthropic API driver (Claude Haiku, Sonnet, Opus) with streaming support, token counting, and cost calculation
    - Create `packages/drivers/src/llm/openai-driver.ts`: OpenAI API driver (GPT-4o-mini, GPT-4o, GPT-4.5) with streaming support, token counting, and cost calculation
    - Both drivers extend the base `Driver` class, authenticate via Credential Manager (Secrets Manager), and report usage to Otzar after each call
    - Implement model-specific rate limiting and retry logic respecting provider rate limits
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 5.1_

  - [x] 5.4 Write unit tests for LLM Provider drivers
    - Test authentication via Credential Manager (mocked Secrets Manager)
    - Test token counting and cost calculation accuracy
    - Test retry on transient errors (rate limits, timeouts)
    - Test circuit breaker opens on provider outage
    - _Requirements: 10.1, 10.2, 10.3, 5.1, 19.1_

  - [x] 5.5 Implement App Store Connect driver
    - Create `packages/drivers/src/appstore/appstore-connect-driver.ts` extending base `Driver`
    - Implement operations: `createApp`, `uploadBuild`, `submitForReview`, `checkReviewStatus`, `updateMetadata`, `uploadScreenshots`, `manageSubscriptions`, `getAppAnalytics`
    - Authenticate using App Store Connect API key (JWT) from Credential Manager
    - Handle App Store-specific error codes and rejection reasons
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 11.2, 11.3, 11.4_

  - [x] 5.6 Implement Google Play Console driver
    - Create `packages/drivers/src/googleplay/google-play-driver.ts` extending base `Driver`
    - Implement operations: `createApp`, `uploadBundle`, `submitForReview`, `checkReviewStatus`, `updateListing`, `uploadScreenshots`, `manageSubscriptions`, `getAppAnalytics`
    - Authenticate using Google Play Developer API service account from Credential Manager
    - Handle Google Play-specific error codes and rejection reasons
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 11.2, 11.3, 11.4_

  - [x] 5.7 Implement YouTube API driver
    - Create `packages/drivers/src/youtube/youtube-driver.ts` extending base `Driver`
    - Implement operations: `uploadVideo`, `updateMetadata`, `setThumbnail`, `getAnalytics`, `getComments`, `replyToComment`, `createPlaylist`, `schedulePublish`
    - Authenticate using YouTube Data API v3 OAuth2 credentials from Credential Manager
    - Handle upload resumption for large video files, platform-specific format validation
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 12.1, 12.2, 12.3, 12.4_

  - [x] 5.8 Implement trading platform drivers (Kalshi and Polymarket)
    - Create `packages/drivers/src/trading/kalshi-driver.ts` extending base `Driver`: implement `getMarkets`, `getPositions`, `placeTrade`, `cancelTrade`, `getTradeHistory`, `getBalance`
    - Create `packages/drivers/src/trading/polymarket-driver.ts` extending base `Driver`: implement `getMarkets`, `getPositions`, `placeTrade`, `cancelTrade`, `getTradeHistory`, `getBalance`
    - Both authenticate via API keys from Credential Manager
    - Implement position size validation and daily loss limit checks before trade execution
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 13.1, 13.2, 13.3_

  - [x] 5.9 Implement communication and productivity drivers
    - Create `packages/drivers/src/gmail/gmail-driver.ts`: send, receive, search emails via Gmail API
    - Create `packages/drivers/src/github/github-driver.ts`: create repos, PRs, issues, manage workflows via GitHub API
    - Create `packages/drivers/src/telegram/telegram-driver.ts`: send/receive messages via Telegram Bot API
    - Create `packages/drivers/src/discord/discord-driver.ts`: send/receive messages via Discord Bot API
    - Create `packages/drivers/src/whatsapp/whatsapp-driver.ts`: send/receive messages via WhatsApp Business API
    - All extend base `Driver`, authenticate via Credential Manager
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [x] 5.10 Implement media and content platform drivers
    - Create `packages/drivers/src/heygen/heygen-driver.ts`: generate AI videos via HeyGen API
    - Create `packages/drivers/src/rumble/rumble-driver.ts`: upload videos, get analytics via Rumble API
    - Create `packages/drivers/src/reddit/reddit-driver.ts`: post, comment, get analytics via Reddit API
    - Create `packages/drivers/src/x/x-driver.ts`: post, reply, get analytics via X (Twitter) API v2
    - Create `packages/drivers/src/instagram/instagram-driver.ts`: post, stories, reels via Instagram Graph API
    - Create `packages/drivers/src/facebook/facebook-driver.ts`: post, manage pages via Facebook Graph API
    - Create `packages/drivers/src/tiktok/tiktok-driver.ts`: upload videos, get analytics via TikTok API
    - All extend base `Driver`, authenticate via Credential Manager
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 12.1_

  - [x] 5.11 Implement commerce and automation drivers
    - Create `packages/drivers/src/stripe/stripe-driver.ts`: manage payments, subscriptions, invoices via Stripe API
    - Create `packages/drivers/src/revenuecat/revenuecat-driver.ts`: manage in-app subscriptions, get revenue data via RevenueCat API
    - Create `packages/drivers/src/google-ads/google-ads-driver.ts`: manage campaigns, get performance data via Google Ads API
    - Create `packages/drivers/src/zeely/zeely-driver.ts`: manage landing pages and funnels via Zeely API
    - Create `packages/drivers/src/n8n/n8n-driver.ts`: trigger webhooks, manage workflows via n8n API
    - Create `packages/drivers/src/browser/browser-driver.ts`: browser automation using Playwright for services without APIs
    - All extend base `Driver`, authenticate via Credential Manager
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [x] 5.12 Implement Driver registry and validation
    - Create `packages/drivers/src/registry.ts`: a registry that validates each driver implements the uniform interface, runs health checks, and manages driver lifecycle (connect/disconnect)
    - Implement `registerDriver()`: validate driver implements all required methods, run integration test suite, activate only if tests pass
    - Implement `getDriver()`: return a connected, ready driver instance by name
    - Implement `listDrivers()`: return all registered drivers with their status and health
    - _Requirements: 10.1, 10.5_

  - [x] 5.13 Write integration tests for critical drivers
    - Write integration tests for LLM provider drivers (mock API responses)
    - Write integration tests for App Store Connect and Google Play drivers (mock API responses)
    - Write integration tests for YouTube driver (mock API responses)
    - Write integration tests for Kalshi and Polymarket drivers (mock API responses)
    - Test driver registry validation rejects drivers missing required methods
    - _Requirements: 10.5, 19.2_

  - [x] 5.14 Implement ZionX App Factory application layer
    - Create `packages/app/src/zionx/agent-program.ts`: define the ZionX agent program with state machine (ideation → market-research → development → testing → gate-review → submission → in-review → approved/rejected → live → marketing → revenue-optimizing → deprecated)
    - Create `packages/app/src/zionx/pipeline.ts`: implement the full build pipeline — code generation (via LLM driver), compilation trigger, test execution, packaging for iOS and Android
    - Create `packages/app/src/zionx/gates.ts`: implement all Gate checks — metadata validation, subscription compliance, IAP sandbox testing, screenshot verification, privacy policy presence, EULA link verification
    - Create `packages/app/src/zionx/rejection-handler.ts`: parse Apple/Google rejection reasons, create new Gate checks to prevent recurrence, store patterns in Zikaron procedural memory
    - Implement parallel submission workflows for Apple and Google with independent status tracking
    - Create `packages/app/src/zionx/gtm/market-research.ts`: implement niche validation, competitive analysis (rating gaps, feature gaps, pricing gaps), demand scoring using appkittie.com-style analysis via browser/LLM drivers
    - Create `packages/app/src/zionx/gtm/aso-engine.ts`: implement ASO optimization — keyword research, title/subtitle A/B testing, screenshot generation, preview video creation, localized store listing optimization for both Apple and Google Play
    - Create `packages/app/src/zionx/gtm/campaign-manager.ts`: implement social media campaign execution across TikTok, Instagram, X, Facebook, Reddit, YouTube Shorts using AI-generated content via HeyGen and LLM drivers; manage Google Ads campaigns via Google Ads driver with ROAS tracking and automatic bid/budget adjustment
    - Create `packages/app/src/zionx/gtm/landing-page-generator.ts`: generate conversion-optimized landing pages via Zeely driver with app store badges, analytics tracking, and A/B testing
    - Create `packages/app/src/zionx/gtm/revenue-optimizer.ts`: implement post-launch analytics (downloads, conversion rate, retention, ARPU, LTV, churn), pricing experiments, paywall optimization, cross-promotion between portfolio apps, re-engagement campaigns for declining apps
    - Create `packages/app/src/zionx/gtm/portfolio-manager.ts`: implement portfolio health dashboard — per-app revenue, marketing spend, ROAS, revenue attribution across channels, and automated recommendations (scale, maintain, optimize, deprecate)
    - Create `packages/app/src/zionx/design/design-system-generator.ts`: generate complete per-app design systems — unique color palette, typography scale, spacing system, component library, iconography, animation specs; enforce <70% visual similarity to other portfolio apps
    - Create `packages/app/src/zionx/design/design-intelligence.ts`: continuously scrape and analyze top-performing apps in each target niche — extract UI patterns, layout structures, color trends, animation styles, onboarding flows, and monetization UX from top-10 ranked apps per category on both Apple and Google Play; maintain a living design pattern library in Zikaron procedural memory that evolves as market trends shift; use this intelligence to inform every design system generated so that ZionX apps reflect current best-in-class design, not stale templates
    - Create `packages/app/src/zionx/design/template-library.ts`: maintain a versioned library of production-quality UI templates organized by app category (wellness, productivity, finance, utility, gaming) — each template derived from design intelligence analysis of top market performers; templates include complete screen flows (onboarding, home, settings, paywall, empty states, error states), component variants (cards, lists, modals, bottom sheets, tab bars), and interaction patterns (swipe gestures, pull-to-refresh, skeleton loading, haptic feedback); templates are living artifacts that auto-update when design intelligence detects new market trends
    - Create `packages/app/src/zionx/design/user-journey-engine.ts`: define onboarding flow, first-session experience, core loop, retention mechanics, and monetization touchpoints for each app before code generation; output as structured journey map consumed by the build pipeline
    - Create `packages/app/src/zionx/design/ui-component-generator.ts`: generate custom UI components with micro-interactions, transitions, haptic feedback specs, and WCAG 2.1 AA accessibility compliance — no default platform widgets or template layouts
    - Create `packages/app/src/zionx/design/brand-asset-generator.ts`: generate branded assets per app — app icon (1024x1024), splash screen, in-app header, promotional artwork, feature graphic — all consistent with the app's design system
    - Create `packages/app/src/zionx/design/quality-gate.ts`: implement design quality Gate that evaluates app against top-10 competitors in its niche, scoring visual polish, interaction design, information architecture, and onboarding effectiveness
    - Create `packages/app/src/zionx/ads/playable-ad-generator.ts`: generate interactive playable ad demos (15-30 second mini-experiences) showcasing app core value proposition, compatible with AdMob, Unity Ads, AppLovin, ironSource ad networks
    - Create `packages/app/src/zionx/ads/video-ad-creator.ts`: produce video ad creatives in multiple formats — 15s vertical (TikTok/Reels/Shorts), 30s horizontal (YouTube pre-roll), 6s bumper ads — using HeyGen and LLM drivers
    - Create `packages/app/src/zionx/ads/ad-monetization-manager.ts`: integrate ad SDK placements (banner, interstitial, rewarded video, native) with intelligent frequency capping and UX optimization; manage ad mediation across networks to maximize fill rate and eCPM
    - Create `packages/app/src/zionx/ads/ad-revenue-tracker.ts`: track ad revenue per app alongside subscription revenue, report combined ARPU, auto-reinvest ad revenue into paid acquisition when threshold exceeded
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11b.1, 11b.2, 11b.3, 11b.4, 11b.5, 11b.6, 11b.7, 11b.8, 11b.9, 11b.10, 11c.1, 11c.2, 11c.3, 11c.4, 11c.5, 11d.1, 11d.2, 11d.3, 11d.4, 11d.5, 11d.6_

  - [x] 5.15 Write unit tests for ZionX App Factory
    - [x] 5.15.1 Core pipeline tests (agent-program.test.ts, gates.test.ts, pipeline.test.ts, rejection-handler.test.ts) — EXISTING, verify coverage
    - [x] 5.15.2 GTM: market-research.test.ts — test niche validation, competitive analysis, demand scoring, appkittie-style analysis
    - [x] 5.15.3 GTM: aso-engine.test.ts — test keyword research, title/subtitle A/B variants, screenshot generation triggers, localization
    - [x] 5.15.4 GTM: campaign-manager.test.ts — test social media campaign creation across TikTok/Instagram/X/Facebook/Reddit/YouTube, Google Ads campaign management, ROAS tracking, bid adjustment
    - [x] 5.15.5 GTM: landing-page-generator.test.ts — test landing page generation via Zeely driver, app store badge inclusion, analytics tracking
    - [x] 5.15.6 GTM: revenue-optimizer.test.ts — test post-launch analytics (downloads, conversion, retention, ARPU, LTV, churn), pricing experiments, paywall optimization, cross-promotion, re-engagement for declining apps
    - [x] 5.15.7 GTM: portfolio-manager.test.ts — test portfolio health dashboard, per-app revenue tracking, ROAS, scale/maintain/optimize/deprecate recommendations, kill decision at 60-day threshold
    - [x] 5.15.8 Design: design-system-generator.test.ts — test unique color palette, typography, spacing, component library generation, <70% similarity enforcement
    - [x] 5.15.9 Design: design-intelligence.test.ts — test top-app scraping/analysis, UI pattern extraction, living design pattern library updates
    - [x] 5.15.10 Design: template-library.test.ts — test versioned template retrieval by category, auto-update on trend detection
    - [x] 5.15.11 Design: user-journey-engine.test.ts — test onboarding flow, first-session experience, core loop, retention mechanics, monetization touchpoint generation
    - [x] 5.15.12 Design: ui-component-generator.test.ts — test custom component generation with micro-interactions, WCAG 2.1 AA compliance
    - [x] 5.15.13 Design: brand-asset-generator.test.ts — test app icon, splash screen, in-app header, promotional artwork generation
    - [x] 5.15.14 Design: quality-gate.test.ts — test design quality scoring against top-10 competitors
    - [x] 5.15.15 Ads: playable-ad-generator.test.ts — test interactive ad demo generation, ad network compatibility
    - [x] 5.15.16 Ads: video-ad-creator.test.ts — test video ad creation in multiple formats (15s vertical, 30s horizontal, 6s bumper)
    - [x] 5.15.17 Ads: ad-monetization-manager.test.ts — test ad SDK placement integration, frequency capping, mediation across networks
    - [x] 5.15.18 Ads: ad-revenue-tracker.test.ts — test combined ad + subscription ARPU tracking, auto-reinvest threshold
    - [x] 5.15.19 Verify all tests compile and pass with `npx vitest run packages/app/src/zionx/`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11b.1–11b.10, 11c.1–11c.5, 11d.1–11d.6, 19.1_

  - [x] 5.16 Implement ZXMG Media Production application layer
    - Create `packages/app/src/zxmg/agent-program.ts`: define the ZXMG agent program with state machine (planning → script-generation → asset-creation → video-assembly → metadata-prep → platform-upload → published → monitoring)
    - Create `packages/app/src/zxmg/pipeline.ts`: implement the content pipeline — script generation (via LLM), media asset creation (via HeyGen driver), video assembly, metadata preparation, platform upload (via YouTube driver and social media drivers)
    - Create `packages/app/src/zxmg/validation.ts`: validate content against platform-specific requirements (video format, duration limits, metadata character limits, thumbnail specs) before upload
    - Create `packages/app/src/zxmg/analytics.ts`: track content performance metrics (views, engagement, revenue) via YouTube driver, store in Zikaron for pattern analysis
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 5.17 Write unit tests for ZXMG Media Production
    - Test content pipeline state machine transitions
    - Test platform-specific validation catches format violations
    - Test upload failure triggers diagnosis and retry
    - Test analytics collection and storage in Zikaron
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 19.1_

  - [x] 5.18 Implement Zion Alpha Trading application layer
    - Create `packages/app/src/zion-alpha/agent-program.ts`: define the Zion Alpha agent program with state machine (scanning → evaluating → positioning → monitoring → exiting → settled)
    - Create `packages/app/src/zion-alpha/strategy.ts`: implement opportunity evaluation against risk parameters defined in agent program, position sizing logic, entry/exit trigger conditions
    - Create `packages/app/src/zion-alpha/risk.ts`: enforce position size limits and daily loss limits via Otzar, block trades exceeding limits
    - Create `packages/app/src/zion-alpha/execution.ts`: execute trades via Kalshi and Polymarket drivers, monitor open positions at configured intervals, execute exit strategies on trigger conditions
    - Create `packages/app/src/zion-alpha/logging.ts`: log every trade decision (entry, exit, hold) with reasoning, market data, and outcome to XO Audit and Zikaron
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 5.19 Write unit tests for Zion Alpha Trading
    - Test opportunity evaluation against risk parameters
    - Test position size limit enforcement blocks oversized trades
    - Test daily loss limit enforcement blocks trades when limit reached
    - Test trade decision logging captures reasoning and market data
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 19.1_

- [x] 6. Checkpoint — Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: all drivers extend base class with retry and circuit breaker, driver registry validates interface compliance, ZionX pipeline executes full app lifecycle with gate checks, ZXMG pipeline produces and validates content, Zion Alpha evaluates opportunities and enforces risk limits, all application agents have defined state machines and completion contracts

- [-] 7. Phase 4 — Interface Layer (Shaar) and Integration
  - [x] 7.1 Implement Shaar API layer (REST + WebSocket)
    - Create `packages/services/src/shaar/api-routes.ts`: define REST API routes — `GET /agents` (list agents with status), `GET /agents/:id` (agent detail), `POST /agents/:id/execute` (submit task), `GET /pillars` (pillar metrics), `GET /costs` (cost data), `GET /audit` (audit trail query), `GET /health` (system health), `POST /commands` (issue command)
    - Create `packages/services/src/shaar/websocket-handler.ts`: WebSocket connection handler for real-time updates — agent state changes, cost updates, alert notifications, workflow progress
    - Create `packages/services/src/shaar/command-router.ts`: parse commands from any channel and route to Seraphim_Core with uniform semantic interpretation regardless of source channel
    - Implement authentication middleware: validate JWT from Cognito, extract tenant and role, enforce Mishmar authorization on every request
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 7.2 Write unit tests for Shaar API layer
    - Test REST endpoints return correct data shapes
    - Test WebSocket connection and real-time event delivery
    - Test command routing produces same result regardless of source channel
    - Test authentication rejects invalid/expired tokens
    - Test Mishmar authorization blocks unauthorized commands
    - _Requirements: 9.1, 9.2, 9.4, 19.1_

  - [x] 7.3 Implement Shaar web dashboard (React + Vite)
    - Create `packages/dashboard/` as a React + Vite + TypeScript project
    - Implement dashboard layout with navigation: Agents, Pillars, Costs, Audit, System Health
    - Implement Agents view: live agent status cards showing state, pillar, resource consumption, health — connected to WebSocket for real-time updates
    - Implement Pillars view: pillar metrics (ZionX app count/status, ZXMG content metrics, Zion Alpha positions/P&L) — all from live data via REST API
    - Implement Costs view: per-agent spend, per-pillar spend, model utilization breakdown, projected daily/monthly costs — from Otzar cost reports
    - Implement Audit view: searchable audit trail with filters (agent, time range, action type, pillar, outcome) — from XO Audit query API
    - Implement System Health view: operational status of every core service, driver, and active agent — from health endpoint
    - Implement alert notification banner: real-time alerts via WebSocket displayed prominently
    - All views display only verified live data — no mock, placeholder, or aspirational data
    - _Requirements: 9.1, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 7.4 Write unit tests for dashboard components
    - Test each view renders correctly with sample data
    - Test WebSocket connection and real-time update rendering
    - Test filter controls on audit view
    - Test alert notification display
    - _Requirements: 9.1, 18.5, 19.1_

  - [x] 7.5 Create CDK stack for dashboard hosting
    - Create `packages/infra/src/stacks/dashboard-stack.ts` with S3 bucket for static assets, CloudFront distribution with HTTPS, origin access identity
    - Configure CloudFront to serve dashboard from S3 with API Gateway as a secondary origin for `/api/*` routes
    - _Requirements: 15.1_

  - [x] 7.6 Implement multi-tenant and family support
    - Create `packages/services/src/tenant/service.ts`: implement tenant provisioning — create isolated tenant with default pillars, fresh Zikaron, independent Otzar budgets
    - Implement Queen provisioning: create scoped authorization profile in Mishmar limiting Queen to designated pillars and action types
    - Implement cross-tenant coordination: allow authorized Queen workflows to trigger actions in King's pillars with appropriate Execution_Tokens
    - Implement tenant-scoped Shaar access: Queen interactions scoped to authorized pillars and actions
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 7.7 Write unit tests for multi-tenant support
    - Test tenant provisioning creates isolated resources
    - Test Queen authorization profile limits access to designated pillars
    - Test cross-tenant coordination requires valid Execution_Tokens
    - Test tenant data isolation (one tenant cannot access another's data)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 19.1_

  - [x] 7.8 Implement observability and monitoring
    - Create `packages/services/src/observability/metrics.ts`: expose real-time metrics — active agent count, agent states, task queue depth, event bus throughput, memory utilization, error rates — via CloudWatch custom metrics
    - Create `packages/services/src/observability/cost-metrics.ts`: expose real-time cost metrics — per-agent token spend, per-pillar spend, model utilization breakdown, projected daily/monthly costs — via CloudWatch custom metrics
    - Create `packages/services/src/observability/alerts.ts`: configure CloudWatch alarms for metric thresholds, trigger alert events to Event Bus when thresholds exceeded, deliver through Shaar within 60 seconds
    - Create `packages/services/src/observability/health.ts`: system health endpoint returning operational status of every core service, driver, and active agent
    - Enable AWS X-Ray distributed tracing across ECS tasks and Lambda functions
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 7.9 Write unit tests for observability
    - Test metric collection and CloudWatch publishing
    - Test alert threshold detection and event generation
    - Test health endpoint returns accurate service status
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 19.1_

  - [x] 7.10 Implement authentication and security layer
    - Create `packages/services/src/auth/cognito.ts`: Cognito User Pool integration — user registration, login, JWT token issuance with scoped permissions tied to tenant and role
    - Create `packages/services/src/auth/middleware.ts`: API Gateway authorizer that validates JWT, extracts tenant context, and passes to downstream services
    - Implement short-lived token generation with refresh token rotation
    - Log all authentication and authorization failures to XO Audit with source, target, and failure reason
    - _Requirements: 20.2, 20.3_

  - [x] 7.11 Implement credential rotation automation
    - Create `packages/services/src/credentials/rotation.ts`: automated credential rotation on configurable schedule (default 90 days) using Secrets Manager rotation Lambda
    - Implement zero-downtime rotation: dual-version credentials during rotation window, automatic switchover after verification
    - Implement network-level tenant isolation: configure VPC security groups per tenant tier in CDK
    - _Requirements: 20.4, 20.5_

  - [x] 7.12 Write integration tests for security layer
    - Test JWT authentication flow (login → token → authorized request)
    - Test authorization failure logging to XO Audit
    - Test credential rotation with zero downtime (mocked)
    - Test tenant network isolation configuration
    - _Requirements: 20.2, 20.3, 20.4, 20.5, 19.2_

  - [x] 7.13 Implement testing infrastructure and CI/CD gates
    - Create `packages/core/src/testing/framework.ts`: test harness that validates Agent_Program test suites cover all Completion_Contract conditions, blocks deployment if coverage gaps exist
    - Create `packages/core/src/testing/traceability.ts`: requirement-to-test traceability matrix — map each requirement to its test cases, report coverage gaps
    - Update CI/CD pipeline to enforce: unit tests → integration tests → gate verifications → coverage check → staged rollout
    - Implement Driver integration test runner: execute integration tests for every driver before activation in production
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 7.14 Write tests for testing infrastructure
    - Test coverage gap detection blocks deployment when Completion_Contract conditions are uncovered
    - Test traceability matrix correctly maps requirements to tests
    - Test Driver integration test runner validates drivers before activation
    - _Requirements: 19.1, 19.4, 19.5_

- [x] 8. Checkpoint — Phase 4 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Shaar API serves live data through REST and WebSocket, dashboard displays real-time agent status/costs/audit/health with no mock data, multi-tenant isolation works correctly, Queen scoping enforces pillar restrictions, observability metrics publish to CloudWatch with alert thresholds, authentication and authorization flow works end-to-end, CI/CD pipeline enforces all gates

- [ ] 8.5 Phase 4b — Local Dev Server (Real Services, No Mock Data)
  - [x] 8.5.1 Build local HTTP server wiring real Shaar API to real service implementations
    - Create `packages/services/src/shaar/local-server.ts`: Express-like HTTP server using Node `http` module
    - Boot real service instances: DefaultAgentRuntime, MishmarServiceImpl, OtzarServiceImpl, XOAuditServiceImpl, ZikaronServiceImpl, EventBusServiceImpl
    - Wire ShaarAPIRouter to real services with in-memory data stores (no AWS dependencies)
    - Create in-memory repository implementations for local dev: agent programs, state machines, memory entries, token usage, audit records
    - Expose REST endpoints on port 3000: GET /api/agents, GET /api/agents/:id, GET /api/pillars, GET /api/costs, GET /api/audit, GET /api/health
    - Expose WebSocket on /ws for real-time updates
    - Seed system on startup: deploy real agent programs (Seraphim Core, Eretz, ZionX, ZXMG, Zion Alpha, Mishmar, Otzar), run state transitions, record audit entries, track token usage
    - Remove mock-data CSS class and banner from dashboard when connected to real backend
    - _Requirements: 9.1, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 8.5.2 Write tests for local dev server
    - Test server boots and responds to all API endpoints with real service data
    - Test seed data creates agents in correct states
    - Teintst audit entries are real XO Audit records
    - Test cost data comes from real Otzar token tracking
    - _Requirements: 19.1, 19.2_

  - [x] 8.5.3 Checkpo — Local dev server complete
    - Verify: `npm run dev:local` starts the full stack, dashboard at localhost:5173 shows real data (no pink), all 5 views populated from real service code

- [x] 8.6 Phase 4c — AWS Deployment (Full Cloud Infrastructure)
  - [x] 8.6.1 Deploy CDK stacks to AWS and wire dashboard to live backend
    - Deploy networking, data, compute, API, messaging, secrets, pipeline, dashboard, and tenant isolation stacks
    - Configure API Gateway to route /api/* to ECS Fargate running the Shaar API server
    - Configure CloudFront to serve dashboard static assets from S3 with API Gateway as secondary origin
    - Wire ECS task to Aurora PostgreSQL, DynamoDB, Secrets Manager, EventBridge
    - Run database migrations against Aurora
    - Deploy Lambda event handlers with SQS event source mappings
    - Verify end-to-end: dashboard → API Gateway → ECS → real services → real databases
    - _Requirements: 15.1, 15.2, 15.3, 20.1, 20.4_

  - [ ] 8.6.2 Checkpoint — AWS deployment complete
    - Verify: dashboard accessible via CloudFront URL, all data comes from live AWS services, WebSocket delivers real-time updates, CI/CD pipeline deploys through dev → staging → production

- [x] 9. Phase 5 — Advanced Features (Learning Engine, Marketplace, Federated Intelligence)
  - [x] 9.1 Implement Learning Engine
    - Create `packages/services/src/learning/engine.ts` implementing the `LearningEngine` interface
    - Implement `analyzeFailure()`: correlate failure events with historical patterns in Zikaron using vector similarity search, identify root cause by matching against known failure patterns in procedural memory
    - Implement `detectPatterns()`: batch analysis over a time range to find recurring failure patterns (same root cause occurring more than once), cluster similar failures using embedding similarity
    - Implement `generateFix()`: for detected patterns, generate a fix proposal targeting the appropriate artifact (agent_program, workflow, gate, driver_config) with versioned changes and confidence score
    - Implement `verifyFix()`: execute the fix in a sandboxed environment, run the relevant test suite, validate the fix resolves the pattern without introducing regressions
    - Implement `applyFix()`: apply verified fixes as versioned Agent_Program updates (not unstructured text), record the improvement in Zikaron procedural memory, publish `learning.fix.applied` event
    - Implement `getImprovementMetrics()`: track repeat failure rate, autonomous resolution rate, mean time to resolution, fix success rate
    - Implement nightly batch job for model router performance aggregation: aggregate `ModelPerformanceRecord` by (taskType, complexity, model), update routing weights
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 9.2 Write unit tests for Learning Engine
    - Test failure analysis correlates with historical patterns
    - Test pattern detection identifies recurring failures
    - Test fix generation produces versioned changes (not unstructured text)
    - Test fix verification catches regressions
    - Test improvement metrics calculation accuracy
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 19.1_

  - [x] 9.3 Implement Learning Engine event handler
    - Create `packages/services/src/handlers/learning-handler.ts`: process learning events from SQS learning queue
    - On `agent.task.failed` events: trigger `analyzeFailure()`, if recurring pattern detected trigger `generateFix()`
    - On `agent.task.completed` events: record `ModelPerformanceRecord` for model router learning
    - On `learning.pattern.detected` events: notify dashboard and log to audit
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 9.4 Implement Agent Marketplace
    - Create `packages/services/src/marketplace/service.ts` with operations: `publishProgram()`, `installProgram()`, `listPrograms()`, `rateProgram()`, `getMetrics()`
    - Implement `publishProgram()`: validate Agent_Program includes versioned definition, test suite, Completion_Contracts, and documentation before accepting
    - Implement `installProgram()`: deploy agent within the installing Tenant's isolated environment, apply Tenant's Mishmar authorization rules and Otzar budget constraints
    - Implement `listPrograms()`: searchable catalog with ratings, installation count, and verified performance metrics
    - Create `packages/services/src/marketplace/validation.ts`: validate published programs meet quality standards (test coverage, documentation completeness, contract definitions)
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 9.5 Write unit tests for Agent Marketplace
    - Test publish validation rejects programs missing test suites or contracts
    - Test install deploys within tenant isolation with correct authorization
    - Test installed programs operate within tenant's budget constraints
    - Test rating and metrics tracking
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 19.1_

  - [x] 9.6 Implement Federated Intelligence
    - Create `packages/services/src/federated/service.ts` with operations: `publishPattern()`, `evaluatePattern()`, `adoptPattern()`, `getPatternMetrics()`
    - Implement `publishPattern()`: anonymize verified improvement patterns (strip all tenant-specific data — memory contents, financial data, credentials, personal information), publish to shared pattern registry (DynamoDB table or S3-backed registry)
    - Implement `evaluatePattern()`: assess a shared pattern's applicability to the local instance by comparing task types, agent configurations, and historical context
    - Implement `adoptPattern()`: propose pattern adoption through the Learning Engine, apply if verified
    - Implement `getPatternMetrics()`: track pattern provenance, adoption rate, and effectiveness across instances
    - Implement data isolation enforcement: automated scanning of patterns before publication to ensure no tenant-specific data leaks
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 9.7 Write unit tests for Federated Intelligence
    - Test pattern anonymization strips all tenant-specific data
    - Test data isolation enforcement catches PII, credentials, and financial data
    - Test pattern applicability evaluation
    - Test adoption flow through Learning Engine
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 19.1_

  - [x] 9.8 Implement iMessage integration driver
    - Create `packages/drivers/src/imessage/imessage-driver.ts` extending base `Driver`
    - Implement send/receive message operations for King and Queen communication channel
    - Integrate with Shaar command router so iMessage commands have the same semantic interpretation as other channels
    - _Requirements: 9.2, 9.5, 10.6_

  - [x] 9.9 Implement voice interface adapter
    - Create `packages/drivers/src/voice/voice-driver.ts`: speech-to-text and text-to-speech integration (AWS Transcribe + Polly or third-party)
    - Integrate with Shaar command router for voice command processing
    - _Requirements: 9.2_

  - [x] 9.10 Implement Shaar notification delivery system
    - Create `packages/services/src/shaar/notifications.ts`: deliver system alerts through the King's preferred channel (dashboard push, email via Gmail driver, Telegram, iMessage) within 60 seconds of triggering event
    - Implement notification preferences per user (King/Queen) — preferred channel, quiet hours, priority filtering
    - Implement Queen-scoped notifications: Queens only receive notifications for their authorized pillars
    - _Requirements: 9.3, 9.5_

  - [x] 9.11 Write integration tests for notification delivery
    - Test notification delivery within 60-second SLA
    - Test channel routing based on user preferences
    - Test Queen notification scoping
    - _Requirements: 9.3, 9.5, 19.2_

- [x] 10. Checkpoint — Phase 5 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Learning Engine detects patterns and generates versioned fixes, Marketplace validates and installs Agent_Programs with tenant isolation, Federated Intelligence anonymizes patterns and enforces data isolation, all interface channels (dashboard, API, iMessage, voice, email) route commands with uniform semantics, notification delivery meets 60-second SLA

- [ ] 11. Final integration and end-to-end validation
  - [-] 11.1 End-to-end wiring and smoke tests
    - Wire all phases together: Interface → Kernel → Services → Application → Drivers
    - Create `packages/core/src/testing/e2e/` with end-to-end test scenarios:
      - Deploy an agent → execute a task → verify audit trail → verify memory storage → verify cost tracking
      - Submit a ZionX app build → verify gate checks → verify state machine transitions → verify driver calls
      - Submit a ZXMG content workflow → verify pipeline stages → verify platform upload → verify analytics collection
      - Submit a Zion Alpha trade → verify risk checks → verify trade execution → verify logging
    - Verify all event flows: action → EventBridge → SQS → Lambda handler → downstream effect
    - _Requirements: 1.1, 2.1, 3.1, 6.1, 7.1, 11.1, 12.1, 13.1_

  - [ ] 11.2 Implement auto-scaling configuration and load testing
    - Configure ECS auto-scaling policies: scale out when CPU > 70% or memory > 80%, scale in when CPU < 30%, respect Otzar budget limits
    - Configure Aurora auto-scaling: scale reader instances based on connection count
    - Create basic load test script to verify scaling behavior under simulated load
    - Verify failover: stop a core service task, confirm ECS replaces it within 120 seconds, confirm Shaar alert delivered
    - _Requirements: 15.3, 15.4, 15.5_

  - [ ] 11.3 Final CDK deployment configuration
    - Create `packages/infra/src/app.ts` as the CDK app entry point composing all stacks: networking → data → secrets → compute → API → messaging → dashboard → pipeline
    - Configure environment-specific settings (dev, staging, prod) with appropriate scaling, budget, and security parameters
    - Verify `cdk synth` produces valid CloudFormation for all stacks
    - Verify `cdk diff` shows expected resources
    - _Requirements: 15.1, 15.6_

- [ ] 12. Final checkpoint — All phases complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: full system deploys via CDK, end-to-end flows work across all layers, auto-scaling responds to load, failover completes within 120 seconds, all 20 requirements have corresponding test coverage, no mock data exists in any dashboard or report

## Notes

- ALL tasks are REQUIRED — no optional tasks exist
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each phase boundary
- Phase 1 produces a deployable foundation — you can deploy and verify infrastructure before building services
- Phase 2 services are the backbone — all application logic depends on them
- Phase 3 drivers are independent of each other and can be implemented in priority order (LLM providers first, then App Store/YouTube/trading, then others)
- Phase 4 brings everything together with the user-facing interface
- Phase 5 adds intelligence and platform capabilities that build on the working system
- The user is not a developer — all tasks are designed to be executed by AI coding agents
- Priority order within Phase 3: Eretz (Business) pillar first, then Otzar (Finance)
- Phase 6 Eretz tasks (13.19–13.36) implement the master business orchestration layer — Eretz must be wired before subsidiary agents can receive enriched directives


- [x] 13. Phase 6 — Autonomous SME and Self-Improvement Architecture
  - [x] 13.1 Implement Domain Expertise Profile storage and management
    - Create `packages/services/src/sme/domain-expertise-profile.ts`: define the `DomainExpertiseProfile` interface and storage layer
    - Implement `createProfile()`: initialize a domain expertise profile for a sub-agent with seed knowledge entries, decision frameworks, and quality benchmarks
    - Implement `updateProfile()`: add new knowledge entries, competitive intelligence, and learned patterns to an existing profile with version tracking
    - Implement `loadProfile()`: retrieve the full expertise profile for an agent, loading knowledge entries from Zikaron semantic memory and decision frameworks from procedural memory
    - Implement `resolveConflicts()`: when new research contradicts existing knowledge, flag the conflict and present both entries with confidence scores
    - Store knowledge entries in Zikaron semantic memory (vector-searchable), decision frameworks in Zikaron procedural memory
    - _Requirements: 23.1, 23.2, 23.7, 23.8_

  - [x] 13.2 Write unit tests for Domain Expertise Profile
    - Test profile creation with seed knowledge
    - Test profile update increments version and adds entries
    - Test profile loading assembles knowledge from semantic and procedural memory layers
    - Test conflict detection flags contradicting entries
    - Test cross-domain insight propagation
    - _Requirements: 23.1, 23.2, 23.7, 23.8, 19.1_

  - [x] 13.3 Create seed Domain Expertise Profiles for each sub-agent
    - Create `packages/services/src/sme/seeds/zionx-expertise.ts`: seed ZionX profile with app store optimization strategies, monetization model benchmarks (subscription vs IAP vs ad-supported), user acquisition cost benchmarks by channel, retention curve benchmarks by app category, Apple/Google review guidelines, and competitive analysis frameworks
    - Create `packages/services/src/sme/seeds/zxmg-expertise.ts`: seed ZXMG profile with YouTube algorithm signals, thumbnail/title optimization patterns, content structure patterns for audience retention, posting cadence benchmarks, cross-platform repurposing strategies, and monetization benchmarks (CPM, RPM)
    - Create `packages/services/src/sme/seeds/zion-alpha-expertise.ts`: seed Zion Alpha profile with prediction market mechanics for Kalshi/Polymarket, risk management frameworks, position sizing models (Kelly criterion, fractional Kelly), market microstructure patterns, and forecasting methodology benchmarks
    - Create `packages/services/src/sme/seeds/seraphim-core-expertise.ts`: seed Seraphim Core profile with autonomous agent architecture patterns, multi-agent coordination designs, LLM orchestration frameworks, infrastructure cost optimization techniques, and self-improving system design principles
    - Note: Eretz seed expertise profile is created in task 13.31
    - _Requirements: 23.3, 23.4, 23.5, 23.6, 29g.23_

  - [x] 13.4 Write unit tests for seed expertise profiles
    - Test each seed profile contains required knowledge categories
    - Test seed profiles load correctly into Zikaron memory layers
    - Test seed knowledge entries have valid structure and confidence scores
    - _Requirements: 23.3, 23.4, 23.5, 23.6, 19.1_

  - [x] 13.5 Implement Heartbeat Scheduler and Review Cycle Engine
    - Create `packages/services/src/sme/heartbeat-scheduler.ts` implementing the `HeartbeatScheduler` interface
    - Implement `configure()`: set heartbeat interval, research depth, and budget cap per sub-agent (defaults: Eretz daily, ZionX daily, ZXMG daily, Zion Alpha hourly, Seraphim Core weekly)
    - Implement `triggerReview()`: orchestrate the full heartbeat review cycle — load domain expertise profile → execute domain research phase (via LLM + drivers) → benchmark against world-class performance → perform gap analysis → generate prioritized recommendations → submit to Recommendation Queue
    - Implement research phase per domain: ZionX researches app store rankings and competitor apps via App Store/Google Play drivers; ZXMG researches YouTube analytics and trending content via YouTube driver; Zion Alpha analyzes market data via trading drivers; Seraphim Core scans AI research via Industry Scanner
    - Implement benchmarking phase: compare current domain metrics against world-class benchmarks stored in the expertise profile
    - Implement gap analysis: identify specific shortfalls with priority scores and closing strategies
    - Implement recommendation generation: produce structured recommendations following the benchmark → current → gap → plan format
    - Enforce research budget cap per cycle via Otzar
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [x] 13.6 Write unit tests for Heartbeat Scheduler
    - Test heartbeat configuration per sub-agent with correct default intervals
    - Test review cycle executes all phases in order (research → benchmark → gap analysis → recommend)
    - Test research budget enforcement caps LLM costs per cycle
    - Test recommendations are submitted to Recommendation Queue with correct structure
    - Test review history is persisted and retrievable
    - _Requirements: 21.1, 21.2, 21.7, 19.1_

  - [x] 13.7 Implement Recommendation Engine and Queue
    - Create `packages/services/src/sme/recommendation-engine.ts` implementing the `RecommendationEngine` interface
    - Implement `submit()`: validate recommendation structure (world-class benchmark, current state, gap analysis, action plan, risk assessment, rollback plan), assign ID, persist to `recommendations` table, publish `recommendation.submitted` event
    - Implement `getPending()`, `getByDomain()`, `getSummary()`: query recommendations with filtering, sorting by priority, and grouping by domain; include "path to world-class" dashboard data in summary
    - Implement `approve()`: transition recommendation to `approved` status, create tracked execution task, dispatch to originating sub-agent, publish `recommendation.approved` event
    - Implement `reject()`: transition to `rejected` status, record rejection reason, store in Zikaron for agent learning, publish `recommendation.rejected` event
    - Implement `batchApprove()` and `batchReject()`: process multiple recommendations in a single transaction
    - Implement `getExecutionStatus()`: track execution progress of approved recommendations
    - Implement `measureImpact()`: compare actual outcomes against estimated impact, calculate variance, store in Zikaron for estimate calibration
    - Implement `getCalibrationReport()`: analyze an agent's recommendation accuracy over time (approval rate, impact accuracy, common rejection reasons)
    - Implement escalation: background job checks for recommendations pending longer than threshold (default 48h), re-notifies King via Shaar
    - Create database migration for `recommendations` table with indexes
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7_

  - [x] 13.8 Write unit tests for Recommendation Engine
    - Test recommendation submission validates required structure fields
    - Test invalid recommendations (missing benchmark, missing gap analysis) are rejected
    - Test approval creates execution task and dispatches to agent
    - Test rejection records reason in Zikaron
    - Test batch approval/rejection processes all items
    - Test impact measurement calculates variance correctly
    - Test calibration report tracks accuracy trends
    - Test escalation triggers after configurable timeout
    - Test budget threshold enforcement requires Otzar approval
    - Test summary includes path-to-world-class data per domain
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 19.1_

  - [x] 13.9 Implement Industry Scanner
    - Create `packages/services/src/sme/industry-scanner.ts` implementing the `IndustryScanner` interface
    - Implement `configureSources()`: manage list of research sources (RSS feeds, APIs, web scrape targets) with scan frequency and domain relevance tags
    - Implement `executeScan()`: iterate through configured sources, extract new technology discoveries, filter for relevance to SeraphimOS and sub-agent domains using LLM classification
    - Implement `assessTechnology()`: for each discovery, generate a structured assessment (relevance score, adoption complexity, estimated benefit, competitive advantage, recommended timeline, integration plan) via LLM analysis
    - Implement `getRoadmap()` and `updateRoadmap()`: maintain technology roadmap categorized by timeline (available now, 3 months, 6 months, 12 months, monitoring)
    - Implement automatic recommendation submission: when a technology reaches production readiness and is assessed as high-impact, submit adoption recommendation to Recommendation Queue
    - Implement domain notification: notify relevant sub-agents when domain-specific advances are detected so they incorporate findings into next heartbeat cycle
    - Store all assessments in Zikaron semantic memory
    - Configure default scan sources: arXiv AI/ML, Hugging Face releases, AWS What's New, Anthropic blog, OpenAI blog, GitHub trending AI/ML, App Store algorithm updates, YouTube Creator Insider, prediction market research
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6_

  - [x] 13.10 Write unit tests for Industry Scanner
    - Test source configuration CRUD operations
    - Test scan execution processes all enabled sources
    - Test technology assessment generates valid structure with relevance scores
    - Test roadmap categorization by timeline
    - Test high-impact discoveries auto-submit to Recommendation Queue
    - Test domain-specific notifications reach correct sub-agents
    - Test assessments are stored in Zikaron semantic memory
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 19.1_

  - [x] 13.11 Implement Self-Improvement Engine
    - Create `packages/services/src/sme/self-improvement-engine.ts` implementing the `SelfImprovementEngine` interface
    - Implement `executeSelfAssessment()`: collect system performance metrics (response time, error rate, resource utilization, cost efficiency), evaluate agent effectiveness (recommendation quality, execution success rate, research depth, expertise growth), review architecture (bottlenecks, scaling concerns, capability gaps), compare against industry state-of-the-art from Industry Scanner
    - Implement `getCapabilityMaturityScore()`: calculate overall and per-domain maturity scores (0.0-1.0), track trend (improving/stable/declining), estimate time to target vision
    - Implement `getCapabilityGapAnalysis()`: identify gaps between current capabilities and target vision, prioritize by impact, identify blocking dependencies
    - Implement `generateProposals()`: from assessment results, generate self-improvement proposals with implementation plans, verification criteria, and rollback plans
    - Implement `implementProposal()`: execute approved proposals (code changes, configuration updates, architecture modifications)
    - Implement `verifyImplementation()`: run verification criteria against the implemented change
    - Implement `rollbackImplementation()`: execute rollback plan if verification fails, log to XO Audit
    - Implement `getImprovementMetrics()`: track proposals generated/approved/implemented/failed, cumulative performance improvement, cost savings, capability maturity trend
    - Submit all proposals to Recommendation Queue for King approval
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

  - [x] 13.12 Write unit tests for Self-Improvement Engine
    - Test self-assessment collects all required metric categories
    - Test capability maturity score calculation
    - Test gap analysis identifies and prioritizes capability gaps
    - Test proposal generation produces valid structure with rollback plans
    - Test implementation verification catches regressions
    - Test rollback execution on failed verification
    - Test improvement metrics tracking accuracy
    - Test proposals are submitted to Recommendation Queue
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 19.1_

  - [x] 13.13 Implement Kiro Integration Service
    - Create `packages/services/src/kiro/integration-service.ts` implementing the `KiroIntegrationService` interface
    - Implement `generateSteeringFile()`: generate a Kiro steering file from a sub-agent's Domain Expertise Profile following the standard structure (domain overview, current state, decision frameworks, best practices, quality standards, common pitfalls, tech stack, research findings)
    - Implement `generateMasterSteering()`: generate the master SeraphimOS steering file describing complete platform architecture, conventions, operational procedures, and current capability maturity
    - Implement `updateSteeringFromExpertise()`: regenerate a domain steering file when the expertise profile is updated (after heartbeat reviews or learning events)
    - Implement `updateSteeringFromIndustryScan()`: update relevant steering files when the Industry Scanner detects new advances
    - Implement `generateSkillDefinition()`: generate a Kiro skill definition for each sub-agent domain encapsulating the agent's expertise
    - Implement `generateHookDefinitions()`: generate Kiro hook definitions for automated triggers (code review, recommendation processing, heartbeat triggers, industry scan review, capability assessment)
    - Implement `convertRecommendationToKiroTask()`: convert an approved recommendation into a structured Kiro task with acceptance criteria, implementation guidance, verification steps, and research references
    - Write generated files to `.kiro/steering/`, `.kiro/skills/`, and `.kiro/hooks/` directories
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6_

  - [x] 13.14 Write unit tests for Kiro Integration Service
    - Test steering file generation produces valid markdown with all required sections
    - Test master steering file includes platform architecture and capability maturity
    - Test steering file updates after expertise profile changes
    - Test steering file updates after industry scan discoveries
    - Test skill definition generation for each domain
    - Test hook definition generation produces valid hook configurations
    - Test recommendation-to-Kiro-task conversion includes all required fields
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 19.1_

  - [x] 13.15 Wire Heartbeat Scheduler to Agent Runtime and Event Bus
    - Integrate HeartbeatScheduler with the Agent Runtime so heartbeat reviews are triggered on schedule for each active sub-agent
    - Publish heartbeat events to Event Bus: `sme.heartbeat.started`, `sme.heartbeat.completed`, `sme.heartbeat.failed`
    - Create `packages/services/src/handlers/sme-handler.ts`: Lambda handler for SME events — process heartbeat completions, trigger expertise profile updates, trigger Kiro steering file regeneration
    - Wire Recommendation Engine events to Shaar for real-time dashboard updates
    - Wire Industry Scanner to Heartbeat Scheduler so scan results feed into the next heartbeat research cycle
    - Wire Self-Improvement Engine to weekly scheduler trigger
    - _Requirements: 21.1, 21.7, 22.3, 24.5, 25.1_

  - [x] 13.16 Write integration tests for SME architecture end-to-end
    - Test full heartbeat cycle: trigger → research → benchmark → gap analysis → recommendation → queue submission
    - Test recommendation approval → execution task creation → agent dispatch → completion → impact measurement
    - Test rejection → Zikaron storage → agent learning feedback
    - Test Industry Scanner discovery → assessment → recommendation submission
    - Test Self-Improvement assessment → proposal → approval → implementation → verification
    - Test Kiro steering file regeneration after heartbeat review
    - Test escalation of stale recommendations
    - _Requirements: 21.1, 22.1, 24.1, 25.1, 27.1, 19.2_

  - [x] 13.17 Implement Shaar dashboard extensions for SME architecture
    - Add Recommendations view to dashboard: pending recommendations grouped by domain with priority, world-class benchmark comparison, approve/reject controls, batch operations
    - Add "Path to World-Class" dashboard: per-domain progress visualization showing current score vs target, cumulative improvement trend, top pending recommendations
    - Add Industry Scanner view: technology roadmap visualization, recent discoveries, assessment details
    - Add Capability Maturity view: overall and per-domain maturity scores, trend charts, gap analysis, estimated time to target
    - Add Heartbeat History view: review cycle history per agent, research findings, recommendation generation stats
    - _Requirements: 22.3, 26.6, 24.3, 25.6_

  - [x] 13.18 Write unit tests for SME dashboard components
    - Test Recommendations view renders pending items with approve/reject controls
    - Test batch approval/rejection UI
    - Test Path to World-Class dashboard renders progress per domain
    - Test Industry Scanner view renders roadmap timeline
    - Test Capability Maturity view renders scores and trends
    - _Requirements: 22.3, 26.6, 19.1_

  - [x] 13.19 Implement Eretz Business Pillar agent program and state machine
    - Create `packages/app/src/eretz/agent-program.ts`: define the Eretz agent program with state machine (initializing → ready → enriching_directive → analyzing_synergies → reviewing_portfolio → training_subsidiary → heartbeat_review → degraded → terminated)
    - Implement directive enrichment pipeline: receive directive from Seraphim Core → load portfolio context → find applicable patterns → check synergy opportunities → add training context → forward enriched directive to target subsidiary
    - Implement result verification pipeline: receive subsidiary result → evaluate business quality → check pattern compliance → assess synergy activation → generate structured feedback → forward enriched result to Seraphim Core
    - Implement bypass detection: intercept directives sent directly to business sub-agents, route through Eretz, log bypass attempt to XO Audit
    - _Requirements: 29a.1, 29a.2, 29a.3, 29a.4_

  - [x] 13.20 Write unit tests for Eretz agent program
    - Test directive enrichment adds portfolio context, applicable patterns, synergy opportunities, and training context
    - Test result verification evaluates business quality and generates structured feedback
    - Test bypass detection intercepts direct-to-subsidiary directives
    - Test state machine transitions (ready → enriching_directive → ready, ready → heartbeat_review → ready, etc.)
    - Test degraded state transition on error and recovery
    - _Requirements: 29a.1, 29a.2, 29a.3, 29a.4, 19.1_

  - [x] 13.21 Implement Cross-Business Synergy Engine
    - Create `packages/app/src/eretz/synergy-engine.ts` implementing the `EretzSynergyEngine` interface
    - Implement `analyzeSynergies()`: scan operations across all subsidiaries using Zikaron memory and portfolio metrics, identify revenue/operational/strategic synergies using LLM analysis
    - Implement `detectSynergy()`: event-driven synergy detection triggered by business events (new app launch, content published, trade executed)
    - Implement `createActivationPlan()`: generate synergy activation plan with steps, estimated revenue impact, and responsible subsidiary
    - Implement `enforceStandingRules()`: check compliance with standing cross-promotion rules (e.g., every ZXMG video includes ZionX app commercial), report violations
    - Implement `addStandingRule()` and `getStandingRules()`: manage standing synergy rules created by King or Eretz
    - Implement `getSynergyDashboard()`: aggregate synergy metrics — identified, activated, revenue impact, missed opportunities, standing rule compliance
    - Submit synergy activation plans to Recommendation Queue
    - _Requirements: 29b.5, 29b.6, 29b.7, 29b.8_

  - [x] 13.22 Write unit tests for Cross-Business Synergy Engine
    - Test synergy detection identifies cross-business opportunities from business events
    - Test activation plan generation includes revenue impact estimates
    - Test standing rule enforcement detects non-compliance
    - Test synergy dashboard aggregates metrics correctly
    - Test synergy activation plans are submitted to Recommendation Queue
    - _Requirements: 29b.5, 29b.6, 29b.7, 29b.8, 19.1_

  - [x] 13.23 Implement Reusable Business Pattern Library
    - Create `packages/app/src/eretz/pattern-library.ts` implementing the `EretzPatternLibrary` interface
    - Implement `extractPattern()`: extract successful business patterns from subsidiary execution outcomes, generalize for cross-subsidiary application, store with effectiveness metrics
    - Implement `storePattern()`: persist patterns in Zikaron procedural memory with vector embeddings for similarity search, categorize by type (monetization, user_acquisition, retention, content_strategy, market_entry, operational_process)
    - Implement `findPatterns()`: semantic similarity search for patterns matching a given business challenge or context
    - Implement `recommendPattern()`: proactively recommend applicable patterns when a subsidiary faces a challenge matching existing patterns
    - Implement `trackAdoption()` and `updateEffectiveness()`: track pattern adoption across subsidiaries, update confidence scores based on real outcomes
    - Implement `getPatternMetrics()`: aggregate pattern library metrics — total patterns, adoption counts, success rates, cross-subsidiary adoptions
    - _Requirements: 29c.9, 29c.10, 29c.11, 29c.12_

  - [x] 13.24 Write unit tests for Reusable Business Pattern Library
    - Test pattern extraction generalizes subsidiary-specific patterns
    - Test pattern storage in Zikaron with correct categorization
    - Test semantic similarity search returns relevant patterns for a given challenge
    - Test pattern recommendation matches challenges to applicable patterns
    - Test adoption tracking updates confidence scores from real outcomes
    - Test pattern metrics aggregation accuracy
    - _Requirements: 29c.9, 29c.10, 29c.11, 29c.12, 19.1_

  - [x] 13.25 Implement Portfolio Intelligence Dashboard
    - Create `packages/app/src/eretz/portfolio-dashboard.ts` implementing the `EretzPortfolioDashboard` interface
    - Implement `getPortfolioMetrics()`: aggregate real-time business metrics across all subsidiaries — total MRR, per-subsidiary MRR, growth rates, unit economics (CAC, LTV, ARPU, churn), marketing spend, ROAS, trading P&L, content revenue
    - Implement `getSubsidiaryMetrics()`: detailed metrics per subsidiary with benchmark comparison and strategy recommendation (scale/maintain/optimize/deprecate)
    - Implement `generateWeeklyReport()`: weekly portfolio intelligence report comparing each subsidiary against targets and industry benchmarks
    - Implement `checkDeclineAlerts()`: detect declining metrics (MRR dropping >10% MoM, churn exceeding benchmarks), generate intervention plans, escalate to Recommendation Queue
    - Implement `getPortfolioStrategy()`: maintain portfolio-level strategy with per-subsidiary resource allocation, priorities, and risk factors
    - _Requirements: 29d.13, 29d.14, 29d.15, 29d.16_

  - [x] 13.26 Write unit tests for Portfolio Intelligence Dashboard
    - Test portfolio metrics aggregation across subsidiaries
    - Test subsidiary metrics include benchmark comparisons
    - Test weekly report generation with correct structure
    - Test decline alert detection triggers at configured thresholds
    - Test portfolio strategy recommendations are informed by real metrics
    - _Requirements: 29d.13, 29d.14, 29d.15, 29d.16, 19.1_

  - [x] 13.27 Implement Training Cascade mechanism
    - Create `packages/app/src/eretz/training-cascade.ts` implementing the `TrainingCascade` interface
    - Implement `addTrainingContext()`: enrich directives with business rationale, expected outcomes, quality standards, portfolio fit, relevant patterns, and learning objectives
    - Implement `evaluateBusinessQuality()`: evaluate subsidiary outputs across dimensions — business alignment, quality standards, synergy awareness, pattern compliance, metric awareness
    - Implement `generateFeedback()`: produce structured feedback from quality evaluations
    - Implement `storeFeedback()`: persist feedback in the subsidiary's Domain_Expertise_Profile for continuous improvement
    - Implement `getTrainingEffectiveness()`: track improvement trends per subsidiary — business decision quality, recommendation accuracy, autonomous judgment, synergy awareness
    - _Requirements: 29e.17, 29e.18, 29e.19_

  - [x] 13.28 Write unit tests for Training Cascade
    - Test training context enrichment adds all required fields
    - Test business quality evaluation scores across all dimensions
    - Test structured feedback generation from evaluations
    - Test feedback storage in subsidiary Domain_Expertise_Profile
    - Test training effectiveness tracking shows improvement trends
    - _Requirements: 29e.17, 29e.18, 29e.19, 19.1_

  - [x] 13.29 Implement Eretz operational authority enforcement
    - Create `packages/app/src/eretz/authority-enforcement.ts`
    - Implement SEMP compliance checking: validate subsidiary outputs against quality standards, process adherence, reporting cadence, and governance requirements
    - Implement output rejection: when subsidiary output fails business quality standards, reject with specific feedback and require remediation
    - Implement resource reallocation: reallocate budget between subsidiaries based on portfolio priorities, subject to Otzar budget constraints and Mishmar governance rules
    - Log all authority exercises to XO Audit
    - _Requirements: 29f.20, 29f.21, 29f.22_

  - [x] 13.30 Write unit tests for Eretz operational authority enforcement
    - Test SEMP compliance checking catches quality violations
    - Test output rejection includes specific remediation requirements
    - Test resource reallocation respects Otzar budget constraints
    - Test resource reallocation respects Mishmar governance rules
    - Test all authority exercises are logged to XO Audit
    - _Requirements: 29f.20, 29f.21, 29f.22, 19.1_

  - [x] 13.31 Create seed Domain Expertise Profile for Eretz
    - Create `packages/services/src/sme/seeds/eretz-expertise.ts`: seed Eretz profile with conglomerate management strategies (BCG matrix, GE-McKinsey, portfolio theory), cross-business synergy frameworks, business pattern extraction methodologies, portfolio metrics benchmarks (MRR tracking, unit economics, cohort analysis), training cascade best practices, operational excellence benchmarks, and world-class conglomerate benchmarks (world-class conglomerate capital allocation strategies, technology conglomerate portfolio management, operational excellence at scale, luxury/brand portfolio management)
    - _Requirements: 29g.23_

  - [x] 13.32 Write unit tests for Eretz seed expertise profile
    - Test seed profile contains all required knowledge categories (conglomerate strategy, synergy frameworks, pattern extraction, portfolio metrics, training, operational excellence, competitive intelligence, world-class benchmarks)
    - Test seed profile loads correctly into Zikaron memory layers
    - Test seed knowledge entries have valid structure and confidence scores
    - _Requirements: 29g.23, 19.1_

  - [x] 13.33 Wire Eretz into Heartbeat Review Cycle and Kiro Integration
    - Update HeartbeatScheduler configuration to include Eretz with daily (24h) default interval
    - Implement Eretz-specific heartbeat review: gather portfolio metrics → scan for synergy opportunities → review subsidiary performance → benchmark against world-class conglomerates → generate portfolio-level recommendations
    - Update Kiro Integration Service to generate `eretz-expertise.md` steering file and `eretz-sme.md` skill definition
    - Wire Eretz heartbeat events to Event Bus: `sme.heartbeat.started`, `sme.heartbeat.completed` for Eretz domain
    - Update SME handler to process Eretz heartbeat completions and trigger expertise profile updates
    - _Requirements: 29g.24, 29g.25, 29g.26, 29g.27_

  - [x] 13.34 Write integration tests for Eretz end-to-end
    - Test full directive enrichment flow: Seraphim → Eretz enrichment → subsidiary delivery → result verification → Seraphim
    - Test bypass detection intercepts and reroutes direct-to-subsidiary directives
    - Test synergy detection from business events triggers activation plan submission
    - Test standing rule enforcement detects non-compliance
    - Test pattern extraction from successful subsidiary outcome → pattern library storage → pattern recommendation to different subsidiary
    - Test portfolio decline alert → intervention plan → Recommendation Queue escalation
    - Test training cascade: directive enrichment → subsidiary output → quality evaluation → feedback storage in expertise profile
    - Test Eretz heartbeat review produces portfolio-level recommendations in correct format
    - Test Kiro steering file generation for Eretz
    - _Requirements: 29a.1, 29b.5, 29c.9, 29d.15, 29e.17, 29f.20, 29g.24, 19.2_

  - [x] 13.35 Add Eretz views to Shaar dashboard
    - Add Eretz Portfolio Dashboard view: portfolio-level metrics, per-subsidiary breakdown, strategy recommendations, decline alerts
    - Add Synergy Dashboard view: identified synergies, activated synergies, revenue impact, standing rule compliance
    - Add Pattern Library view: patterns by category, adoption metrics, effectiveness scores
    - Add Training Cascade view: per-subsidiary training effectiveness trends, quality evaluation history
    - _Requirements: 29b.7, 29d.13, 29d.16_

  - [x] 13.36 Write unit tests for Eretz dashboard components
    - Test Portfolio Dashboard renders metrics and strategy recommendations
    - Test Synergy Dashboard renders synergy tracking and standing rule compliance
    - Test Pattern Library view renders patterns with adoption metrics
    - Test Training Cascade view renders effectiveness trends
    - _Requirements: 29b.7, 29d.13, 19.1_

- [ ] 14. Checkpoint — Phase 6 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Domain Expertise Profiles load correctly for each sub-agent (including Eretz) with seed knowledge, Heartbeat Scheduler triggers review cycles at configured intervals per domain (including Eretz daily), heartbeat reviews produce structured analysis with world-class benchmarks and gap analysis, Recommendation Engine accepts/validates/queues recommendations with correct structure, approval workflow dispatches to agents and tracks execution, rejection feedback reaches Zikaron for agent learning, Industry Scanner discovers and assesses technologies with roadmap maintenance, Self-Improvement Engine runs weekly assessments and generates proposals with rollback plans, Kiro steering files are generated and updated from expertise profiles (including eretz-expertise.md), all dashboard extensions display live SME data, Eretz directive enrichment pipeline adds business intelligence to all directives, Eretz bypass detection intercepts direct-to-subsidiary directives, Cross-Business Synergy Engine detects and activates synergies with standing rule enforcement, Reusable Business Pattern Library extracts/stores/recommends patterns across subsidiaries, Portfolio Intelligence Dashboard aggregates real metrics with decline alerts, Training Cascade evaluates subsidiary outputs and stores feedback in expertise profiles, Eretz operational authority enforcement validates SEMP compliance

- [-] 15. Phase 7 — Reference Ingestion and Quality Baseline System
  - [x] 15.1 Implement Reference Ingestion Service — URL intake and dispatch
    - Create `packages/services/src/reference-ingestion/service.ts` implementing the `ReferenceIngestionService` interface
    - Implement `ingest(url: string)`: request Execution Token from Mishmar, classify URL using regex patterns (Apple App Store: `apps.apple.com`, Google Play: `play.google.com/store/apps`, YouTube channel: `youtube.com/@` or `youtube.com/channel/`), dispatch to appropriate analyzer
    - Implement URL validation and error handling for unsupported URL formats (return supported formats list)
    - Record ingestion event in XO Audit with URL, detected type, and timestamp
    - Publish `reference.ingested` event to Event Bus on successful analysis completion
    - Publish `reference.ingestion.failed` event on failure with reason and stage
    - _Requirements: 34a.1, 34a.2, 34a.3, 34a.4, 34a.5, 34a.6_

  - [x] 15.2 Write unit tests for Reference Ingestion Service
    - Test URL classification correctly identifies Apple App Store, Google Play, and YouTube channel URLs
    - Test unsupported URLs return error with supported formats list
    - Test Execution Token is requested from Mishmar before dispatch
    - Test ingestion event is recorded in XO Audit
    - Test `reference.ingested` event is published on success
    - Test `reference.ingestion.failed` event is published on failure
    - _Requirements: 34a.1, 34a.5, 34a.6, 34j.55, 34j.60, 19.1_

  - [x] 15.3 Implement App Store Analyzer
    - Create `packages/services/src/reference-ingestion/analyzers/app-store-analyzer.ts`
    - Implement `analyze(url: string, platform: 'ios' | 'android')`: use Browser Automation driver (Playwright) to scrape public listing page
    - Extract listing metadata: app name, developer, category, rating, review count, pricing model, IAP options, description, feature list
    - Extract and analyze screenshots: screen count, UI layout patterns (via LLM vision analysis through Otzar), color usage, typography, navigation structure, information density
    - Analyze user reviews (minimum 50 or all available): extract top-praised features, common complaints, sentiment distribution, feature requests using LLM classification
    - Infer patterns from available data: onboarding flow complexity, monetization model classification, notification strategy indicators, interaction pattern categories, retention mechanic types
    - Handle failures: regional restrictions, app removal — report specific reason and suggest alternatives
    - Produce structured `App_Reference_Report` with all data organized by category
    - _Requirements: 34b.7, 34b.8, 34b.9, 34b.10, 34b.11, 34b.12_

  - [x] 15.4 Write unit tests for App Store Analyzer
    - Test metadata extraction from mocked App Store listing HTML
    - Test metadata extraction from mocked Google Play listing HTML
    - Test screenshot analysis produces UI pattern classifications
    - Test review analysis extracts sentiment and feature insights (min 50 reviews)
    - Test pattern inference produces valid onboarding/monetization/retention classifications
    - Test failure handling for inaccessible listings returns specific reason
    - Test output conforms to App_Reference_Report structure
    - _Requirements: 34b.7, 34b.8, 34b.9, 34b.10, 34b.11, 34b.12, 19.1_

  - [x] 15.5 Implement YouTube Channel Analyzer
    - Create `packages/services/src/reference-ingestion/analyzers/youtube-channel-analyzer.ts`
    - Implement `analyze(url: string)`: use YouTube API driver to extract channel-level metrics (subscriber count, total videos, upload frequency, avg views, engagement rate, growth trajectory)
    - Select 10-20 recent videos (mix of highest-performing and most-recent)
    - Per-video analysis: extract title word count, emotional trigger words, thumbnail composition (via LLM vision), video duration, hook structure (first 5 seconds from transcript), pattern interrupt frequency, CTA placement timestamps, estimated retention curve shape
    - Assess production quality: editing pace (cuts per minute from chapter markers/transcript timing), B-roll usage frequency, audio quality classification, music usage patterns, visual effects density
    - Synthesize Production_Formula: common hook patterns, optimal video length range, thumbnail composition rules, title construction patterns, pacing rhythm, engagement triggers
    - Handle failures: private/deleted channels — report specific reason
    - Produce structured `Channel_Reference_Report` with channel metrics, per-video breakdowns, and Production_Formula
    - _Requirements: 34c.13, 34c.14, 34c.15, 34c.16, 34c.17, 34c.18, 34c.19_

  - [x] 15.6 Write unit tests for YouTube Channel Analyzer
    - Test channel metrics extraction from mocked YouTube API responses
    - Test video selection logic (10-20 videos, mix of top-performing and recent)
    - Test per-video analysis extracts all required dimensions
    - Test production quality assessment produces valid classifications
    - Test Production_Formula synthesis identifies common patterns across videos
    - Test failure handling for private/deleted channels
    - Test output conforms to Channel_Reference_Report structure
    - _Requirements: 34c.13, 34c.14, 34c.15, 34c.16, 34c.17, 34c.18, 34c.19, 19.1_

  - [x] 15.7 Implement Quality Baseline Generator
    - Create `packages/services/src/reference-ingestion/baseline/quality-baseline-generator.ts`
    - Implement `generateAppBaseline(report: AppReferenceReport)`: produce App_Quality_Baseline with scored dimensions (visual polish, interaction complexity, content depth, monetization sophistication, retention mechanic strength, onboarding effectiveness) each 1-10
    - Implement `generateVideoBaseline(report: ChannelReferenceReport)`: produce Video_Quality_Baseline with scored dimensions (hook strength, pacing quality, thumbnail effectiveness, title optimization, production value, engagement trigger density) each 1-10
    - Implement monotonic merge: when existing baseline exists, raise thresholds where new reference exceeds current standards, preserve existing thresholds where new reference is weaker
    - Implement weighted synthesis: weight reference contributions by performance metrics (higher-rated apps / higher-view channels contribute more)
    - Implement core principle elevation: patterns appearing across multiple references get higher confidence scores
    - Include in each baseline: source URL, extraction date, confidence score (0-1), threshold values, example patterns
    - Ensure all criteria are measurable and evaluatable — no subjective dimensions
    - Track reference count per dimension for confidence reporting
    - Flag contradictions between references with metadata
    - _Requirements: 34d.20, 34d.21, 34d.22, 34d.23, 34d.24, 34d.25, 34h.44, 34h.45, 34h.46, 34h.47, 34h.48_

  - [x] 15.8 Write unit tests for Quality Baseline Generator
    - Test app baseline generation produces valid scored dimensions (all 1-10)
    - Test video baseline generation produces valid scored dimensions (all 1-10)
    - Test monotonic merge only raises thresholds, never lowers
    - Test weighted synthesis gives higher weight to better-performing references
    - Test core principle elevation for patterns across multiple references
    - Test confidence score reflects data completeness
    - Test contradiction flagging when new reference conflicts with existing baseline
    - Test all baseline dimensions are measurable (no subjective criteria)
    - _Requirements: 34d.20, 34d.21, 34d.22, 34d.23, 34d.24, 34d.25, 34h.44, 34h.45, 34h.46, 34h.47, 34h.48, 19.1_

  - [x] 15.9 Implement Baseline Storage
    - Create `packages/services/src/reference-ingestion/baseline/baseline-storage.ts`
    - Implement `store(baseline: QualityBaseline, agentId: string)`: store in Zikaron procedural memory via `storeProcedural()` with domain-specific tags
    - Route app baselines to ZionX Domain_Expertise_Profile, video baselines to ZXMG Domain_Expertise_Profile
    - Implement versioning: retain full history of baseline evolution, each store creates a new version
    - Tag memory entries with: reference type, source URL, domain category, extraction timestamp
    - Implement `queryByCategory(category: string)`: retrieve applicable baseline by domain category (e.g., "wellness apps", "tech review channels")
    - Publish `baseline.updated` event to Event Bus on every store/update with affected domain category, baseline version, and changed dimensions
    - _Requirements: 34e.26, 34e.27, 34e.28, 34e.29, 34e.30, 34e.31_

  - [x] 15.10 Write unit tests for Baseline Storage
    - Test app baselines route to ZionX Domain_Expertise_Profile
    - Test video baselines route to ZXMG Domain_Expertise_Profile
    - Test versioning retains full history (multiple stores create multiple versions)
    - Test tagging includes reference type, source URL, domain category, timestamp
    - Test queryByCategory retrieves correct baseline for domain
    - Test `baseline.updated` event is published on every store
    - _Requirements: 34e.26, 34e.27, 34e.28, 34e.29, 34e.30, 34e.31, 19.1_

  - [x] 15.11 Implement Reference Quality Gate
    - Create `packages/services/src/reference-ingestion/gate/reference-quality-gate.ts`
    - Implement `evaluate(output: ProductionOutput, domainCategory: string)`: retrieve applicable baseline from Baseline Storage, score output against each dimension using LLM evaluation via Otzar
    - Produce per-dimension scores and overall pass/fail (passing requires meeting or exceeding threshold on every dimension)
    - On failure: produce rejection report with failed dimensions, achieved scores, required thresholds, and specific gaps
    - On no baseline available: fall back to existing design quality gate evaluation
    - Log every evaluation (pass or fail) to XO Audit with output identifier, baseline version, per-dimension scores, overall result
    - Subscribe to `baseline.updated` events to reload baselines without restart
    - _Requirements: 34f.32, 34f.33, 34f.34, 34f.35, 34f.36, 34f.37, 34j.57_

  - [x] 15.12 Write unit tests for Reference Quality Gate
    - Test evaluation scores output against each baseline dimension
    - Test pass requires meeting threshold on every dimension
    - Test failure produces rejection report with specific gaps
    - Test fallback to existing gate when no baseline exists
    - Test evaluation results logged to XO Audit
    - Test baseline reload on `baseline.updated` event
    - _Requirements: 34f.32, 34f.33, 34f.34, 34f.35, 34f.36, 34f.37, 34j.57, 19.1_

  - [x] 15.13 Implement Auto-Rework Loop
    - Create `packages/services/src/reference-ingestion/rework/auto-rework-loop.ts`
    - Implement `handleRejection(output: ProductionOutput, rejectionReport: RejectionReport)`: route output back through Training Cascade with rejection report as remediation guidance
    - Include in rework directive: failed dimensions, gap between achieved and required scores, example patterns from baseline
    - Re-evaluate reworked output against same baseline version that triggered original rejection
    - Track iteration count, time elapsed, and score progression across attempts
    - Escalate to King after 5 failed rework attempts with summary of all attempts, persistent gaps, and recommendation (lower threshold, provide additional references, or accept current quality)
    - On successful rework: record the successful rework pattern in Zikaron procedural memory for future avoidance
    - _Requirements: 34g.38, 34g.39, 34g.40, 34g.41, 34g.42, 34g.43_

  - [x] 15.14 Write unit tests for Auto-Rework Loop
    - Test rejection routes output to Training Cascade with remediation guidance
    - Test rework directive includes failed dimensions, gaps, and example patterns
    - Test re-evaluation uses same baseline version as original rejection
    - Test iteration tracking (count, time, score progression)
    - Test escalation triggers after 5 failed attempts with correct summary
    - Test successful rework pattern stored in Zikaron procedural memory
    - _Requirements: 34g.38, 34g.39, 34g.40, 34g.41, 34g.42, 34g.43, 19.1_

  - [x] 15.15 Implement Pre-Production Plan Generation
    - Update ZionX agent program to generate production plan before building apps evaluated against a Quality_Baseline
    - Update ZXMG agent program to generate production plan before producing videos evaluated against a Quality_Baseline
    - Production plan includes: applicable baseline with threshold values, proposed approach for meeting each dimension, estimated confidence per threshold, at-risk dimensions
    - Implement approval flow: present plan to King, on approval proceed with autonomous production + auto-rework, on rejection revise based on feedback and resubmit
    - _Requirements: 34i.50, 34i.51, 34i.52, 34i.53, 34i.54_

  - [x] 15.16 Write unit tests for Pre-Production Plan Generation
    - Test ZionX generates production plan with all baseline dimensions addressed
    - Test ZXMG generates production plan with all baseline dimensions addressed
    - Test plan includes confidence estimates and at-risk dimensions
    - Test approval triggers autonomous production
    - Test rejection triggers plan revision
    - _Requirements: 34i.50, 34i.51, 34i.52, 34i.53, 34i.54, 19.1_

  - [x] 15.17 Implement Learning Engine integration for baseline effectiveness
    - Extend Learning Engine to monitor Quality Gate pass rates over time
    - Correlate pass rate improvements with specific baseline updates (which reference ingestions improved quality)
    - Record correlations in Zikaron for continuous improvement tracking
    - _Requirements: 34h.49_

  - [x] 15.18 Write unit tests for Learning Engine baseline integration
    - Test pass rate monitoring detects improvements after baseline updates
    - Test correlation recording links specific reference ingestions to quality improvements
    - _Requirements: 34h.49, 19.1_

  - [x] 15.19 Implement EventBridge rules and SQS queue for reference ingestion events
    - Add EventBridge rule for `reference.ingested` event type routing to new `reference-ingestion-queue`
    - Add EventBridge rule for `baseline.updated` event type routing to Quality Gate and Training Cascade consumers
    - Add EventBridge rule for `reference.ingestion.failed` event type routing to alert queue
    - Create Lambda handler for `baseline.updated` events that notifies Training Cascade to update quality standards
    - Update CDK messaging stack with new queue and rules
    - _Requirements: 34j.55, 34j.56, 34j.57, 34j.58, 34j.59, 34j.60_

  - [x] 15.20 Write unit tests for reference ingestion event handlers
    - Test `baseline.updated` handler triggers Quality Gate baseline reload
    - Test `baseline.updated` handler triggers Training Cascade standards update
    - Test `reference.ingestion.failed` handler routes to alert queue
    - Test Execution Token is required before ingestion starts
    - _Requirements: 34j.55, 34j.56, 34j.57, 34j.58, 34j.59, 34j.60, 19.1_

  - [x] 15.21 Wire Reference Ingestion into ZionX and ZXMG gate-review states
    - Update ZionX state machine gate-review transition to invoke Reference_Quality_Gate before existing gates
    - Update ZXMG state machine review transition to invoke Reference_Quality_Gate before existing gates
    - Wire Auto_Rework_Loop into Training Cascade rejection flow for both agents
    - Ensure gate-review falls back gracefully when no baseline exists (existing gates still apply)
    - _Requirements: 34f.32, 34f.33, 34f.36, 34g.38_

  - [x] 15.22 Write integration tests for Reference Ingestion end-to-end
    - Test full flow: King provides App Store URL → ingestion → analysis → baseline generation → storage → event published
    - Test full flow: King provides YouTube channel URL → ingestion → analysis → baseline generation → storage → event published
    - Test quality gate evaluation: app submitted → baseline retrieved → scored → pass/fail
    - Test auto-rework loop: app fails gate → rework directive → Training Cascade → resubmit → re-evaluate
    - Test multi-reference synthesis: second reference ingested → baseline merged (monotonic) → thresholds raised
    - Test pre-production plan: baseline exists → plan generated → King approves → autonomous production begins
    - Test escalation: 5 failed reworks → King notified with summary and recommendation
    - _Requirements: 34a-34j (all), 19.2_

- [ ] 16. Checkpoint — Phase 7 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Reference Ingestion Service correctly classifies and dispatches URLs, App Store Analyzer produces structured reports from real listing data, YouTube Channel Analyzer produces structured reports with Production Formula, Quality Baseline Generator scores dimensions and performs monotonic merge, Baseline Storage versions and tags baselines in Zikaron with event publishing, Reference Quality Gate evaluates output against baselines with pass/fail, Auto-Rework Loop routes rejections through Training Cascade with escalation after 5 failures, Pre-Production Plan generation works for both ZionX and ZXMG, Learning Engine tracks baseline effectiveness, all events flow correctly through EventBridge/SQS, ZionX and ZXMG gate-review states invoke Reference Quality Gate

- [ ] 17. Phase 8 — Parallel Agent Orchestration, MCP Integration, and Unified Communication Layer
  - [x] 17.1 Implement Dependency Graph Engine
    - Create `packages/services/src/parallel/dependency-graph.ts` implementing the `DependencyGraphEngine` interface
    - Implement `createGraph()`: construct a DAG from a list of `ParallelTask` definitions with dependency edges
    - Implement `validateGraph()`: detect circular dependencies using topological sort (Kahn's algorithm), reject invalid graphs with specific cycle path reporting
    - Implement `schedule()`: generate an execution plan using topological ordering, grouping independent tasks into parallel batches
    - Implement `getReadyTasks()`: return all tasks whose dependencies are satisfied and are ready for execution
    - Implement `markComplete()`: update task status, release dependent tasks, check for DAG completion
    - Implement `detectDeadlocks()`: identify tasks that are blocked indefinitely due to failed dependencies
    - _Requirements: 35c.8, 35c.9, 35c.10, 35c.11_

  - [x] 17.2 Write unit tests for Dependency Graph Engine
    - Test DAG construction from task list with dependencies
    - Test circular dependency detection rejects invalid graphs with cycle path
    - Test topological sort produces valid execution order
    - Test getReadyTasks returns only tasks with satisfied dependencies
    - Test markComplete releases dependent tasks correctly
    - Test deadlock detection identifies permanently blocked tasks
    - _Requirements: 35c.8, 35c.9, 35c.10, 35c.11, 19.1_

  - [x] 17.3 Implement Parallel Scheduler and Load Balancer
    - Create `packages/services/src/parallel/scheduler.ts` implementing parallel task scheduling
    - Implement work distribution across available compute resources using configurable strategy (round-robin, least-loaded, affinity-based)
    - Implement parallelism limits per agent (default: 5 concurrent sub-tasks) with configurable overrides
    - Implement resource-aware scheduling: check Otzar budget before dispatching, queue lower-priority tasks when resources are constrained
    - Implement failure isolation: failed sub-tasks don't terminate siblings, retry according to policy, report partial results
    - _Requirements: 35a.1, 35a.2, 35a.4, 35d.12, 35d.13_

  - [x] 17.4 Write unit tests for Parallel Scheduler
    - Test parallelism limit enforcement (max 5 concurrent per agent by default)
    - Test work distribution strategies (round-robin, least-loaded)
    - Test failure isolation (sibling tasks continue when one fails)
    - Test resource constraint queuing for lower-priority tasks
    - Test budget enforcement blocks over-budget parallel dispatch
    - _Requirements: 35a.1, 35a.2, 35a.4, 35d.12, 35d.13, 19.1_

  - [x] 17.5 Implement Inter-Agent Coordination Bus
    - Create `packages/services/src/parallel/coordination-bus.ts` implementing the `CoordinationBus` interface
    - Implement `sendToAgent()` and `broadcast()`: real-time message passing between concurrently executing agents via EventBridge + WebSocket
    - Implement `signalCompletion()` and `waitForDependency()`: dependency signaling with configurable timeout
    - Implement `shareIntermediateResult()` and `getIntermediateResult()`: shared state for parallel agents working on related tasks
    - Implement subscription management for real-time coordination messages
    - _Requirements: 35b.7_

  - [x] 17.6 Write unit tests for Inter-Agent Coordination Bus
    - Test point-to-point messaging between agents
    - Test broadcast messaging to all agents in a DAG
    - Test dependency signaling unblocks waiting tasks
    - Test intermediate result sharing and retrieval
    - Test timeout handling for waitForDependency
    - _Requirements: 35b.7, 19.1_

  - [x] 17.7 Implement Result Aggregator
    - Create `packages/services/src/parallel/result-aggregator.ts` implementing the `ResultAggregator` interface
    - Implement `collectResult()`: store individual stream results as they complete
    - Implement `aggregate()`: merge results from all parallel streams using configurable strategy (merge, concatenate, vote, custom)
    - Implement `getPartialResults()`: return results collected so far for in-progress DAGs
    - Implement conflict resolution when parallel streams produce contradictory results
    - _Requirements: 35a.3, 35c.11_

  - [x] 17.8 Write unit tests for Result Aggregator
    - Test result collection from multiple parallel streams
    - Test merge aggregation strategy combines results correctly
    - Test partial results available before all streams complete
    - Test conflict resolution for contradictory results
    - _Requirements: 35a.3, 35c.11, 19.1_

  - [x] 17.9 Wire Parallel Orchestration into Agent Runtime
    - Update `packages/core/src/agent-runtime/runtime.ts` to support parallel task dispatch
    - Implement intra-agent parallelization: when an agent decomposes a task into independent sub-tasks, dispatch them concurrently through the Parallel Scheduler
    - Implement inter-agent parallelization: when Seraphim/Eretz dispatches to multiple agents, use the Dependency Graph Engine to manage execution
    - Update Seraphim_Core and Eretz directive decomposition to produce parallel task DAGs when tasks are independent
    - Add parallel execution status to agent health reporting
    - _Requirements: 35a.1, 35b.5, 35b.6_

  - [x] 17.10 Write integration tests for Parallel Orchestration
    - Test intra-agent: single agent spawns 3 parallel sub-tasks, all complete, results aggregated
    - Test inter-agent: Seraphim dispatches to ZionX and ZXMG in parallel, both complete independently
    - Test dependency: agent B waits for agent A's output, proceeds after A completes
    - Test failure isolation: one parallel stream fails, others continue, partial results returned
    - Test deadlock detection: circular dependency detected and reported
    - _Requirements: 35a.1, 35b.5, 35b.6, 35c.9, 19.2_

  - [x] 17.11 Implement MCP Server Host
    - Create `packages/services/src/mcp/server-host.ts` implementing the `MCPServerHost` interface
    - Implement `startServer()`: start an MCP server for a given agent exposing its tools via the MCP protocol (JSON-RPC over stdio/SSE/WebSocket)
    - Implement `registerTool()` and `unregisterTool()`: dynamic tool registration with JSON Schema validation
    - Implement MCP protocol handlers: `tools/list`, `tools/call`, `initialize`, `ping`
    - Implement authentication: validate incoming MCP connections against Mishmar authorization
    - Implement rate limiting per connection
    - _Requirements: 36a.1, 36a.2, 36a.3, 36a.4_

  - [x] 17.12 Write unit tests for MCP Server Host
    - Test server starts and responds to MCP protocol messages
    - Test tool registration exposes tools with correct schemas
    - Test authentication rejects unauthorized connections
    - Test rate limiting blocks excessive requests
    - Test tool invocation routes to correct agent and returns results
    - _Requirements: 36a.1, 36a.2, 36a.3, 36a.4, 19.1_

  - [x] 17.13 Define and register per-agent MCP tools
    - Create `packages/services/src/mcp/tools/seraphim-tools.ts`: system health, directive submission, recommendation queue access, parallel execution status
    - Create `packages/services/src/mcp/tools/eretz-tools.ts`: portfolio metrics, synergy status, pattern library query, directive enrichment
    - Create `packages/services/src/mcp/tools/zionx-tools.ts`: app status, pipeline triggers, gate results, design system query
    - Create `packages/services/src/mcp/tools/zxmg-tools.ts`: content pipeline status, analytics, production queue, baseline query
    - Create `packages/services/src/mcp/tools/zion-alpha-tools.ts`: positions, strategy status, market scans, trade history
    - Each tool definition includes JSON Schema for inputs/outputs and required authority level
    - _Requirements: 36a.5_

  - [x] 17.14 Implement MCP Client Manager
    - Create `packages/services/src/mcp/client-manager.ts` implementing the `MCPClientManager` interface
    - Implement `connect()`: establish connection to external MCP servers with retry and circuit breaker
    - Implement `discoverTools()`: query connected server for available tools
    - Implement `invokeTool()`: call external MCP tools with proper error handling, timeout, and cost tracking via Otzar
    - Implement `findToolByCapability()`: semantic search across registered tools using embedding similarity
    - Implement connection health monitoring with automatic reconnection
    - _Requirements: 36b.6, 36b.7, 36b.8, 36b.9_

  - [x] 17.15 Write unit tests for MCP Client Manager
    - Test connection establishment and reconnection on failure
    - Test tool discovery from external servers
    - Test tool invocation with proper error handling
    - Test cost tracking for external tool calls via Otzar
    - Test circuit breaker opens after repeated failures
    - Test semantic tool search by capability description
    - _Requirements: 36b.6, 36b.7, 36b.8, 36b.9, 19.1_

  - [x] 17.16 Implement MCP Tool Registry
    - Create `packages/services/src/mcp/tool-registry.ts` implementing the `MCPToolRegistry` interface
    - Implement `registerInternalTools()`: register agent tools with schema validation
    - Implement `registerExternalServer()`: register external MCP server tools with health monitoring
    - Implement `listAllTools()`, `searchTools()`, `getToolSchema()`: query and discovery operations
    - Implement `findByCapability()`: semantic matching using embedding similarity against tool descriptions
    - Implement dynamic registration: new MCP servers auto-discovered and registered without restart
    - Store registry in `mcp_tool_registry` database table
    - _Requirements: 36c.10, 36c.11, 36c.12_

  - [x] 17.17 Write unit tests for MCP Tool Registry
    - Test internal tool registration with schema validation
    - Test external server registration with health monitoring
    - Test tool listing and search operations
    - Test semantic capability matching returns relevant tools
    - Test dynamic registration without restart
    - _Requirements: 36c.10, 36c.11, 36c.12, 19.1_

  - [x] 17.18 Implement Kiro-Seraphim MCP Bridge
    - Create `packages/services/src/mcp/kiro-bridge.ts` implementing the `KiroSeraphimBridge` interface
    - Implement Kiro → Seraphim direction: expose all agent MCP tools to Kiro IDE sessions
    - Implement Seraphim → Kiro direction: allow agents to invoke Kiro tools (readFile, writeFile, runCommand, search, getDiagnostics) through the bridge
    - Implement persistent connection management for ongoing development sessions
    - Implement bridge status monitoring and automatic reconnection
    - _Requirements: 36d.13, 36d.14, 36d.15_

  - [x] 17.19 Write unit tests for Kiro-Seraphim MCP Bridge
    - Test Kiro can discover and invoke SeraphimOS agent tools
    - Test SeraphimOS agents can invoke Kiro tools through the bridge
    - Test persistent connection survives temporary disconnections
    - Test bridge status reporting
    - _Requirements: 36d.13, 36d.14, 36d.15, 19.1_

  - [x] 17.20 Implement Agent Communication Service
    - Create `packages/services/src/communication/service.ts` implementing the `AgentCommunicationService` interface
    - Implement `sendMessage()`: route user message to target agent, persist in `chat_messages` table, process through priority queue, deliver agent response
    - Implement `getHistory()` and `searchHistory()`: retrieve and search chat history per agent with filtering
    - Implement `getUnifiedHistory()`: return all users' messages for an agent in chronological order with user attribution
    - Implement `getActiveUsers()`: return currently active users chatting with an agent
    - Implement multi-user context management: maintain separate conversation contexts per user while providing unified history access to the agent
    - _Requirements: 37a.1, 37a.2, 37a.3, 37b.5, 37b.6, 37b.7_

  - [x] 17.21 Write unit tests for Agent Communication Service
    - Test message sending persists to database and routes to agent
    - Test history retrieval with filtering (time range, user, priority)
    - Test unified history shows all users' messages chronologically
    - Test multi-user concurrent access with separate contexts
    - Test search across chat history
    - _Requirements: 37a.1, 37a.2, 37a.3, 37b.5, 37b.6, 37b.7, 19.1_

  - [x] 17.22 Implement Message Priority Queue
    - Create `packages/services/src/communication/priority-queue.ts`
    - Implement priority-based message processing: critical → high → normal → low, FIFO within same priority
    - Implement critical message interruption: when critical message arrives, interrupt non-critical agent work within 10 seconds
    - Implement configurable King message auto-elevation (default: high priority)
    - Implement rate limiting and fairness for multi-user access
    - _Requirements: 37b.8, 39.1, 39.2, 39.3, 39.4_

  - [x] 17.23 Write unit tests for Message Priority Queue
    - Test priority ordering (critical processed before normal)
    - Test FIFO within same priority level
    - Test critical message interruption within 10 seconds
    - Test King message auto-elevation to high priority
    - Test rate limiting prevents single user from monopolizing agent
    - _Requirements: 37b.8, 39.1, 39.2, 39.3, 39.4, 19.1_

  - [x] 17.24 Implement Context Sharing Engine
    - Create `packages/services/src/communication/context-sharing.ts` implementing the `ContextSharingEngine` interface
    - Implement `analyzeRelevance()`: use embedding similarity to determine if a message to one agent is relevant to other agents (threshold: 0.7 relevance score)
    - Implement `propagateContext()`: share relevant context to target agents, store in `context_share_events` table, update receiving agent's working memory
    - Implement explicit @-mention parsing: detect @agent_name patterns in messages and route context explicitly
    - Implement `generateHandoffSummary()`: when user switches agents, generate a concise summary of recent conversation for the new agent
    - Implement configurable handoff mode per user (automatic, on-request, manual)
    - _Requirements: 37c.9, 37c.10, 37c.11, 37c.12, 37d.13, 37d.14_

  - [x] 17.25 Write unit tests for Context Sharing Engine
    - Test relevance analysis detects cross-agent relevant messages
    - Test auto-propagation shares context above threshold
    - Test explicit @-mention routes to correct agent
    - Test handoff summary generation captures key conversation points
    - Test context share events are logged correctly
    - Test configurable handoff modes work as expected
    - _Requirements: 37c.9, 37c.10, 37c.11, 37c.12, 37d.13, 37d.14, 19.1_

  - [x] 17.26 Implement Agent Presence Service
    - Create `packages/services/src/communication/presence.ts`
    - Implement real-time agent presence tracking: idle, working (with task description), waiting_input, thinking, parallel_processing (with count), degraded
    - Implement presence change broadcasting via WebSocket within 2 seconds
    - Implement queue depth reporting per agent
    - Wire presence updates to agent runtime state changes
    - _Requirements: 37e.15, 37e.16_

  - [x] 17.27 Write unit tests for Agent Presence Service
    - Test presence updates reflect actual agent state
    - Test WebSocket broadcast within 2-second SLA
    - Test queue depth accurately reflects pending messages
    - Test all presence states are correctly reported
    - _Requirements: 37e.15, 37e.16, 19.1_

  - [x] 17.28 Implement Telegram Integration Service
    - Create `packages/services/src/communication/telegram.ts` implementing the `TelegramIntegrationService` interface
    - Implement bot initialization with Telegram Bot API (token from Secrets Manager)
    - Implement per-agent thread management: create and manage dedicated threads/topics for each agent in a Telegram group
    - Implement `handleIncomingMessage()`: receive Telegram messages, identify user (linked account), route to correct agent via Communication Service
    - Implement `sendToThread()`: deliver agent responses to the correct Telegram thread
    - Implement account linking: connect Telegram user IDs to SeraphimOS user accounts
    - Implement Mishmar authorization enforcement for Telegram interactions
    - _Requirements: 38a.1, 38a.2, 38a.3, 38c.7, 38c.8, 38c.9_

  - [x] 17.29 Write unit tests for Telegram Integration Service
    - Test bot initialization and thread creation per agent
    - Test incoming message routing to correct agent
    - Test response delivery to correct Telegram thread
    - Test account linking flow
    - Test unauthorized users are rejected
    - Test command semantics match dashboard behavior
    - _Requirements: 38a.1, 38a.2, 38a.3, 38c.7, 38c.8, 38c.9, 19.1_

  - [x] 17.30 Implement Dashboard-Telegram Synchronization
    - Create `packages/services/src/communication/sync.ts`
    - Implement `syncToDashboard()`: Telegram messages appear in dashboard chat with "via Telegram" indicator
    - Implement `syncFromDashboard()`: dashboard messages appear in Telegram thread with "via Dashboard" indicator
    - Implement real-time bidirectional sync within 3 seconds
    - Ensure unified conversation stream regardless of originating surface
    - _Requirements: 38b.4, 38b.5, 38b.6_

  - [x] 17.31 Write unit tests for Dashboard-Telegram Synchronization
    - Test Telegram messages appear in dashboard with source indicator
    - Test dashboard messages appear in Telegram with source indicator
    - Test sync latency within 3-second SLA
    - Test conversation continuity across surfaces
    - _Requirements: 38b.4, 38b.5, 38b.6, 19.1_

  - [x] 17.32 Implement Notification Routing Engine
    - Create `packages/services/src/communication/notification-router.ts` implementing the `NotificationRoutingEngine` interface
    - Implement `setRules()` and `getRules()`: manage per-user notification routing rules with conditions (agent, priority, type, time window) and target channels
    - Implement `route()`: evaluate all applicable rules for a notification and deliver to all matching channels simultaneously
    - Implement `checkEscalation()` and `escalate()`: background job checks unacknowledged notifications, escalates after configurable timeout (15min high, 5min critical)
    - Implement `acknowledge()`: mark notification as acknowledged across all channels (deduplication)
    - Implement delivery to: dashboard (WebSocket push), Telegram (via Telegram service), email (via Gmail driver), iMessage (via iMessage driver)
    - _Requirements: 41.1, 41.2, 41.3, 41.4, 38d.10, 38d.11, 38d.12_

  - [x] 17.33 Write unit tests for Notification Routing Engine
    - Test rule evaluation routes to correct channels
    - Test simultaneous multi-channel delivery
    - Test escalation triggers after timeout
    - Test acknowledgment deduplicates across channels
    - Test quiet hours suppress notifications
    - Test priority threshold filtering
    - _Requirements: 41.1, 41.2, 41.3, 41.4, 38d.10, 38d.11, 38d.12, 19.1_

  - [x] 17.34 Implement Agent-to-Agent Delegation Visibility
    - Create `packages/services/src/communication/delegation-visibility.ts`
    - Implement delegation tracking: when an agent delegates work to another agent during message processing, record the delegation with status
    - Implement chat UI delegation indicators: show delegation chain, delegated task description, and real-time status (pending/in-progress/complete/failed)
    - Implement parallel delegation display: when multiple agents are delegated to simultaneously, show all streams with individual progress
    - Wire delegation events to both dashboard WebSocket and Telegram threads
    - _Requirements: 40.1, 40.2, 40.3, 40.4_

  - [x] 17.35 Write unit tests for Delegation Visibility
    - Test delegation recording captures correct metadata
    - Test delegation status updates propagate to chat UI
    - Test parallel delegation display shows all streams
    - Test delegation visibility works in both dashboard and Telegram
    - _Requirements: 40.1, 40.2, 40.3, 40.4, 19.1_

  - [x] 17.36 Implement Communication Audit Trail
    - Extend XO Audit to log all human-agent communications: user identity, agent identity, message content, timestamp, response time, actions triggered
    - Implement conversation replay: retrieve full communication history between any user and any agent for a given time period
    - Implement audit queries for communication patterns: response times, message volumes, priority distribution
    - _Requirements: 37f.17, 37f.18_

  - [x] 17.37 Write unit tests for Communication Audit Trail
    - Test all messages are logged to XO Audit with required fields
    - Test conversation replay retrieves complete history
    - Test audit queries return correct communication patterns
    - _Requirements: 37f.17, 37f.18, 19.1_

  - [x] 17.38 Implement Dashboard Chat UI Components
    - Add per-agent chat panel to each agent's dashboard page (Seraphim, Eretz, ZionX, ZXMG, Zion Alpha)
    - Implement chat message list with: user attribution, timestamps, source indicators (dashboard/telegram), priority badges, delegation indicators
    - Implement agent presence indicator with real-time status updates
    - Implement @-mention autocomplete for cross-agent tagging
    - Implement message priority selector (low/normal/high/critical)
    - Implement unified history view toggle (show all users vs. my messages only)
    - Implement notification preferences UI for routing rule configuration
    - _Requirements: 37a.1, 37a.4, 37b.6, 37c.10, 37e.15, 39.1, 41.5_

  - [x] 17.39 Write unit tests for Dashboard Chat UI Components
    - Test chat panel renders messages with correct attribution
    - Test presence indicator updates in real-time
    - Test @-mention autocomplete suggests correct agents
    - Test priority selector changes message priority
    - Test unified history toggle switches between views
    - Test notification preferences UI saves rules correctly
    - _Requirements: 37a.1, 37a.4, 37b.6, 37c.10, 37e.15, 41.5, 19.1_

  - [x] 17.40 Implement database migrations for Phase 8
    - Create migration for `chat_messages` table with indexes
    - Create migration for `context_share_events` table with indexes
    - Create migration for `notification_rules` table
    - Create migration for `notification_deliveries` table with indexes
    - Create migration for `telegram_account_links` table
    - Create migration for `mcp_tool_registry` table with indexes
    - Create migration for `parallel_execution_dags` table with indexes
    - _Requirements: 35c.8, 36c.10, 37a.2, 37c.12, 38c.7, 41.1_

  - [x] 17.41 Write integration tests for Phase 8 end-to-end
    - Test full parallel execution: create DAG → schedule → execute parallel → coordinate → aggregate results
    - Test MCP server: external client connects → discovers tools → invokes tool → receives result
    - Test MCP client: agent needs external tool → discovers via registry → invokes → tracks cost
    - Test Kiro bridge: Kiro invokes agent tool → agent invokes Kiro tool → bidirectional flow
    - Test communication: user sends message via dashboard → agent responds → message appears in Telegram
    - Test cross-agent context: message to ZionX auto-shared with ZXMG → ZXMG acknowledges context
    - Test notification routing: agent generates alert → routed to dashboard + Telegram → user acknowledges on Telegram → marked acknowledged on dashboard
    - Test delegation visibility: user asks Seraphim → Seraphim delegates to Eretz and ZionX in parallel → delegation shown in chat → results aggregated
    - Test multi-user: two users chat with same agent → unified history shows both → priority ordering respected
    - _Requirements: 35a-35d, 36a-36d, 37a-37f, 38a-38d, 39, 40, 41, 19.2_

- [x] 18. Checkpoint — Phase 8 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Dependency Graph Engine validates DAGs and detects cycles, Parallel Scheduler distributes work with configurable limits and failure isolation, Coordination Bus enables real-time inter-agent messaging, Result Aggregator merges parallel outputs, MCP Server Host exposes agent tools with authentication, MCP Client Manager connects to external tools with cost tracking, MCP Tool Registry supports dynamic discovery and semantic search, Kiro-Seraphim Bridge enables bidirectional tool invocation, Agent Communication Service handles multi-user persistent chat, Priority Queue processes messages in priority order with critical interruption, Context Sharing Engine auto-detects and propagates relevant context, Telegram Integration provides per-agent threads with dashboard sync, Notification Routing Engine delivers to multiple channels with escalation, Delegation Visibility shows agent-to-agent work chains in chat, all database migrations applied successfully

- [ ] 19. Phase 9 — ZionX App Development Studio
  - [x] 19.1 Implement Studio Session Manager
    - Create `packages/app/src/zionx/studio/session-manager.ts` with StudioSession interface and lifecycle management
    - Implement session creation, state persistence, file tree tracking, and last-activity updates
    - Implement undo/redo stack management for edit commands
    - Create `packages/app/src/zionx/studio/types.ts` with all studio-specific types (ProjectState, FileNode, BuildStatus, PlatformBuildStatus, EditCommand, EditResult)
    - _Requirements: 42a.1, 42d.11, 42c.8_

  - [x] 19.2 Write unit tests for Studio Session Manager
    - Test session creation with valid project state
    - Test undo/redo stack push, pop, and state restoration
    - Test file tree updates after code generation and edits
    - Test build status transitions (idle → building → success/failed)
    - Test session activity tracking and cleanup
    - _Requirements: 42a.1, 42d.11, 19.1_

  - [x] 19.3 Implement Device Profile Manager
    - Create `packages/app/src/zionx/studio/device-profiles.ts` with all device frame definitions
    - Define profiles for: iPhone 15 (6.7"), iPhone SE, iPad, Pixel 8, Android Tablet
    - Include accurate dimensions, scale factors, safe area insets, notch/dynamic island specs, and status bar heights
    - _Requirements: 42b.6, 42j.31_

  - [x] 19.4 Implement App Preview Runtime (Level 1 — React Native Web)
    - Create `packages/dashboard/src/components/studio/PreviewRuntime.tsx` — React component that renders React Native Web app inside device frames
    - Implement sandboxed iframe rendering with restricted permissions
    - Implement device frame switching with re-render within 2 seconds
    - Implement hot reload on code changes via WebSocket message
    - Implement screenshot capture from preview iframe
    - _Requirements: 42b.4, 42b.5, 42b.6, 42j.31_

  - [x] 19.5 Write unit tests for App Preview Runtime
    - Test device frame renders with correct dimensions and safe areas
    - Test device switching triggers re-render within 2 seconds
    - Test hot reload applies code changes without full page refresh
    - Test click-through navigation works within iframe
    - Test screenshot capture produces correct dimensions per device profile
    - _Requirements: 42b.4, 42b.5, 42b.6, 19.1_

  - [x] 19.6 Implement AI Edit Controller
    - Create `packages/app/src/zionx/studio/edit-controller.ts` with natural language edit processing
    - Implement edit command routing to ZionX agent for code modification
    - Implement test execution after each edit (lint, typecheck, unit tests)
    - Implement preview reload trigger after successful edit
    - Implement undo/redo by restoring file state from edit history
    - Emit `app.code.changed` hook after every edit
    - _Requirements: 42d.10, 42d.11, 42d.12_

  - [x] 19.7 Write unit tests for AI Edit Controller
    - Test edit command produces file changes and triggers tests
    - Test undo restores previous file state
    - Test redo re-applies undone edit
    - Test failed edit (test failures) does not update preview
    - Test `app.code.changed` hook emitted after successful edit
    - _Requirements: 42d.10, 42d.11, 42d.12, 19.1_

  - [x] 19.8 Implement Integration Panel Service
    - Create `packages/app/src/zionx/studio/integrations.ts` with integration configuration management
    - Implement integration enable/disable with SDK code generation (RevenueCat, Database, Analytics, Push, Ads, etc.)
    - Implement secure credential storage via Otzar for environment variables and API keys
    - Implement integration list: Preview, Code, Design, Files, Images, Audio, API, Environment Variables, Database, Payments, Prompts, Haptics, Logs, Network Requests, Store Assets, Ad Studio, Revenue, Deployments
    - _Requirements: 42e.13, 42e.14, 42e.15_

  - [x] 19.9 Write unit tests for Integration Panel Service
    - Test enabling an integration generates correct SDK code and config
    - Test disabling an integration removes SDK code cleanly
    - Test credential storage calls Otzar without exposing values
    - Test integration list returns all configured services with status
    - _Requirements: 42e.13, 42e.14, 42e.15, 19.1_

  - [x] 19.10 Implement Testing Panel Service
    - Create `packages/app/src/zionx/studio/testing-panel.ts` with test execution and gate check management
    - Implement test runner that executes unit tests, UI tests, and accessibility checks
    - Implement design quality scoring against Quality_Baseline
    - Implement store readiness checklist (metadata, privacy policy, screenshots, IAP sandbox)
    - Implement gate-blocked progression — block Build/Submit if critical gates fail
    - _Requirements: 42f.16, 42f.17, 42f.18_

  - [x] 19.11 Write unit tests for Testing Panel Service
    - Test test execution returns structured pass/fail results with failure details
    - Test gate check blocks progression when critical checks fail
    - Test gate check allows progression when all critical checks pass
    - Test design quality score calculation against baseline
    - _Requirements: 42f.16, 42f.17, 42f.18, 19.1_

  - [x] 19.12 Implement Store Asset Generator
    - Create `packages/app/src/zionx/studio/store-assets.ts` with screenshot capture and asset generation
    - Implement screenshot capture from preview across all device sizes (iPhone 6.7", 6.5", iPad, Google Play phone, tablet)
    - Implement app icon generation (1024×1024)
    - Implement feature graphic generation (1024×500)
    - Implement promotional banner generation
    - Implement localized caption generation per screenshot
    - Implement platform-specific validation (Apple and Google dimension/size/content requirements)
    - Emit `app.screenflow.changed` hook when navigation changes trigger regeneration
    - _Requirements: 42h.24, 42h.25, 42h.26, 42h.27_

  - [x] 19.13 Write unit tests for Store Asset Generator
    - Test screenshot capture produces correct dimensions per device profile
    - Test app icon generation produces 1024×1024 output
    - Test feature graphic generation produces 1024×500 output
    - Test validation catches incorrect dimensions, oversized files, and content policy violations
    - Test `app.screenflow.changed` hook triggers regeneration
    - _Requirements: 42h.24, 42h.25, 42h.26, 42h.27, 19.1_

  - [x] 19.14 Implement Ad Studio Service
    - Create `packages/app/src/zionx/studio/ad-studio.ts` with video ad creative generation
    - Implement 15-second vertical ad generation (TikTok/Reels/Shorts format)
    - Implement 30-second horizontal ad generation (YouTube pre-roll format)
    - Implement 6-second bumper ad generation
    - Implement playable ad demo generation with interactive elements
    - Implement ad network validation (AdMob, AppLovin, Unity Ads specs)
    - Implement export in network-ready formats without manual conversion
    - _Requirements: 42i.28, 42i.29, 42i.30_

  - [x] 19.15 Write unit tests for Ad Studio Service
    - Test vertical ad generation produces correct aspect ratio and duration
    - Test horizontal ad generation produces correct aspect ratio and duration
    - Test bumper ad generation produces 6-second output
    - Test playable ad includes interactive elements
    - Test validation catches file size, aspect ratio, and duration violations per network
    - Test export produces network-ready format without conversion needed
    - _Requirements: 42i.28, 42i.29, 42i.30, 19.1_

  - [x] 19.16 Implement Apple Release Agent
    - Create `packages/app/src/zionx/studio/agents/apple-release-agent.ts`
    - Implement Xcode build trigger and status tracking
    - Implement Bundle ID management via App Store Connect driver
    - Implement code signing with provisioning profiles
    - Implement App Store Connect metadata preparation
    - Implement privacy nutrition label generation from app analysis
    - Implement IAP/RevenueCat validation
    - Implement screenshot validation against Apple HIG
    - Implement TestFlight upload and distribution
    - Implement App Store review submission
    - Implement rejection parsing and remediation plan generation
    - Expose MCP tools: `apple.validateMetadata`, `apple.uploadScreenshots`, `apple.submitForReview`, `apple.checkReviewStatus`, `apple.uploadBuild`
    - _Requirements: 42g.20, 42k.34_

  - [x] 19.17 Write unit tests for Apple Release Agent
    - Test build trigger initiates Xcode build and tracks status
    - Test metadata preparation produces valid App Store Connect format
    - Test privacy nutrition label generation from app analysis
    - Test IAP validation catches misconfigured products
    - Test rejection parsing extracts actionable remediation steps
    - Test MCP tool exposure with correct schemas
    - _Requirements: 42g.20, 42k.34, 19.1_

  - [x] 19.18 Implement Google Play Release Agent
    - Create `packages/app/src/zionx/studio/agents/google-play-release-agent.ts`
    - Implement Gradle AAB build trigger and status tracking
    - Implement package name management via Google Play Console driver
    - Implement signing keystore management
    - Implement Google Play Console metadata preparation
    - Implement Data Safety form generation from app analysis
    - Implement Google Play billing/RevenueCat validation
    - Implement closed testing track upload
    - Implement production release promotion
    - Implement rejection parsing and remediation plan generation
    - Expose MCP tools: `google.validateListing`, `google.uploadAssets`, `google.submitForReview`, `google.checkReviewStatus`, `google.uploadAAB`
    - _Requirements: 42g.21, 42k.35_

  - [x] 19.19 Write unit tests for Google Play Release Agent
    - Test build trigger initiates Gradle AAB build and tracks status
    - Test metadata preparation produces valid Play Console format
    - Test Data Safety form generation from app analysis
    - Test billing validation catches misconfigured products
    - Test rejection parsing extracts actionable remediation steps
    - Test MCP tool exposure with correct schemas
    - _Requirements: 42g.21, 42k.35, 19.1_

  - [x] 19.20 Implement Store Asset Agent (MCP)
    - Create `packages/app/src/zionx/studio/agents/store-asset-agent.ts`
    - Implement preview screenshot capture via MCP tool `preview.captureScreen`
    - Implement image generation and resizing for multiple device sizes
    - Implement video generation for App Preview videos
    - Implement asset format conversion per platform requirements
    - Implement S3 storage for all generated assets
    - Expose MCP tools: `preview.captureScreen`, `preview.captureVideo`, `assets.generateIcon`, `assets.generateFeatureGraphic`, `assets.validate`
    - _Requirements: 42k.36, 42h.24, 42h.25_

  - [x] 19.21 Implement Hook Integration for Studio Lifecycle
    - Create `packages/app/src/zionx/studio/hooks.ts` with all studio lifecycle hook emissions
    - Implement hook emitters for: `app.idea.created`, `app.code.changed`, `app.preview.updated`, `app.screenflow.changed`, `app.ios.build.created`, `app.android.build.created`, `app.assets.requested`, `app.marketing.state.entered`, `app.store.gate.failed`, `app.submission.ready`
    - Implement `app.store.gate.failed` handler: identify responsible sub-agent, create rework task, rerun gate after remediation
    - Integrate with existing Event Bus infrastructure
    - _Requirements: 42l.38, 42l.39, 42l.40_

  - [x] 19.22 Write unit tests for Hook Integration
    - Test each hook emits correct event payload to Event Bus
    - Test `app.store.gate.failed` identifies correct sub-agent and creates rework task
    - Test `app.submission.ready` triggers King approval request via Mishmar
    - Test hooks integrate with existing WebSocket for real-time dashboard updates
    - _Requirements: 42l.38, 42l.39, 42l.40, 19.1_

  - [x] 19.23 Implement Revenue and Performance Panel
    - Create `packages/app/src/zionx/studio/revenue-panel.ts` with metrics aggregation
    - Implement data sourcing from App Store Connect and Google Play Console drivers (downloads, revenue, ratings, reviews, crash rate, retention)
    - Implement combined subscription + ad revenue display
    - Implement LLM token cost tracking per app via Otzar integration (cost-per-app, cost-per-edit)
    - _Requirements: 42m.41, 42m.42_

  - [x] 19.24 Implement Governance and Audit Integration
    - Create `packages/app/src/zionx/studio/governance.ts` with Mishmar approval workflows
    - Implement King approval requirement before store submission (L1 authority)
    - Implement budget allocation approval for paid acquisition
    - Implement authority escalation for cross-pillar resource requests
    - Implement XO_Audit logging for all studio actions with full traceability (idea → live app)
    - _Requirements: 42n.43, 42n.44_

  - [x] 19.25 Write unit tests for Governance and Audit Integration
    - Test store submission blocked without King approval
    - Test budget allocation requires approval above threshold
    - Test all studio actions produce XO_Audit records with correct metadata
    - Test audit trail provides full traceability from idea to live app
    - _Requirements: 42n.43, 42n.44, 19.1_

  - [x] 19.26 Implement Build/Submit Panel Service
    - Create `packages/app/src/zionx/studio/build-panel.ts` with build status management
    - Implement separate iOS and Android build status tracking (progress, signing, metadata, privacy policy, screenshots, IAP sandbox)
    - Implement `app.ios.build.created` hook emission for iOS builds
    - Implement `app.android.build.created` hook emission for Android builds
    - Implement `app.submission.ready` hook when all gates pass
    - _Requirements: 42g.19, 42g.22, 42g.23_

  - [x] 19.27 Write unit tests for Build/Submit Panel Service
    - Test iOS build status tracks all required fields
    - Test Android build status tracks all required fields
    - Test `app.ios.build.created` hook validates Xcode/iOS SDK, bundle ID, signing, metadata
    - Test `app.android.build.created` hook validates Gradle/AAB, package name, keystore, Data Safety
    - Test `app.submission.ready` fires only when all gates pass
    - _Requirements: 42g.19, 42g.22, 42g.23, 19.1_

  - [x] 19.28 Implement Preview Maturity Level 2 (Expo QR)
    - Create `packages/app/src/zionx/studio/preview-expo.ts` with Expo QR code generation
    - Implement QR code generation for Expo Go or custom dev client
    - Implement real-device connection tracking
    - _Requirements: 42j.32_

  - [x] 19.29 Implement Preview Maturity Level 3 (Cloud Emulator)
    - Create `packages/app/src/zionx/studio/preview-emulator.ts` with cloud emulator streaming
    - Implement Android emulator streaming from cloud to dashboard
    - Implement iOS simulator streaming from cloud to dashboard
    - Implement automated screenshot capture via Maestro/Detox test frameworks
    - _Requirements: 42j.33_

  - [x] 19.30 Create database migrations for Phase 9
    - Create migration for `studio_sessions` table with tenant and app indexes
    - Create migration for `studio_edit_history` table with session index
    - Create migration for `studio_store_assets` table with session and type indexes
    - Create migration for `studio_ad_creatives` table with session and type indexes
    - _Requirements: 42a.1, 42d.11, 42h.24, 42i.28_

  - [x] 19.31 Implement Dashboard UI — Studio Layout and Tab Structure
    - Create `packages/dashboard/src/pages/ZionXStudio.tsx` — main studio layout with three-panel design
    - Implement left panel: Integration Sidebar with service connection toggles
    - Implement center panel: Tab bar (Preview | Store Assets | Ad Studio | Revenue) with content switching
    - Implement right panel: ZionX Chat (reusing existing agent chat component), File Tree, Test Results, Build Status
    - _Requirements: 42a.1, 42b.4, 42c.8, 42e.13_

  - [x] 19.32 Implement Dashboard UI — Device Frame Preview Component
    - Create `packages/dashboard/src/components/studio/DeviceFrame.tsx` — accurate device frame rendering
    - Implement device selector dropdown (iPhone 15, iPhone SE, iPad, Pixel 8, Android Tablet)
    - Implement frame chrome (notch, dynamic island, status bar, home indicator) per device profile
    - Implement iframe container for React Native Web preview content
    - _Requirements: 42b.4, 42b.5, 42b.6_

  - [x] 19.33 Implement Dashboard UI — File Tree and Code Viewer
    - Create `packages/dashboard/src/components/studio/FileTree.tsx` — navigable file tree component
    - Create `packages/dashboard/src/components/studio/CodeViewer.tsx` — syntax-highlighted file viewer (read-only MVP)
    - Implement file selection with content display
    - Implement build status indicators on file tree nodes
    - _Requirements: 42c.8, 42c.9_

  - [x] 19.34 Implement Dashboard UI — Testing Panel Component
    - Create `packages/dashboard/src/components/studio/TestingPanel.tsx` — test results display
    - Implement unit test, UI test, and accessibility results display with pass/fail indicators
    - Implement design quality score visualization
    - Implement store readiness checklist with gate status
    - Implement "Run Tests" button triggering test execution
    - _Requirements: 42f.16, 42f.17, 42f.18_

  - [x] 19.35 Implement Dashboard UI — Build/Submit Panel Component
    - Create `packages/dashboard/src/components/studio/BuildPanel.tsx` — dual-platform build status
    - Implement iOS build status card (progress, signing, metadata, privacy, screenshots, IAP)
    - Implement Android build status card (progress, signing, metadata, Data Safety, screenshots, billing)
    - Implement "Submit to App Store" and "Submit to Play Store" buttons with Mishmar approval flow
    - _Requirements: 42g.19, 42g.20, 42g.21_

  - [x] 19.36 Implement Dashboard UI — Store Assets Tab
    - Create `packages/dashboard/src/components/studio/StoreAssetsTab.tsx` — asset grid display
    - Implement screenshot grid organized by device size with validation status indicators
    - Implement app icon, feature graphic, and promo banner preview
    - Implement "Generate All Assets" button and individual regeneration
    - Implement validation issue display with remediation instructions
    - _Requirements: 42h.24, 42h.25, 42h.26_

  - [x] 19.37 Implement Dashboard UI — Ad Studio Tab
    - Create `packages/dashboard/src/components/studio/AdStudioTab.tsx` — ad creative management
    - Implement creative list with type, format, duration, and validation status
    - Implement video preview player for generated ads
    - Implement "Generate Ads" button with format selection
    - Implement export buttons per ad network (AdMob, AppLovin, Unity)
    - _Requirements: 42i.28, 42i.29, 42i.30_

  - [x] 19.38 Implement Dashboard UI — Revenue Panel Component
    - Create `packages/dashboard/src/components/studio/RevenuePanel.tsx` — metrics dashboard
    - Implement downloads, revenue (subscription + ad), ratings, reviews, crash rate, retention charts
    - Implement cost-per-app and cost-per-edit metrics from Otzar
    - Implement scale/optimize/kill recommendation display
    - _Requirements: 42m.41, 42m.42_

  - [x] 19.39 Write integration tests for Phase 9 end-to-end
    - Test full app creation flow: King describes app → spec generated → code generated → preview renders → edit applied → preview reloads
    - Test store asset flow: preview active → capture screenshots → generate icon → generate feature graphic → validate all → pass
    - Test ad creative flow: preview active → generate vertical ad → validate for AdMob → export
    - Test Apple submission flow: build triggered → signed → metadata prepared → screenshots uploaded → submitted for review
    - Test Google submission flow: build triggered → signed → metadata prepared → Data Safety form → closed track → production
    - Test hook integration: edit applied → `app.code.changed` fires → tests run → preview updates
    - Test gate blocking: critical gate fails → submission blocked → rework task created → gate rerun after fix
    - Test governance: submission attempted → Mishmar requires King approval → approved → submitted
    - _Requirements: 42a-42n, 19.2_

- [ ] 20. Checkpoint — Phase 9 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Studio Session Manager handles session lifecycle and undo/redo, App Preview Runtime renders React Native Web in device frames with hot reload, AI Edit Controller processes natural language edits and triggers test/preview cycle, Integration Panel enables service connections with SDK code generation, Testing Panel executes tests and enforces gate-blocked progression, Store Asset Generator captures screenshots and generates all required assets with validation, Ad Studio generates video creatives in multiple formats with network validation, Apple Release Agent owns complete iOS workflow from build to submission, Google Play Release Agent owns complete Android workflow from build to submission, Hook Integration emits all lifecycle events through Event Bus, Revenue Panel displays live metrics from store drivers, Governance Integration enforces King approval and logs all actions to XO_Audit, all database migrations applied successfully

- [x] 21. Phase 10 — ZXMG Video Development Studio
  - [x] 21.1 Implement Trend Intelligence Engine
    - Create `packages/app/src/zxmg/studio/trend-engine.ts` with TrendIntelligenceEngine interface
    - Implement trending topic analysis across YouTube, TikTok, and Instagram via browser automation and YouTube API driver
    - Implement algorithm signal detection (format boosts, topic boosts, length preferences)
    - Implement competitor channel analysis with above-average engagement identification
    - Implement audience retention curve analysis with drop-off pattern detection
    - Implement content gap identification (high demand, low supply topics)
    - Implement viral pattern detection (hooks, pacing, formats, thumbnail styles)
    - Store all research findings in Zikaron procedural memory with confidence scores
    - _Requirements: 44e.24, 44e.25, 44e.26, 44e.27, 44e.28, 44e.29_

  - [x] 21.2 Write unit tests for Trend Intelligence Engine
    - Test trending topic analysis returns structured results with velocity and relevance scores
    - Test algorithm signal detection identifies format and topic boosts with confidence levels
    - Test competitor analysis extracts engagement strategies from channel data
    - Test retention curve analysis identifies drop-off points and generates recommendations
    - Test content gap identification finds high-demand low-supply topics
    - Test viral pattern detection extracts hooks, pacing, and format patterns
    - Test all findings are stored in Zikaron with correct metadata
    - _Requirements: 44e.24-44e.29, 21.1_

  - [x] 21.3 Implement Autonomous Content Engine
    - Create `packages/app/src/zxmg/studio/autonomous-engine.ts` with AutonomousContentEngine interface
    - Implement content calendar generation using trend research results and Zikaron performance patterns
    - Implement content idea ranking by predicted views, engagement rate, and revenue potential
    - Implement rolling pipeline management (7-14 days ahead per channel, organized BY CHANNEL)
    - Implement "Generate" action — King clicks to trigger production pipeline for a specific idea
    - Implement "Publish" action — King clicks to push generated video to assigned channel (no auto-publish)
    - Implement natural language edit feedback loop — King provides feedback, ZXMG re-generates affected portions
    - Implement King override interface (approve, reject, modify, reorder pipeline items)
    - Emit `video.idea.generated` hook when new content idea is generated
    - Emit `video.pipeline.updated` hook when pipeline state changes
    - _Requirements: 44a.1, 44a.2, 44a.3, 44a.4, 44a.5, 44a.6, 44a.8, 44a.9, 44a.10_

  - [x] 21.4 Write unit tests for Autonomous Content Engine
    - Test content calendar generates 7-14 days of ranked ideas per channel
    - Test idea ranking uses trend data and Zikaron performance patterns
    - Test pipeline is organized by channel (each channel has independent pipeline)
    - Test "Generate" action triggers production pipeline for selected idea
    - Test "Publish" action uploads video to assigned channel only after explicit King click
    - Test edit feedback re-generates affected scenes while preserving the rest
    - Test King rejection removes item from pipeline and emits hook
    - Test King modification updates item and recalculates schedule
    - Test `video.idea.generated` hook emits with correct payload
    - Test `video.pipeline.updated` hook emits on state changes
    - _Requirements: 44a.1-44a.10, 21.1_

  - [x] 21.5 Implement Multi-Model Video Router
    - Create `packages/app/src/zxmg/studio/model-router.ts` with MultiModelVideoRouter interface
    - Implement model capability registry (Sora 2/Veo 3, Kling, WAN, Minimax, animation models)
    - Implement routing logic: cinematic → Sora 2/Veo 3, fast iteration → Kling/WAN/Minimax, animation → specialized models
    - Implement Otzar integration for budget-aware model selection
    - Implement text-to-video, image-to-video, and audio-to-video generation modes
    - Implement camera simulation parameters (pan, zoom, dolly, crane, tracking)
    - Implement character persistence across clips using Zikaron face/body profiles
    - Implement lip-sync generation for dialogue scenes
    - _Requirements: 44c.12, 44c.13, 44c.14, 44c.15, 44c.16, 44c.17_

  - [x] 21.6 Write unit tests for Multi-Model Video Router
    - Test cinematic scenes route to Sora 2 or Veo 3
    - Test fast iteration scenes route to Kling, WAN, or Minimax
    - Test animation scenes route to specialized animation models
    - Test budget constraints influence model selection (downgrade when over budget)
    - Test text-to-video, image-to-video, and audio-to-video modes produce valid clips
    - Test camera simulation parameters are passed correctly to model API
    - Test character persistence references Zikaron profiles across clips
    - Test lip-sync generation synchronizes with voiceover audio
    - Test `video.scene.rendered` hook emits after clip generation
    - _Requirements: 44c.12-44c.17, 21.1_

  - [x] 21.7 Implement Video Production Pipeline
    - Create `packages/app/src/zxmg/studio/production-pipeline.ts` with VideoProductionPipeline interface
    - Implement script generation from concept using channel config and trend context
    - Implement scene decomposition (script → individual scenes with duration, visuals, camera, audio, characters)
    - Implement scene rendering orchestration (route each scene through Multi-Model Router)
    - Implement video assembly from rendered clips with transitions and audio layers
    - Implement multi-format export (16:9, 9:16, 1:1)
    - Emit `video.script.created` hook when script is generated
    - Emit `video.assembled` hook when full video is assembled
    - _Requirements: 44b.7, 44b.8, 44b.9, 44b.10, 44b.11, 44d.22, 44d.23_

  - [x] 21.8 Write unit tests for Video Production Pipeline
    - Test script generation produces complete production package (script, scenes, shot list, style guide, audio direction)
    - Test scene decomposition creates scenes with all required fields (duration, visuals, camera, audio, characters)
    - Test 15-minute video support with consistent character/visual style across scenes
    - Test multi-style support (cinematic, animated, documentary, tutorial, vlog, music video)
    - Test video assembly combines clips with transitions and audio layers
    - Test multi-format export produces correct aspect ratios
    - Test `video.script.created` and `video.assembled` hooks emit correctly
    - _Requirements: 44b.7-44b.11, 44d.22, 44d.23, 21.1_

  - [x] 21.9 Implement Timeline Editor Service
    - Create `packages/app/src/zxmg/studio/timeline-editor.ts` with VideoTimelineEditor interface
    - Implement scene-by-scene timeline control (reorder, trim, extend, replace)
    - Implement audio layer management (music, SFX, voiceover, ambient as separate tracks)
    - Implement transitions between scenes (cuts, fades, dissolves, wipes, motion graphics)
    - Implement color grading presets (per scene and whole video)
    - _Requirements: 44d.18, 44d.19, 44d.20, 44d.21_

  - [x] 21.10 Write unit tests for Timeline Editor Service
    - Test scene reorder updates sequence and maintains audio sync
    - Test scene trim adjusts duration without affecting adjacent scenes
    - Test audio layer management supports independent track manipulation
    - Test transitions apply correctly between scene boundaries
    - Test color grading applies per-scene and whole-video presets
    - _Requirements: 44d.18-44d.21, 21.1_

  - [x] 21.11 Implement Channel Manager
    - Create `packages/app/src/zxmg/studio/channel-manager.ts` with ChannelManager interface
    - Implement multi-channel CRUD (add, update, list channels)
    - Implement per-channel configuration (niche, tone, cadence, audience, content pillars)
    - Implement per-channel analytics aggregation (views, subscribers, revenue, retention, CTR, growth)
    - Implement cross-channel promotion opportunity detection
    - Implement channel health monitoring with decline alerts
    - Store channel configurations in Zikaron for learning
    - _Requirements: 44f.30, 44f.31, 44f.32, 44f.33, 44f.34_

  - [x] 21.12 Write unit tests for Channel Manager
    - Test channel creation stores configuration correctly
    - Test channel update modifies only specified fields
    - Test analytics aggregation returns correct metrics per channel
    - Test cross-channel promotion identifies relevant opportunities
    - Test health monitoring emits alerts when metrics decline below thresholds
    - Test channel config stored in Zikaron
    - _Requirements: 44f.30-44f.34, 21.1_

  - [x] 21.13 Implement Platform Distribution Engine
    - Create `packages/app/src/zxmg/studio/distribution.ts` with PlatformDistributionEngine interface
    - Implement YouTube publishing via YouTube API driver with full metadata
    - Implement TikTok, Instagram Reels, X, Facebook, and Rumble publishing
    - Implement platform-specific formatting (aspect ratio, duration, captions, hashtags, thumbnails)
    - Implement optimal scheduling based on audience activity data from Zikaron
    - Implement content repurposing (long-form → shorts, clips, teasers)
    - Emit `video.scheduled` hook when video is scheduled
    - Emit `video.published` hook when video is uploaded to platform
    - _Requirements: 44g.35, 44g.36, 44g.37, 44g.38, 44g.39_

  - [x] 21.14 Write unit tests for Platform Distribution Engine
    - Test YouTube publishing sends correct metadata and video file
    - Test platform-specific formatting produces correct aspect ratios and durations
    - Test optimal scheduling queries Zikaron for audience activity patterns
    - Test content repurposing generates shorts from long-form with correct format
    - Test `video.scheduled` and `video.published` hooks emit with correct payloads
    - Test multi-platform publish handles partial failures gracefully
    - _Requirements: 44g.35-44g.39, 21.1_

  - [x] 21.15 Implement Thumbnail and SEO Generator
    - Create `packages/app/src/zxmg/studio/thumbnail-seo.ts` with ThumbnailSEOGenerator interface
    - Implement thumbnail generation (minimum 3 variants per video) with predicted CTR scoring
    - Implement title variant generation optimized for YouTube SEO
    - Implement description and tag generation
    - Implement A/B test result recording and Zikaron learning feedback
    - Emit `video.thumbnail.generated` hook when variants are created
    - _Requirements: 44h.40, 44h.41, 44h.42, 44h.43_

  - [x] 21.16 Write unit tests for Thumbnail and SEO Generator
    - Test thumbnail generation produces minimum 3 variants with different styles
    - Test title variants include predicted CTR and search volume
    - Test tag generation produces relevant, non-duplicate tags
    - Test A/B result recording stores in Zikaron with correct metrics
    - Test `video.thumbnail.generated` hook emits with variant data
    - _Requirements: 44h.40-44h.43, 21.1_

  - [x] 21.17 Implement UGC and Ad Creative Builder
    - Create `packages/app/src/zxmg/studio/ugc-builder.ts` with UGCAdCreativeBuilder interface
    - Implement UGC-style video generation (authentic-looking user-generated content)
    - Implement AI avatar/influencer creation with persistent identity in Zikaron
    - Implement performance ad format generation (hook → value → CTA) with A/B variants
    - _Requirements: 44i.44, 44i.45, 44i.46_

  - [x] 21.18 Write unit tests for UGC and Ad Creative Builder
    - Test UGC generation produces authentic-style video content
    - Test AI avatar creation stores persistent identity in Zikaron
    - Test performance ad variants follow hook → value → CTA structure
    - Test multiple variants generated for A/B testing
    - _Requirements: 44i.44-44i.46, 21.1_

  - [x] 21.19 Implement Analytics and Performance Tracker
    - Create `packages/app/src/zxmg/studio/analytics.ts` with VideoAnalyticsEngine interface
    - Implement real-time performance tracking (views, watch time, engagement, CTR, revenue)
    - Implement audience retention heatmap generation (second-by-second)
    - Implement revenue tracking (AdSense, sponsorships, affiliate)
    - Implement performance pattern storage in Zikaron procedural memory
    - Emit `video.performance.update` hook when metrics are updated
    - Generate optimization recommendations when metrics fall below channel baseline
    - _Requirements: 44j.47, 44j.48, 44j.49, 44j.50_

  - [x] 21.20 Write unit tests for Analytics and Performance Tracker
    - Test real-time metrics tracking aggregates correctly from platform APIs
    - Test retention heatmap generates second-by-second data
    - Test revenue tracking combines AdSense, sponsorship, and affiliate sources
    - Test performance patterns stored in Zikaron with correct metadata
    - Test `video.performance.update` hook emits with metrics payload
    - Test optimization recommendations generated when below baseline
    - _Requirements: 44j.47-44j.50, 21.1_

  - [x] 21.21 Implement Video Studio Hook Integration
    - Create `packages/app/src/zxmg/studio/hooks.ts` with all video studio lifecycle hook emissions
    - Implement hook emitters for: `video.idea.generated`, `video.script.created`, `video.scene.rendered`, `video.assembled`, `video.thumbnail.generated`, `video.scheduled`, `video.published`, `video.performance.update`, `video.pipeline.updated`
    - Implement performance-based recommendation generation on `video.performance.update`
    - Integrate with existing Event Bus infrastructure
    - Integrate with existing Shaar WebSocket for real-time dashboard updates
    - _Requirements: 44m.59, 44m.60, 44m.61_

  - [x] 21.22 Write unit tests for Video Studio Hook Integration
    - Test each hook emits correct event payload to Event Bus
    - Test `video.performance.update` triggers optimization recommendations when below baseline
    - Test WebSocket integration delivers real-time updates to dashboard
    - Test hooks integrate with existing Event Bus infrastructure
    - _Requirements: 44m.59-44m.61, 21.1_

  - [x] 21.23 Implement Governance and Audit Integration
    - Create `packages/app/src/zxmg/studio/governance.ts` with Mishmar and XO_Audit integration
    - Implement optional King approval requirement before autonomous publishing (configurable per channel)
    - Implement budget allocation approval for premium model usage via Otzar
    - Implement authority escalation for cross-pillar resource requests
    - Implement XO_Audit logging for all studio actions (idea → research → script → render → assemble → publish → performance)
    - Implement Otzar model routing integration for budget-aware video generation
    - _Requirements: 44n.62, 44n.63, 44n.64, 44n.65, 44n.66_

  - [x] 21.24 Write unit tests for Governance and Audit Integration
    - Test publishing blocked when channel requires King approval and approval not given
    - Test publishing proceeds when channel has auto-publish enabled
    - Test budget allocation requires approval above threshold
    - Test all studio actions produce XO_Audit records with correct metadata
    - Test audit trail provides full traceability from research to published video
    - Test Otzar integration enforces per-channel budget limits
    - _Requirements: 44n.62-44n.66, 21.1_

  - [x] 21.25 Create database migrations for Phase 10
    - Create migration for `video_channels` table with tenant and YouTube channel indexes
    - Create migration for `video_pipeline_items` table with channel, status, and auto-execute indexes
    - Create migration for `video_rendered_scenes` table with pipeline item index
    - Create migration for `video_performance` table with pipeline and channel indexes
    - Create migration for `video_trend_research` table with channel and expiry indexes
    - _Requirements: 44a.3, 44f.30, 44j.47, 44e.24_

  - [x] 21.26 Implement Dashboard UI — Video Studio Layout
    - Create `packages/dashboard/src/pages/ZXMGVideoStudio.tsx` — main studio layout with three-panel design
    - Implement left panel (1fr): ZXMG AI chat panel + autonomous pipeline view
    - Implement center panel (2fr): Video preview player + timeline editor + scene thumbnail strip + audio waveform
    - Implement right panel (64px): Tool sidebar with 13 icon buttons (Script, Scenes, Characters, Audio, Effects, Trends, Thumbnails, Captions, Export, Analytics, Publish, Pipeline, Research)
    - _Requirements: 44l.56, 44l.57, 44l.58_

  - [x] 21.27 Implement Dashboard UI — Video Preview Panel
    - Create `packages/dashboard/src/components/video-studio/VideoPlayer.tsx` — full video player with timeline scrubbing
    - Create `packages/dashboard/src/components/video-studio/SceneThumbnailStrip.tsx` — scene-by-scene thumbnail navigation
    - Create `packages/dashboard/src/components/video-studio/AudioWaveform.tsx` — synchronized audio waveform visualization
    - Implement side-by-side comparison view for before/after edits
    - Implement device preview (mobile vs desktop viewing contexts)
    - _Requirements: 44k.51, 44k.52, 44k.53, 44k.54, 44k.55_

  - [x] 21.28 Implement Dashboard UI — Pipeline View Component
    - Create `packages/dashboard/src/components/video-studio/PipelineView.tsx` — autonomous pipeline display
    - Implement pipeline item cards showing: concept, predicted metrics, status, scheduled dates
    - Implement approve/reject/modify buttons per pipeline item
    - Implement pipeline timeline visualization (7-14 day view)
    - Implement "Generate" button per pipeline item to trigger video production
    - _Requirements: 44a.3, 44a.4, 44a.5_

  - [x] 21.29 Implement Dashboard UI — Tool Panels
    - Create `packages/dashboard/src/components/video-studio/ScriptPanel.tsx` — script editor and scene breakdown view
    - Create `packages/dashboard/src/components/video-studio/ScenesPanel.tsx` — scene-by-scene management with render status
    - Create `packages/dashboard/src/components/video-studio/CharactersPanel.tsx` — character consistency and avatar management
    - Create `packages/dashboard/src/components/video-studio/AudioPanel.tsx` — music, SFX, voiceover layer management
    - Create `packages/dashboard/src/components/video-studio/EffectsPanel.tsx` — transitions, color grading, visual effects
    - Create `packages/dashboard/src/components/video-studio/TrendsPanel.tsx` — trending topics and algorithm signals display
    - Create `packages/dashboard/src/components/video-studio/ThumbnailsPanel.tsx` — thumbnail generation and A/B testing
    - Create `packages/dashboard/src/components/video-studio/CaptionsPanel.tsx` — subtitle and caption generation
    - Create `packages/dashboard/src/components/video-studio/ExportPanel.tsx` — multi-format export settings
    - Create `packages/dashboard/src/components/video-studio/AnalyticsPanel.tsx` — performance metrics and optimization
    - Create `packages/dashboard/src/components/video-studio/PublishPanel.tsx` — platform distribution and scheduling
    - Create `packages/dashboard/src/components/video-studio/ResearchPanel.tsx` — content research and competitor analysis
    - _Requirements: 44l.57, 44l.58, 44d.18, 44e.24, 44h.40, 44j.47, 44g.35_

  - [x] 21.30 Implement Dashboard UI — Channel Management View
    - Create `packages/dashboard/src/components/video-studio/ChannelManager.tsx` — multi-channel management interface
    - Implement channel configuration form (niche, tone, cadence, audience, content pillars)
    - Implement per-channel analytics dashboard (views, subscribers, revenue, retention, CTR, growth)
    - Implement channel health indicators with alert display
    - _Requirements: 44f.30, 44f.31, 44f.32, 44f.34_

  - [x] 21.31 Write integration tests for Phase 10 end-to-end
    - Test full pipeline flow: trend research → idea generation → calendar entry → King clicks Generate → script → scenes → render → assemble → King reviews → King provides feedback → re-render → King clicks Publish
    - Test King override flow: pipeline item displayed → King modifies → updated item produced → King publishes with modifications
    - Test multi-model routing: cinematic scene → Sora 2, fast scene → Kling, animation → specialized model
    - Test content repurposing: long-form video → shorts + clips + teasers generated
    - Test multi-platform distribution: single video → YouTube + TikTok + Instagram published with correct formats
    - Test performance learning loop: video published → metrics tracked → patterns stored in Zikaron → next cycle uses learnings
    - Test channel health monitoring: metrics decline → alert generated → recommendation created
    - Test governance: approval-required channel → publish blocked until King approves
    - Test hook integration: each lifecycle event emits correct hook through Event Bus
    - _Requirements: 44a-44n, 21.2_

- [x] 22. Checkpoint — Phase 10 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Trend Intelligence Engine researches across platforms and stores findings in Zikaron, Autonomous Content Engine generates ranked content calendars and auto-executes after 24hr timeout, Multi-Model Video Router routes scenes to optimal AI models via Otzar budget management, Video Production Pipeline generates scripts and assembles 15-minute videos with character consistency, Timeline Editor provides scene-by-scene control with audio layers and transitions, Channel Manager supports multi-channel configuration with health monitoring, Platform Distribution Engine publishes to 6 platforms with optimal scheduling, Thumbnail/SEO Generator produces A/B variants with learning feedback, Analytics Engine tracks performance and feeds learnings back to Zikaron, all 9 lifecycle hooks emit through Event Bus, Governance integration enforces optional approval and logs all actions to XO_Audit, Dashboard UI provides three-panel layout with 13 tool sidebar buttons


- [x] 23. Phase 11 — ZionX Autonomous App Ideation Engine + Eretz Business Command Center

  - [x] 23.1 Implement Market Research Engine
    - Create `packages/app/src/zionx/studio/ideation/market-research.ts` with MarketResearchEngine interface
    - Implement `runResearchCycle()`: orchestrate full market scan across Apple App Store and Google Play Store
    - Implement `scanAppStoreCategory()`: analyze category rankings, top apps, revenue data, and growth trends per store
    - Implement `analyzeCompetitorApps()`: identify competitor weaknesses, missing features, and user complaints from reviews
    - Implement `identifyReviewGaps()`: detect unmet user needs from review sentiment analysis
    - Implement `detectEmergingNiches()`: identify rising niches with high demand and low supply
    - Implement `storeResearchFindings()`: persist all findings to Zikaron with structured metadata (source, confidence, category, timestamp, relevance tags)
    - Emit `app.idea.researched` hook when research cycle completes
    - _Requirements: 45a.1, 45a.2, 45a.3, 45a.4_

  - [x] 23.2 Write unit tests for Market Research Engine
    - Test research cycle orchestrates scans across both stores and aggregates results
    - Test category analysis produces correct structure with rankings, revenue, and competition density
    - Test competitor analysis identifies gaps and user complaints from review data
    - Test review gap detection identifies unmet needs with correct sentiment scoring
    - Test emerging niche detection identifies rising niches with growth velocity
    - Test findings are stored in Zikaron with correct metadata structure
    - Test `app.idea.researched` hook emits with research result payload
    - _Requirements: 45a.1-45a.4, 21.1_

  - [x] 23.3 Implement Niche Scoring Algorithm
    - Create `packages/app/src/zionx/studio/ideation/niche-scoring.ts` with NicheScoringAlgorithm interface
    - Implement `scoreNiche()`: compute composite score (0-100) from market size, competition density (inverse), revenue potential, technical feasibility, growth trend, and review gap score
    - Implement `batchScoreNiches()`: score multiple niches in parallel with consistent weighting
    - Implement `updateWeights()`: adjust scoring weights based on historical outcomes stored in Zikaron (ideas that succeeded get their niche factors weighted higher)
    - Implement `getWeights()`: return current scoring weights with last calibration date
    - Implement per-factor breakdown in score output so King can understand ranking rationale
    - _Requirements: 45b.5, 45b.6, 45b.7_

  - [x] 23.4 Write unit tests for Niche Scoring Algorithm
    - Test composite score normalizes correctly to 0-100 range
    - Test per-factor breakdown sums to composite score
    - Test competition density is inversely weighted (lower competition = higher score)
    - Test weight updates from historical outcomes adjust future scoring
    - Test niches with previous ZionX success receive higher feasibility scores
    - Test batch scoring produces consistent results with single scoring
    - _Requirements: 45b.5-45b.7, 21.1_

  - [x] 23.5 Implement App Idea Generator and Pipeline Manager
    - Create `packages/app/src/zionx/studio/ideation/pipeline-manager.ts` with AppIdeaPipelineManager interface
    - Implement `addIdea()`: add ideas from both autonomous and manual sources with correct metadata
    - Implement `rankPipeline()`: sort ideas by composite score of predicted downloads, revenue, and inverse competition
    - Implement `getPipeline()`: return ranked ideas with optional filters (category, revenue, competition, feasibility, status)
    - Implement `refreshPipeline()`: re-score existing ideas, remove stale ideas (>30 days without action), add new ideas from research
    - Implement `markAsGenerating()`, `markAsGenerated()`, `markAsPublished()`: status transitions for Gate 1 and Gate 2
    - Implement `dismissIdea()` and `bookmarkIdea()`: King pipeline management actions
    - Emit `app.idea.ranked` hook when ideas are added or re-ranked
    - Emit `app.pipeline.updated` hook when pipeline state changes
    - _Requirements: 45c.8, 45c.9, 45c.10, 45c.11, 45d.12, 45d.13, 45d.14, 45d.15_

  - [x] 23.6 Write unit tests for App Idea Generator and Pipeline Manager
    - Test ideas from both autonomous and manual sources are added with correct metadata
    - Test pipeline ranking sorts by composite score correctly
    - Test filters (category, revenue, competition, feasibility, status) return correct subsets
    - Test stale idea pruning removes ideas older than 30 days without action
    - Test re-scoring updates rankings based on market changes
    - Test status transitions (pipeline → generating → generated → published) work correctly
    - Test dismiss and bookmark actions update idea status
    - Test `app.idea.ranked` hook emits on add and re-rank
    - Test `app.pipeline.updated` hook emits on all state changes
    - Test both Gate 1 (Generate) and Gate 2 (Publish) transitions integrate with existing ZionX Studio flow
    - _Requirements: 45c.8-45c.11, 45d.12-45d.15, 21.1_

  - [x] 23.7 Implement Ideation Learning and Audit Integration
    - Create `packages/app/src/zionx/studio/ideation/learning.ts` with outcome tracking and weight calibration
    - Implement outcome recording: when a published app's performance data is available, correlate original idea scoring with actual results
    - Implement weight calibration: use outcome data to adjust niche scoring weights via `updateWeights()`
    - Implement XO_Audit logging for all ideation actions (research cycles, niche scoring, idea generation, pipeline updates)
    - Integrate with existing ZionX design intelligence, quality baselines, and GTM engine — pipeline ideas inherit same standards
    - _Requirements: 45f.20, 45f.21, 45f.22_

  - [x] 23.8 Write unit tests for Ideation Learning and Audit Integration
    - Test outcome recording stores correct correlation between idea scoring and actual performance
    - Test weight calibration adjusts scoring weights based on outcome data
    - Test all ideation actions produce XO_Audit records with correct metadata and traceability
    - Test pipeline ideas inherit ZionX quality baselines and GTM automation
    - _Requirements: 45f.20-45f.22, 21.1_

  - [x] 23.9 Implement Dashboard UI — ZionX Studio Pipeline View Update
    - Update `packages/dashboard/src/pages/ZionXAppStudio.tsx` left panel to include autonomous pipeline view alongside existing chat
    - Create `packages/dashboard/src/components/app-studio/IdeationPipelineView.tsx` — ranked pipeline display with "Generate" buttons per idea
    - Implement pipeline idea cards showing: app name, predicted downloads, predicted revenue, competition level, niche score, and status
    - Implement pipeline filters: category, revenue potential, competition level, technical feasibility
    - Implement idea detail view on click: full market analysis, competitor breakdown, revenue model, niche scoring factors
    - Implement dismiss and bookmark actions per idea
    - Connect to WebSocket for real-time pipeline updates
    - _Requirements: 45e.16, 45e.17, 45e.18, 45e.19_

  - [x] 23.10 Write unit tests for ZionX Studio Pipeline View
    - Test pipeline view renders ranked ideas with correct metrics display
    - Test "Generate" button triggers app generation flow for selected idea
    - Test filters correctly narrow displayed ideas
    - Test idea detail view shows full market analysis and scoring breakdown
    - Test dismiss and bookmark actions update pipeline state
    - Test WebSocket integration delivers real-time pipeline updates
    - _Requirements: 45e.16-45e.19, 21.1_

  - [x] 23.11 Implement Eretz Business Command Center — Page Layout and Portfolio Overview
    - Create `packages/dashboard/src/pages/EretzCommandCenter.tsx` — full-page dedicated tab with responsive grid layout
    - Create `packages/dashboard/src/components/command-center/PortfolioOverviewHeader.tsx` — total MRR, total revenue, growth trajectory sparkline, portfolio health indicator
    - Create `packages/dashboard/src/components/command-center/SubsidiaryCardGrid.tsx` — grid of per-subsidiary cards
    - Create `packages/dashboard/src/components/command-center/ZionXCard.tsx` — apps count, total app revenue, top 3 apps, pipeline count, growth trend
    - Create `packages/dashboard/src/components/command-center/ZXMGCard.tsx` — channels count, total views, revenue, top 3 channels, content pipeline count
    - Create `packages/dashboard/src/components/command-center/ZionAlphaCard.tsx` — active positions, P&L, win rate, strategy, risk exposure
    - Implement per-subsidiary breakdown showing MRR contribution percentage and trend indicators
    - Connect to portfolio-dashboard.ts via WebSocket for real-time metric updates
    - _Requirements: 46a.1, 46a.2, 46a.3, 46b.4, 46b.5, 46c.6, 46c.7, 46c.8_

  - [x] 23.12 Write unit tests for Command Center Layout and Portfolio Overview
    - Test full-page layout renders as dedicated tab (not sub-view)
    - Test portfolio header displays correct total MRR, revenue, growth, and health indicator
    - Test per-subsidiary breakdown shows correct contribution percentages
    - Test ZionX card displays apps count, revenue, top apps, and pipeline count
    - Test ZXMG card displays channels count, views, revenue, and top channels
    - Test Zion Alpha card displays positions, P&L, win rate, and risk exposure
    - Test WebSocket connection delivers real-time metric updates
    - _Requirements: 46a.1-46a.3, 46b.4-46b.5, 46c.6-46c.8, 21.1_

  - [x] 23.13 Implement Eretz Business Command Center — Synergy Map and Pattern Library
    - Create `packages/dashboard/src/components/command-center/SynergyMapVisualization.tsx` — visual synergy map with connecting lines between subsidiaries, data flow direction, and revenue impact annotations
    - Create `packages/dashboard/src/components/command-center/PatternLibraryBrowser.tsx` — searchable pattern list with name, category, source subsidiary, adoption count, and effectiveness score
    - Implement pattern detail view on click: description, implementation examples, adoption history, measured impact
    - Implement synergy revenue impact display: total additional revenue from cross-subsidiary synergies
    - Connect to synergy-engine.ts and pattern-library.ts via WebSocket/REST
    - _Requirements: 46d.9, 46d.10, 46e.11, 46e.12_

  - [x] 23.14 Write unit tests for Synergy Map and Pattern Library
    - Test synergy map renders active synergies with correct source/target subsidiaries
    - Test synergy revenue impact displays total synergy-generated revenue
    - Test pattern library browser renders searchable list with correct metrics
    - Test pattern detail view shows full information on click
    - Test search filters patterns by name and category
    - Test data sourced from synergy-engine.ts and pattern-library.ts services
    - _Requirements: 46d.9-46d.10, 46e.11-46e.12, 21.1_

  - [x] 23.15 Implement Eretz Business Command Center — Training, Recommendations, and Alerts
    - Create `packages/dashboard/src/components/command-center/TrainingCascadeChart.tsx` — per-subsidiary quality trend line charts showing before/after training, completion rates, and quality score improvements
    - Create `packages/dashboard/src/components/command-center/RecommendationQueuePanel.tsx` — pending recommendations with summary, priority, source agent, date, and approve/reject/modify buttons
    - Create `packages/dashboard/src/components/command-center/DeclineAlertsPanel.tsx` — real-time alerts with subsidiary, metric, severity, decline percentage, and intervention plan
    - Implement recommendation approve action: trigger execution workflow, update queue display
    - Implement recommendation reject action: mark rejected with optional reason, remove from pending
    - Implement recommendation modify action: inline editor for parameter adjustment before approval
    - Implement alert acknowledgment and full intervention plan view
    - Connect to training-cascade.ts, RecommendationQueue, and portfolio-dashboard.ts via WebSocket
    - _Requirements: 46f.13, 46f.14, 46g.15, 46g.16, 46g.17, 46g.18, 46h.19, 46h.20, 46h.21_

  - [x] 23.16 Write unit tests for Training, Recommendations, and Alerts
    - Test training cascade chart renders per-subsidiary quality trends correctly
    - Test recommendation queue displays pending items with correct priority ordering
    - Test approve action triggers execution and removes from pending queue
    - Test reject action marks recommendation as rejected with reason
    - Test modify action opens inline editor and submits adjusted parameters
    - Test decline alerts display immediately via WebSocket push
    - Test alert acknowledgment updates alert state
    - Test intervention plan view shows full actionable steps
    - _Requirements: 46f.13-46f.14, 46g.15-46g.18, 46h.19-46h.21, 21.1_

  - [x] 23.17 Implement Eretz Business Command Center — Resource Allocation and Strategy
    - Create `packages/dashboard/src/components/command-center/ResourceAllocationView.tsx` — visual budget breakdown (bar chart/treemap) with per-subsidiary percentage, actual spend, and recommended allocation
    - Create `packages/dashboard/src/components/command-center/StrategicPrioritiesPanel.tsx` — portfolio thesis, top priorities list, per-subsidiary strategy (scale/maintain/optimize/deprecate), risk factors, and key actions with progress indicators
    - Implement resource allocation adjustment: King can drag percentages or enter values, changes propagated to Eretz portfolio strategy
    - Connect to portfolio-dashboard.ts for strategy and allocation data
    - _Requirements: 46i.22, 46i.23, 46j.24, 46j.25_

  - [x] 23.18 Write unit tests for Resource Allocation and Strategy
    - Test resource allocation view renders correct budget distribution per subsidiary
    - Test allocation adjustment propagates changes to portfolio strategy service
    - Test strategic priorities panel displays portfolio thesis and per-subsidiary strategies
    - Test risk factors and key actions render with correct priority ordering
    - Test data sourced from portfolio-dashboard.ts service
    - _Requirements: 46i.22-46i.23, 46j.24-46j.25, 21.1_

  - [x] 23.19 Implement Eretz Command Center WebSocket Integration and Data Layer
    - Create `packages/dashboard/src/services/command-center-ws.ts` with CommandCenterWebSocket interface
    - Implement WebSocket subscriptions for: metrics updates, decline alerts, recommendation changes, synergy updates
    - Implement action dispatchers: approveRecommendation, rejectRecommendation, modifyRecommendation, updateResourceAllocation
    - Ensure all displayed data sources from existing Eretz services (no business logic duplication)
    - Verify Command Center is presentation layer only (Requirement 46k.26, 46k.27)
    - _Requirements: 46a.3, 46k.26, 46k.27_

  - [x] 23.20 Write unit tests for Command Center WebSocket Integration
    - Test WebSocket subscriptions receive and dispatch correct event types
    - Test metrics update handler refreshes portfolio overview in real-time
    - Test alert push handler displays new alerts without page refresh
    - Test recommendation action dispatchers send correct payloads to backend
    - Test resource allocation updates propagate through WebSocket
    - Test no business logic duplication — all data from existing services
    - _Requirements: 46a.3, 46k.26-46k.27, 21.1_

  - [x] 23.21 Deploy updated dashboard to S3
    - Build the dashboard package (`packages/dashboard`) with production configuration
    - Upload built assets to the existing S3 bucket (from Phase 4, task 7.5 CloudFront/S3 hosting)
    - Invalidate CloudFront distribution cache to serve updated dashboard immediately
    - Verify new ZionX Studio pipeline view and Eretz Command Center tab are accessible via CloudFront URL
    - _Requirements: 45e.16, 46a.1_

  - [x] 23.22 Write integration tests for Phase 11 end-to-end
    - Test full ideation flow: market research → niche scoring → idea generation → pipeline ranking → King clicks Generate → app enters ZionX Studio flow → King clicks Publish
    - Test manual idea flow: King creates idea via chat → idea added to pipeline → same Generate → Publish flow
    - Test pipeline maintenance: stale ideas pruned after 30 days, re-scoring updates rankings
    - Test learning loop: published app performance → outcome stored → scoring weights updated → next cycle uses learnings
    - Test Eretz Command Center loads all sections with live data from Eretz services
    - Test Command Center real-time updates: metric change → WebSocket push → dashboard updates without refresh
    - Test recommendation workflow: recommendation submitted → appears in queue → King approves → execution triggered
    - Test decline alert flow: metric drops below threshold → alert generated → pushed to Command Center → King acknowledges
    - Test resource allocation: King adjusts allocation → change propagated to portfolio strategy
    - Test hook integration: `app.idea.researched`, `app.idea.ranked`, `app.pipeline.updated` emit correctly through Event Bus
    - _Requirements: 45a-45f, 46a-46k, 21.2_

- [x] 24. Checkpoint — Phase 11 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Market Research Engine scans App Store and Play Store categories and stores findings in Zikaron, Niche Scoring Algorithm produces normalized 0-100 scores with per-factor breakdown and learning-based weight adjustment, App Idea Pipeline Manager maintains ranked ideas from both autonomous and manual sources with correct status transitions, Ideation Learning tracks outcomes and calibrates scoring weights, ZionX Studio UI shows pipeline view alongside chat with Generate buttons and filters, Eretz Business Command Center renders as full-page dedicated tab with portfolio overview and per-subsidiary cards, Synergy Map visualizes active synergies with revenue impact, Pattern Library Browser provides searchable patterns with adoption metrics, Training Cascade shows per-subsidiary quality trends, Recommendation Queue supports approve/reject/modify actions, Decline Alerts display in real-time via WebSocket push, Resource Allocation view allows King to adjust budget distribution, Strategic Priorities display portfolio thesis and per-subsidiary strategies, all hooks emit through Event Bus, dashboard deployed to S3 with CloudFront cache invalidation

- [x] 25. Phase 12 — Dashboard UX Enhancements (Original Seraphim Integration)

  - [x] 25.1 Implement King's Briefing Card on King's View tab
    - Create `packages/dashboard/src/components/kings-view/BriefingCard.tsx` with KingsBriefingCard interface
    - Implement instant state recovery card showing: current top 3 priorities, active blockers (count + severity), revenue status (MRR + trend), and key events since last login
    - Implement session continuity indicator showing when the system lost context and recovered (gap detection)
    - Implement "since last login" timestamp with relative time display
    - Pull data from portfolio-dashboard.ts (revenue), recommendation queue (blockers), and Event Bus (recent events)
    - Auto-refresh via WebSocket on `portfolio.metrics_updated` events
    - Place as the first/top component on the King's View tab
    - _Requirements: 46a.1, 9.1_

  - [x] 25.2 Write unit tests for King's Briefing Card
    - Test briefing card renders priorities, blockers, revenue, and recent events
    - Test session continuity indicator shows gap when detected
    - Test "since last login" displays correct relative time
    - Test WebSocket updates refresh the card in real-time
    - Test empty states (no blockers, no events since last login)

  - [x] 25.3 Implement Visual Pipeline Progress on ZionX Pipeline tab
    - Create `packages/dashboard/src/components/app-studio/VisualPipelineBoard.tsx` with VisualPipelineBoard interface
    - Implement horizontal Kanban-style pipeline visualization with columns: Ideation → Market Research → Development → Testing → Gate Review → Submission → In Review → Live → Marketing → Revenue Optimizing
    - Implement app cards that move between columns showing: app name, days in stage, gate check status (e.g., "67/70 passed, 3 warnings"), and health indicator
    - Implement gate checkpoint markers between columns showing pass/fail counts per gate
    - Implement click-to-expand on any app card for full detail view
    - Implement drag-and-drop reordering within columns (priority ordering)
    - Connect to ZionX agent program state machine for real-time position data
    - Place on the existing `zionx-pipeline` nav view
    - _Requirements: 11.1, 11.2, 2.1_

  - [x] 25.4 Write unit tests for Visual Pipeline Progress
    - Test pipeline renders all stage columns with correct app cards
    - Test gate checkpoint markers show pass/fail counts
    - Test app card click expands to detail view
    - Test cards move between columns on state transition events
    - Test drag-and-drop reorders within a column

  - [x] 25.5 Implement Rejection Crisis View on ZionX Pipeline tab
    - Create `packages/dashboard/src/components/app-studio/RejectionCrisisPanel.tsx` with RejectionCrisisPanel interface
    - Implement crisis panel that activates when any app enters "rejected" state
    - Display: rejection reason (from App Store/Play Store driver), root cause analysis, fix status checklist, resubmission timeline estimate
    - Implement fix progress tracker: each rejection issue as a checklist item with status (pending → in progress → fixed → verified)
    - Implement "Resubmit" action button (requires King approval via Mishmar)
    - Show historical rejections with resolution time for pattern learning
    - Integrate below the Visual Pipeline Board on the same `zionx-pipeline` view — only visible when an app is in rejected state
    - _Requirements: 11.3, 11.4, 2.3_

  - [x] 25.6 Write unit tests for Rejection Crisis View
    - Test crisis panel appears when app enters rejected state
    - Test rejection reason and root cause display correctly
    - Test fix checklist tracks progress per issue
    - Test resubmission timeline estimate calculates from fix progress
    - Test panel hides when no apps are in rejected state
    - Test historical rejections display with resolution times

  - [x] 25.7 Implement Market Opportunity Heatmap on ZionX Pipeline tab
    - Create `packages/dashboard/src/components/app-studio/MarketHeatmap.tsx` with MarketOpportunityHeatmap interface
    - Implement bubble chart heatmap: X-axis = app categories, Y-axis = revenue potential tier, bubble size = gap opportunity score (inverse competition × review gap)
    - Implement color coding: green = high opportunity, yellow = moderate, red = saturated
    - Implement click-on-bubble to drill into specific niche details (competitors, review gaps, estimated downloads)
    - Implement filter controls: minimum revenue threshold, maximum competition level, category filter
    - Pull data from Market Research Engine and Niche Scoring Algorithm
    - Place as a collapsible section on the `zionx-pipeline` view below the pipeline board
    - _Requirements: 45a.1, 45b.5_

  - [x] 25.8 Write unit tests for Market Opportunity Heatmap
    - Test heatmap renders bubbles with correct positioning (category × revenue tier)
    - Test bubble size correlates with opportunity score
    - Test color coding reflects opportunity level
    - Test click-on-bubble shows niche detail drill-down
    - Test filters narrow displayed bubbles correctly
    - Test empty state when no opportunities match filters

  - [x] 25.9 Implement Content Diversity Dashboard on ZXMG Content Pipeline tab
    - Create `packages/dashboard/src/components/video-studio/ContentDiversityDashboard.tsx` with ContentDiversityDashboard interface
    - Implement visual grid showing usage history: avatars used (with thumbnail), voices used (with sample label), styles/backgrounds used, and music tracks used
    - Implement duplicate detection highlighting: if an avatar/voice/background was used in the last 5 videos, highlight it in red with "Used X videos ago" label
    - Implement diversity score per channel (0-100) based on variety across last 20 videos
    - Implement "Suggest Alternative" button that recommends unused combinations
    - Pull data from Zikaron procedural memory (video production history)
    - Place on the existing `zxmg-content-pipeline` nav view as a collapsible panel
    - _Requirements: 44b.7, 44f.30_

  - [x] 25.10 Write unit tests for Content Diversity Dashboard
    - Test grid renders all used avatars, voices, styles, and music
    - Test duplicate detection highlights recently-used elements in red
    - Test diversity score calculates correctly from last 20 videos
    - Test "Suggest Alternative" returns unused combinations
    - Test per-channel diversity tracking (each channel independent)

  - [x] 25.11 Implement Pre-Generation Compliance Check on ZXMG Video Production tab
    - Create `packages/dashboard/src/components/video-studio/PreGenerationCheck.tsx` with PreGenerationComplianceCheck interface
    - Implement modal/panel that appears before any video render is triggered
    - Display checklist: avatar diversity check (✓/✗), voice diversity check (✓/✗), background diversity check (✓/✗), style diversity check (✓/✗)
    - If any check fails, show warning with suggestion: "This avatar was used 2 videos ago. Suggested alternatives: [list]"
    - Implement "Override" button (King can proceed anyway) and "Accept Suggestion" button (auto-swap)
    - Integrate with the existing Video Production Pipeline — fires before scene rendering begins
    - Place on the existing `zxmg-video-production` nav view as a pre-render gate
    - _Requirements: 44b.7, 44c.12_

  - [x] 25.12 Write unit tests for Pre-Generation Compliance Check
    - Test compliance check appears before render trigger
    - Test all diversity checks display pass/fail correctly
    - Test failed check shows specific suggestion with alternative
    - Test "Override" proceeds with original selection
    - Test "Accept Suggestion" swaps to recommended alternative
    - Test all-pass state shows green confirmation and auto-proceeds

  - [x] 25.13 Implement End-to-End Production Tracker on ZXMG Video Production tab
    - Create `packages/dashboard/src/components/video-studio/ProductionTracker.tsx` with EndToEndProductionTracker interface
    - Implement horizontal timeline per video showing journey: Script → Scenes → Render → Assemble → Review → Publish → Distribute → Live
    - Implement status dots per stage: gray (pending), blue (in progress), green (complete), red (failed)
    - Implement time-in-stage display showing how long each step took
    - Implement upload queue view showing pending platform uploads with connection health per platform (YouTube, TikTok, Instagram, etc.)
    - Implement platform connection status indicators (connected/disconnected/rate-limited)
    - Note: Production uses our own Multi-Model Video Router (not HeyGen) — reflect internal pipeline stages
    - Place on the existing `zxmg-video-production` nav view alongside the existing timeline editor
    - _Requirements: 44b.7, 44g.35, 44g.36_

  - [x] 25.14 Write unit tests for End-to-End Production Tracker
    - Test timeline renders all stages with correct status dots
    - Test time-in-stage calculates duration correctly
    - Test upload queue shows pending uploads per platform
    - Test platform connection health indicators reflect driver status
    - Test failed stage shows red dot with error details on hover
    - Test completed videos show full green timeline

  - [x] 25.15 Implement Intelligence Feed on Eretz Command Center
    - Create `packages/dashboard/src/components/command-center/IntelligenceFeed.tsx` with IntelligenceFeed interface
    - Implement real-time scrolling feed of agent-generated insights: problems detected, improvement suggestions, and observations from all subsidiaries
    - Implement priority badges (critical/high/medium/low) with color coding
    - Implement source agent label showing which agent generated the insight
    - Implement King actions per insight: approve (trigger execution), dismiss, bookmark for later
    - Implement "Compounding Intelligence Score" — total insights generated, acted on, and measured impact over time
    - Pull from Event Bus events and Zikaron procedural memory
    - Place on the Eretz Command Center page as a new section between Recommendations and Decline Alerts
    - _Requirements: 46g.15, 46a.1_

  - [x] 25.16 Write unit tests for Intelligence Feed
    - Test feed renders insights with priority badges and source agent
    - Test approve action triggers execution workflow
    - Test dismiss removes from feed
    - Test bookmark persists for later review
    - Test compounding score calculates correctly (generated vs acted on vs impact)
    - Test real-time updates via WebSocket push new insights to feed

  - [x] 25.17 Implement Standing Orders Panel on Eretz Command Center
    - Create `packages/dashboard/src/components/command-center/StandingOrdersPanel.tsx` with StandingOrdersPanel interface
    - Implement persistent directives display: order text, assigned agent, status (active/completed/cancelled), creation date, completion date
    - Implement King actions: add new order (text input + agent assignment), modify existing order, cancel order
    - Implement completion tracking: show progress percentage and last activity timestamp per order
    - Store orders in Zikaron working memory with XO_Audit logging for all changes
    - Place on the Eretz Command Center page in the strategy section (alongside Strategic Priorities)
    - _Requirements: 46j.24, 46g.15_

  - [x] 25.18 Write unit tests for Standing Orders Panel
    - Test panel renders active orders with correct status and assigned agent
    - Test add new order creates entry with correct metadata
    - Test modify updates order text and logs to audit
    - Test cancel marks order as cancelled (not deleted)
    - Test completion tracking shows progress percentage
    - Test completed orders move to history section

  - [x] 25.19 Build dashboard and deploy to S3
    - Build the dashboard package with production configuration
    - Upload built assets to `seraphim-dashboard-live` S3 bucket
    - Verify all new components render correctly on their respective tabs
    - _Requirements: 15.1_

  - [x] 25.20 Write integration tests for Phase 12 end-to-end
    - Test King's View tab loads briefing card with live data
    - Test ZionX Pipeline tab shows visual pipeline + rejection crisis + market heatmap
    - Test ZXMG Content Pipeline tab shows diversity dashboard
    - Test ZXMG Video Production tab shows compliance check + production tracker
    - Test Eretz Command Center shows intelligence feed + standing orders
    - Test all new components integrate with existing WebSocket infrastructure
    - Test all new components source data from existing services (no business logic duplication)

- [x] 26. Checkpoint — Phase 12 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: King's Briefing Card shows priorities/blockers/revenue/events on King's View tab, Visual Pipeline Board displays Kanban-style app progression with gate checkpoints on ZionX Pipeline tab, Rejection Crisis Panel activates on rejected apps with fix tracking, Market Opportunity Heatmap shows clickable bubble chart on ZionX Pipeline tab, Content Diversity Dashboard tracks avatar/voice/style usage with duplicate detection on ZXMG Content Pipeline tab, Pre-Generation Compliance Check gates video renders with diversity verification, End-to-End Production Tracker shows full video journey from script to live, Intelligence Feed displays real-time agent insights with King actions on Eretz Command Center, Standing Orders Panel manages persistent directives, dashboard deployed to S3


- [x] 27. Phase 13 — Seraphim Core Architecture Views (Dashboard Integration)

  - [x] 27.1 Implement Diagram Renderer (SVG generation engine)
    - Create `packages/dashboard/src/views/seraphim-core/diagram-renderer.ts` with DiagramRenderer class
    - Implement SVG generation from structured diagram definitions (nodes, connections, layers, labels)
    - Implement WCAG 2.1 AA compliant color palette: Interface (#DBEAFE/#1E3A5F), Kernel (#7C3AED/#FFF), System Services (#059669/#FFF), Application (#F59E0B/#451A03), Driver (#475569/#FFF), Data (#4338CA/#FFF)
    - Implement connection line rendering with distinct colors per flow type: Command (#DC2626 solid), Data (#2563EB solid), Event (#16A34A dashed), Information (#9333EA dotted)
    - Implement responsive SVG scaling (viewBox-based) to fit available content area width
    - _Requirements: 47b.4, 47c.8, 47i.33, 47i.34, 47i.35, 47i.36, 47j.37_

  - [x] 27.2 Write unit tests for Diagram Renderer
    - Test SVG output contains correct color values for each architectural layer
    - Test connection lines use correct colors and styles per flow type
    - Test text labels meet WCAG 2.1 AA contrast ratio (4.5:1)
    - Test SVG scales proportionally via viewBox without horizontal scrolling
    - Test all nodes and connections from diagram definitions are rendered
    - _Requirements: 47i.33, 47i.34, 47i.35, 47i.36, 19.1_

  - [x] 27.3 Implement OV-1 Operational View diagram definition and view
    - Create `packages/dashboard/src/views/seraphim-core/diagram-definitions/ov1-definition.ts` with INCOSE OV-1 structure: King actor, Seraphim orchestrator, operational pillars (Eretz, ZionX, ZXMG, Zion Alpha, Otzar), external systems, and information flows
    - Create `packages/dashboard/src/views/seraphim-core/ov1-view.ts` extending base view class
    - Render OV-1 diagram using DiagramRenderer with all actors, pillars, and flows
    - Ensure text labels are legible at default zoom level
    - _Requirements: 47b.4, 47b.5, 47b.6, 47b.7_

  - [x] 27.4 Implement SV-1 System View diagram definition and view
    - Create `packages/dashboard/src/views/seraphim-core/diagram-definitions/sv1-definition.ts` with INCOSE SV-1 structure: 6 architectural layers with all components, inter-layer connections with directional indicators and labels
    - Create `packages/dashboard/src/views/seraphim-core/sv1-view.ts` extending base view class
    - Render SV-1 diagram using DiagramRenderer with layered layout, component boxes, and labeled connections
    - Ensure text labels are legible at default zoom level
    - _Requirements: 47c.8, 47c.9, 47c.10, 47c.11, 47c.12_

  - [x] 27.5 Implement Diagram Modal with Pan/Zoom Controller
    - Create `packages/dashboard/src/views/seraphim-core/diagram-modal.ts` with full-viewport overlay
    - Create `packages/dashboard/src/views/seraphim-core/pan-zoom-controller.ts` with PanZoomController class
    - Implement zoom: mouse wheel (centered on cursor), pinch gesture, +/- buttons, range 0.25x–4x
    - Implement pan: click-and-drag, touch-and-drag
    - Implement zoom percentage indicator display
    - Implement close: Escape key, close button, backdrop click
    - Implement smooth open/close animations (200ms)
    - _Requirements: 47d.13, 47d.14, 47d.15, 47d.16, 47d.17, 47d.18_

  - [x] 27.6 Write unit tests for Diagram Modal and Pan/Zoom
    - Test modal opens on diagram click with correct SVG content
    - Test zoom in/out via mouse wheel stays within 0.25x–4x bounds
    - Test pan via drag updates translate values
    - Test Escape key closes modal
    - Test close button closes modal
    - Test zoom percentage indicator updates on zoom change
    - Test pinch gesture triggers zoom (touch events)
    - _Requirements: 47d.13, 47d.14, 47d.15, 47d.16, 47d.17, 47d.18, 19.1_

  - [x] 27.7 Implement Markdown Renderer
    - Create `packages/dashboard/src/views/seraphim-core/markdown-renderer.ts` with MarkdownRenderer class
    - Integrate `marked` library for markdown → HTML parsing
    - Integrate `highlight.js` for code block syntax highlighting
    - Integrate `mermaid` library for mermaid diagram block rendering (design.md)
    - Apply dashboard-consistent styling: headings, lists, tables (striped), bold, code blocks (rounded with copy button)
    - Constrain content width to max 900px centered in available space
    - _Requirements: 47e.20, 47f.23, 47g.26, 47j.40_

  - [x] 27.8 Implement Requirements, Design, and Capabilities document views
    - Create `packages/dashboard/src/views/seraphim-core/requirements-view.ts` extending base view class
    - Create `packages/dashboard/src/views/seraphim-core/design-view.ts` extending base view class
    - Create `packages/dashboard/src/views/seraphim-core/capabilities-view.ts` extending base view class
    - Each view: fetch markdown from Document API on mount, render via MarkdownRenderer, display error message if unavailable
    - _Requirements: 47e.19, 47e.21, 47f.22, 47f.24, 47g.25, 47g.27_

  - [x] 27.9 Implement Document API endpoint
    - Create `GET /api/specs/:documentType` endpoint in Shaar API layer
    - Serve raw markdown content from `.kiro/specs/seraphim-os-core/` directory
    - Include `lastModified` timestamp and SHA-256 content hash in response
    - Support `documentType` values: `requirements`, `design`, `capabilities`
    - _Requirements: 47e.19, 47f.22, 47g.25_

  - [x] 27.10 Implement Auto-Sync Service (WebSocket-based real-time updates)
    - Create `packages/dashboard/src/views/seraphim-core/auto-sync-handler.ts` with AutoSyncHandler class
    - Implement backend file watcher on `.kiro/specs/seraphim-os-core/` directory (chokidar/fs.watch)
    - On file change: compute content hash → publish `spec.document.updated` event to Event Bus → push via WebSocket
    - Frontend: listen for `spec.document.updated` WebSocket messages → compare hash → re-fetch if changed → re-render active view
    - Target: < 5 seconds from file save to dashboard update
    - _Requirements: 47h.28, 47h.29, 47h.30, 47h.31, 47h.32_

  - [x] 27.11 Write unit tests for Auto-Sync and Document Views
    - Test document views fetch and render markdown content on mount
    - Test error state displays when document is unavailable
    - Test WebSocket `spec.document.updated` message triggers re-fetch
    - Test re-render occurs without navigation change
    - Test content hash comparison prevents unnecessary re-renders
    - _Requirements: 47e.19, 47e.21, 47h.28, 47h.31, 47h.32, 19.1_

  - [x] 27.12 Implement Navigation Integration
    - Register 5 new navigation items under Seraphim Core section in sidebar: "OV-1 Operational", "SV-1 System", "Requirements", "Design", "Capabilities"
    - Position after existing items (Command Center, Governance, Memory, Resources, Audit Trail, Learning, Self-Improvement, Decisions)
    - Implement active tab highlighting on navigation click
    - Implement responsive layout: vertical stacking below 768px viewport width
    - _Requirements: 47a.1, 47a.2, 47a.3, 47j.38_

  - [x] 27.13 Write integration tests for Phase 13 end-to-end
    - Test all 5 navigation items appear under Seraphim Core section in correct order
    - Test OV-1 view renders color SVG with all actors, pillars, and flows
    - Test SV-1 view renders color SVG with 6 layers and connections
    - Test clicking diagram opens modal with pan/zoom functionality
    - Test Requirements view renders markdown from requirements.md
    - Test Design view renders markdown with mermaid diagrams from design.md
    - Test Capabilities view renders markdown from capabilities.md
    - Test auto-sync updates active view when source document changes
    - Test responsive layout stacks vertically below 768px
    - _Requirements: 47a-47j, 19.2_

  - [x] 27.14 Build dashboard and deploy to S3
    - Build the dashboard package with production configuration
    - Upload built assets to `seraphim-dashboard-live` S3 bucket
    - Verify all 5 new views render correctly on the Seraphim Core section
    - _Requirements: 15.1_

- [x] 28. Checkpoint — Phase 13 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: OV-1 Operational View renders INCOSE-standard color SVG with King/Seraphim/Pillars/External Systems and labeled flows, SV-1 System View renders INCOSE-standard color SVG with 6 architectural layers and component connections, Diagram Modal opens on click with pan/zoom (0.25x–4x) and percentage indicator, Requirements/Design/Capabilities views render live markdown with proper styling, Design view renders mermaid diagrams, Auto-Sync propagates document changes to active views within 5 seconds via WebSocket, all color combinations meet WCAG 2.1 AA contrast ratio, responsive layout works on mobile, navigation items positioned correctly under Seraphim Core section, dashboard deployed to S3

- [x] 29. Phase 14 — Persistent Agent Identity and Memory-Backed Conversations
  - [x] 29.1 Define AgentIdentityProfile interface and update AgentProgram type
    - Add `identityProfile` field to the `AgentProgram` interface in `packages/core/src/types/agent.ts`
    - Define `AgentIdentityProfile` interface with: name, role, hierarchyPosition, personality (tone, verbosity, proactivity, formality), expertise, domainLanguage, decisionPrinciples, relationships, neverBreakCharacter, identityReinforcement
    - Update all existing agent program definitions in `production-server.ts` with full identity profiles for: Seraphim, Eretz, ZionX, ZXMG, Zion Alpha, Mishmar, Otzar
    - _Requirements: 48a.1, 48a.2, 48g.26, 48g.27_

  - [x] 29.2 Implement conversation persistence in the Agent Runtime execute flow
    - Modify `executeChatTask()` in `packages/core/src/agent-runtime/runtime.ts` to store every user message + agent response as an episodic memory entry in Zikaron with tags: `conversation`, `dashboard`, `{agentId}`, `{userId}`
    - Before calling the LLM, query Zikaron for the last 20 conversation exchanges for this agent-user pair
    - Format loaded conversation history as alternating user/assistant messages in the LLM messages array
    - If conversation history exceeds context window budget, use vector search for most semantically relevant past conversations
    - _Requirements: 48b.5, 48b.6, 48b.7, 48b.8, 48b.9_

  - [x] 29.3 Implement identity-aware system prompt assembly
    - Create `packages/core/src/agent-runtime/prompt-builder.ts` that assembles the full system prompt from: identity profile + personality directives + decision principles + character enforcement
    - The system prompt MUST include: "You ARE {name}. You NEVER identify as Claude, GPT, or any generic AI assistant. You NEVER break character."
    - Include the agent's relationships to other agents and its position in the hierarchy
    - Include relevant procedural memory (top 5 patterns by success rate) as "institutional knowledge"
    - _Requirements: 48a.2, 48a.3, 48g.27, 48d.14_

  - [x] 29.4 Implement working memory persistence (60-second interval + task completion)
    - Add a periodic persistence timer (60s) to the Agent Runtime that serializes each agent's working memory and stores it in Zikaron
    - On task completion, immediately persist working memory with updated context (topics discussed, recent decisions, active goals)
    - On agent startup, call `Zikaron.loadAgentContext(agentId)` and verify the loaded state matches the last persisted hash
    - Add `session_continuity` record tracking: last active timestamp, persistence hash, session transitions
    - _Requirements: 48c.10, 48c.11, 48c.12, 48c.13_

  - [x] 29.5 Implement memory-backed decision support
    - Before any agent decision/recommendation, query Zikaron procedural memory for past decisions in similar contexts
    - After each decision, store the decision context, reasoning, and (later) outcome in episodic memory with `decision` tag
    - Track decision patterns in procedural memory with success rates (updated when outcomes are known)
    - When a decision contradicts a stored successful pattern, include acknowledgment in the response
    - _Requirements: 48d.14, 48d.15, 48d.16, 48d.17_

  - [x] 29.6 Implement governance-compliant memory access
    - Add Mishmar authorization checks to all Zikaron read/write operations in the runtime
    - Enforce: own memories = L4 (autonomous), cross-agent reads = L3, shared semantic writes = L3, identity modifications = L1
    - Log all memory access operations to XO Audit (key/tag only, never full content for privacy)
    - Store King's conversations with L1 authority metadata, making them accessible to all agents within the tenant
    - Enforce append-only policy: attempted deletions are blocked and logged as security events
    - _Requirements: 48e.18, 48e.19, 48e.20, 48e.21_

  - [x] 29.7 Implement inter-agent knowledge sharing via Event Bus
    - When an agent stores a new procedural pattern or semantic fact, publish `memory.knowledge_shared` event to Event Bus with relevance tags
    - Create a Lambda handler that processes `memory.knowledge_shared` events and indexes them for cross-agent retrieval
    - When an agent loads context, include relevant shared knowledge from other agents (filtered by pillar/domain tags)
    - When responding about a topic another agent has expertise in, query cross-agent semantic memory and acknowledge the source
    - _Requirements: 48f.22, 48f.23, 48f.24, 48f.25_

  - [x] 29.8 Write unit tests for persistent identity and memory-backed conversations
    - Test identity profile is loaded into system prompt and character is maintained
    - Test conversation history is stored and retrieved correctly (last 20 exchanges)
    - Test working memory persistence at 60s intervals and on task completion
    - Test cross-session continuity (simulate container restart, verify context restored)
    - Test memory-backed decisions query procedural memory before responding
    - Test governance enforcement (L4 own access, L3 cross-agent, L1 identity changes)
    - Test inter-agent knowledge sharing publishes and consumes events correctly
    - Test append-only enforcement (deletion attempts blocked and logged)
    - _Requirements: 48a-48g, 19.1_

  - [x] 29.9 Write integration tests for end-to-end conversation flow
    - Test full flow: user sends message → history loaded → LLM called with context → response stored → next message includes previous exchange
    - Test agent maintains character across 10+ consecutive messages
    - Test conversation persists across simulated container restart
    - Test cross-agent memory query returns relevant results with proper authorization
    - Test knowledge sharing event propagates to subscribing agents
    - _Requirements: 48a-48g, 19.2_

  - [x] 29.10 Update production server with full identity profiles and deploy
    - Update all 7 agent program definitions with comprehensive identity profiles
    - Build Docker image with all changes
    - Push to ECR and force ECS redeployment
    - Verify agents respond in character with conversation continuity on the live dashboard
    - _Requirements: 48a.1, 48a.2, 15.1_

  - [x] 29.11 Add agent detail panel to Command Center dashboard
    - Create a clickable agent card in the Command Center that opens a detail panel/modal
    - Display full agent identity: name, role, personality traits, expertise areas, decision principles, authority level, relationships to other agents
    - Show agent status: current state, last heartbeat, active tasks, memory stats (episodic count, procedural patterns, working memory utilization)
    - Show recent activity: last 5 conversations, last 5 decisions, last 5 governance events
    - Include a "Chat with Agent" button that navigates to the agent's pillar chat view
    - Style consistently with the existing dashboard dark theme
    - _Requirements: 48a.1, 48g.26, 18.1, 18.5_

- [ ] 30. Checkpoint — Phase 14 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Each agent responds in character and never breaks identity, conversation history persists across messages, working memory survives container restarts, agents reference past conversations naturally, governance controls memory access appropriately, knowledge sharing propagates between agents, King's interactions are accessible to all agents as institutional knowledge


- [x] 31. Phase 15 — Agentic Execution Core
  - [x] 31.1 Implement Cognition Envelope Builder
    - Create `packages/core/src/agent-runtime/cognition-envelope.ts` implementing the `CognitionEnvelope` interface
    - Assemble full context before every LLM call: identity, authority, memory, tools, workflow state, goals, delegation policy
    - Modify `executeChatTask()` to use the Cognition Envelope instead of raw system prompt assembly
    - Add validation that blocks LLM calls without a complete envelope (log violation to XO_Audit)
    - _Requirements: 49.1, 49.2, 49.3, 49.4, 55.1_

  - [x] 31.2 Implement Planning Engine
    - Create `packages/core/src/agent-runtime/planning-engine.ts` implementing the `ExecutionPlan` interface
    - When an agent receives a complex directive, generate a structured plan with subtasks, tools, agents, dependencies, gates, and budget
    - Persist plans in Zikaron working memory for resumability
    - Implement dynamic plan revision when steps fail
    - Submit plans requiring L1/L2 actions to Mishmar for pre-approval
    - _Requirements: 50.1, 50.2, 50.3, 50.4, 50.5_

  - [x] 31.3 Implement MCP Tool Registry and Dynamic Selection
    - Create `packages/core/src/mcp/tool-registry.ts` with the `MCPToolDescriptor` interface
    - Implement semantic tool discovery (match task needs to tool capabilities)
    - Implement tool selection engine: cost, reliability, permissions, availability
    - Implement automatic fallback on tool failure
    - Integrate with Mishmar (authorization) and Otzar (cost tracking) before every tool invocation
    - _Requirements: 51.1, 51.2, 51.3, 51.4, 51.5, 51.6, 51.7_

  - [x] 31.4 Implement A2A Delegation Engine
    - Create `packages/core/src/agent-runtime/delegation-engine.ts` implementing `DelegationRequest` and `DelegationResult`
    - Implement delegation dispatch: initiating agent publishes request, target agent processes and returns result
    - Implement result aggregation and conflict resolution
    - Enforce Mishmar authorization on all delegation flows
    - Log all delegation steps to XO_Audit with full traceability
    - _Requirements: 52.1, 52.2, 52.3, 52.4, 52.5, 52.7_

  - [x] 31.5 Implement Autonomy Mode Configuration
    - Create `packages/core/src/agent-runtime/autonomy-config.ts` implementing `AutonomyConfig`
    - Support Crawl/Walk/Run modes per agent and per workflow type
    - Implement human gate pausing in Crawl and Walk modes (publish approval request to Shaar)
    - Implement dynamic autonomy escalation based on success history
    - Configure ZionX default=Walk (gated submission) and ZXMG default=Walk (gated publishing)
    - _Requirements: 53.1, 53.2, 53.3, 53.4, 53.5, 53.6, 53.7, 53.8_

  - [x] 31.6 Implement Execution Trace System
    - Create `packages/core/src/agent-runtime/execution-trace.ts` implementing `ExecutionTrace`
    - Capture full trace for every agent action: plan, tools, delegations, memory, governance, budget, actions, synthesis
    - Persist traces in XO_Audit (DynamoDB) for retrieval
    - Make traces machine-readable (JSON) for Learning Engine analysis
    - _Requirements: 54.1, 54.2, 54.4, 54.5_

  - [x] 31.7 Implement Anti-Chatbot Enforcement Guards
    - Add runtime guards that block direct LLM calls without Cognition Envelope
    - Add guards that warn/block when memory retrieval is skipped
    - Add guards that block tool invocations without Mishmar/Otzar checks
    - Add CI test that verifies different agent envelopes produce different behavior from same LLM key
    - _Requirements: 55.1, 55.2, 55.3, 55.5, 55.6_

  - [x] 31.8 Add Execution Trace view to Shaar dashboard
    - Create execution trace timeline component showing each step with inputs/outputs/duration
    - Display active plans with current execution state in the agent detail panel
    - Show delegation chains (which agents are working on what)
    - Show autonomy mode indicator per agent
    - _Requirements: 49.4, 50.6, 52.6, 54.3_

  - [x] 31.9 Write unit tests for Agentic Execution Core
    - Test Cognition Envelope assembly includes all required components
    - Test Planning Engine generates valid plans with dependencies
    - Test MCP tool selection picks optimal tool by cost/reliability
    - Test A2A delegation dispatches and aggregates correctly
    - Test autonomy modes gate appropriately (Crawl pauses, Walk gates, Run executes)
    - Test execution traces capture all steps
    - Test anti-chatbot guards block direct LLM calls
    - _Requirements: 49-55, 19.1_

  - [x] 31.10 Write integration tests for end-to-end agentic workflows
    - Test: Seraphim receives directive → creates plan → delegates to ZionX → ZionX invokes MCP tools → returns result → Seraphim synthesizes
    - Test: ZionX plans app build → selects tools → persists workflow state → resumes after simulated restart
    - Test: MCP tool fails → agent attempts fallback → logs decision
    - Test: Same LLM key produces different behavior through different agent envelopes
    - _Requirements: 49-55, 19.2_

- [ ] 32. Checkpoint — Phase 15 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Cognition Envelope assembled before every LLM call, Planning Engine generates structured plans, MCP tools selected dynamically with fallback, A2A delegation works end-to-end, autonomy modes gate correctly, execution traces visible in Shaar, anti-chatbot guards prevent degradation

- [x] 33. Phase 16 — Persistent Chat Sessions with History
  - [x] 33.1 Add conversation session endpoints to the backend
    - Add `GET /api/agents/:id/conversations` — returns list of all sessions (id, startedAt, messageCount, preview) + current session messages
    - Add `GET /api/agents/:id/conversations/:sessionId` — returns all messages for a specific past session
    - Add `POST /api/agents/:id/conversations/new` — archives current session, creates new one
    - Store sessions in Zikaron with tags: `session`, `{agentId}`, `{sessionId}`
    - Each message stored with `sessionId` metadata for retrieval
    - _Requirements: 56.7, 56.8_

  - [x] 33.2 Update executeChatTask to tag messages with session IDs
    - Maintain a current sessionId per agent (stored in working memory)
    - When storing conversation exchanges in Zikaron, include `sessionId` in metadata
    - On agent deploy, create initial session ID
    - _Requirements: 56.3, 56.7_

  - [x] 33.3 Implement conversation loading on dashboard mount
    - Modify `BasePillarView.mount()` to call `GET /api/agents/:id/conversations` on load
    - Parse response and populate the messages array with the current session's messages
    - Display all messages immediately (no "welcome" message if history exists)
    - _Requirements: 56.1, 56.2_

  - [x] 33.4 Add conversation history sidebar to the chat UI
    - Add a collapsible sidebar to the left of the chat area showing past sessions
    - Each entry shows: date, first message preview (truncated), message count
    - Clicking a past session loads it in read-only mode (grayed input, "Viewing archived chat" label)
    - "Back to current" button returns to the active session
    - "New Chat" button at the top archives current and starts fresh
    - _Requirements: 56.4, 56.5, 56.6_

  - [x] 33.5 Implement auto-archival at 100 messages
    - When a session reaches 100 messages, automatically archive and start new session
    - Copy last 5 messages as context into the new session for continuity
    - Show a system message: "Previous conversation archived. Continuing with context."
    - _Requirements: 56.9_

  - [x] 33.6 Write tests and deploy
    - Test: conversation loads on mount from backend
    - Test: messages persist across simulated refresh
    - Test: new chat archives current session
    - Test: past sessions are browsable
    - Test: auto-archive at 100 messages
    - Build dashboard and Docker image
    - Push to ECR, update ECS, sync S3
    - _Requirements: 56.1-56.9, 19.1_

- [ ] 34. Checkpoint — Phase 16 complete
  - Verify: conversations persist across refresh/tab switch, history sidebar shows past sessions, new chat archives correctly, auto-archive works at 100 messages, all data stored in Zikaron

- [ ] 35. Phase 17 — Agent-to-Kiro Execution Bridge
  - [x] 35.1 Create .kiro/agent-tasks/ directory structure and README
    - Created directories: agent-tasks/, agent-tasks/completed/, agent-tasks/failed/
    - Created TEMPLATE.md showing the task file format
    - _Requirements: 57b.5, 57b.7_

  - [x] 35.2 Create Kiro hook for task file detection
    - Created `agent-task-dispatch` hook watching `.kiro/agent-tasks/*.md` for new files
    - Hook triggers askAgent to read and execute the task
    - _Requirements: 57b.6_

  - [x] 35.3 Add task dispatch endpoint to backend
    - Added `POST /api/agent-tasks/dispatch` endpoint that writes task files
    - Accepts: title, description, agent, instructions, criteria
    - Writes structured markdown to .kiro/agent-tasks/
    - _Requirements: 57b.5, 57b.7_

  - [x] 35.4 Update agent system prompts with Kiro dispatch awareness
    - Seraphim knows it can dispatch tasks to Kiro after King approval
    - _Requirements: 57a.1_

  - [ ] 35.5 Add "Dispatch to Kiro" button in dashboard chat
    - When an agent proposes work, show a "Dispatch to Kiro" button
    - Button calls POST /api/agent-tasks/dispatch with the task details
    - Show confirmation: "Task dispatched — Kiro will execute in IDE"
    - _Requirements: 57a.2, 57d.13_

  - [ ] 35.6 Implement MCP bridge (future evolution)
    - Create MCP server that exposes Kiro capabilities to SeraphimOS agents
    - Enable bidirectional communication: agents can query codebase, request changes, trigger builds
    - Enforce Mishmar governance on all MCP bridge operations
    - _Requirements: 57c.10, 57c.11, 57c.12_

- [ ] 36. Checkpoint — Phase 17 complete
  - Verify: agents can propose work, King approves, task file written, Kiro hook triggers, execution happens in IDE


- [x] 37. Phase 18 — Shaar Agent (Human Interface Intelligence)
  - [x] 37.1 Define Shaar Agent Program and deploy
    - Create Shaar Guardian agent program with full identity profile, system prompt, and state machine
    - Add to production server agent deployments
    - Deploy and verify agent responds in character
    - _Requirements: 58a.1, 48a.1_

  - [x] 37.2 Implement browser observation service (Playwright)
    - Create `packages/services/src/shaar-agent/browser-observer.ts` using Playwright
    - Implement: openDashboard, captureScreenshot, inspectDOM, getConsoleErrors, navigateTo, clickElement
    - Store screenshots in S3 for reference
    - _Requirements: 58a.1, 58a.2_

  - [x] 37.3 Implement UX friction detector
    - Analyze DOM for: missing labels, dead-end workflows, hidden status, missing loading feedback, unclear navigation
    - Compare observed workflows against expected ideal flows
    - Score cognitive load and information hierarchy per page
    - _Requirements: 58b.4, 58b.5, 58b.6_

  - [x] 37.4 Implement UI/UX design evaluator
    - Evaluate: layout quality, visual hierarchy, spacing, typography, color, CTAs, navigation, empty/loading/error states
    - Score each page against design principles
    - Generate specific redesign recommendations with evidence
    - _Requirements: 58c.7, 58c.8, 58c.9_

  - [x] 37.5 Implement data truth auditor
    - Check every metric/chart for: real data source, freshness, mock data indicators, placeholder values
    - Flag disconnected or stale data
    - _Requirements: 58d.10, 58d.11_

  - [x] 37.6 Implement agentic behavior visibility auditor
    - Verify execution traces, memory indicators, tool usage, delegation status are visible on agent screens
    - Flag screens where agents appear as chatbots without agentic context
    - _Requirements: 58e.12, 58e.13_

  - [x] 37.7 Implement revenue workflow auditor
    - Inspect ZionX screens: app preview, screenshots, ads, payments, store readiness
    - Inspect ZXMG screens: video generation, thumbnails, publish gates, analytics
    - Evaluate whether screens help make money
    - _Requirements: 58f.14, 58f.15, 58f.16_

  - [x] 37.8 Implement Shaar Readiness Score
    - Composite score across all dimensions (UX, design, data truth, agentic visibility, revenue, permissions, mobile, cost)
    - Generate Top 5 improvements to reach next threshold
    - _Requirements: 58h.19, 58h.20_

  - [x] 37.9 Implement recommendation generator and Kiro task dispatcher
    - Generate structured recommendations with evidence, acceptance criteria, implementation guidance
    - Convert approved recommendations to Kiro tasks via Agent-to-Kiro bridge
    - _Requirements: 58i.21, 58i.22_

  - [x] 37.10 Implement post-implementation verification
    - After Kiro implements changes, retest affected page with Playwright
    - Compare before/after screenshots
    - Mark task verified or reopen with failure evidence
    - _Requirements: 58i.23_

  - [x] 37.11 Create Shaar Agent dashboard tab
    - Add "Shaar Agent" tab to dashboard navigation
    - Build overview page with readiness score cards
    - Build page review queue
    - Build recommendation viewer
    - Build before/after comparison viewer
    - Build Kiro task status tracker
    - _Requirements: 58j.24, 58j.25_

  - [x] 37.12 Implement scheduled reviews
    - Run after dashboard deployments (hook on S3 sync)
    - Run daily during active development
    - Run before multi-user rollout
    - Run after any failed user-facing workflow
    - _Requirements: 58a.3_

- [x] 38. Checkpoint — Phase 18 complete
  - Verify: Shaar Agent observes dashboard via Playwright, generates readiness score, detects UX friction, evaluates visual design, audits data truth, generates Kiro tasks, verifies implementations, has its own dashboard tab
