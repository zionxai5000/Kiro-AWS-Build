# Requirements Document — SeraphimOS Core Platform

## Introduction

SeraphimOS is an AI-powered autonomous orchestration platform — not a traditional operating system, but a coordinated hierarchy of AI agents ("House of Zion") that runs multiple life and business pillars simultaneously. The primary user (the "King") provides vision and approves key decisions, while Seraphim — the top-level orchestrator agent — translates that vision into strategy and drives autonomous execution across all pillars. The platform is cloud-first on AWS, entirely AI-built and AI-maintained, and designed to start as a personal tool before evolving into a multi-tenant product platform.

This document defines the core platform requirements across five architectural layers: Kernel (Seraphim Core), System Services, Application Layer, Interface Layer (Shaar), and Driver Layer (Adapters). Requirements are informed by a brutal-honesty system audit that identified critical gaps in the previous implementation: governance theater without enforcement, single-point-of-failure agent execution, no persistent memory, mock data instead of live state, and zero testing at any level.

## Glossary

- **SeraphimOS**: The complete AI-powered autonomous orchestration platform
- **Seraphim_Core**: The kernel layer and top-level orchestrator agent responsible for translating the King's vision into strategy, agent runtime, state machine engine, permissions, IPC/messaging, resource allocation, lifecycle management, cross-pillar coordination, and platform self-improvement
- **Agent**: An autonomous AI unit that performs tasks within defined authority boundaries, running on a specific LLM model
- **Agent_Program**: A versioned, testable, deployable package defining an agent's behavior, capabilities, permissions, and state machine
- **King**: The primary user who provides vision, approves key decisions, and reviews results. The King does not set strategy — Seraphim translates the King's vision into strategy.
- **Queen**: A family member user who executes specific tasks and interacts via messaging and email
- **Tenant**: A user or family unit running their own SeraphimOS instance with their own pillars and agents
- **Pillar**: A top-level domain of operation (e.g., Eretz for Business, Otzar for Finance) containing agent programs, workflows, data stores, and metrics
- **Zikaron (Memory)**: The 4-layer persistent memory system providing episodic, semantic, procedural, and working memory with vector search
- **Mishmar (Governance)**: The governance-as-code system enforcing authorization, role separation, completion contracts, and audit trails programmatically
- **Shaar (Interface)**: The interface layer providing dashboard, voice, iMessage, email, API, and CLI access
- **Otzar (Resource_Manager)**: The resource management system handling token budgets, cost tracking, model routing, and spend enforcement
- **Eretz (Business_Pillar)**: The master business orchestration sub-agent that sits between Seraphim_Core and all business sub-agents (ZionX, ZXMG, Zion_Alpha). Eretz is the mandatory intermediary in the chain of command (King [vision] → Seraphim [strategy] → Eretz → Subsidiary → Agent), responsible for cross-business synergy detection, reusable business pattern extraction, portfolio-level intelligence aggregation, directive enrichment, training cascade, and operational authority enforcement across all business subsidiaries. Eretz operates as a strategic business leader with operational authority — not a relay or coordinator.
- **Eretz_Synergy_Engine**: The component within Eretz that detects and activates revenue and operational synergies across business subsidiaries (e.g., ZXMG videos including ZionX app commercials, Zion_Alpha insights informing ZionX app ideas)
- **Eretz_Pattern_Library**: The reusable business pattern library maintained by Eretz, containing extracted business architectures, processes, and strategies that have proven successful in one subsidiary and can be applied across all subsidiaries
- **Eretz_Portfolio_Dashboard**: The portfolio-level intelligence dashboard maintained by Eretz, aggregating business metrics (MRR, growth rate, unit economics, CAC, LTV, churn) across all subsidiaries for strategic decision-making
- **Directive_Enrichment**: The process by which Eretz adds business intelligence, context, and strategic guidance to every directive passing through it before forwarding to subsidiary agents — each level in the chain adds intelligence, not just compliance
- **ZionX**: The app factory sub-pillar responsible for building and submitting apps to Apple App Store and Google Play Store. ZionX starts as a single capable agent owning the full app lifecycle, with the right to decompose into subordinate agents when performance testing demonstrates the need.
- **ZXMG**: The media production sub-pillar responsible for systematic content production at scale across YouTube and social platforms. ZXMG operates as a production machine with redundancy, automation, and reliable delivery — not a one-off content creator.
- **Zion_Alpha**: The trading sub-pillar responsible for autonomous trading on Kalshi and Polymarket. Zion_Alpha operates with a trader mindset — spotting edge, sizing positions, executing immediately, and learning from outcomes — not an analyst mindset of research without action.
- **Driver**: An adapter that connects SeraphimOS to an external service (e.g., App Store Connect, YouTube API, Gmail, GitHub)
- **Completion_Contract**: A JSON schema defining the required outputs and verification criteria for a workflow to be considered done
- **Execution_Token**: A programmatic authorization artifact required before an agent can perform a controlled action
- **State_Machine**: A formal definition of allowed states and transitions for an entity (agent, workflow, app lifecycle)
- **Gate**: A verification checkpoint that must pass before a state transition is allowed
- **XO_Audit**: The executive officer audit system that logs all actions, decisions, and authority exercises for accountability
- **Event_Bus**: The asynchronous messaging backbone connecting all system components
- **Learning_Engine**: The continuous improvement system that detects patterns, generates fixes, and feeds learnings back into agent behavior
- **Model_Router**: The component that selects the appropriate LLM model for a task based on complexity, cost, and capability requirements
- **Federated_Intelligence**: The capability for multiple SeraphimOS instances to share learned patterns while maintaining data isolation
- **Recommendation_Queue**: The centralized queue where all sub-agent recommendations are submitted, prioritized, and tracked through the approval-to-execution lifecycle
- **Recommendation_Engine**: The service that manages the Recommendation_Queue, validates recommendation structure, dispatches approved recommendations, and tracks outcomes
- **Industry_Scanner**: The component that monitors external technology sources, assesses relevance to SeraphimOS, and maintains a technology roadmap
- **Heartbeat_Review**: A scheduled review cycle where a sub-agent proactively researches its domain, benchmarks against world-class performance, and generates improvement recommendations
- **Domain_Expertise_Profile**: A structured knowledge base maintained per sub-agent containing research findings, competitive intelligence, decision frameworks, and learned patterns
- **Capability_Maturity_Score**: A metric measuring SeraphimOS progress toward fully autonomous operation across all pillars
- **Reference_Ingestion_Service**: The orchestration component that accepts a URL, determines the reference type (app store listing or YouTube channel), validates the URL, and dispatches to the appropriate analyzer
- **App_Store_Analyzer**: The component that scrapes and analyzes Apple App Store and Google Play Store app listings, extracting UI patterns, onboarding flows, navigation structures, monetization models, notification strategies, interaction patterns, ratings, reviews, and feature lists
- **YouTube_Channel_Analyzer**: The component that analyzes YouTube channels and their videos, extracting hook structures, pacing patterns, thumbnail styles, title patterns, retention curves, editing styles, audio quality indicators, B-roll usage, CTA placement, upload frequency, and engagement metrics
- **Quality_Baseline**: A structured benchmark document derived from reference analysis that defines the minimum acceptable standard across measurable dimensions for a specific domain (app category or content type)
- **Quality_Baseline_Generator**: The component that converts raw reference analysis data into structured, measurable Quality_Baseline documents with scored dimensions and thresholds
- **Baseline_Storage**: The subsystem responsible for persisting Quality_Baselines in Zikaron procedural memory within the appropriate Domain_Expertise_Profile
- **Reference_Quality_Gate**: The enhanced Quality Gate evaluation that scores output against stored Quality_Baselines and produces pass/fail results with specific gap identification
- **Auto_Rework_Loop**: The integration between the Reference_Quality_Gate and the Training Cascade that automatically resubmits rejected output with identified gaps until the Quality_Baseline is met
- **Production_Formula**: A distilled set of principles extracted from video/channel analysis describing what makes content achieve specific performance thresholds (e.g., "50M+ view video formula")
- **App_Quality_Profile**: A distilled set of principles extracted from app analysis describing what makes an app achieve specific quality thresholds (e.g., "4.8-star wellness app profile")

---

## Requirements

### Requirement 1: Agent Runtime and Lifecycle Management

**User Story:** As the King, I want agents to run as persistent, stateful processes with defined lifecycles, so that they maintain context across sessions and operate autonomously without waking up fresh each time.

#### Acceptance Criteria

1. WHEN an Agent_Program is deployed, THE Seraphim_Core SHALL instantiate the agent with its defined state machine, permissions, and memory context
2. WHILE an Agent is running, THE Seraphim_Core SHALL persist the agent's working memory and state across session boundaries
3. WHEN an Agent encounters an unrecoverable error, THE Seraphim_Core SHALL transition the agent to a degraded state, log the error to XO_Audit, and notify Mishmar
4. THE Seraphim_Core SHALL enforce that each Agent operates only within the permissions defined in its Agent_Program
5. WHEN an Agent_Program is updated to a new version, THE Seraphim_Core SHALL perform a rolling transition that preserves the agent's accumulated memory and state
6. THE Seraphim_Core SHALL maintain a registry of all active agents with their current state, assigned pillar, resource consumption, and health status

---

### Requirement 2: State Machine Engine

**User Story:** As the King, I want all workflows and entity lifecycles governed by formal state machines, so that state transitions are predictable, verifiable, and enforceable — not ad-hoc.

#### Acceptance Criteria

1. THE Seraphim_Core SHALL execute state transitions only when all Gate conditions for the transition are satisfied
2. WHEN a state transition is requested without satisfying Gate conditions, THE Seraphim_Core SHALL reject the transition and log the rejection reason to XO_Audit
3. THE Seraphim_Core SHALL support defining State_Machines as versioned, declarative configurations (not embedded in code)
4. WHEN a State_Machine definition is updated, THE Seraphim_Core SHALL migrate existing entities to the new definition without data loss
5. FOR ALL state transitions, THE Seraphim_Core SHALL record the prior state, new state, triggering agent, Gate results, and timestamp in XO_Audit

---

### Requirement 3: Governance as Code (Mishmar)

**User Story:** As the King, I want governance rules enforced programmatically at runtime, so that authorization, role separation, and completion contracts are real constraints — not documentation theater.

#### Acceptance Criteria

