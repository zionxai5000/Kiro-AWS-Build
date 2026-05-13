# SeraphimOS — Capability Map by Phase

## Overview

This document maps the capabilities unlocked at each phase of the SeraphimOS implementation. Each phase builds on the previous, progressively enabling more autonomous behavior. A capability is considered "available" when its implementation is complete, tested, and verified at the phase checkpoint.

---

## Phase 1 — Core Infrastructure and Kernel Foundation

**Status: ✅ Complete**

### Platform Capabilities

| Capability | Description |
|---|---|
| TypeScript Monorepo | Strict-mode TypeScript with workspaces, ESLint, Prettier, Vitest |
| AWS Infrastructure (IaC) | VPC, Aurora PostgreSQL (pgvector), DynamoDB, S3, Secrets Manager — all defined in CDK |
| Compute Infrastructure | ECS Fargate cluster, Lambda functions, auto-scaling, IAM roles |
| API Gateway | REST + WebSocket endpoints with Cognito authentication |
| Event Bus Infrastructure | EventBridge bus, SQS queues (FIFO + standard), dead-letter queues, content-based routing rules |
| CI/CD Pipeline | GitHub Actions + CDK Pipelines with staged deployment (dev → staging → prod) |

### Kernel Capabilities

| Capability | Description |
|---|---|
| Agent Runtime | Deploy, execute, upgrade, terminate agents with full lifecycle management |
| Agent Registry | Track all active agents with state, pillar, resource consumption, health |
| Heartbeat Monitoring | Detect stale agents (90s timeout) with automatic health degradation |
| State Machine Engine | Register versioned definitions, create instances, evaluate gate conditions, execute transitions |
| Gate Evaluation | Block transitions when required gates fail, log rejections |
| Definition Versioning | Migrate existing state machine instances to new definitions without data loss |
| Event Bus Service | Publish/subscribe with JSON Schema validation (Ajv), batch publishing, DLQ management |

### Data Capabilities

| Capability | Description |
|---|---|
| Database Schema | All tables: tenants, agent_programs, state_machine_definitions/instances, memory_entries (pgvector), completion_contracts, token_usage |
| Row-Level Security | Tenant isolation enforced at the database level on all tables |
| Repository Layer | Type-safe CRUD with automatic tenant_id filtering on every query |
| Connection Pooling | Managed pool reading credentials from Secrets Manager at runtime |

---

## Phase 2 — System Services

**Status: ⬜ Not Started**

### Governance Capabilities (Mishmar)

| Capability | Description |
|---|---|
| Authority Enforcement | L1–L4 authority matrix with escalation routing |
| Role Separation | Prevent same agent from deciding and executing controlled actions |
| Execution Tokens | Dual-approval tokens (authorizer + Otzar) required for controlled actions |
| Completion Contracts | JSON Schema validation of workflow outputs before state transitions |
| Governance Audit Trail | Every governance decision logged to XO Audit |

### Memory Capabilities (Zikaron)

| Capability | Description |
|---|---|
| 4-Layer Memory | Episodic, semantic, procedural, and working memory |
| Vector Search | Cosine similarity search via pgvector for memory retrieval |
| Entity Extraction | Automatic extraction from episodic events into semantic memory |
| Agent Context Loading | Load working memory + recent episodic + top procedural patterns on agent start |
| Conflict Resolution | Flag conflicting entries with metadata, retain both |

### Resource Management (Otzar)

| Capability | Description |
|---|---|
| Task Classification | Classify by type and complexity for intelligent model routing |
| Model Routing | 3-tier routing (Haiku/GPT-4o-mini → Sonnet/GPT-4o → Opus/GPT-4.5) based on task needs |
| Budget Enforcement | Daily and monthly token budgets per agent, per pillar, and system-wide |
| Semantic Caching | Task-type-aware cache with differentiated TTLs |
| Cost Reporting | Per-agent and per-pillar spend with waste pattern detection |
| Pillar Routing Policies | Per-pillar cost sensitivity, tier constraints, and task overrides |

### Audit Capabilities (XO Audit)

| Capability | Description |
|---|---|
| Immutable Audit Trail | SHA-256 hash chain ensuring tamper detection |
| Rich Querying | Filter by agent, action type, pillar, time range, outcome |
| Integrity Verification | Walk hash chain to verify no records have been modified |
| 365-Day Retention | DynamoDB TTL configured for minimum 1-year retention |

### Credential Management

| Capability | Description |
|---|---|
| Secure Retrieval | Credentials from Secrets Manager with 5-minute in-memory cache |
| Zero-Downtime Rotation | Dual-version credentials during rotation window |
| Access Auditing | Every credential access logged (key name only, never value) |

### Event Processing

| Capability | Description |
|---|---|
| Audit Event Handler | Process audit events, maintain hash chain in DynamoDB |
| Memory Event Handler | Process memory events, trigger entity extraction |
| Alert Event Handler | Format and deliver notifications |
| Workflow Event Handler | Trigger next state machine steps |
| Idempotent Processing | Deduplication by event ID across all handlers |

---

## Phase 3 — Application Layer and Driver Layer

**Status: ⬜ Not Started**

### Driver Framework

| Capability | Description |
|---|---|
| Uniform Driver Interface | Standard connect/execute/verify/disconnect lifecycle for all external services |
| Retry with Backoff | Exponential backoff (1s–16s, max 5 attempts) built into base class |
| Circuit Breaker | Open after 5 failures, half-open after 60s, automatic recovery |
| Session Management | Persistent sessions to avoid redundant authentication |
| Idempotency Keys | Safe retries without duplicate side effects |
| Driver Registry | Validate interface compliance, manage lifecycle, health checks |

### LLM Provider Drivers

| Capability | Description |
|---|---|
| Anthropic (Claude) | Haiku, Sonnet, Opus with streaming, token counting, cost calculation |
| OpenAI (GPT) | GPT-4o-mini, GPT-4o, GPT-4.5 with streaming, token counting, cost calculation |

### App Store Drivers

| Capability | Description |
|---|---|
| Apple App Store Connect | Create apps, upload builds, submit for review, manage subscriptions, get analytics |
| Google Play Console | Create apps, upload bundles, submit for review, manage subscriptions, get analytics |

