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