1. WHEN an Agent requests an action that exceeds its defined authority level, THE Mishmar SHALL block the action and route an escalation request to the appropriate authority
2. THE Mishmar SHALL enforce that no Agent may both decide and execute the same controlled action within a single workflow
3. WHEN a workflow claims completion, THE Mishmar SHALL validate the outputs against the workflow's Completion_Contract JSON schema before allowing the state transition
4. IF a Completion_Contract validation fails, THEN THE Mishmar SHALL reject the completion claim, log the specific schema violations, and return the workflow to its prior state
5. THE Mishmar SHALL require valid Execution_Tokens from both the authorizing agent and Otzar before permitting a controlled action
6. IF an Agent attempts a controlled action without valid Execution_Tokens, THEN THE Mishmar SHALL block the action and log the violation to XO_Audit
7. THE Mishmar SHALL enforce authority levels (L1 through L4) as defined in the autonomy matrix, where L1 requires King approval, L2 requires designated authority approval, L3 requires peer verification, and L4 is autonomous within defined bounds

---

### Requirement 4: Persistent Memory System (Zikaron)

**User Story:** As the King, I want a 4-layer persistent memory system with vector search, so that agents remember past decisions, learn from failures, and build institutional knowledge over time.

#### Acceptance Criteria

1. THE Zikaron SHALL maintain four distinct memory layers: episodic (event history), semantic (facts and relationships), procedural (learned workflows), and working (active task context)
2. WHEN an Agent queries Zikaron, THE Zikaron SHALL return semantically relevant results using vector similarity search across all four memory layers
3. WHEN an event is recorded in episodic memory, THE Zikaron SHALL automatically extract and store entities and relationships in semantic memory
4. WHEN an Agent completes a workflow successfully, THE Zikaron SHALL extract the execution pattern and store it in procedural memory for reuse
5. WHEN an Agent starts a new session, THE Zikaron SHALL load the agent's relevant working memory, recent episodic context, and applicable procedural patterns
6. THE Zikaron SHALL support cross-agent memory queries so that one agent can access relevant memories from other agents within the same Tenant, subject to Mishmar authorization
7. WHEN a memory entry conflicts with an existing entry, THE Zikaron SHALL flag the conflict and retain both entries with metadata indicating the conflict

---

### Requirement 5: Resource Management and Cost Optimization (Otzar)

**User Story:** As the King, I want intelligent resource management that enforces budgets, routes to cost-effective models, and prevents token waste, so that the system achieves a 50% cost reduction through smart model routing.

#### Acceptance Criteria

1. WHEN a task is submitted for execution, THE Model_Router SHALL automatically select the optimal LLM model based on task type, complexity assessment, cost constraints, and historical performance data — similar to Kiro's auto-routing where the system chooses the best model without user intervention
2. THE Otzar SHALL enforce daily and monthly token budgets per Agent, per Pillar, and system-wide
3. IF an Agent's token request would exceed its budget allocation, THEN THE Otzar SHALL block the request and notify Mishmar for escalation
4. THE Otzar SHALL track and report real-time cost data including per-agent spend, per-pillar spend, model utilization, and cost-per-task metrics
5. WHEN the same task pattern has been executed previously, THE Otzar SHALL cache the result and serve it from cache when the inputs match, avoiding redundant LLM calls
6. THE Otzar SHALL generate daily cost optimization reports identifying waste patterns, model routing inefficiencies, and savings opportunities

---

### Requirement 6: Inter-Process Communication and Event Bus

**User Story:** As the King, I want a reliable asynchronous messaging backbone connecting all system components, so that agents, services, and drivers communicate without tight coupling or single points of failure.

#### Acceptance Criteria

1. THE Event_Bus SHALL deliver messages between any two system components (agents, services, drivers) with at-least-once delivery guarantees
2. WHEN a message cannot be delivered after the configured retry limit, THE Event_Bus SHALL route the message to a dead-letter queue and notify XO_Audit
3. THE Event_Bus SHALL support publish-subscribe patterns so that multiple consumers can react to the same event independently
4. WHILE the Event_Bus is processing messages, THE Event_Bus SHALL maintain message ordering within a single topic partition
5. THE Event_Bus SHALL enforce message schema validation before accepting a message for delivery

---

### Requirement 7: Executive Audit System (XO Audit)

**User Story:** As the King, I want a comprehensive audit trail of all system actions, decisions, and authority exercises, so that I have complete visibility into what happened, who did it, and why.

#### Acceptance Criteria

1. THE XO_Audit SHALL record every controlled action with the acting agent, action type, target, authorization chain, timestamp, and outcome
2. THE XO_Audit SHALL record every Mishmar governance decision including authorization checks, escalations, Completion_Contract validations, and Execution_Token grants
3. THE XO_Audit SHALL record every state transition with the State_Machine identifier, prior state, new state, Gate results, and triggering event
4. WHEN the King queries the audit trail, THE XO_Audit SHALL support filtering by agent, time range, action type, pillar, and outcome
5. THE XO_Audit SHALL retain audit records for a minimum of 365 days with immutable storage — no agent may modify or delete audit records

---

### Requirement 8: Continuous Improvement and Learning Engine

**User Story:** As the King, I want the system to automatically detect failure patterns, generate fixes, and improve its own behavior over time, so that zero repeat failures occur and 80% of problems are resolved autonomously.

#### Acceptance Criteria

1. WHEN a failure occurs, THE Learning_Engine SHALL perform automated root cause analysis by correlating the failure with historical patterns in Zikaron
2. WHEN the Learning_Engine identifies a recurring failure pattern (same root cause occurring more than once), THE Learning_Engine SHALL generate a fix proposal and submit it for verification
3. WHEN a fix proposal passes verification, THE Learning_Engine SHALL apply the fix to the relevant Agent_Program or workflow definition and record the improvement in Zikaron procedural memory
4. IF a fix proposal fails verification, THEN THE Learning_Engine SHALL escalate to the appropriate authority level and log the failed attempt
5. THE Learning_Engine SHALL track improvement metrics including: repeat failure rate, autonomous resolution rate, mean time to resolution, and fix success rate
6. WHEN the Learning_Engine consumes its own reflections and performance data, THE Learning_Engine SHALL generate behavioral modifications as versioned Agent_Program updates — not as unstructured text files

---

### Requirement 9: Interface Layer (Shaar)

**User Story:** As the King, I want to interact with SeraphimOS through multiple channels — dashboard, voice, iMessage, email, API, and CLI — so that I can monitor and command the system from anywhere.

#### Acceptance Criteria

1. THE Shaar SHALL provide a real-time web dashboard displaying live agent status, pillar metrics, cost data, workflow states, and system health — using actual live data, not mock or aspirational data
2. WHEN the King issues a command through any Shaar channel (dashboard, voice, iMessage, email, API, CLI), THE Shaar SHALL route the command to Seraphim_Core with the same semantic interpretation regardless of channel
3. THE Shaar SHALL deliver system alerts and notifications through the King's preferred channel within 60 seconds of the triggering event
4. THE Shaar SHALL authenticate all access using the Tenant's identity and enforce Mishmar authorization for all commands
5. WHEN a Queen interacts through messaging or email, THE Shaar SHALL scope the interaction to the Queen's authorized pillars and actions as defined in Mishmar

---

### Requirement 10: Driver Layer (Adapters)

**User Story:** As the King, I want standardized adapters for all external services, so that integrations are reliable, testable, and replaceable — not ad-hoc browser automation scripts.

#### Acceptance Criteria

1. THE Driver layer SHALL expose a uniform interface for all external service integrations, where each Driver implements connect, execute, verify, and disconnect operations
2. WHEN a Driver connects to an external service, THE Driver SHALL authenticate using securely stored credentials managed by Otzar and validate the connection before reporting ready status
3. IF a Driver operation fails, THEN THE Driver SHALL retry with exponential backoff up to the configured retry limit, then report the failure to the Event_Bus with the error details
4. THE Driver layer SHALL maintain session state across operations to avoid redundant authentication and navigation
5. WHEN a new Driver is added, THE Driver layer SHALL validate that the Driver implements the uniform interface and passes integration tests before activation
6. THE Driver layer SHALL include Drivers for: App Store Connect (Apple), Google Play Console, YouTube API, Kalshi API, Polymarket API, Gmail API, GitHub API, RevenueCat API, HeyGen API, n8n webhook integration, LLM provider APIs, browser automation, Telegram API, Rumble API, Reddit API, X (Twitter) API, Instagram API, Facebook/Meta API, TikTok API, Google Ads API, Zeely API, WhatsApp API, Discord API, Stripe API, and iMessage integration

---

### Requirement 11: Business Pillar — ZionX App Factory

**User Story:** As the King, I want an autonomous app factory that builds, tests, and submits apps to both Apple App Store and Google Play Store, so that the system generates revenue through app submissions without manual intervention.

#### Acceptance Criteria

1. WHEN a ZionX app build is initiated, THE ZionX SHALL execute the full build pipeline including code generation, compilation, testing, and packaging for both iOS and Android targets
2. WHEN a ZionX app is ready for submission, THE ZionX SHALL execute all Gate checks (metadata validation, subscription compliance, IAP sandbox testing, screenshot verification, privacy policy presence, EULA link) before allowing submission
3. IF any Gate check fails during app submission, THEN THE ZionX SHALL block the submission, log the specific failures, and generate a remediation plan
4. WHEN an app submission is rejected by Apple or Google, THE ZionX SHALL parse the rejection reason, create new Gate checks to prevent the same rejection, and store the pattern in Zikaron procedural memory
5. THE ZionX SHALL track each app through its complete lifecycle using a State_Machine with states: ideation, development, testing, gate-review, submission, in-review, approved, rejected, live, and deprecated
6. THE ZionX SHALL submit apps to both Apple App Store and Google Play Store as parallel workflows, tracking each platform's status independently

---

### Requirement 11b: Business Pillar — ZionX Go-To-Market Engine

**User Story:** As the King, I want a fully autonomous go-to-market engine integrated into the app factory, so that every app that passes gate review is automatically marketed, promoted, and revenue-optimized across all digital channels — not just built and submitted.

#### Acceptance Criteria