### Media & Content Drivers

| Capability | Description |
|---|---|
| YouTube | Upload videos, manage metadata/thumbnails, analytics, comments, playlists, scheduling |
| HeyGen | AI video generation |
| Rumble, Reddit, X, Instagram, Facebook, TikTok | Post content, get analytics per platform |

### Trading Drivers

| Capability | Description |
|---|---|
| Kalshi | Markets, positions, trades with position size and daily loss limit validation |
| Polymarket | Markets, positions, trades with position size and daily loss limit validation |

### Communication Drivers

| Capability | Description |
|---|---|
| Gmail | Send, receive, search emails |
| GitHub | Repos, PRs, issues, workflow management |
| Telegram, Discord, WhatsApp | Send/receive messages |

### Commerce & Automation Drivers

| Capability | Description |
|---|---|
| Stripe | Payments, subscriptions, invoices |
| RevenueCat | In-app subscription management, revenue data |
| Google Ads | Campaign management, performance data |
| Zeely | Landing pages and funnels |
| n8n | Webhook triggers, workflow management |
| Browser (Playwright) | Automation for services without APIs |

### Application: ZionX App Factory

| Capability | Description |
|---|---|
| App Lifecycle State Machine | Ideation → development → testing → gate-review → submission → in-review → approved/rejected → live → deprecated |
| Gate Checks | Metadata validation, subscription compliance, IAP sandbox testing, screenshot verification, privacy policy, EULA |
| Rejection Learning | Parse rejection reasons, create new gates to prevent recurrence, store in procedural memory |
| Parallel Submission | Independent Apple and Google submission tracking |

### Application: ZXMG Media Production

| Capability | Description |
|---|---|
| Content Pipeline | Planning → script generation → asset creation → video assembly → metadata prep → platform upload → monitoring |
| Platform Validation | Format, duration, metadata, thumbnail compliance per platform |
| Performance Analytics | Track views, engagement, revenue; store patterns in Zikaron |

### Application: Zion Alpha Trading

| Capability | Description |
|---|---|
| Trading State Machine | Scanning → evaluating → positioning → monitoring → exiting → settled |
| Risk Enforcement | Position size limits and daily loss limits enforced via Otzar |
| Trade Logging | Every decision (entry, exit, hold) logged with reasoning and market data |

---

## Phase 4 — Interface Layer (Shaar) and Integration

**Status: ⬜ Not Started**

### Interface Capabilities

| Capability | Description |
|---|---|
| REST API | Full CRUD for agents, pillars, costs, audit, health, commands |
| WebSocket Real-Time | Live agent state changes, cost updates, alerts, workflow progress |
| Command Router | Uniform semantic interpretation regardless of source channel |
| Web Dashboard | React + Vite with live views: Agents, Pillars, Costs, Audit, System Health |
| Alert Notifications | Real-time alerts via WebSocket displayed in dashboard |

### Multi-Tenant Capabilities

| Capability | Description |
|---|---|
| Tenant Provisioning | Isolated tenant with default pillars, fresh memory, independent budgets |
| Queen Scoping | Authorization profiles limiting Queens to designated pillars and actions |
| Cross-Tenant Coordination | Queen workflows can trigger King pillar actions with Execution Tokens |
| Tenant-Scoped Interface | Queen interactions limited to authorized pillars |

### Observability

| Capability | Description |
|---|---|
| Real-Time Metrics | Agent count, states, queue depth, throughput, memory utilization, error rates → CloudWatch |
| Cost Metrics | Per-agent/pillar spend, model utilization, projected costs → CloudWatch |
| Alert Thresholds | CloudWatch alarms trigger events delivered through Shaar within 60 seconds |
| System Health Endpoint | Operational status of every service, driver, and agent |
| Distributed Tracing | AWS X-Ray across ECS and Lambda |

### Security

| Capability | Description |
|---|---|
| Cognito Authentication | User registration, login, JWT with scoped permissions |
| API Authorization | JWT validation, tenant context extraction, Mishmar enforcement on every request |
| Token Rotation | Short-lived tokens with refresh token rotation |
| Credential Rotation Automation | 90-day rotation schedule, zero-downtime switchover |
| Network Isolation | VPC security groups per tenant tier |

### Testing Infrastructure

| Capability | Description |
|---|---|
| Coverage Enforcement | Block deployment if Completion Contract conditions are uncovered by tests |
| Traceability Matrix | Requirement-to-test mapping with gap reporting |
| Driver Validation | Integration test runner validates drivers before production activation |
| CI/CD Gates | Unit → integration → gate verification → coverage → staged rollout |

---

## Phase 5 — Advanced Features

**Status: ⬜ Not Started**

### Learning Engine

| Capability | Description |
|---|---|
| Failure Analysis | Correlate failures with historical patterns via vector similarity |
| Pattern Detection | Batch analysis to find recurring failure clusters |
| Fix Generation | Produce versioned Agent_Program changes with confidence scores |
| Fix Verification | Sandboxed execution with regression testing before apply |
| Autonomous Improvement | Apply verified fixes, record in procedural memory, publish events |
| Model Router Learning | Nightly aggregation of model performance to update routing weights |

### Agent Marketplace

| Capability | Description |
|---|---|
| Publish Programs | Validated Agent_Programs with test suites, contracts, and documentation |
| Install Programs | Deploy within tenant isolation with tenant's authorization and budget rules |
| Searchable Catalog | Ratings, installation count, verified performance metrics |
| Quality Validation | Reject programs missing tests, contracts, or documentation |

### Federated Intelligence

| Capability | Description |
|---|---|
| Pattern Sharing | Anonymized improvement patterns published to shared registry |
| Data Isolation | Automated scanning strips tenant-specific data before publication |
| Pattern Evaluation | Assess applicability to local instance |
| Pattern Adoption | Propose and verify adoption through Learning Engine |

### Additional Interface Channels

| Capability | Description |
|---|---|
| iMessage Integration | Send/receive messages for King and Queen communication |
| Voice Interface | Speech-to-text and text-to-speech via AWS Transcribe + Polly |
| Notification Delivery | Multi-channel (dashboard, email, Telegram, iMessage) within 60-second SLA |
| Queen-Scoped Notifications | Queens only receive notifications for authorized pillars |

---

---

## Phase 6 — Autonomous SME and Self-Improvement Architecture

**Status: ⬜ Not Started**

### Domain Expertise Capabilities

| Capability | Description |
|---|---|
| Domain Expertise Profiles | Structured, evolving knowledge bases per sub-agent with competitive intelligence, decision frameworks, and learned patterns |
| Seed Knowledge | Pre-loaded domain expertise for Eretz (conglomerate management), ZionX (app market), ZXMG (content/YouTube), Zion Alpha (trading), and Seraphim Core (AI architecture) |
| Knowledge Accumulation | Continuous updates from research, execution outcomes, and cross-domain learning with conflict detection |
| Cross-Domain Insights | Relevant findings propagated between sub-agents when applicable |

### Autonomous Review Capabilities

| Capability | Description |
|---|---|
| Heartbeat Review Cycles | Scheduled proactive analysis per sub-agent (Eretz daily, ZionX daily, ZXMG daily, Zion Alpha hourly, Seraphim Core weekly) |
| World-Class Benchmarking | Each review compares current performance against best-in-world benchmarks with gap analysis |
| Autonomous Research | Sub-agents independently research their domain using drivers and LLM analysis |
| Structured Recommendations | Every recommendation follows benchmark → current state → gap → action plan format |

### Recommendation Engine Capabilities

| Capability | Description |
|---|---|
| Recommendation Queue | Centralized queue with priority scoring, domain grouping, and structured validation |
| Approval Workflow | King approves/rejects with batch operations; approved items dispatched for autonomous execution |
| Execution Tracking | Track recommendation implementation progress from approval through completion |
| Impact Measurement | Compare actual outcomes against estimates; calibrate future recommendation accuracy |
| Rejection Learning | Rejection reasons stored in Zikaron; agents learn to avoid similar recommendations |
| Escalation | Stale recommendations (>48h) re-escalated to King with impact summary |
| Path to World-Class Dashboard | Per-domain progress visualization showing cumulative improvement toward world-class targets |

### Industry Awareness Capabilities

| Capability | Description |
|---|---|
| Technology Scanning | Daily monitoring of AI research, framework releases, cloud provider announcements, and domain-specific sources |
| Technology Assessment | Structured evaluation of discoveries with relevance scoring, adoption complexity, and integration plans |
| Technology Roadmap | Forward-looking roadmap (now / 3mo / 6mo / 12mo) with per-domain impact notes |
| Adoption Recommendations | High-impact technologies auto-submitted to Recommendation Queue with concrete integration plans |
| Domain Notifications | Sub-agents notified of domain-specific advances for incorporation into heartbeat research |

### Self-Improvement Capabilities

| Capability | Description |
|---|---|
| Weekly Self-Assessment | System-wide evaluation of performance, agent effectiveness, architecture, and industry comparison |
| Capability Maturity Score | Overall and per-domain maturity tracking with trend analysis and time-to-target estimates |
| Capability Gap Analysis | Identification and prioritization of gaps between current state and target vision |
| Self-Improvement Proposals | Generated with implementation plans, verification criteria, and rollback plans |
| Verified Implementation | Changes verified against criteria; automatic rollback on failure |

### Kiro Integration Capabilities

| Capability | Description |
|---|---|
| Domain Steering Files | Auto-generated Kiro steering files per sub-agent encoding domain expertise and research findings |
| Master Steering File | Complete platform architecture, conventions, and capability maturity for development sessions |
| Kiro Skills | Per-domain skill definitions activatable during Kiro sessions |
| Automated Hooks | Hook definitions for code review, recommendation processing, heartbeat triggers, and capability assessment |
| Recommendation-to-Task Conversion | Approved recommendations converted to structured Kiro tasks with acceptance criteria and research references |

### Seraphim Strategist and Orchestrator Agent Capabilities

| Capability | Description |
|---|---|
| Vision-to-Strategy Translation | Take the King's vision and formulate concrete strategic plans with objectives, success metrics, pillar-level directives, resource strategies, and timelines |
| Directive Classification & Routing | Classify King commands by target pillar(s), priority, resource impact, and cross-pillar dependencies; route strategically enriched directives to appropriate pillar heads |
| Strategic Directive Enrichment | Add strategic framing, objectives, system-wide context, budget allocation, priority ranking, cross-pillar implications, and measurable success criteria to every directive before routing |
| Escalation Management | Receive and classify escalations from all pillar heads; resolve autonomously within L2 authority or escalate to King with context and recommended resolution |
| Autonomous Escalation Resolution | Resolve budget reallocations (< 20%), cross-pillar priority conflicts, high-confidence fix proposals, governance violations, and recoverable system failures without King involvement |
| Cross-Pillar Orchestration | Coordinate initiatives spanning multiple pillars with dependency tracking, conflict resolution, and resource allocation |
| Priority Matrix Management | Maintain and enforce pillar-level priorities, budget shares, and resource allocation rationale aligned with the King's vision |
| System Health Oversight | Continuous monitoring of all pillars, services, drivers, and agents with corrective action on degradation |
| Service Recovery Coordination | Trigger and coordinate recovery for failed services, including failover, state restoration, and alert delivery |
| Capability Maturity Tracking | Track overall and per-domain capability maturity scores with trend analysis and time-to-target estimates |
| Seraphim State Machine | Full lifecycle: initializing → ready → formulating_strategy / processing_directive / handling_escalation / coordinating_cross_pillar / monitoring_system / heartbeat_review / recovering_service → degraded → terminated |
| Seraphim Domain Expertise Profile | Seed knowledge covering strategic planning, platform architecture, AI agent orchestration, cost optimization, governance, reliability, self-improvement, and technology landscape |
| Seraphim Heartbeat Review | Weekly platform-level analysis: AI research scanning, architecture benchmarking, reliability gap analysis, cost optimization, and technology adoption recommendations |
| Seraphim Kiro Integration | Auto-generated steering file and skill definition encoding vision-to-strategy frameworks, platform architecture expertise, escalation decision trees, and capability maturity assessment |