1. WHEN a ZionX app passes gate review, THE ZionX GTM Engine SHALL automatically generate a go-to-market plan including ASO strategy, social media content calendar, ad campaign configuration, and landing page specification
2. THE ZionX GTM Engine SHALL execute ASO optimization for every live app including keyword research, title/subtitle A/B testing, screenshot generation, preview video creation, and localized store listing optimization for both Apple App Store and Google Play Store
3. WHEN a ZionX app is published to a store, THE ZionX GTM Engine SHALL automatically launch social media campaigns across configured platforms (TikTok, Instagram, X, Facebook, Reddit, YouTube Shorts) using AI-generated content via the HeyGen, LLM, and social media Drivers
4. THE ZionX GTM Engine SHALL create and manage paid acquisition campaigns via the Google Ads Driver, tracking ROAS (Return on Ad Spend) per app and automatically adjusting bids and budgets based on performance data
5. THE ZionX GTM Engine SHALL generate landing pages for each app via the Zeely Driver with conversion-optimized copy, app store badges, and analytics tracking
6. WHEN a ZionX app has been live for more than 7 days, THE ZionX GTM Engine SHALL analyze performance metrics (downloads, conversion rate, retention, ARPU, LTV, churn rate) and generate optimization recommendations stored in Zikaron
7. THE ZionX GTM Engine SHALL implement cross-promotion between apps in the portfolio, routing users from high-traffic apps to new or underperforming apps
8. THE ZionX GTM Engine SHALL track revenue attribution across all marketing channels and report which channels drive the highest LTV users per app
9. WHEN the ZionX GTM Engine identifies an app with declining metrics (downloads dropping >20% week-over-week or retention below threshold), THE ZionX GTM Engine SHALL generate a re-engagement plan and execute it through configured channels
10. THE ZionX GTM Engine SHALL maintain a portfolio health dashboard showing per-app revenue, marketing spend, ROAS, and a recommendation for each app: scale, maintain, optimize, or deprecate

---

### Requirement 11c: Business Pillar — ZionX App Quality and Design Excellence

**User Story:** As the King, I want every app produced by ZionX to have production-quality UI/UX, branding, and user journey design comparable to top-tier apps in the market, so that apps capture and retain users rather than looking like low-effort vibecoded output.

#### Acceptance Criteria

1. WHEN a ZionX app enters the development phase, THE ZionX SHALL generate a complete design system for the app including color palette, typography scale, spacing system, component library, iconography, and animation specifications — unique per app with less than 70% visual similarity to other apps in the portfolio
2. THE ZionX SHALL implement a user journey engine that defines onboarding flow, first-session experience, core loop, retention mechanics, and monetization touchpoints for each app before code generation begins
3. WHEN generating app UI, THE ZionX SHALL produce custom components with micro-interactions, transitions, haptic feedback specifications, and accessibility compliance (WCAG 2.1 AA minimum) — not default platform widgets or template layouts
4. THE ZionX SHALL include a Gate check for design quality that evaluates the app against top-10 competitors in its niche, scoring on visual polish, interaction design, information architecture, and onboarding effectiveness before allowing submission
5. THE ZionX SHALL generate branded assets for each app including app icon (1024x1024), splash screen, in-app header, promotional artwork, and feature graphic — all consistent with the app's design system
6. THE ZionX SHALL maintain a design intelligence system that continuously analyzes top-performing apps in each target niche — extracting UI patterns, layout structures, color trends, animation styles, onboarding flows, and monetization UX from top-10 ranked apps per category on both Apple App Store and Google Play Store — and store these patterns in Zikaron procedural memory
7. THE ZionX SHALL maintain a versioned template library of production-quality UI templates organized by app category, where each template is derived from design intelligence analysis of current market leaders and auto-updates when new design trends are detected
8. WHEN generating UI for a new app, THE ZionX SHALL select and customize templates from the template library based on the app's category and niche, ensuring the output reflects current best-in-class design standards rather than generic or outdated patterns

---

### Requirement 11d: Business Pillar — ZionX Playable Ads and In-App Advertising

**User Story:** As the King, I want ZionX to produce playable ad demos for user acquisition and integrate in-app advertising as a revenue stream, so that apps both attract users through interactive previews and generate ad revenue from engaged users.

#### Acceptance Criteria

1. WHEN a ZionX app reaches the marketing state, THE ZionX SHALL generate playable ad demos — interactive mini-experiences that showcase the app's core value proposition in 15-30 second playable format compatible with major ad networks (AdMob, Unity Ads, AppLovin, ironSource)
2. THE ZionX SHALL produce video ad creatives in multiple formats: 15-second vertical (TikTok/Reels/Shorts), 30-second horizontal (YouTube pre-roll), and 6-second bumper ads — using AI-generated content via HeyGen and LLM drivers
3. WHEN a ZionX app is configured for ad monetization, THE ZionX SHALL integrate ad SDK placements (banner, interstitial, rewarded video, native ads) with intelligent frequency capping and user experience optimization to maximize ad revenue without degrading retention
4. THE ZionX SHALL manage ad mediation across multiple ad networks to maximize fill rate and eCPM, automatically shifting traffic to the highest-paying network
5. THE ZionX SHALL track ad revenue per app alongside subscription revenue, reporting total revenue per user (ARPU) combining both streams in the portfolio dashboard
6. WHEN a ZionX app's ad revenue exceeds a configurable threshold, THE ZionX SHALL reinvest a percentage of ad revenue into paid acquisition campaigns for that app via the GTM Engine

---

### Requirement 12: Business Pillar — ZXMG Media Production

**User Story:** As the King, I want autonomous media production that creates and publishes content to YouTube and social platforms, so that the system builds audience and generates ad revenue without manual content creation.

#### Acceptance Criteria

1. WHEN a ZXMG content production workflow is initiated, THE ZXMG SHALL execute the pipeline: script generation, media asset creation, video assembly, metadata preparation, and platform upload
2. THE ZXMG SHALL validate all content against platform-specific requirements (video format, duration limits, metadata character limits, thumbnail specifications) before upload
3. IF a content upload fails, THEN THE ZXMG SHALL diagnose the failure, apply the appropriate fix, and retry the upload
4. THE ZXMG SHALL track content performance metrics (views, engagement, revenue) through the YouTube API Driver and store results in Zikaron for pattern analysis

---

### Requirement 13: Business Pillar — Zion Alpha Trading

**User Story:** As the King, I want autonomous trading on prediction markets, so that the system generates revenue through informed position management on Kalshi and Polymarket.

#### Acceptance Criteria

1. WHEN Zion_Alpha identifies a trading opportunity, THE Zion_Alpha SHALL evaluate the opportunity against risk parameters defined in its Agent_Program before executing
2. THE Zion_Alpha SHALL enforce position size limits and daily loss limits as defined in Otzar, blocking trades that would exceed these limits
3. WHILE Zion_Alpha holds open positions, THE Zion_Alpha SHALL monitor positions at the configured interval and execute exit strategies when trigger conditions are met
4. THE Zion_Alpha SHALL log every trade decision (entry, exit, hold) with the reasoning, market data, and outcome to XO_Audit and Zikaron

---

### Requirement 14: Multi-Tenant and Family Support

**User Story:** As the King, I want multi-user support where family members have their own scoped instances that coordinate with the main instance, so that Queens can operate within their authorized domains while the King maintains oversight.

#### Acceptance Criteria

1. THE SeraphimOS SHALL support multiple Tenants, where each Tenant has isolated pillars, agents, memory, and resource budgets
2. WHEN a Queen is provisioned, THE Mishmar SHALL create a scoped authorization profile limiting the Queen to designated pillars and action types
3. WHILE a Queen is operating within their authorized scope, THE SeraphimOS SHALL provide the same autonomous capabilities available to the King within that scope
4. THE SeraphimOS SHALL support cross-Tenant coordination where authorized, allowing a Queen's workflow to trigger actions in the King's pillars with appropriate Execution_Tokens
5. WHEN a future platform user provisions a new Tenant, THE SeraphimOS SHALL create an isolated instance with default pillars, a fresh Zikaron, and independent Otzar budgets

---

### Requirement 15: Deployment and Infrastructure

**User Story:** As the King, I want the platform deployed on AWS and accessible from anywhere, so that the system runs reliably in the cloud without requiring the King to manage infrastructure.

#### Acceptance Criteria

1. THE SeraphimOS SHALL deploy to AWS using infrastructure-as-code with automated provisioning, scaling, and teardown
2. THE SeraphimOS SHALL encrypt all data at rest and in transit using AWS-managed encryption keys
3. WHEN system load exceeds the configured threshold, THE SeraphimOS SHALL auto-scale compute resources within the budget limits defined in Otzar
4. THE SeraphimOS SHALL maintain 99.5% uptime for core services (Seraphim_Core, Mishmar, Zikaron, Event_Bus) measured on a monthly basis
5. IF a core service becomes unavailable, THEN THE SeraphimOS SHALL failover to a standby instance within 120 seconds and notify the King through Shaar
6. THE SeraphimOS SHALL produce deployment artifacts through a CI/CD pipeline that includes automated testing, Gate verification, and staged rollout

---

### Requirement 16: Federated Intelligence

**User Story:** As the King, I want multiple SeraphimOS instances to share learned patterns while maintaining data isolation, so that each instance benefits from collective intelligence without exposing private data.

#### Acceptance Criteria

1. WHEN the Learning_Engine generates a verified improvement pattern, THE Federated_Intelligence SHALL publish the anonymized pattern to the shared pattern registry
2. THE Federated_Intelligence SHALL enforce that no Tenant-specific data (memory contents, financial data, credentials, personal information) is included in shared patterns
3. WHEN a new pattern is available in the shared registry, THE Federated_Intelligence SHALL evaluate the pattern's applicability to the local instance and propose adoption through the Learning_Engine
4. THE Federated_Intelligence SHALL track pattern provenance, adoption rate, and effectiveness across instances

---

### Requirement 17: Agent Marketplace

**User Story:** As the King, I want an agent marketplace where Agent_Programs can be published, discovered, and installed, so that the platform becomes a product others can build on.

#### Acceptance Criteria

1. WHEN an Agent_Program is published to the marketplace, THE Agent_Marketplace SHALL validate that the program includes a versioned definition, test suite, Completion_Contracts, and documentation
2. WHEN a Tenant installs an Agent_Program from the marketplace, THE SeraphimOS SHALL deploy the agent within the Tenant's isolated environment with the Tenant's Mishmar authorization rules applied
3. THE Agent_Marketplace SHALL track Agent_Program ratings, installation count, and verified performance metrics
4. THE Agent_Marketplace SHALL enforce that installed Agent_Programs operate within the installing Tenant's Otzar budget and Mishmar authority constraints

---

### Requirement 18: Observability and Real-Time Visibility

**User Story:** As the King, I want real-time system visibility with actual live data, so that I can see exactly what the system is doing, what it costs, and where problems exist — no mock data, no aspirational dashboards.

#### Acceptance Criteria

1. THE SeraphimOS SHALL expose real-time metrics for: active agent count, agent states, task queue depth, event bus throughput, memory utilization, and error rates
2. THE SeraphimOS SHALL expose real-time cost metrics for: per-agent token spend, per-pillar spend, model utilization breakdown, and projected daily/monthly costs
3. WHEN any metric exceeds its configured alert threshold, THE SeraphimOS SHALL generate an alert and deliver it through Shaar within 60 seconds
4. THE SeraphimOS SHALL provide a system health endpoint that returns the operational status of every core service, driver, and active agent
5. THE SeraphimOS SHALL display only verified, live data in all dashboards and reports — no placeholder, mock, or aspirational data at any time

---

### Requirement 19: Testing and Verification Infrastructure

**User Story:** As the King, I want testing built into every layer of the system, so that the V-model is enforced and requirements are tied to executable tests — not documentation theater.

#### Acceptance Criteria

1. THE SeraphimOS SHALL require that every Agent_Program includes a test suite that validates its Completion_Contracts and state machine transitions before deployment
2. THE SeraphimOS SHALL execute integration tests for every Driver before activating the Driver in production
3. WHEN a code change is submitted to the CI/CD pipeline, THE SeraphimOS SHALL execute unit tests, integration tests, and Gate verifications before allowing the change to proceed
4. THE SeraphimOS SHALL maintain traceability from each requirement to its corresponding test cases, and report coverage gaps
5. IF a test suite does not cover all Completion_Contract conditions for an Agent_Program, THEN THE SeraphimOS SHALL block deployment and report the coverage gap

---

### Requirement 20: Security and Access Control

**User Story:** As the King, I want comprehensive security across the platform, so that credentials are protected, access is controlled, and the system is resilient to unauthorized actions.

#### Acceptance Criteria

1. THE SeraphimOS SHALL store all external service credentials in AWS Secrets Manager and retrieve them at runtime — credentials shall not exist in code, configuration files, or memory logs
2. THE SeraphimOS SHALL authenticate every API request using short-lived tokens with scoped permissions tied to the requesting Tenant and user role
3. WHEN an authentication or authorization failure occurs, THE SeraphimOS SHALL log the attempt to XO_Audit with the source, target, and failure reason
4. THE SeraphimOS SHALL enforce network-level isolation between Tenants using AWS VPC configurations
5. THE SeraphimOS SHALL rotate external service credentials on a configurable schedule without service interruption


---

### Requirement 21: Autonomous SME Review Cycles

**User Story:** As the King, I want each business sub-agent to operate as a world-class Subject Matter Expert in its domain — one that independently researches what the best in the world are doing, figures out the path to get there, tells me exactly what needs to happen, and then executes — so that I don't need to know the path myself, the agents find it.

#### Acceptance Criteria

1. WHILE a sub-agent is active, THE Seraphim_Core SHALL execute a scheduled "heartbeat" review cycle at a configurable interval (default: daily for Eretz, ZionX, and ZXMG, hourly for Zion_Alpha, weekly for Seraphim_Core) where the sub-agent proactively researches its domain, benchmarks against the best in the world, and identifies the gap between current performance and world-class performance
2. WHEN a heartbeat review cycle executes, THE sub-agent SHALL produce a structured analysis report containing: current performance benchmarks, world-class benchmarks for comparison, gap analysis, a ranked list of actions to close the gap, and estimated impact per action
3. THE ZionX agent SHALL autonomously research the top-grossing apps in each target niche, reverse-engineer what makes them successful (monetization models, retention mechanics, ASO strategies, user acquisition funnels, UI/UX patterns), compare against the ZionX portfolio, and generate specific improvement plans that move each app toward best-in-class revenue performance
4. THE ZXMG agent SHALL autonomously research the highest-performing YouTube channels and social media accounts in target niches, analyze what drives their views and engagement (thumbnails, titles, content structure, posting cadence, audience retention curves, algorithm signals), compare against ZXMG content performance, and generate specific content strategy changes to maximize views and audience growth
5. THE Zion_Alpha agent SHALL autonomously research the most successful prediction market strategies, analyze historical market data for pattern recognition, backtest strategy variations against real market outcomes, evaluate risk-adjusted returns across different approaches, and generate specific strategy refinements to maximize returns while managing risk
6. THE Seraphim_Core agent SHALL autonomously research the most advanced AI orchestration systems, autonomous agent architectures, and infrastructure patterns in the industry, evaluate which advances are applicable to SeraphimOS, and generate specific architectural improvements to move the platform toward fully autonomous capability
7. WHEN a sub-agent completes a heartbeat review, THE sub-agent SHALL write all recommendations to the Recommendation_Queue with priority scores, estimated effort, expected impact metrics, and a clear explanation of why each action moves the domain closer to world-class performance

---

### Requirement 22: Proactive Recommendation Engine

**User Story:** As the King, I want agents to tell me exactly what needs to happen to make each business pillar the best in the world, present a clear plan, and execute it once I approve — so that Seraphim drives strategy from my vision, domain agents drive execution with world-class expertise, and I make the final call on vision and approval.

#### Acceptance Criteria

1. THE Recommendation_Engine SHALL maintain a structured queue of pending recommendations from all sub-agents, sorted by priority score and grouped by domain, with each recommendation framed as "here is what the best in the world do, here is where we are, here is how to close the gap"
2. WHEN a recommendation is submitted to the queue, THE Recommendation_Engine SHALL validate the recommendation structure (world-class benchmark, current state assessment, gap analysis, proposed action plan, estimated impact, estimated effort, risk assessment, rollback plan) before accepting it
3. THE Recommendation_Engine SHALL present pending recommendations to the King through Shaar with sufficient context for informed approval or rejection — including evidence from research, competitive benchmarks, and projected outcomes
4. WHEN the King approves a recommendation, THE Recommendation_Engine SHALL dispatch the recommendation to the originating sub-agent for autonomous execution, coordinate with Seraphim_Core for any cross-system changes, and track implementation progress to completion
5. WHEN the King rejects a recommendation, THE Recommendation_Engine SHALL record the rejection reason in Zikaron so that the sub-agent learns from the feedback and refines future recommendations accordingly
6. IF a recommendation has been pending for longer than a configurable threshold (default: 48 hours), THEN THE Recommendation_Engine SHALL escalate the recommendation by re-notifying the King through the preferred alert channel with a summary of potential impact being delayed
7. THE Recommendation_Engine SHALL track recommendation outcomes (approved, rejected, implemented, actual impact measured) and feed results back to the originating sub-agent to calibrate future estimates and improve recommendation quality over time

---

### Requirement 23: Domain Expertise and Autonomous Research

**User Story:** As the King, I want each sub-agent to build and maintain deep domain expertise through continuous autonomous research, so that agents genuinely understand their domain at an expert level and can independently discover the path to world-class performance.

#### Acceptance Criteria

1. THE SeraphimOS SHALL maintain domain expertise profiles for each sub-agent encoded as structured knowledge bases containing: domain-specific research findings, competitive intelligence, decision frameworks, quality benchmarks, industry best practices, and learned patterns from past execution
2. WHEN a sub-agent is initialized, THE Seraphim_Core SHALL load the agent's domain expertise profile into its working context alongside its Agent_Program, giving the agent full access to its accumulated domain knowledge
3. THE ZionX expertise profile SHALL encode and continuously update knowledge of: top-grossing app strategies by category, app store review guidelines and common rejection patterns for Apple and Google, monetization model benchmarks (subscription vs. IAP vs. ad-supported), user acquisition cost benchmarks by channel, retention curve benchmarks by app category, ASO keyword strategies, and UI/UX patterns from top-10 apps per target niche
4. THE ZXMG expertise profile SHALL encode and continuously update knowledge of: YouTube algorithm signals and ranking factors, thumbnail and title optimization patterns from top-performing channels, content structure patterns that maximize audience retention, optimal posting cadence by niche, cross-platform content repurposing strategies, monetization benchmarks (CPM, RPM, sponsorship rates), and audience growth tactics used by the fastest-growing channels
5. THE Zion_Alpha expertise profile SHALL encode and continuously update knowledge of: prediction market mechanics and liquidity patterns for Kalshi and Polymarket, historical accuracy of different forecasting methodologies, risk management frameworks used by professional traders, position sizing models (Kelly criterion, fractional Kelly, fixed-fractional), market microstructure patterns, and correlation analysis between prediction markets and real-world events
6. THE Seraphim_Core expertise profile SHALL encode and continuously update knowledge of: state-of-the-art autonomous agent architectures, multi-agent coordination patterns, LLM orchestration frameworks, infrastructure cost optimization techniques, self-improving system designs, and emerging AI capabilities relevant to autonomous orchestration
7. WHEN a sub-agent conducts research during a heartbeat review cycle, THE sub-agent SHALL update its domain expertise profile with new findings, tag entries with source and confidence level, and flag entries that contradict existing knowledge for resolution
8. WHEN a sub-agent learns a new pattern through the Learning_Engine, successful task execution, or research, THE Seraphim_Core SHALL update the agent's domain expertise profile and propagate relevant cross-domain insights to other sub-agents

---

### Requirement 24: Industry Awareness Scanner

**User Story:** As the King, I want Seraphim to continuously scan for AI industry advances and emerging technologies, so that the platform stays ahead of the curve and I know when new capabilities become available that could give us an edge.

#### Acceptance Criteria

1. THE Industry_Scanner SHALL monitor configurable sources (AI research feeds, technology blogs, framework release notes, cloud provider announcements, open-source project releases, AI benchmark leaderboards) on a scheduled basis (default: daily)
2. WHEN the Industry_Scanner identifies a new technology, framework, model, or capability relevant to SeraphimOS or any sub-agent domain, THE Industry_Scanner SHALL generate an assessment report containing: capability description, relevance to current architecture, which sub-agents would benefit, adoption complexity, estimated benefit, competitive advantage potential, and recommended adoption timeline
3. THE Industry_Scanner SHALL maintain a technology roadmap showing: capabilities available today, capabilities expected within 3 months, capabilities expected within 6 months, and capabilities expected within 12 months — with specific notes on how each capability could improve ZionX, ZXMG, Zion_Alpha, or Seraphim_Core
4. WHEN a monitored technology reaches production readiness and the Industry_Scanner assesses it as high-impact, THE Industry_Scanner SHALL generate an adoption recommendation and submit it to the Recommendation_Queue with a concrete integration plan
5. THE Industry_Scanner SHALL categorize discoveries by relevance to each sub-agent domain (ZionX, ZXMG, Zion_Alpha, Seraphim_Core) and notify the relevant sub-agent when domain-specific advances are detected so the sub-agent can incorporate the advance into its next heartbeat research cycle
6. THE Industry_Scanner SHALL store all technology assessments in Zikaron semantic memory for cross-referencing with future discoveries and platform planning

---

### Requirement 25: Self-Improvement Loop

**User Story:** As the King, I want Seraphim to continuously improve its own architecture, performance, and capabilities — evolving toward fully autonomous operation — so that the platform gets smarter and more capable over time without requiring manual engineering for every improvement.