### Eretz Business Pillar Capabilities

| Capability | Description |
|---|---|
| Directive Enrichment Pipeline | Every directive to business sub-agents is enriched with portfolio context, applicable patterns, synergy opportunities, and training context before delivery |
| Chain of Command Enforcement | Mandatory routing of all business directives through Eretz; bypass detection intercepts and reroutes direct-to-subsidiary directives |
| Result Verification | Subsidiary results verified against business quality standards with structured feedback before forwarding to Seraphim Core |
| Cross-Business Synergy Engine | Continuous detection and activation of revenue, operational, and strategic synergies across ZionX, ZXMG, and Zion Alpha |
| Standing Rule Enforcement | Mandatory cross-promotion rules (e.g., ZXMG videos include ZionX app commercials) enforced with compliance tracking |
| Synergy Tracking Dashboard | Real-time visibility into identified synergies, activated synergies, revenue impact, and missed opportunities |
| Reusable Business Pattern Library | Extraction, generalization, and cross-subsidiary application of proven business patterns with effectiveness tracking |
| Pattern Recommendation | Proactive recommendation of applicable patterns when subsidiaries face challenges matching existing library entries |
| Portfolio Intelligence Dashboard | Aggregated real-time business metrics (MRR, growth, unit economics, ROAS) across all subsidiaries |
| Decline Alert System | Automatic detection of declining subsidiary metrics with intervention plan generation and Recommendation Queue escalation |
| Portfolio Strategy Engine | Per-subsidiary strategy recommendations (scale/maintain/optimize/deprecate) informed by real metrics and benchmarks |
| Training Cascade | Structured business training through directive enrichment and output quality evaluation with feedback stored in subsidiary expertise profiles |
| Training Effectiveness Tracking | Per-subsidiary improvement trends in business decision quality, recommendation accuracy, and autonomous judgment |
| Operational Authority Enforcement | SEMP compliance validation, output rejection with remediation, and resource reallocation within governance bounds |
| Eretz Domain Expertise Profile | Seed knowledge covering conglomerate management, synergy frameworks, portfolio optimization, and world-class benchmarks |
| Eretz Heartbeat Review | Daily portfolio-level analysis: metrics gathering, synergy scanning, benchmark comparison, and strategic recommendation generation |
| Eretz Kiro Integration | Auto-generated steering file and skill definition encoding portfolio management expertise and synergy detection frameworks |

---

## Phase 8 — Parallel Agent Orchestration, MCP Integration, and Unified Communication Layer

**Status: ⬜ Not Started**

### Parallel Agent Orchestration Capabilities

| Capability | Description |
|---|---|
| Intra-Agent Parallelization | Sub-agents within a single agent can execute multiple tasks concurrently with shared context |
| Inter-Agent Parallelization | Multiple top-level agents (Eretz, ZionX, ZXMG, Zion Alpha) can work on different parts of the same project simultaneously |
| Dependency Graph Engine | Declarative dependency definitions between parallel tasks with automatic scheduling and blocking |
| Work Distribution & Load Balancing | Intelligent distribution of parallel work units across available compute resources |
| Parallel Progress Tracking | Real-time visibility into all concurrent execution streams with dependency status |
| Inter-Agent Communication Bus | Real-time message passing between concurrently executing agents for coordination |
| Parallel Result Aggregation | Collect and synthesize results from multiple parallel execution streams into unified outputs |
| Deadlock Detection | Detect circular dependencies between parallel agents and resolve or escalate |

### MCP (Model Context Protocol) Capabilities

| Capability | Description |
|---|---|
| MCP Server Hosting | Each agent can expose its capabilities as an MCP server for external consumption |
| MCP Client Integration | Agents can consume external MCP tools/services as part of their execution |
| MCP Tool Registry | Central registry of all available MCP tools (internal and external) with schema validation |
| MCP Protocol Routing | Route MCP requests between agents, Kiro, and external systems |
| MCP Authentication & Authorization | Secure MCP connections with token-based auth integrated with Mishmar governance |
| MCP Tool Discovery | Agents can dynamically discover and use new MCP tools without code changes |
| Kiro-Seraphim MCP Bridge | Bidirectional MCP connection between Kiro IDE and SeraphimOS agents |
| MCP Health Monitoring | Monitor MCP server/client connections with automatic reconnection |

### Unified Agent Communication Layer Capabilities

| Capability | Description |
|---|---|
| Per-Agent Chat Interface | Each agent (Seraphim, Eretz, ZionX, ZXMG, Zion Alpha) has a persistent chat interface on its dashboard |
| Multi-User Concurrent Chat | Multiple user accounts can chat with the same agent simultaneously |
| Unified Chat History | Complete chat history across all users visible in a single agent conversation view |
| Cross-Agent Context Sharing | Messages to one agent can be automatically or explicitly shared with other agents |
| Auto-Propagation (NLP-based) | System automatically detects when a message is relevant to other agents and shares context |
| Explicit Agent Tagging | Users can @-mention other agents to explicitly route messages or context |
| Agent Presence & Status | Real-time indicators showing agent state (idle, working, waiting, processing) |
| Conversation Context Handoff | When switching between agents, the new agent can pull in relevant prior conversation context |

### Telegram Integration Capabilities

| Capability | Description |
|---|---|
| Unified Telegram Bot | Single Telegram bot with channels/threads per agent |
| Per-Agent Telegram Threads | Dedicated threads for Seraphim, Eretz, ZionX, ZXMG, and Zion Alpha |
| Telegram-Dashboard Sync | Messages sent via Telegram appear in dashboard chat and vice versa |
| Mobile Command Execution | Issue commands and receive responses from agents via Telegram on mobile |
| Telegram Notification Routing | Agent notifications delivered to Telegram based on user preferences |
| Multi-User Telegram Support | Multiple users can interact with agents via the same Telegram bot with identity tracking |

### Communication Infrastructure Capabilities