#### Acceptance Criteria

1. THE Seraphim_Core SHALL execute a self-assessment cycle at a configurable interval (default: weekly) evaluating: system performance metrics, error rates, resource utilization, cost efficiency, agent effectiveness, recommendation quality scores, research depth, and architectural bottlenecks — benchmarked against the platform's own historical trajectory and industry state-of-the-art
2. WHEN the self-assessment identifies an improvement opportunity, THE Seraphim_Core SHALL generate a self-improvement proposal containing: current state analysis, proposed change, expected improvement, implementation plan, verification criteria, and rollback plan
3. THE Seraphim_Core SHALL submit self-improvement proposals to the Recommendation_Queue for King approval before implementation
4. WHEN a self-improvement proposal is approved, THE Seraphim_Core SHALL implement the change, verify it against the defined criteria, and record the outcome in Zikaron procedural memory
5. IF a self-improvement implementation fails verification, THEN THE Seraphim_Core SHALL execute the rollback plan, log the failure to XO_Audit, and update the proposal with failure analysis
6. THE Seraphim_Core SHALL track self-improvement metrics including: proposals generated, proposals approved, proposals implemented successfully, cumulative performance improvement, cost savings achieved, and a "capability maturity score" measuring progress toward full autonomous operation
7. THE Seraphim_Core SHALL maintain a capability gap analysis comparing current SeraphimOS capabilities against the target vision (fully autonomous orchestration across all pillars) and prioritize self-improvement proposals that close the largest capability gaps

---

### Requirement 26: Recommendation Queue and Approval Workflow

**User Story:** As the King, I want a centralized queue where all agent recommendations flow through a structured approval workflow, so that I maintain strategic control while agents drive tactical execution autonomously.

#### Acceptance Criteria

1. THE Recommendation_Queue SHALL store all pending recommendations with: originating agent, domain, priority score (1-10), world-class benchmark reference, current state assessment, gap analysis, proposed action plan, estimated impact, estimated effort, risk level, and submission timestamp
2. THE Recommendation_Queue SHALL support batch approval — the King can approve or reject multiple recommendations in a single action
3. WHEN a recommendation is approved, THE Recommendation_Queue SHALL create a tracked execution task assigned to the originating sub-agent with defined completion criteria and coordinate with Seraphim_Core for any cross-system dependencies
4. WHILE a recommendation is being executed, THE Recommendation_Queue SHALL track execution progress and report status through Shaar
5. WHEN a recommendation execution completes, THE Recommendation_Queue SHALL compare actual outcomes against estimated impact and store the variance in Zikaron for calibration of future estimates
6. THE Recommendation_Queue SHALL provide summary views: pending by domain, approved and in-progress, completed with impact analysis, rejected with reasons, and a "path to world-class" dashboard showing cumulative progress per domain
7. THE Recommendation_Queue SHALL enforce that recommendations requiring budget allocation above a configurable threshold obtain Otzar approval in addition to King approval

---

### Requirement 27: Kiro Integration Layer

**User Story:** As the King, I want SeraphimOS to integrate with Kiro through steering files, hooks, and triggers, so that the autonomous review cycles, research findings, and improvement loops are actionable within the development environment immediately.

#### Acceptance Criteria

1. THE SeraphimOS SHALL generate and maintain Kiro steering files encoding each sub-agent's domain expertise, research findings, decision frameworks, and operational procedures in the `.kiro/steering/` directory
2. THE SeraphimOS SHALL define Kiro hooks that automate review cycles — including file-change triggers for code quality review, scheduled triggers for heartbeat analysis, and event-driven triggers for recommendation processing
3. WHEN a sub-agent generates a recommendation that requires code changes, THE SeraphimOS SHALL produce the recommendation as a structured Kiro task with acceptance criteria, implementation guidance, verification steps, and references to the research that motivated the recommendation
4. THE SeraphimOS SHALL maintain a Kiro skill definition for each sub-agent domain that encapsulates the agent's expertise and can be activated during development sessions
5. WHEN the Industry_Scanner detects a relevant advance, THE SeraphimOS SHALL update the appropriate Kiro steering files to reflect new best practices, capabilities, and integration opportunities
6. THE SeraphimOS SHALL generate a master steering file that describes the complete SeraphimOS architecture, conventions, operational procedures, and current capability maturity for use during Kiro development sessions


---

### Requirement 28: Seraphim Core — Autonomous Platform Strategist and Orchestrator

**User Story:** As the King, I want Seraphim Core to operate as the autonomous platform strategist and orchestrator — the kernel-level agent that takes my vision and translates it into strategy, proactively anticipates my needs, coordinates all pillars, enforces systems engineering discipline, maintains system health, and pushes without being asked — so that I provide vision and approval while Seraphim owns strategy and drives execution forward, and engineering quality is built into the platform by design.

#### Acceptance Criteria

##### 28a: Proactive Orchestration

1. WHILE Seraphim_Core is active, THE Seraphim_Core SHALL proactively monitor all pillar operations, detect emerging issues before they escalate, and initiate corrective actions within its governed authority without waiting for King directives
2. WHEN Seraphim_Core detects a pattern of declining performance across any pillar (error rate increasing, throughput decreasing, cost efficiency dropping), THE Seraphim_Core SHALL generate a diagnostic report and initiate remediation within its authority bounds, escalating to the King only when remediation requires authority beyond L4
3. THE Seraphim_Core SHALL maintain a rolling 72-hour anticipation queue — predicting likely King needs based on current system state, pillar performance trends, scheduled events, and historical directive patterns — and pre-prepare resources, analyses, or recommendations before they are requested
4. WHEN the King issues a directive, THE Seraphim_Core SHALL decompose the directive into sub-tasks, assign them to the appropriate pillar agents through the chain of command (via Eretz for business pillars), track execution progress, and report completion with outcome metrics

##### 28b: System Health and Coordination

5. THE Seraphim_Core SHALL execute a continuous system health assessment at a configurable interval (default: every 5 minutes) evaluating: agent health across all pillars, Event Bus throughput, Zikaron query latency, Otzar budget utilization, Mishmar governance compliance, and Driver connection status
6. WHEN Seraphim_Core identifies a system health degradation, THE Seraphim_Core SHALL classify the degradation severity (warning, critical, emergency), initiate the appropriate response protocol, and notify the King through Shaar if severity is critical or above
7. THE Seraphim_Core SHALL coordinate cross-pillar operations — ensuring that when one pillar's action affects another (e.g., ZionX app launch triggering ZXMG promotional content), the dependent actions are orchestrated in the correct sequence with proper resource allocation

##### 28c: Governance-Enabled Execution

8. THE Seraphim_Core SHALL execute directly within its governed authority as defined by Mishmar — including system maintenance, agent lifecycle management, resource reallocation, and cross-pillar coordination — without requiring external approval for L4 autonomous actions
9. WHEN Seraphim_Core needs to perform an action that exceeds its L4 authority, THE Seraphim_Core SHALL submit the action as a structured request to the appropriate authority level through Mishmar, including the business justification, expected impact, and urgency assessment
10. THE Seraphim_Core SHALL maintain its own Agent_Program with a defined state machine (initializing → ready → orchestrating → health_check → anticipating → coordinating_cross_pillar → v_model_audit → degraded → terminated), heartbeat review cycle (weekly), and Domain_Expertise_Profile covering AI orchestration systems, platform architecture, and systems engineering

##### 28d: V-Model Systems Engineering Discipline

11. THE Seraphim_Core SHALL own and enforce the systems engineering V-model across all SeraphimOS development — ensuring that every requirement has a corresponding design element, every design element has a corresponding implementation, and every implementation has a corresponding verification test
12. THE Seraphim_Core SHALL maintain a Requirements Traceability Matrix (RTM) that maps every requirement to its design elements, implementation artifacts, and test cases — reporting coverage gaps and untested requirements
13. WHEN a new requirement is added or an existing requirement is modified, THE Seraphim_Core SHALL update the RTM and verify that the corresponding design, implementation, and test artifacts are created or updated accordingly
14. THE Seraphim_Core SHALL enforce that no code change may be deployed to production without passing the verification tests that trace back to the requirements the change affects
15. WHEN a component claims completion, THE Seraphim_Core SHALL execute independent verification against defined criteria — acting as the independent verifier, not the component's own author
16. THE Seraphim_Core SHALL define and enforce engineering quality standards across the platform including: code quality metrics (test coverage, cyclomatic complexity, documentation coverage), architecture compliance (layer separation, interface contracts, dependency rules), and operational quality (error rates, latency budgets, resource utilization targets)

##### 28e: Quality Gate Design and Stress Testing

17. THE Seraphim_Core SHALL design and maintain quality gates for all critical workflows — defining measurable pass/fail criteria, required evidence, and escalation procedures for gate failures
18. THE Seraphim_Core SHALL execute periodic quality audits (default: weekly) across all platform components, generating audit reports with findings, severity classifications, and remediation recommendations
19. WHEN a quality audit identifies a critical finding (security vulnerability, data integrity risk, or governance bypass), THE Seraphim_Core SHALL escalate immediately to the King through Shaar with a remediation plan
20. THE Seraphim_Core SHALL maintain a verification dashboard showing: total requirements, requirements with tests, requirements passing verification, requirements failing verification, and overall system verification coverage percentage

##### 28f: SME Integration

21. WHILE Seraphim_Core is active, THE Seraphim_Core SHALL participate in the SME architecture (Requirement 21) with a weekly heartbeat review cycle researching AI orchestration advances, systems engineering best practices, evaluating platform architecture improvements, and generating self-improvement recommendations
22. THE Seraphim_Core SHALL maintain a Domain_Expertise_Profile (Requirement 23) encoding knowledge of autonomous agent architectures, multi-agent coordination patterns, LLM orchestration frameworks, infrastructure cost optimization, self-improving system designs, systems engineering V-model, quality gate design, stress testing methodologies, and digital engineering transformation practices
23. WHEN Seraphim_Core generates recommendations from its heartbeat review, THE Seraphim_Core SHALL submit them to the Recommendation_Queue (Requirement 22) following the standard benchmark → current state → gap → action plan format

---

### Requirement 29: Eretz Business Pillar — Master Business Orchestration Sub-Agent

**User Story:** As the King, I want a master business orchestration sub-agent (Eretz) that sits between Seraphim and all business subsidiaries, so that every directive is enriched with business intelligence, cross-business synergies are actively detected and activated, reusable business patterns are extracted and applied across all ventures, and portfolio-level strategy is driven by real metrics — not frameworks without execution.

#### Acceptance Criteria

##### 29a: Chain of Command Enforcement