| Capability | Description |
|---|---|
| Message Priority & Urgency | Priority levels (low, normal, high, critical) affecting agent response ordering |
| Audit Trail & Replay | Full audit log of all human-agent and agent-agent communications |
| Agent-to-Agent Delegation Visibility | Chat shows when an agent delegates work to another agent with status tracking |
| Rate Limiting & Fairness | Queue management for multi-user access with configurable priority (FIFO, role-based) |
| Notification Routing Engine | User-preference-based routing of notifications across dashboard, Telegram, email, and other channels |

---

## Phase 9 — ZionX App Development Studio

**Status: ⬜ Not Started**

### App Studio Core Capabilities

| Capability | Description |
|---|---|
| ZionX App Studio Dashboard Tab | Full in-browser app development environment within the Shaar ZionX section |
| Natural Language App Generation | King describes app in plain language; ZionX generates complete React Native/Expo codebase with design system, screens, navigation, and monetization |
| Product Spec Generation | Auto-generate product requirements, screen list, user journey map, design system, monetization plan, and technical architecture from a natural language prompt |
| Studio Session Management | Manage app development session lifecycle including project state, file tree, build status, preview connection, and undo/redo history |

### Live Preview Capabilities

| Capability | Description |
|---|---|
| React Native Web Preview (Level 1) | In-browser interactive mobile preview rendered inside accurate device frames |
| Device Frame Switching | Switch between iPhone 15, iPhone SE, iPad, Pixel, Android tablet with correct dimensions and safe areas |
| Click-Through Navigation | Navigate between screens, test buttons, simulate onboarding and paywall flows in-browser |
| Hot Reload on Edit | Preview automatically reloads within 2 seconds when code changes are applied |
| Expo QR Preview (Level 2) | Generate QR code for real-device testing via Expo Go or custom dev client |
| Cloud Emulator Streaming (Level 3) | Stream Android emulator or iOS simulator from cloud with automated screenshot capture |

### AI Edit Loop Capabilities

| Capability | Description |
|---|---|
| Natural Language Code Editing | King gives edit commands in plain language; AI translates to code modifications |
| Edit-Test-Preview Cycle | Every edit triggers lint, typecheck, test execution, and preview reload automatically |
| Undo/Redo History | Full undo/redo stack for all AI edit commands with state restoration |
| Code Change Hook | `app.code.changed` hook fires after every edit for downstream automation |

### Integration Management Capabilities

| Capability | Description |
|---|---|
| Integration Sidebar Menu | Visual menu for connecting services: Payments, Database, Analytics, Push, API, Env Vars, Audio, Haptics, Ads |
| SDK Auto-Integration | Enabling an integration generates required SDK code, configuration, and test stubs |
| Secure Credential Injection | Environment variables and API keys stored via Otzar and injected into builds without UI exposure |

### Code/File Panel Capabilities

| Capability | Description |
|---|---|
| Project Structure View | Navigable file tree showing screens, components, configs, metadata, and build status |
| Syntax-Highlighted File Viewer | View file contents with syntax highlighting (read-only MVP, Monaco editor future) |

### Testing and Quality Capabilities

| Capability | Description |
|---|---|
| Testing Panel | Display unit tests, UI tests, accessibility compliance, design quality score, and store readiness |
| Gate-Blocked Progression | Block Build/Submit phase if critical gate checks fail |
| Test Execution on Demand | King-triggered test runs with pass/fail results and suggested fixes |

### Store Asset Generation Capabilities

| Capability | Description |
|---|---|
| Automated Screenshot Capture | Capture screenshots from live preview across all required device sizes (iPhone 6.7", 6.5", iPad, Google Play phone/tablet) |
| Feature Graphic Generation | Generate 1024×500 feature graphics, 1024×1024 app icons, promo banners |
| Localized Captions | Generate captions and frames per device size per locale |
| Platform Compliance Validation | Validate all assets against Apple and Google dimension, file size, and content policy requirements |
| Automatic Regeneration | Screenshots auto-regenerate when screen flow changes via `app.screenflow.changed` hook |

### Ad Studio Capabilities

| Capability | Description |
|---|---|
| Video Ad Generation | Generate 15s vertical, 30s horizontal, 6s bumper ads from app preview recordings |
| Playable Ad Demos | Generate interactive playable ad demos for user acquisition |
| Ad Network Format Export | Export in AdMob, AppLovin, Unity Ads formats without manual conversion |
| Ad Spec Validation | Validate against ad network specifications (file size, aspect ratio, duration, interactive elements) |

### Platform Release Agent Capabilities

| Capability | Description |
|---|---|
| Apple Release Agent | Complete iOS release workflow: Xcode build, signing, App Store Connect metadata, privacy nutrition labels, TestFlight, App Store review submission, rejection remediation |
| Google Play Release Agent | Complete Android release workflow: Gradle AAB build, signing keystores, Google Play Console metadata, Data Safety form, closed testing tracks, production release, rejection remediation |
| Store Asset Agent | Generate and adapt screenshots, captions, preview videos, feature graphics, and promo banners to platform-specific rules |
| Parallel Platform Submission | Independent iOS and Android submission tracking with separate build status panels |

### Revenue and Performance Capabilities

| Capability | Description |
|---|---|
| Revenue Panel | Display downloads, MRR, ARPU, LTV, churn, ROAS, combined ad + subscription revenue |
| Cost-Per-App Tracking | Track LLM token costs per app generation and editing session via Otzar |
| Scale/Optimize/Kill Recommendations | Performance-based recommendations for each app in the portfolio |

### Hook and Event Integration Capabilities

| Capability | Description |
|---|---|
| Studio Lifecycle Hooks | Emit: `app.idea.created`, `app.code.changed`, `app.preview.updated`, `app.screenflow.changed`, `app.ios.build.created`, `app.android.build.created`, `app.assets.requested`, `app.marketing.state.entered`, `app.store.gate.failed`, `app.submission.ready` |
| Rework Loop on Gate Failure | Identify responsible sub-agent, create rework task, rerun gate after remediation |
| Real-Time WebSocket Integration | Preview updates, build status, and test results streamed via existing Shaar WebSocket infrastructure |

### Governance and Audit Capabilities

| Capability | Description |
|---|---|
| Mishmar Approval Integration | King approval required before store submission, budget allocation, and cross-pillar resource requests |
| Full XO_Audit Traceability | All studio actions logged with traceability from idea to live app |

---

## Phase 10 — ZXMG Video Development Studio

**Status: ⬜ Not Started**

### Autonomous Content Engine Capabilities

| Capability | Description |
|---|---|
| Autonomous Research Mode | ZXMG autonomously researches trending topics, algorithm signals, competitor performance, and audience behavior without King input |
| Content Calendar Generation | Auto-generate content ideas ranked by predicted views, engagement, and revenue potential with recommended publish dates |
| Rolling Content Pipeline | Maintain 7-14 day production pipeline per managed YouTube channel with auto-generated scripts, thumbnails, titles, descriptions, tags, and scheduling |
| Auto-Execution on Timeout | Execute pipeline items autonomously if King does not intervene within 24 hours of scheduled production start |
| Pipeline Override Interface | King can approve, modify, or reject any pipeline item; pipeline state updates accordingly |
| Content Idea Hook | Emit `video.idea.generated` hook for downstream notification and approval workflows |

### Script-to-Video Pipeline Capabilities

| Capability | Description |
|---|---|
| Production Package Generation | Generate complete production package from concept: script → scene breakdown → shot list → visual style guide → audio direction |
| Scene Decomposition | Break scripts into individual scenes with duration, visual description, camera direction, audio layers, and character references |
| 15-Minute Video Support | Generate up to 15 minutes of consistent content per video with character and visual consistency across scenes |
| Multi-Style Support | Support cinematic, animated, documentary, tutorial, vlog, music video, and custom visual styles per channel |
| Script Hook | Emit `video.script.created` hook when a script is generated |

### Multi-Model Video Generation Capabilities

| Capability | Description |
|---|---|
| Intelligent Model Routing | Route to optimal AI model per shot type via Otzar: Sora 2/Veo 3 for cinematic, Kling/WAN/Minimax for fast iteration, specialized models for animation |
| Multi-Modal Input | Support text-to-video, image-to-video, and audio-to-video generation modes per scene |
| Camera Simulation | Support pan, zoom, dolly, crane, and tracking shot types within generated clips |
| Character Persistence | Maintain consistent face, body, clothing, and mannerisms for recurring characters across clips |
| Lip-Sync Generation | Synchronize generated character mouth movements with voiceover audio for dialogue scenes |
| Scene Render Hook | Emit `video.scene.rendered` hook when an individual scene clip is generated |

### Production Studio Capabilities

| Capability | Description |
|---|---|
| Timeline Editor | Scene-by-scene timeline control with reorder, trim, extend, and replace operations |
| Audio Layer Management | Separate tracks for music, sound effects, voiceover, and ambient audio |
| Transitions and Effects | Cuts, fades, dissolves, wipes, and custom motion graphics between scenes |
| Color Grading | Presets applicable per scene or across entire video |
| Multi-Format Export | Export in 16:9 (YouTube), 9:16 (Shorts/TikTok/Reels), and 1:1 (Instagram feed) |
| Video Assembly Hook | Emit `video.assembled` hook when full video is assembled from scenes |

### Trend Intelligence Engine Capabilities

| Capability | Description |
|---|---|
| Real-Time Trend Analysis | Analyze trending video styles, topics, and formats across YouTube, TikTok, and Instagram |
| Algorithm Signal Detection | Detect which content types are currently being boosted by platform recommendation systems |
| Competitor Channel Analysis | Analyze competitor channels to identify above-average engagement strategies |
| Retention Curve Analysis | Analyze audience retention curves to identify drop-off points and generate improvement recommendations |
| Content Gap Identification | Identify topics with high search demand but low supply of quality content |
| Viral Pattern Detection | Detect successful hooks, pacing, formats, and thumbnail styles; store in Zikaron procedural memory |

### Channel Management Capabilities

| Capability | Description |
|---|---|
| Multi-Channel Interface | Manage multiple YouTube channels from single interface with per-channel strategy |
| Channel Configuration | Configure niche, tone, posting cadence, target audience, and content pillars per channel |
| Per-Channel Analytics | Display views, subscribers, revenue, retention, CTR, and growth rate per channel |
| Cross-Channel Promotion | Automatically reference other managed channels in content where contextually appropriate |
| Channel Health Monitoring | Monitor growth rate, engagement trends, and algorithm standing with decline alerts |

### Platform Distribution Capabilities

| Capability | Description |
|---|---|
| Multi-Platform Publishing | One-click distribution to YouTube, TikTok, Instagram Reels, X, Facebook, and Rumble |
| Platform-Specific Formatting | Auto-format per platform: aspect ratio, duration, captions, hashtags, thumbnails |
| Optimal Scheduling | Schedule uploads at optimal times per platform based on audience activity data |
| Content Repurposing | Auto-generate Shorts, clips, and teasers from long-form videos |
| Distribution Hooks | Emit `video.scheduled` and `video.published` hooks for lifecycle tracking |

### Thumbnail and SEO Capabilities

| Capability | Description |
|---|---|
| Multi-Variant Thumbnails | Generate minimum 3 thumbnail variants optimized for click-through rate per video |
| Title/Description SEO | Generate title and description variants optimized for YouTube search and suggested placement |
| Thumbnail Hook | Emit `video.thumbnail.generated` hook when variants are created |
| A/B Test Learning | Store A/B test results in Zikaron and update generation models based on per-channel performance |

### UGC and Ad Creative Capabilities

| Capability | Description |
|---|---|
| UGC-Style Video Generation | Generate authentic-looking user-generated content style videos for brand promotion |
| AI Avatar Creation | Create persistent AI avatars/influencers for consistent brand presence across videos |
| Performance Ad Variants | Generate ad creatives in hook → value → CTA format for A/B testing |

### Analytics and Optimization Capabilities

| Capability | Description |
|---|---|
| Real-Time Performance Tracking | Track views, watch time, engagement rate, CTR, and revenue per published video |
| Retention Heatmaps | Generate second-by-second viewer engagement heatmaps per video |
| Performance Pattern Learning | Store content performance patterns in Zikaron for autonomous content engine improvement |
| Performance Update Hook | Emit `video.performance.update` hook for automated optimization recommendations |