1. THE Seraphim_Core SHALL route all directives destined for business sub-agents (ZionX, ZXMG, Zion_Alpha) through Eretz before delivery — Eretz is the mandatory intermediary in the chain King → Seraphim → Eretz → Subsidiary → Agent
2. WHEN Eretz receives a directive from Seraphim_Core, THE Eretz agent SHALL enrich the directive with business intelligence (relevant portfolio context, cross-business implications, applicable business patterns, resource allocation guidance) before forwarding to the target subsidiary
3. WHEN a subsidiary agent completes a directive and reports results upward, THE Eretz agent SHALL verify the results against business standards, add portfolio-level context, and forward the enriched report to Seraphim_Core
4. IF a directive is sent directly to a business sub-agent bypassing Eretz, THEN THE Seraphim_Core SHALL intercept the directive, route it through Eretz, and log the bypass attempt to XO_Audit

##### 29b: Cross-Business Synergy Detection and Activation

5. THE Eretz_Synergy_Engine SHALL continuously analyze operations across all business subsidiaries to detect revenue synergies, operational synergies, and strategic synergies that individual subsidiaries would miss
6. WHEN the Eretz_Synergy_Engine identifies a cross-business synergy (e.g., ZXMG videos including ZionX app commercials, Zion_Alpha market insights informing ZionX app ideas, ZionX user data informing ZXMG content strategy), THE Eretz agent SHALL generate a synergy activation plan and submit it to the Recommendation_Queue with estimated revenue impact
7. THE Eretz agent SHALL maintain a synergy tracking dashboard showing: identified synergies, activated synergies, revenue impact per synergy, and missed synergy opportunities
8. THE Eretz agent SHALL enforce standing cross-promotion rules (e.g., every ZXMG YouTube video includes at least one in-video commercial for a ZionX app) as mandatory business policies across subsidiaries

##### 29c: Reusable Business Pattern Library

9. WHEN a business process, strategy, or architecture proves successful in one subsidiary, THE Eretz agent SHALL extract the pattern, generalize it, and store it in the Eretz_Pattern_Library for application across all subsidiaries
10. THE Eretz_Pattern_Library SHALL categorize patterns by type (monetization, user acquisition, retention, content strategy, market entry, operational process) with effectiveness metrics, applicability criteria, and implementation guides
11. WHEN a subsidiary faces a challenge that matches an existing pattern in the Eretz_Pattern_Library, THE Eretz agent SHALL proactively recommend the pattern with adaptation guidance specific to the subsidiary's context
12. THE Eretz agent SHALL track pattern adoption and effectiveness across subsidiaries, updating pattern confidence scores based on real outcomes

##### 29d: Portfolio Intelligence Aggregation

13. THE Eretz_Portfolio_Dashboard SHALL aggregate business metrics across all subsidiaries including: total MRR, per-subsidiary MRR, growth rates, unit economics (CAC, LTV, ARPU, churn), marketing spend and ROAS, content performance, and trading P&L
14. THE Eretz agent SHALL generate weekly portfolio intelligence reports comparing each subsidiary's performance against its targets and against industry benchmarks from the sub-agent expertise profiles
15. WHEN the Eretz_Portfolio_Dashboard detects a subsidiary with declining metrics (MRR dropping more than 10% month-over-month, or churn exceeding category benchmarks), THE Eretz agent SHALL generate an intervention plan and escalate to the Recommendation_Queue with high priority
16. THE Eretz agent SHALL maintain portfolio-level strategy recommendations for each subsidiary: scale, maintain, optimize, or deprecate — informed by real metrics, not assumptions

##### 29e: Training Cascade

17. WHEN Eretz forwards a directive to a subsidiary, THE Eretz agent SHALL include training context — explaining the business rationale, expected outcomes, quality standards, and how the directive fits into the broader portfolio strategy — so that each subsidiary agent improves its business understanding over time
18. THE Eretz agent SHALL evaluate subsidiary agent outputs for business quality (not just task completion) and provide structured feedback that is stored in the subsidiary's Domain_Expertise_Profile for continuous improvement
19. THE Eretz agent SHALL maintain a training effectiveness tracker measuring each subsidiary's improvement in business decision quality, recommendation accuracy, and autonomous business judgment over time

##### 29f: Operational Authority Enforcement

20. THE Eretz agent SHALL enforce SEMP (SeraphimOS Engineering Management Plan) compliance across all business subsidiaries — including quality standards, process adherence, reporting cadence, and governance requirements
21. WHEN a subsidiary agent produces output that does not meet Eretz's business quality standards, THE Eretz agent SHALL reject the output with specific feedback and require remediation before the output proceeds
22. THE Eretz agent SHALL have operational authority to reallocate resources between subsidiaries based on portfolio priorities — subject to Otzar budget constraints and Mishmar governance rules

##### 29g: Eretz as Autonomous SME Sub-Agent

23. THE Seraphim_Core SHALL maintain a Domain_Expertise_Profile for Eretz encoding: conglomerate management strategies, cross-business synergy frameworks, portfolio optimization models, business pattern extraction methodologies, training cascade best practices, and operational excellence benchmarks derived from world-class conglomerate capital allocation strategies, technology conglomerate portfolio management, operational excellence at scale, and luxury/brand portfolio management
24. WHILE Eretz is active, THE Seraphim_Core SHALL execute a scheduled heartbeat review cycle for Eretz at a configurable interval (default: daily) where Eretz researches portfolio management best practices, evaluates cross-business performance, identifies new synergy opportunities, and generates strategic recommendations
25. WHEN Eretz completes a heartbeat review, THE Eretz agent SHALL write all portfolio-level recommendations to the Recommendation_Queue following the standard benchmark → current state → gap → action plan format
26. THE SeraphimOS SHALL generate and maintain a Kiro steering file for Eretz (`eretz-expertise.md`) encoding portfolio management expertise, synergy detection frameworks, business pattern library contents, and operational authority procedures
27. THE SeraphimOS SHALL define a Kiro skill for Eretz (`eretz-sme.md`) that encapsulates conglomerate management expertise and can be activated during development sessions

---

### Requirement 30: ZionX — App Factory Pillar Leader Sub-Agent

**User Story:** As the King, I want ZionX to operate as a full-lifecycle app factory that manages ideation through revenue optimization and drives toward the MRR targets — starting as a single capable agent with the right to decompose into specialized subordinate agents when performance testing proves the need — so that the app business runs as a systematic production operation, not a one-off project.

#### Acceptance Criteria

##### 30a: Pillar Leadership and Delegation

1. THE ZionX agent SHALL operate as the pillar leader for the app factory — a single capable agent that owns the full app lifecycle from ideation through revenue optimization, executing directly within its governed authority and decomposing into subordinate agents only when performance testing demonstrates the need for specialization
2. WHEN ZionX receives a directive from Eretz, THE ZionX agent SHALL decompose the directive into executable tasks, execute them through the app factory pipeline, and report results with outcome metrics to Eretz
3. THE ZionX agent SHALL maintain a portfolio-level view of all apps across their lifecycle states (ideation, development, testing, gate-review, submission, in-review, approved, rejected, live, marketing, revenue-optimizing, deprecated) and make strategic decisions about resource allocation across the portfolio
4. WHEN performance testing reveals that a specific function (product decisions, revenue optimization, development, quality assurance) would benefit from a dedicated subordinate agent, THE ZionX agent SHALL propose the decomposition to the Recommendation_Queue with evidence of the bottleneck and expected improvement

##### 30b: App Store Expertise

5. THE ZionX agent SHALL manage app submissions to both Apple App Store and Google Play Store as parallel workflows, handling platform-specific requirements, rejection responses, and compliance updates independently per platform
6. WHEN an app submission is rejected, THE ZionX agent SHALL parse the rejection reason, execute remediation, create new Gate checks to prevent recurrence, and store the rejection pattern in Zikaron procedural memory
7. THE ZionX agent SHALL enforce all Gate checks (metadata validation, subscription compliance, IAP sandbox testing, screenshot verification, privacy policy presence, EULA link verification) before allowing any app submission — no app may bypass gate review

##### 30c: Revenue and Growth Management

8. THE ZionX agent SHALL track revenue metrics for every live app (MRR, downloads, conversion rate, retention, ARPU, LTV, churn) and generate optimization recommendations when metrics fall below category benchmarks
9. WHEN a ZionX app has been live for more than 60 days with MRR below the configured threshold, THE ZionX agent SHALL evaluate the app for deprecation and submit a recommendation to the Recommendation_Queue with the analysis
10. THE ZionX agent SHALL coordinate go-to-market execution for each app — ASO optimization, social media campaigns, paid acquisition, landing pages, and cross-promotion — executing directly or delegating to subordinate agents if decomposition has occurred

##### 30d: SME Integration

11. WHILE ZionX is active, THE ZionX agent SHALL participate in the SME architecture (Requirement 21) with a daily heartbeat review cycle researching top-grossing apps, reverse-engineering success patterns, and generating improvement plans for the portfolio
12. THE ZionX agent SHALL maintain a Domain_Expertise_Profile (Requirement 23) encoding knowledge of app store optimization, monetization models, user acquisition funnels, retention mechanics, Apple/Google review guidelines, and UI/UX patterns from top-performing apps
13. WHEN ZionX generates recommendations from its heartbeat review, THE ZionX agent SHALL submit them to the Recommendation_Queue (Requirement 22) following the standard benchmark → current state → gap → action plan format

---

### Requirement 31: ZXMG — Media Production Pillar Leader Sub-Agent

**User Story:** As the King, I want ZXMG to operate as a systematic content production machine that runs a scalable pipeline across YouTube and social platforms — not a one-off content creator — so that the media business generates consistent audience growth and ad revenue at scale.

#### Acceptance Criteria

##### 31a: Production Pipeline Management

1. THE ZXMG agent SHALL operate as the pillar leader for media production, managing a systematic content pipeline that produces content at a configurable cadence (default: daily for YouTube, multiple daily for social platforms) across all configured channels
2. WHEN ZXMG receives a content directive from Eretz, THE ZXMG agent SHALL decompose it into pipeline stages (script generation, asset creation, video assembly, metadata preparation, platform upload, performance monitoring) and orchestrate execution through the content pipeline
3. THE ZXMG agent SHALL maintain a content calendar with scheduled productions across all platforms, ensuring consistent output cadence and strategic content mix (educational, entertainment, promotional, cross-promotional)
4. THE ZXMG agent SHALL enforce platform-specific validation (video format, duration limits, metadata character limits, thumbnail specifications) before any content upload — no content may bypass validation

##### 31b: Multi-Platform Distribution