### Video Preview Panel Capabilities

| Capability | Description |
|---|---|
| Full Video Player | Video player with timeline scrubbing in center panel |
| Scene Thumbnail Strip | Scene-by-scene thumbnail strip for quick navigation |
| Side-by-Side Comparison | Before/after comparison view for scene edits |
| Device Preview | Show how video appears on mobile vs desktop viewing contexts |
| Audio Waveform Visualization | Synchronized audio waveform display on video timeline |

### Studio Layout and UI Capabilities

| Capability | Description |
|---|---|
| Three-Panel Layout | Left (1fr) AI chat + pipeline, Center (2fr) video preview + timeline, Right (64px) tool sidebar |
| 13-Button Tool Sidebar | Script, Scenes, Characters, Audio, Effects, Trends, Thumbnails, Captions, Export, Analytics, Publish, Pipeline, Research |
| Tool Panel Switching | Selecting a sidebar button opens corresponding tool panel |

### Hook and Event Integration Capabilities

| Capability | Description |
|---|---|
| Video Lifecycle Hooks | Emit: `video.idea.generated`, `video.script.created`, `video.scene.rendered`, `video.assembled`, `video.thumbnail.generated`, `video.scheduled`, `video.published`, `video.performance.update`, `video.pipeline.updated` |
| Performance-Based Recommendations | Generate optimization recommendations when metrics fall below channel baseline |
| Real-Time WebSocket Integration | Pipeline status, render progress, and analytics streamed via existing Shaar WebSocket |

### Governance and Architecture Capabilities

| Capability | Description |
|---|---|
| Optional Mishmar Approval | King may optionally require approval before autonomous publishing and premium model usage |
| Zikaron Learning Integration | Store successful hooks, optimal lengths, best posting times, thumbnail styles, and pacing patterns |
| Full XO_Audit Traceability | All studio actions logged from research insight to published video |
| ZXMG State Machine Integration | Integrate with existing state machine (planning → script → asset creation → video assembly → upload → monitoring) |
| Otzar Model Routing | Route video generation to multiple AI providers based on shot type, quality, and budget via Otzar |

---

## Cumulative Capability Summary

| Phase | New Capabilities | Cumulative Total |
|---|---|---|
| Phase 1 | 19 | 19 |
| Phase 2 | 24 | 43 |
| Phase 3 | 34 | 77 |
| Phase 4 | 22 | 99 |
| Phase 5 | 16 | 115 |
| Phase 6 | 54 | 169 |
| Phase 8 | 39 | 208 |
| Phase 9 | 42 | 250 |
| Phase 10 | 68 | 318 |

---

## Phase Dependency Chain

```
Phase 1 (Infrastructure + Kernel)
    └── Phase 2 (System Services)
            └── Phase 3 (Applications + Drivers)
                    └── Phase 4 (Interface + Integration)
                            └── Phase 5 (Intelligence + Platform)
                                    └── Phase 6 (Autonomous SME + Self-Improvement)
                                            └── Phase 8 (Parallelization + MCP + Communication)
                                                    └── Phase 9 (ZionX App Development Studio)
                                                            └── Phase 10 (ZXMG Video Development Studio)
```

Each phase is fully functional and testable at its checkpoint. The system is usable (programmatically) after Phase 2, usable via drivers after Phase 3, usable by humans after Phase 4, self-improving after Phase 5, autonomously researching, recommending, and orchestrating business operations through Eretz after Phase 6, fully parallel with unified communication and MCP integration after Phase 8, providing a complete in-browser app development experience after Phase 9, and delivering autonomous AI video production with multi-model generation and multi-platform distribution after Phase 10.


---

## Phase 13 — Seraphim Core Architecture Views (Dashboard Integration)

**Status: ⬜ Not Started**

### Architecture Visualization Capabilities

| Capability | Description |
|---|---|
| OV-1 Operational View | INCOSE-standard color SVG operational architecture diagram showing King → Seraphim → Pillars → External Systems with command/information flows |
| SV-1 System View | INCOSE-standard color SVG system architecture diagram showing 6 architectural layers with component relationships and data flows |
| Diagram Color Palette | WCAG 2.1 AA compliant 6-color palette mapped to architectural layers with distinct connection line colors per flow type |
| Diagram Click-to-Zoom | Click any diagram to open full-viewport modal with pan/zoom (0.25x–4x range) |
| Pan/Zoom Controller | Mouse wheel zoom, pinch gesture zoom, click-and-drag pan, zoom buttons, percentage indicator |
| Diagram Modal | Full-viewport overlay with Escape/close button dismiss, smooth open/close animations |

### Document Rendering Capabilities

| Capability | Description |
|---|---|
| Requirements Document View | Live-rendered markdown content from requirements.md with headings, lists, tables, code blocks |
| Design Document View | Live-rendered markdown content from design.md including mermaid diagram rendering |
| Capabilities Document View | Live-rendered markdown content from capabilities.md with phase status tables |
| Markdown Rendering Engine | marked + highlight.js + mermaid.js for full markdown fidelity with syntax highlighting |
| Responsive Document Layout | Max-width 900px for readability, mobile stacking below 768px |

### Auto-Sync Capabilities

| Capability | Description |
|---|---|
| WebSocket Document Sync | Real-time propagation of spec document changes to active dashboard views within 5 seconds |
| File Change Detection | File system watcher on spec documents with content hash comparison |
| Live Re-render | Active views re-render on update without navigation change or page reload |
| Document API | REST endpoint serving raw markdown content with hash-based cache validation |

### Navigation Integration Capabilities

| Capability | Description |
|---|---|
| Seraphim Core Sub-Navigation | 5 new tabs (OV-1, SV-1, Requirements, Design, Capabilities) under Seraphim Core section |
| Active Tab Highlighting | Visual indicator of currently active architecture view |
| Consistent Positioning | New tabs appear after existing Seraphim Core items |

---

## Cumulative Capability Summary (Updated)