5. THE ZXMG agent SHALL manage content distribution across YouTube (long-form and Shorts), TikTok, Instagram (Reels and Stories), X, Facebook, Reddit, and Rumble — adapting content format, length, and metadata per platform requirements
6. WHEN content is published on any platform, THE ZXMG agent SHALL track performance metrics (views, engagement rate, audience retention, click-through rate, revenue) through the respective platform drivers and store results in Zikaron for pattern analysis
7. THE ZXMG agent SHALL implement cross-platform content repurposing — automatically adapting long-form YouTube content into short-form clips for TikTok, Reels, and Shorts with platform-optimized metadata

##### 31c: Algorithm Optimization and Growth

8. THE ZXMG agent SHALL continuously analyze content performance data to identify patterns that drive views and engagement — thumbnail styles, title formulas, content structures, posting times, audience retention curves — and apply these patterns to future content production
9. WHEN a content piece underperforms relative to channel averages (views below 50% of 30-day average), THE ZXMG agent SHALL analyze the underperformance, identify contributing factors, and adjust future content strategy accordingly
10. THE ZXMG agent SHALL enforce cross-promotional standing rules from Eretz (e.g., every YouTube video includes at least one in-video commercial for a ZionX app) and report compliance status

##### 31d: SME Integration

11. WHILE ZXMG is active, THE ZXMG agent SHALL participate in the SME architecture (Requirement 21) with a daily heartbeat review cycle researching top-performing channels, analyzing algorithm signals, and generating content strategy improvements
12. THE ZXMG agent SHALL maintain a Domain_Expertise_Profile (Requirement 23) encoding knowledge of YouTube algorithm signals, thumbnail/title optimization, content structure patterns, posting cadence benchmarks, cross-platform strategies, and monetization benchmarks (CPM, RPM, sponsorship rates)
13. WHEN ZXMG generates recommendations from its heartbeat review, THE ZXMG agent SHALL submit them to the Recommendation_Queue (Requirement 22) following the standard benchmark → current state → gap → action plan format

---

### Requirement 32: Zion Alpha — Trading Pillar Leader Sub-Agent

**User Story:** As the King, I want Zion Alpha to operate with a trader mindset — spotting edge, sizing positions, executing immediately, and learning from outcomes — so that the trading pillar generates systematic returns through disciplined prediction market execution, not analysis paralysis.

#### Acceptance Criteria

##### 32a: Trader Mindset Execution

1. THE Zion_Alpha agent SHALL operate with a trader execution model: when a signal meets the configured confidence threshold (default: 60%), THE Zion_Alpha agent SHALL size the position according to risk parameters and execute within 5 minutes of signal identification — not defer to further analysis
2. WHEN Zion_Alpha identifies a trading opportunity, THE Zion_Alpha agent SHALL evaluate the opportunity against defined risk parameters (position size limits, daily loss limits, portfolio concentration limits) and execute if within bounds, without requiring external approval for trades within L4 authority
3. THE Zion_Alpha agent SHALL maintain a minimum trading cadence of configurable trades per week (default: 3-5) to ensure active market participation and continuous learning — going more than 72 hours without a position SHALL trigger a self-diagnostic
4. THE Zion_Alpha agent SHALL log every trade decision (entry, exit, hold, skip) with the complete reasoning chain, market data at time of decision, confidence level, position size rationale, and expected outcome to XO_Audit and Zikaron

##### 32b: Systematic Strategy Management

5. THE Zion_Alpha agent SHALL maintain and execute multiple trading strategies simultaneously across Kalshi and Polymarket, tracking per-strategy performance (win rate, average return, Sharpe ratio, maximum drawdown) independently
6. WHEN a strategy's performance degrades below configured thresholds (win rate below 45% over 20+ trades, or drawdown exceeding 25% of allocated capital), THE Zion_Alpha agent SHALL reduce the strategy's capital allocation and generate a strategy review recommendation for the Recommendation_Queue
7. THE Zion_Alpha agent SHALL implement systematic position sizing using configurable models (Kelly criterion, fractional Kelly, fixed-fractional) based on edge confidence and bankroll management principles
8. THE Zion_Alpha agent SHALL monitor all open positions at the configured interval (default: every 15 minutes for active markets) and execute exit strategies when trigger conditions are met

##### 32c: Market Intelligence