| Phase | New Capabilities | Cumulative Total |
|---|---|---|
| Phase 1 | 19 | 19 |
| Phase 2 | 24 | 43 |
| Phase 3 | 34 | 77 |
| Phase 4 | 22 | 99 |
| Phase 5 | 16 | 115 |
| Phase 6 | 54 | 169 |
| Phase 8 | 39 | 208 |
| Phase 9 | 42 | 250 |
| Phase 10 | 68 | 318 |
| Phase 13 | 16 | 334 |

---

## Phase Dependency Chain (Updated)

```
Phase 1 (Infrastructure + Kernel)
    └── Phase 2 (System Services)
            └── Phase 3 (Applications + Drivers)
                    └── Phase 4 (Interface + Integration)
                            └── Phase 5 (Intelligence + Platform)
                                    └── Phase 6 (Autonomous SME + Self-Improvement)
                                            └── Phase 8 (Parallelization + MCP + Communication)
                                                    └── Phase 9 (ZionX App Development Studio)
                                                            └── Phase 10 (ZXMG Video Development Studio)
                                                                    └── Phase 13 (Seraphim Core Architecture Views)
```

Each phase is fully functional and testable at its checkpoint. Phase 13 adds INCOSE-grade architecture visualization and live spec document rendering to the Seraphim Core dashboard section, providing the King with interactive system views and always-current documentation without leaving the dashboard.

### Persistent Agent Identity & Memory-Backed Conversations

| Capability | Description |
|---|---|
| Identity Profiles | Each agent has an immutable identity profile defining personality, expertise, communication style, and hierarchical role |
| Conversation Persistence | Every user-agent exchange stored in Zikaron episodic memory with full metadata for retrieval |
| Conversation Continuity | Last 20 exchanges loaded into LLM context on each interaction; vector search for older relevant context |
| Cross-Session Memory | Working memory persisted every 60s and on task completion; restored on container restart/redeployment |
| Memory-Backed Decisions | Agents query procedural memory (past decisions) and episodic memory (outcomes) before making recommendations |
| Decision Pattern Learning | Success/failure outcomes stored in procedural memory with success rates for continuous improvement |
| Governance-Compliant Access | All memory reads/writes subject to Mishmar authorization; tenant isolation enforced at database level |
| Inter-Agent Knowledge Sharing | Agents publish learned facts/patterns to Event Bus; other agents incorporate via semantic memory |
| Knowledge Graph | Semantic memory maintains linked graph of agents, decisions, outcomes, and patterns |
| Personality Enforcement | System prompts enforce character consistency; personality evolution tracked in procedural memory |
| Session Continuity Records | Zikaron tracks last active timestamp, working memory hash, and session transitions per agent |
| L1 Knowledge Broadcasting | King's interactions stored with L1 authority metadata, accessible to all agents for institutional knowledge |


### Agentic Execution Core

| Capability | Description |
|---|---|
| Cognition Envelope | Full context assembly before every LLM call: persona + authority + tools + memory + workflow state + goals |
| Planning Engine | Structured plan generation with subtasks, dependencies, tools, agents, gates, and budget estimates |
| Dynamic Tool Selection | Semantic MCP registry lookup, cost/reliability-based selection, automatic fallback |
| A2A Delegation | Agent-to-agent task delegation with scope, constraints, timeout, and result aggregation |
| Autonomy Modes | Crawl (human-gated) / Walk (scripted + gates) / Run (fully autonomous within authority) |
| Execution Traces | Full observability: plan → tools → memory → governance → actions → results → synthesis |
| Anti-Chatbot Enforcement | Architectural guardrails preventing degradation to generic chatbot behavior |
| Dynamic Autonomy Escalation | Workflows promote from Crawl → Walk → Run based on confidence and history |
| Human-Gated Production | ZionX submission and ZXMG publishing require approval unless explicitly configured |
| MCP Cost Tracking | Otzar tracks per-tool, per-agent, per-pillar invocation costs |
| Conflict Resolution | Delegating agents resolve conflicting results using decision principles |
| Plan Persistence | Execution plans stored in Zikaron, enabling resumption after failure/restart |

### Agent-to-Kiro Execution Bridge

| Capability | Description |
|---|---|
| Task Dispatch | Agents write approved tasks to .kiro/agent-tasks/ for Kiro execution |
| Kiro Hook | File watcher triggers Kiro to read and execute dispatched tasks |
| Approval Gate | No task dispatched without explicit King approval (Mishmar enforced) |
| Task Lifecycle | Pending → In Progress → Completed/Failed with full audit trail |
| MCP Bridge (future) | Bidirectional communication between agents and Kiro via MCP protocol |
| Execution Monitoring | Dashboard shows pending, active, and completed Kiro tasks |


### Shaar Agent — Human Interface Intelligence

| Capability | Description |
|---|---|
| Browser Observation | Playwright-based visual inspection, screenshot capture, DOM analysis, console log monitoring |
| Multi-Perspective Testing | Evaluates from King, Queen, new user, power user, mobile, and admin perspectives |
| UX Friction Detection | Identifies unclear labels, dead-end workflows, missing feedback, hidden status, cognitive overload |
| Expert UI/UX Design | Evaluates layout, hierarchy, spacing, typography, color, CTAs, navigation, accessibility |
| Data Truth Auditing | Flags mock data, stale metrics, disconnected charts, placeholder values |
| Agentic Visibility Audit | Verifies execution traces, memory indicators, tool usage, delegation status are visible |
| Revenue Workflow Audit | Inspects ZionX and ZXMG revenue-critical screens for completeness and clarity |
| Permission Testing | Verifies role-based access boundaries and credential safety |
| Readiness Score | Composite score across UX, design, data truth, agentic visibility, revenue, permissions |
| Redesign Recommendations | Structured proposals with evidence, design principles, acceptance criteria, implementation guidance |
| Kiro Task Generation | Converts approved recommendations into structured Kiro implementation tasks |
| Post-Implementation Verification | Retests affected workflows after Kiro implements changes, verifies or reopens |
| Before/After Comparison | Screenshot comparison showing improvement after implementation |
| Scheduled Reviews | Runs after deployments, daily, before rollout, and after failed workflows |