9. THE Zion_Alpha agent SHALL continuously scan prediction markets for arbitrage opportunities (price discrepancies between Kalshi and Polymarket for equivalent events), mispriced contracts (where the agent's model disagrees with market pricing by more than a configurable threshold), and event-driven opportunities (upcoming economic releases, political events, scheduled announcements)
10. WHEN the Zion_Alpha agent identifies an arbitrage opportunity with a spread exceeding the configured minimum (default: 5%), THE Zion_Alpha agent SHALL execute the arbitrage trade immediately within risk parameters

##### 32d: SME Integration

11. WHILE Zion_Alpha is active, THE Zion_Alpha agent SHALL participate in the SME architecture (Requirement 21) with an hourly heartbeat review cycle analyzing market conditions, evaluating strategy performance, backtesting variations, and generating strategy refinements
12. THE Zion_Alpha agent SHALL maintain a Domain_Expertise_Profile (Requirement 23) encoding knowledge of prediction market mechanics, risk management frameworks, position sizing models, market microstructure patterns, and correlation analysis between prediction markets and real-world events
13. WHEN Zion_Alpha generates recommendations from its heartbeat review, THE Zion_Alpha agent SHALL submit them to the Recommendation_Queue (Requirement 22) following the standard benchmark → current state → gap → action plan format

---

### Requirement 33: Live System Runtime — Local and Cloud Execution

**User Story:** As the King, I want SeraphimOS to be a real, bootable, executing system — not a collection of tested modules — so that I can start it locally with a single command and see real agents running, real governance enforcing, real costs tracking, and real audit recording in the dashboard, and then deploy the same system to AWS for persistent cloud operation.

#### Acceptance Criteria

##### 33a: Local Runtime

1. WHEN the King runs `npm run dev:local`, THE system SHALL boot the full SeraphimOS kernel, all system services (Mishmar, Zikaron, Otzar, XO Audit, Event Bus), the Shaar API server, and the web dashboard — all running locally on the King's machine
2. THE local runtime SHALL use in-memory data stores that implement the same repository interfaces as the production Aurora/DynamoDB stores, so that all service code runs identically to production
3. ON startup, THE local runtime SHALL deploy real Agent_Programs (Seraphim Core, Eretz, ZionX, ZXMG, Zion Alpha, Mishmar, Otzar) through the real Agent Runtime, creating real state machine instances, recording real audit entries, and tracking real token usage
4. THE Shaar dashboard SHALL display data from the real running services — not mock data, not placeholder data — with a visual indicator removed once connected to the live backend
5. THE local runtime SHALL support hot-reload: when service code changes, the server restarts and re-seeds without manual intervention

##### 33b: AWS Cloud Deployment

6. WHEN the King runs `cdk deploy`, THE system SHALL deploy the full SeraphimOS infrastructure to AWS: Aurora PostgreSQL with pgvector, DynamoDB tables, ECS Fargate cluster, Lambda event handlers, API Gateway (REST + WebSocket), EventBridge event bus, SQS queues, S3 buckets, CloudFront distribution, Cognito User Pool, and Secrets Manager entries
7. THE deployed system SHALL run the same service code as the local runtime, with production repository implementations backed by Aurora and DynamoDB instead of in-memory stores
8. THE dashboard SHALL be accessible via a CloudFront URL, with API Gateway proxying /api/* requests to ECS Fargate and /ws connections to WebSocket API
9. THE CI/CD pipeline SHALL enforce the full gate chain (lint → typecheck → unit tests → integration tests → gate verification → coverage check → CDK synth) before any deployment to staging or production

##### 33c: Live Driver Connections

10. WHEN API credentials are provided via Secrets Manager (or local environment variables), THE Driver layer SHALL connect to real external services: Anthropic (Claude), OpenAI (GPT-4o), App Store Connect, Google Play Console, YouTube API, Kalshi API, Polymarket API, and all other configured drivers
11. WHEN no credentials are provided for a driver, THE system SHALL operate in stub mode for that driver — returning realistic simulated responses — without blocking system startup or other driver connections
12. THE Otzar model router SHALL route real LLM tasks to real LLM providers when credentials are available, tracking actual token usage and costs

---

### Requirement 34: Reference Ingestion and Quality Baseline System

**User Story:** As the King, I want to feed ZionX a link to any mobile app and feed ZXMG a link to any YouTube channel, and have the system ingest, dissect, and reverse-engineer what makes those references world-class — then use that as the minimum quality standard for everything it produces — so that the system never ships terrible apps or horrible videos again.

#### Acceptance Criteria

##### 34a: Reference URL Intake and Dispatch

1. WHEN the King provides a URL to the Reference_Ingestion_Service, THE Reference_Ingestion_Service SHALL determine the reference type by matching the URL against known patterns for Apple App Store, Google Play Store, and YouTube channel URLs
2. WHEN the Reference_Ingestion_Service identifies a valid Apple App Store URL, THE Reference_Ingestion_Service SHALL dispatch the URL to the App_Store_Analyzer with platform set to "ios"
3. WHEN the Reference_Ingestion_Service identifies a valid Google Play Store URL, THE Reference_Ingestion_Service SHALL dispatch the URL to the App_Store_Analyzer with platform set to "android"
4. WHEN the Reference_Ingestion_Service identifies a valid YouTube channel URL, THE Reference_Ingestion_Service SHALL dispatch the URL to the YouTube_Channel_Analyzer
5. IF the Reference_Ingestion_Service receives a URL that does not match any supported reference type, THEN THE Reference_Ingestion_Service SHALL return an error indicating the URL type is unsupported and list the supported URL formats
6. WHEN a reference analysis is dispatched, THE Reference_Ingestion_Service SHALL record the ingestion event in XO_Audit with the URL, detected type, and timestamp

##### 34b: App Store Reference Analysis

7. WHEN the App_Store_Analyzer receives an app store URL, THE App_Store_Analyzer SHALL scrape the listing metadata including: app name, developer, category, rating, review count, pricing model, in-app purchase options, description, and feature list
8. WHEN the App_Store_Analyzer scrapes a listing, THE App_Store_Analyzer SHALL extract all available screenshots and analyze them for: screen count, UI layout patterns, color usage, typography choices, navigation structure, and information density
9. WHEN the App_Store_Analyzer processes an app, THE App_Store_Analyzer SHALL analyze user reviews (minimum 50 reviews or all available if fewer) to extract: top-praised features, common complaints, sentiment distribution, and feature requests
10. WHEN the App_Store_Analyzer completes listing and review analysis, THE App_Store_Analyzer SHALL infer the following from available data: onboarding flow complexity, monetization model classification, notification strategy indicators, interaction pattern categories, and retention mechanic types
11. IF the App_Store_Analyzer cannot access the listing due to regional restrictions or removal, THEN THE App_Store_Analyzer SHALL report the failure with the specific reason and suggest alternative approaches (e.g., cached data, alternative region)
12. WHEN the App_Store_Analyzer completes analysis, THE App_Store_Analyzer SHALL produce a structured App_Reference_Report containing all extracted data points organized by category (listing metadata, visual analysis, review insights, inferred patterns)

##### 34c: YouTube Channel Reference Analysis

13. WHEN the YouTube_Channel_Analyzer receives a channel URL, THE YouTube_Channel_Analyzer SHALL extract channel-level metrics including: subscriber count, total video count, upload frequency (videos per week), average views per video, engagement rate (likes + comments / views), and channel growth trajectory
14. WHEN the YouTube_Channel_Analyzer processes a channel, THE YouTube_Channel_Analyzer SHALL select and analyze between 10 and 20 of the most recent videos, prioritizing a mix of highest-performing and most-recent content
15. WHEN the YouTube_Channel_Analyzer analyzes a video, THE YouTube_Channel_Analyzer SHALL extract: title word count, title emotional trigger words, thumbnail composition elements, video duration, hook structure (first 5 seconds), pattern interrupt frequency, CTA placement timestamps, and estimated retention curve shape
16. WHEN the YouTube_Channel_Analyzer analyzes a video, THE YouTube_Channel_Analyzer SHALL assess production quality indicators including: editing pace (cuts per minute), B-roll usage frequency, audio quality classification, music usage patterns, and visual effects density
17. WHEN the YouTube_Channel_Analyzer completes analysis of all selected videos, THE YouTube_Channel_Analyzer SHALL synthesize findings into a Production_Formula identifying: common hook patterns, optimal video length range, thumbnail composition rules, title construction patterns, pacing rhythm, and engagement triggers
18. IF the YouTube_Channel_Analyzer cannot access a channel due to the channel being private or deleted, THEN THE YouTube_Channel_Analyzer SHALL report the failure with the specific reason
19. WHEN the YouTube_Channel_Analyzer completes analysis, THE YouTube_Channel_Analyzer SHALL produce a structured Channel_Reference_Report containing channel metrics, per-video breakdowns, and the synthesized Production_Formula

##### 34d: Quality Baseline Generation

20. WHEN the Quality_Baseline_Generator receives an App_Reference_Report, THE Quality_Baseline_Generator SHALL produce an App_Quality_Baseline containing scored dimensions: visual polish level (1-10), interaction complexity (1-10), content depth (1-10), monetization sophistication (1-10), retention mechanic strength (1-10), and onboarding effectiveness (1-10)
21. WHEN the Quality_Baseline_Generator receives a Channel_Reference_Report, THE Quality_Baseline_Generator SHALL produce a Video_Quality_Baseline containing scored dimensions: hook strength (1-10), pacing quality (1-10), thumbnail effectiveness (1-10), title optimization (1-10), production value (1-10), and engagement trigger density (1-10)
22. WHEN multiple references of the same type exist in the Domain_Expertise_Profile, THE Quality_Baseline_Generator SHALL synthesize all reference baselines into a single composite baseline that represents the combined standard, weighting higher-performing references more heavily
23. THE Quality_Baseline_Generator SHALL include in each baseline: the source reference URL, extraction date, confidence score (0-1) indicating data completeness, specific threshold values for each dimension, and example patterns that illustrate each dimension
24. WHEN a new reference is ingested for a domain that already has a baseline, THE Quality_Baseline_Generator SHALL merge the new reference data with the existing baseline, raising thresholds where the new reference exceeds current standards and preserving existing thresholds where the new reference is weaker
25. THE Quality_Baseline_Generator SHALL produce baselines that contain only measurable, evaluatable criteria — no subjective or unmeasurable dimensions

##### 34e: Baseline Storage in Domain Expertise Profile

26. WHEN a Quality_Baseline is generated for an app reference, THE Baseline_Storage SHALL store the baseline in the ZionX Domain_Expertise_Profile within Zikaron procedural memory
27. WHEN a Quality_Baseline is generated for a video/channel reference, THE Baseline_Storage SHALL store the baseline in the ZXMG Domain_Expertise_Profile within Zikaron procedural memory
28. THE Baseline_Storage SHALL version each stored baseline, retaining the full history of baseline evolution as new references are ingested
29. WHEN a baseline is stored, THE Baseline_Storage SHALL tag the memory entry with the reference type, source URL, domain category, and extraction timestamp for retrieval
30. THE Baseline_Storage SHALL support querying baselines by domain category (e.g., "wellness apps", "tech review channels") so that the appropriate baseline is applied to matching output
31. WHEN the Baseline_Storage stores a new or updated baseline, THE Baseline_Storage SHALL publish an event to the Event_Bus notifying downstream consumers (Quality Gate, Training Cascade) that the baseline has changed

##### 34f: Reference-Enhanced Quality Gate Evaluation

32. WHEN a ZionX app reaches the gate-review state, THE Reference_Quality_Gate SHALL retrieve the applicable App_Quality_Baseline from the ZionX Domain_Expertise_Profile and evaluate the app against each baseline dimension
33. WHEN a ZXMG video reaches the review state, THE Reference_Quality_Gate SHALL retrieve the applicable Video_Quality_Baseline from the ZXMG Domain_Expertise_Profile and evaluate the video against each baseline dimension
34. WHEN the Reference_Quality_Gate evaluates output, THE Reference_Quality_Gate SHALL produce a score for each baseline dimension and a pass/fail result where passing requires meeting or exceeding the threshold on every dimension
35. IF the Reference_Quality_Gate determines that output fails one or more baseline dimensions, THEN THE Reference_Quality_Gate SHALL produce a rejection report listing each failed dimension, the achieved score, the required threshold, and specific gaps that must be addressed
36. WHEN no Quality_Baseline exists for the output's domain category, THE Reference_Quality_Gate SHALL fall back to the existing design quality gate evaluation without baseline comparison
37. THE Reference_Quality_Gate SHALL log every evaluation result (pass or fail) to XO_Audit with the output identifier, baseline version used, per-dimension scores, and overall result

##### 34g: Auto-Rework Loop Integration

38. WHEN the Reference_Quality_Gate rejects output for failing baseline dimensions, THE Auto_Rework_Loop SHALL automatically route the output back through the Training Cascade with the rejection report attached as remediation guidance
39. WHEN the Auto_Rework_Loop routes output for rework, THE Auto_Rework_Loop SHALL include in the rework directive: the specific failed dimensions, the gap between achieved and required scores, and the example patterns from the baseline that illustrate the expected standard
40. WHEN reworked output is resubmitted, THE Reference_Quality_Gate SHALL re-evaluate the output against the same baseline version that triggered the original rejection
41. IF the Auto_Rework_Loop has reworked the same output more than 5 times without passing the baseline, THEN THE Auto_Rework_Loop SHALL escalate to the King with a summary of all attempts, persistent gaps, and a recommendation (lower the threshold, provide additional references, or accept current quality)
42. WHILE the Auto_Rework_Loop is processing a rework cycle, THE Auto_Rework_Loop SHALL track the iteration count, time elapsed, and score progression across attempts
43. WHEN output passes the Reference_Quality_Gate after rework, THE Auto_Rework_Loop SHALL record the successful rework pattern in Zikaron procedural memory so that future output avoids the same gaps

##### 34h: Multi-Reference Synthesis and Learning

44. WHEN a second or subsequent reference is ingested for the same domain category, THE Quality_Baseline_Generator SHALL merge the new analysis with existing baselines rather than replacing them
45. THE Quality_Baseline_Generator SHALL weight reference contributions based on the reference's performance metrics (higher-rated apps and higher-view channels contribute more to the composite baseline)
46. WHEN synthesizing multiple references, THE Quality_Baseline_Generator SHALL identify patterns that appear across multiple references and elevate those patterns to "core principles" with higher confidence scores
47. THE Quality_Baseline_Generator SHALL track the number of references contributing to each baseline dimension and report the confidence level (more references contributing to a dimension means higher confidence)
48. WHEN a new reference contradicts an existing baseline pattern (e.g., a successful app uses a pattern the baseline currently penalizes), THE Quality_Baseline_Generator SHALL flag the contradiction for review and retain both patterns with metadata indicating the conflict
49. THE Learning_Engine SHALL monitor Quality Gate pass rates over time and, WHEN pass rates improve after baseline updates, THE Learning_Engine SHALL record the correlation between specific reference ingestions and quality improvements in Zikaron

##### 34i: Pre-Production Plan Approval

50. WHEN ZionX begins building an app that will be evaluated against a Quality_Baseline, THE ZionX SHALL generate a production plan showing how each baseline dimension will be addressed and present the plan to the King for approval before proceeding
51. WHEN ZXMG begins producing a video that will be evaluated against a Quality_Baseline, THE ZXMG SHALL generate a production plan showing how each baseline dimension will be addressed and present the plan to the King for approval before proceeding
52. THE production plan SHALL include: the applicable baseline with threshold values, the proposed approach for meeting each dimension, estimated confidence of meeting each threshold, and any dimensions where meeting the threshold is at risk
53. WHEN the King approves a production plan, THE system SHALL proceed with autonomous production and auto-rework without further King involvement until a finished product is delivered or escalation is triggered
54. IF the King rejects a production plan, THEN THE system SHALL revise the plan based on the King's feedback and resubmit for approval

##### 34j: Reference Ingestion Event Integration

55. WHEN a reference is successfully ingested and analyzed, THE Reference_Ingestion_Service SHALL publish a "reference.ingested" event to the Event_Bus containing the reference type, source URL, domain category, and analysis summary
56. WHEN a Quality_Baseline is created or updated, THE Baseline_Storage SHALL publish a "baseline.updated" event to the Event_Bus containing the affected domain category, baseline version, and changed dimensions
57. WHEN the Quality Gate receives a "baseline.updated" event, THE Reference_Quality_Gate SHALL reload the applicable baseline for subsequent evaluations without requiring a restart
58. WHEN the Training Cascade receives a "baseline.updated" event, THE Training Cascade SHALL update its quality standards to reflect the new baseline thresholds
59. THE Reference_Ingestion_Service SHALL require a valid Execution_Token from Mishmar before initiating any reference analysis, enforcing the existing governance model
60. WHEN a reference ingestion fails at any stage, THE Reference_Ingestion_Service SHALL publish a "reference.ingestion.failed" event with the failure reason and stage where the failure occurred

---
