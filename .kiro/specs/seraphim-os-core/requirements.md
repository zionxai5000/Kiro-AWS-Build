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
- **ZionX_App_Studio**: The in-browser app development environment within the Shaar dashboard that enables the King to describe, generate, preview, edit, test, and publish mobile apps through natural language interaction with ZionX — combining AI code generation, live mobile preview, iterative edit loop, integration management, store asset generation, and submission orchestration
- **App_Preview_Runtime**: The component that renders a live mobile app preview in the browser using React Native Web inside device frames (iPhone, iPad, Android), supporting screen navigation, UI validation, and real-time reload on code changes
- **AI_Edit_Controller**: The component that accepts natural language edit commands from the King, translates them into code modifications via ZionX, reruns tests, and triggers preview reload
- **Studio_Session_Manager**: The component that manages the lifecycle of an app development session including project state, file tree, build status, preview connection, and undo/redo history
- **Device_Profile_Manager**: The component that maintains device frame definitions (iPhone 15, SE, iPad, Pixel, Android tablet) with accurate dimensions, safe areas, and notch/island specifications for preview rendering and screenshot generation
- **Store_Asset_Generator**: The component that automatically generates app store screenshots per device size, feature graphics, app icons, promo banners, and captions by capturing the live preview in various device frames and states
- **Ad_Studio**: The component that generates video ad creatives (15s vertical, 30s horizontal, 6s bumper, playable demos) from app preview recordings, validates against ad network specifications, and exports for AdMob/AppLovin/Unity
- **Apple_Release_Agent**: The sub-agent responsible for iOS build management, App Store Connect metadata, Apple IAP/RevenueCat validation, privacy nutrition labels, device-specific screenshots, TestFlight distribution, App Store review submission, and rejection remediation
- **Google_Play_Release_Agent**: The sub-agent responsible for Android AAB build management, Google Play Console metadata, Google Play billing/RevenueCat validation, Data Safety form completion, feature graphics, closed testing tracks, production releases, and rejection remediation
- **Store_Asset_Agent**: The sub-agent that generates and adapts screenshots, captions, app preview videos, feature graphics, promo banners, and ad creatives to platform-specific rules for both Apple and Google stores
- **Preview_Maturity_Level**: The three-stage progression of app preview capability: Level 1 (React Native Web in-browser), Level 2 (Expo QR code on real device), Level 3 (cloud emulator streaming with automated screenshot capture)
- **ZXMG_Video_Studio**: The in-browser video production studio within the Shaar dashboard ZXMG tab that provides autonomous AI video production — researching trends, generating content ideas, producing scripts, rendering AI video clips, assembling full videos, and publishing across platforms — with optional King override for manual ideation and editing
- **Autonomous_Content_Engine**: The default operating mode of ZXMG_Video_Studio where ZXMG autonomously researches trending topics, generates content calendars, produces videos, and publishes without requiring King input — the King can override at any point but intervention is not required
- **Content_Pipeline**: The rolling 7-14 day production queue maintained per managed YouTube channel, containing auto-generated video concepts with scripts, thumbnails, titles, descriptions, tags, and scheduling — executed autonomously unless the King intervenes
- **Trend_Intelligence_Engine**: The component that performs real-time analysis of trending video styles, algorithm signals, competitor performance, audience retention patterns, content gaps, and viral patterns across YouTube, TikTok, and Instagram
- **Multi_Model_Video_Router**: The component that routes video generation requests to the optimal AI model per shot type (Sora 2/Veo 3 for cinematic, Kling/WAN/Minimax for fast iteration, specialized models for animation) — managed by Otzar based on quality and budget
- **Video_Timeline_Editor**: The production studio component providing scene-by-scene timeline control, audio layer management, transitions, color grading, and multi-format export
- **Platform_Distribution_Engine**: The component that handles one-click publishing to YouTube, TikTok, Instagram Reels, X, Facebook, and Rumble with platform-specific formatting, optimal scheduling, and cross-platform content repurposing

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


### Requirement 35: Parallel Agent Orchestration

**User Story:** As the King, I want all agents and sub-agents to work in parallel — both within a single agent spawning concurrent sub-tasks and across multiple agents working on different parts of the same project simultaneously — so that the system maximizes throughput, minimizes wall-clock time, and operates like a coordinated team rather than a sequential pipeline.

#### Acceptance Criteria

##### 35a: Intra-Agent Parallelization

1. WHEN an agent decomposes a task into independent sub-tasks, THE Agent_Runtime SHALL execute those sub-tasks concurrently on separate compute threads/containers, sharing the parent agent's context and memory access
2. THE Agent_Runtime SHALL support configurable parallelism limits per agent (default: 5 concurrent sub-tasks) to prevent resource exhaustion
3. WHEN parallel sub-tasks complete, THE Agent_Runtime SHALL aggregate results into a unified output, resolving any conflicts using the agent's defined merge strategy
4. IF a parallel sub-task fails, THE Agent_Runtime SHALL isolate the failure without terminating sibling tasks, retry the failed task according to retry policy, and report partial results if retry exhausts

##### 35b: Inter-Agent Parallelization

5. WHEN Seraphim_Core or Eretz decomposes a directive into work for multiple agents (e.g., ZionX and ZXMG working on different aspects of the same launch), THE orchestrator SHALL dispatch work to all target agents simultaneously rather than sequentially
6. THE Agent_Runtime SHALL maintain a dependency graph for inter-agent parallel work — when agent B depends on agent A's output, agent B SHALL wait for agent A's specific output before proceeding, while other independent work continues
7. WHEN multiple agents are working in parallel on related tasks, THE Event_Bus SHALL provide a real-time coordination channel allowing agents to share intermediate results, signal completion of dependencies, and request information from sibling agents without blocking

##### 35c: Dependency Management and Coordination

8. THE Seraphim_Core SHALL support declarative dependency definitions between parallel tasks using a DAG (Directed Acyclic Graph) structure, where each task specifies its inputs and which other tasks must complete first
9. WHEN a circular dependency is detected in the task DAG, THE Seraphim_Core SHALL reject the task graph, log the cycle to XO_Audit, and notify the originating agent with the specific cycle path
10. THE Seraphim_Core SHALL provide real-time parallel execution dashboards showing: active parallel streams, dependency status (waiting/ready/executing/complete), resource utilization per stream, and estimated completion times
11. WHEN all parallel streams for a coordinated task complete, THE Seraphim_Core SHALL execute a configurable aggregation step that synthesizes results from all streams into a unified deliverable

##### 35d: Work Distribution and Load Balancing

12. THE Agent_Runtime SHALL distribute parallel work units across available compute resources using a configurable strategy (round-robin, least-loaded, affinity-based) respecting Otzar budget constraints
13. WHEN system load from parallel execution approaches resource limits, THE Agent_Runtime SHALL queue lower-priority parallel tasks and notify the orchestrating agent of the delay

---

### Requirement 36: MCP (Model Context Protocol) Integration

**User Story:** As the King, I want SeraphimOS agents to both consume and provide MCP tools — so that agents can use external tools/services dynamically, other systems (like Kiro) can call into SeraphimOS agents, and the platform participates in the broader MCP ecosystem as both client and server.

#### Acceptance Criteria

##### 36a: MCP Server Capabilities (Agents as MCP Providers)

1. THE SeraphimOS SHALL expose each agent's capabilities as an MCP server, allowing external systems (Kiro, other MCP clients) to discover and invoke agent tools through the standard MCP protocol
2. WHEN an external MCP client connects to a SeraphimOS agent's MCP server, THE MCP server SHALL authenticate the client using token-based authentication integrated with Mishmar governance
3. THE MCP server SHALL expose agent tools with full JSON Schema definitions for inputs and outputs, enabling type-safe tool discovery and invocation
4. WHEN an MCP tool invocation is received, THE MCP server SHALL validate the request against Mishmar authorization rules before executing — unauthorized tool calls SHALL be rejected with appropriate error codes
5. THE SeraphimOS SHALL expose the following as MCP tools per agent: Seraphim (system health, directive submission, recommendation queue), Eretz (portfolio metrics, synergy status, pattern library), ZionX (app status, pipeline triggers, gate results), ZXMG (content pipeline, analytics, production status), Zion Alpha (positions, strategy status, market scans)

##### 36b: MCP Client Capabilities (Agents Consuming External Tools)

6. THE Agent_Runtime SHALL support agents consuming external MCP tools as part of their execution — agents can discover, connect to, and invoke tools from external MCP servers
7. WHEN an agent needs a capability not available internally, THE Agent_Runtime SHALL check the MCP Tool Registry for available external tools matching the required capability
8. THE MCP Client SHALL handle connection lifecycle (connect, reconnect, disconnect) with automatic retry and circuit breaker patterns consistent with the Driver layer
9. THE Agent_Runtime SHALL enforce Otzar budget constraints on external MCP tool usage — each external tool call SHALL be tracked for cost and counted against the agent's budget

##### 36c: MCP Tool Registry and Discovery

10. THE SeraphimOS SHALL maintain a central MCP Tool Registry listing all available tools (internal agent tools + external MCP server tools) with their schemas, availability status, and cost estimates
11. THE MCP Tool Registry SHALL support dynamic registration — when a new MCP server is configured, its tools SHALL be automatically discovered and registered without system restart
12. WHEN an agent requests a tool by capability description rather than exact name, THE MCP Tool Registry SHALL perform semantic matching to find the best available tool

##### 36d: Kiro-Seraphim MCP Bridge

13. THE SeraphimOS SHALL provide a bidirectional MCP bridge between Kiro IDE and SeraphimOS — Kiro can invoke SeraphimOS agent tools, and SeraphimOS agents can invoke Kiro tools (file editing, code analysis, terminal commands)
14. WHEN a SeraphimOS agent needs to make code changes, THE agent SHALL invoke Kiro tools through the MCP bridge rather than directly manipulating files, ensuring all changes go through Kiro's verification and hook system
15. THE Kiro-Seraphim MCP bridge SHALL maintain persistent connection state so that ongoing development sessions can seamlessly interact with live SeraphimOS agents

---

### Requirement 37: Unified Agent Communication Layer

**User Story:** As the King, I want to communicate with any agent directly from its own dashboard — with persistent chat history, multi-user support, and cross-agent context sharing — so that I can interact with agents where they live without switching to a separate tool, and so that multiple team members can collaborate with agents simultaneously.

#### Acceptance Criteria

##### 37a: Per-Agent Chat Interface

1. THE Shaar dashboard SHALL provide a persistent chat interface on each agent's dashboard page (Seraphim, Eretz, ZionX, ZXMG, Zion Alpha) where users can send messages and receive responses in real-time
2. THE chat interface SHALL maintain full conversation history per agent, persisted in the database, scrollable and searchable
3. WHEN a user sends a message to an agent via the dashboard chat, THE agent SHALL process the message using its full context (domain expertise, current state, memory) and respond within the chat interface
4. THE chat interface SHALL display agent status indicators: idle (available), working (processing a task), waiting (needs input), thinking (processing the current message)

##### 37b: Multi-User Concurrent Access

5. THE chat system SHALL support multiple authenticated user accounts chatting with the same agent simultaneously — each user's messages are attributed to their identity
6. THE chat system SHALL display a unified conversation view showing all users' messages interleaved chronologically with clear user attribution (username, avatar, timestamp)
7. WHEN multiple users are chatting with an agent concurrently, THE agent SHALL maintain separate conversation contexts per user while having access to the full unified history for situational awareness
8. THE chat system SHALL implement rate limiting and fairness — when multiple users are waiting for agent responses, THE system SHALL process requests using a configurable priority strategy (default: FIFO, configurable to role-based priority where King messages are processed first)

##### 37c: Cross-Agent Context Sharing

9. WHEN a user sends a message to one agent that contains information relevant to another agent's domain, THE system SHALL automatically detect the relevance (using NLP/embedding similarity) and share the context with the relevant agent(s) as a background context update
10. THE system SHALL support explicit agent tagging using @-mention syntax (e.g., "@eretz look at this") to manually route messages or context to specific agents
11. WHEN context is shared between agents (automatically or explicitly), THE receiving agent SHALL acknowledge the context in its next relevant interaction and incorporate it into its working memory
12. THE system SHALL maintain a shared context log showing all cross-agent context propagation events — which messages were shared, from which agent to which agent, and whether they were auto-detected or explicitly tagged

##### 37d: Conversation Context Handoff

13. WHEN a user switches from chatting with one agent to another, THE new agent SHALL have access to a summary of the user's recent conversation with the previous agent, enabling continuity without re-explanation
14. THE context handoff SHALL be configurable: automatic (always share recent context), on-request (agent asks if user wants to share prior context), or manual (user explicitly shares)

##### 37e: Agent Presence and Status

15. THE dashboard SHALL display real-time agent presence indicators for all agents: online/idle, actively working (with task description), waiting for user input, processing parallel tasks (with count), degraded/error state
16. WHEN an agent's status changes, THE dashboard SHALL update the presence indicator within 2 seconds via WebSocket

##### 37f: Communication Audit and Replay

17. THE system SHALL log all human-agent communications to XO_Audit with: user identity, agent identity, message content, timestamp, response time, and any actions triggered by the message
18. THE system SHALL support conversation replay — the ability to review the full communication history between any user and any agent for a given time period

---

### Requirement 38: Telegram Integration

**User Story:** As the King, I want a single Telegram bot with dedicated channels/threads per agent, so that I can communicate with and command any agent from my phone — with the same capabilities as the dashboard chat — enabling mobile-first agent interaction.

#### Acceptance Criteria

##### 38a: Unified Bot with Per-Agent Threads

1. THE SeraphimOS SHALL operate a single Telegram bot that provides dedicated threads/topics for each agent: Seraphim, Eretz, ZionX, ZXMG, and Zion Alpha
2. WHEN a user sends a message in an agent's Telegram thread, THE system SHALL route the message to that agent for processing and deliver the response in the same thread
3. THE Telegram bot SHALL support the same command semantics as the dashboard chat — any command that works in the dashboard chat SHALL work identically in Telegram

##### 38b: Dashboard-Telegram Synchronization

4. WHEN a message is sent via Telegram, THE system SHALL display it in the corresponding agent's dashboard chat history with a "via Telegram" indicator
5. WHEN a message is sent via the dashboard chat, THE system SHALL display it in the corresponding Telegram thread with a "via Dashboard" indicator
6. THE synchronization SHALL be real-time (within 3 seconds) and bidirectional — the conversation is one unified stream regardless of which surface it originates from

##### 38c: Multi-User Telegram Support

7. THE Telegram bot SHALL identify users by their Telegram account linked to their SeraphimOS user account, maintaining proper attribution in the unified chat history
8. WHEN a new Telegram user interacts with the bot, THE system SHALL require account linking (connecting their Telegram ID to their SeraphimOS user account) before granting access
9. THE Telegram bot SHALL enforce the same Mishmar authorization rules as the dashboard — users can only interact with agents they are authorized to access

##### 38d: Telegram Notification Routing

10. WHEN an agent completes a long-running task, needs user input, or generates an alert, THE notification system SHALL route the notification to Telegram if the user's preference includes Telegram as a notification channel
11. THE Telegram bot SHALL support notification preferences per user: all notifications, high-priority only, specific agents only, or quiet hours
12. WHEN a notification is delivered via Telegram, THE user SHALL be able to respond directly in the thread to take action (approve, reject, acknowledge) without switching to the dashboard

---

### Requirement 39: Message Priority and Urgency

**User Story:** As the King, I want message priority levels so that urgent communications are processed immediately while routine messages wait their turn — especially important when multiple users are interacting with the same agent.

#### Acceptance Criteria

1. THE communication system SHALL support four priority levels for messages: low (when you get a chance), normal (standard processing), high (prioritize this), and critical (stop what you're doing)
2. WHEN a critical-priority message is received, THE agent SHALL interrupt its current non-critical work, acknowledge the message within 10 seconds, and begin processing immediately
3. WHEN multiple messages are queued for an agent, THE system SHALL process them in priority order (critical → high → normal → low), with FIFO ordering within the same priority level
4. THE system SHALL allow the King's messages to be automatically elevated to high priority by default (configurable)

---

### Requirement 40: Agent-to-Agent Delegation Visibility

**User Story:** As the King, I want to see in the chat when an agent delegates work to another agent — including the delegation chain, status of delegated work, and when results come back — so that I have full transparency into how my requests are being handled across the agent hierarchy.

#### Acceptance Criteria

1. WHEN an agent delegates work to another agent as part of processing a user message, THE chat interface SHALL display a delegation indicator showing: which agent received the delegation, what was delegated, and current status (pending/in-progress/complete)
2. WHEN a delegated task completes, THE chat interface SHALL display the result inline with a clear indication that it came from the delegated agent
3. WHEN parallel delegations occur (agent sends work to multiple agents simultaneously), THE chat interface SHALL display all parallel streams with individual progress indicators
4. THE delegation visibility SHALL work identically in both dashboard chat and Telegram threads

---

### Requirement 41: Notification Routing Engine

**User Story:** As the King, I want fine-grained control over where notifications go — dashboard, Telegram, email, or multiple channels — based on notification type, urgency, time of day, and which agent generated it — so that I'm informed without being overwhelmed.

#### Acceptance Criteria

1. THE notification system SHALL support per-user routing rules that specify: which channels receive which notification types, priority thresholds per channel, quiet hours per channel, and per-agent notification preferences
2. WHEN a notification is generated, THE routing engine SHALL evaluate all applicable routing rules and deliver to all matching channels simultaneously
3. THE routing engine SHALL support escalation: if a notification is not acknowledged within a configurable timeout (default: 15 minutes for high priority, 5 minutes for critical), THE system SHALL escalate to the next configured channel
4. THE routing engine SHALL deduplicate notifications — if the same notification is delivered to multiple channels and acknowledged on one, THE system SHALL mark it as acknowledged on all channels
5. THE system SHALL provide a notification preferences UI in the dashboard where users can configure their routing rules without code changes



---

### Requirement 42: ZionX App Development Studio

**User Story:** As the King, I want a full in-browser app development studio inside the ZionX tab of the Shaar dashboard — where I describe an app in natural language, ZionX generates it, I see a live mobile preview, give edit commands that update in real-time, connect integrations, generate store assets and ad creatives, and manage Apple/Google submissions through dedicated sub-agents — so that I can build, iterate, and publish production mobile apps entirely through conversation without touching Xcode, Android Studio, or any manual tooling.

#### Acceptance Criteria

##### 42a: Prompt/Spec Panel — App Ideation and Generation

1. WHEN the King describes an app idea in natural language in the ZionX_App_Studio, THE ZionX SHALL generate a complete product specification including: product requirements, screen list, user journey map, design system, monetization plan, and technical architecture (React Native/Expo)
2. WHEN the King approves the generated specification, THE ZionX SHALL generate the full app codebase (React Native/Expo) including all screens, navigation, components, state management, and configuration files
3. THE ZionX_App_Studio SHALL trigger the `app.idea.created` hook upon app idea submission, initiating market research, competitor analysis, and design baseline generation via the existing ZionX domain expertise pipeline

##### 42b: Mobile Preview Panel — Live In-Browser Preview

4. WHEN app code is generated or modified, THE App_Preview_Runtime SHALL render a live interactive preview inside an accurate device frame (selectable: iPhone 15, iPhone SE, iPad, Pixel, Android tablet) within the Shaar dashboard
5. THE App_Preview_Runtime SHALL support click-through navigation, button interactions, onboarding flow simulation, and paywall preview within the in-browser device frame
6. WHEN the King selects a different device frame, THE App_Preview_Runtime SHALL re-render the preview with the correct dimensions, safe areas, and platform-specific UI conventions within 2 seconds
7. THE ZionX_App_Studio SHALL trigger the `app.preview.updated` hook whenever the preview build refreshes, enabling downstream screenshot regeneration and test execution

##### 42c: Code/File Panel — Project Structure Visibility

8. THE ZionX_App_Studio SHALL display the app's file structure including: screen list, component list, configuration files, app metadata, and current build status in a navigable panel
9. WHEN the King selects a file in the Code/File Panel, THE ZionX_App_Studio SHALL display the file contents with syntax highlighting (read-only in MVP, Monaco editor in future iteration)

##### 42d: AI Edit Panel — Natural Language Code Modification

10. WHEN the King issues a natural language edit command (e.g., "make the header blue", "add a settings screen", "change the paywall to annual pricing"), THE AI_Edit_Controller SHALL translate the command into code modifications, apply them to the codebase, rerun relevant tests, and trigger a preview reload
11. THE AI_Edit_Controller SHALL maintain an undo/redo history so the King can revert any edit command to a previous state
12. THE ZionX_App_Studio SHALL trigger the `app.code.changed` hook after every AI edit, initiating lint, typecheck, and test execution before updating the preview

##### 42e: Integration Panel — Service Connections

13. THE ZionX_App_Studio SHALL provide a vertical integration menu with configurable service connections including: Preview, Code, Design, Files, Images, Audio, API, Environment Variables, Database, Payments (RevenueCat), Prompts, Haptics, Logs, Network Requests, Store Assets, Ad Studio, Revenue, and Deployments
14. WHEN the King enables an integration (e.g., RevenueCat payments), THE ZionX SHALL generate the required SDK integration code, configuration, and test stubs, and update the app codebase accordingly
15. WHEN the King configures environment variables or API keys through the Integration Panel, THE ZionX_App_Studio SHALL store them securely via Otzar credential management and inject them into the build environment without exposing values in the UI

##### 42f: Testing Panel — Quality Assurance

16. THE ZionX_App_Studio SHALL provide a testing panel displaying: unit test results, UI test results, accessibility compliance status, design quality score (against Quality_Baseline), and store readiness checklist
17. WHEN the King triggers a test run, THE ZionX_App_Studio SHALL execute all configured tests and display pass/fail results with specific failure details and suggested fixes
18. THE ZionX_App_Studio SHALL block progression to the Build/Submit phase if any critical gate check fails (accessibility, store metadata completeness, IAP sandbox validation)

##### 42g: Build/Submit Panel — Store Submission Management

19. THE ZionX_App_Studio SHALL display separate build status panels for iOS and Android, showing: build progress, signing status, metadata readiness, privacy policy status, screenshot completeness, and IAP sandbox validation results
20. WHEN the King initiates an iOS submission, THE Apple_Release_Agent SHALL own the complete iOS release workflow: Xcode build, Bundle ID management, App Store Connect metadata, Apple IAP/RevenueCat validation, privacy nutrition label generation, device-specific screenshots, App Preview video, TestFlight distribution, App Store review submission, and rejection remediation
21. WHEN the King initiates an Android submission, THE Google_Play_Release_Agent SHALL own the complete Android release workflow: Gradle AAB build, package name management, Google Play Console metadata, Google Play billing/RevenueCat validation, Data Safety form completion, feature graphic generation, phone/tablet screenshots, closed testing track, production release, and rejection remediation
22. THE ZionX_App_Studio SHALL trigger the `app.ios.build.created` hook for iOS builds (validating Xcode/iOS SDK, bundle ID, signing, App Store metadata) and the `app.android.build.created` hook for Android builds (validating Gradle/AAB, package name, signing keystore, Data Safety form)
23. THE ZionX_App_Studio SHALL trigger the `app.submission.ready` hook when all gate checks pass, marking the app ready for King approval before final store submission

##### 42h: Store Assets Tab — Automated Screenshot and Asset Generation

24. WHEN the King opens the Store Assets tab or the `app.assets.requested` hook fires, THE Store_Asset_Agent SHALL capture screenshots from the live preview across all required device sizes: iPhone 6.7", iPhone 6.5", iPad, Google Play phone, and Google Play tablet
25. THE Store_Asset_Agent SHALL generate feature graphics (1024×500), app icons (1024×1024), promotional banners, and localized captions for each screenshot — formatted per Apple App Store and Google Play Store specifications
26. THE Store_Asset_Agent SHALL validate all generated assets against platform-specific requirements (dimensions, file size, content policy, text overlay limits) and flag non-compliant assets with specific remediation instructions
27. THE ZionX_App_Studio SHALL trigger the `app.screenflow.changed` hook when navigation or screen layout changes, automatically regenerating affected screenshots

##### 42i: Ad Studio Tab — Video Ad Creative Generation

28. WHEN the King opens the Ad Studio tab or the `app.marketing.state.entered` hook fires, THE Ad_Studio SHALL generate video ad creatives in multiple formats: 15-second vertical (TikTok/Reels/Shorts), 30-second horizontal (YouTube pre-roll), 6-second bumper ads, and playable ad demos
29. THE Ad_Studio SHALL validate all generated ad creatives against ad network specifications (AdMob, AppLovin, Unity Ads) including: file size limits, aspect ratios, duration constraints, and interactive element requirements for playable ads
30. THE Ad_Studio SHALL export ad creatives in formats ready for upload to configured ad networks without manual conversion or reformatting

##### 42j: Preview Maturity Levels — Progressive Preview Capability

31. THE ZionX_App_Studio SHALL implement Preview_Maturity_Level 1 (MVP): React Native Web preview rendered in-browser inside device frames, supporting screen navigation, UI validation, design testing, and the AI edit loop
32. WHERE Expo QR code preview is enabled (Preview_Maturity_Level 2), THE ZionX_App_Studio SHALL generate a QR code that the King can scan with Expo Go or a custom dev client to test the app on a real physical device
33. WHERE cloud emulator streaming is enabled (Preview_Maturity_Level 3), THE ZionX_App_Studio SHALL stream an Android emulator or iOS simulator from the cloud to the dashboard, enabling automated screenshot generation via Maestro/Detox test frameworks

##### 42k: Sub-Agent Architecture and MCP Integration

34. THE Apple_Release_Agent SHALL use MCP tools for: App Store Connect API operations, Apple metadata management, IAP configuration checks, screenshot validation against Apple Human Interface Guidelines, and TestFlight management
35. THE Google_Play_Release_Agent SHALL use MCP tools for: Google Play Console API operations, Android build validation, Data Safety form generation, Play Billing configuration, and internal testing track management
36. THE Store_Asset_Agent SHALL use MCP tools for: preview screenshot capture, image generation and resizing, video generation, asset format conversion, and S3 storage for generated assets
37. THE ZionX_App_Studio SHALL use MCP tools for: file editing, code generation, Git operations, test execution, and preview runtime management — coordinated through the existing ZionX Product Agent

##### 42l: Hook Integration and Event-Driven Automation

38. THE ZionX_App_Studio SHALL emit the following lifecycle hooks: `app.idea.created`, `app.code.changed`, `app.preview.updated`, `app.screenflow.changed`, `app.ios.build.created`, `app.android.build.created`, `app.assets.requested`, `app.marketing.state.entered`, `app.store.gate.failed`, and `app.submission.ready`
39. WHEN the `app.store.gate.failed` hook fires, THE ZionX_App_Studio SHALL identify the responsible sub-agent (Apple_Release_Agent, Google_Play_Release_Agent, or Store_Asset_Agent), create a rework task with specific failure details, and rerun the failed gate after remediation
40. THE ZionX_App_Studio SHALL integrate with existing Shaar WebSocket infrastructure for real-time preview updates, build status streaming, and test result delivery to the dashboard

##### 42m: Revenue and Performance Tracking

41. WHEN an app is live on either store, THE ZionX_App_Studio SHALL display a revenue and performance panel showing: downloads, revenue (subscription + ad), ratings, reviews, crash rate, and retention metrics — sourced from App Store Connect and Google Play Console drivers
42. THE ZionX_App_Studio SHALL integrate with the existing Otzar budget management for tracking LLM token costs incurred during app generation and editing sessions, reporting cost-per-app and cost-per-edit metrics

##### 42n: Governance and Approval Integration

43. THE ZionX_App_Studio SHALL integrate with existing Mishmar governance for approval workflows — requiring King approval before final store submission, budget allocation for paid acquisition, and authority escalation for cross-pillar resource requests
44. THE ZionX_App_Studio SHALL log all studio actions (app creation, edits, builds, submissions, asset generation) to XO_Audit with full traceability from idea to live app

---

### Requirement 43: Persistent Domain Learning and Memory-First Architecture

**User Story:** As the King, I want every piece of research, domain expertise, branding knowledge, design pattern, market intelligence, and operational learning that any agent produces to be permanently stored in Zikaron long-term memory — not as static files or hardcoded data — so that agents build genuine institutional knowledge over time, reference it in future decisions, and evolve their expertise autonomously.

#### Acceptance Criteria

##### 43a: Research Persistence

1. WHEN any agent conducts research (market analysis, competitor study, design trend analysis, technology scanning, or domain investigation), THE agent SHALL store all findings in Zikaron procedural memory with structured metadata including: source, confidence level, domain, timestamp, and relevance tags
2. WHEN ZionX researches branding styles, design patterns, app store trends, or competitor apps, THE ZionX SHALL store the complete analysis in its Domain_Expertise_Profile within Zikaron — not as static TypeScript files or hardcoded arrays
3. WHEN ZXMG researches content trends, algorithm signals, or competitor channels, THE ZXMG SHALL store findings in Zikaron procedural memory tagged with platform, niche, and effectiveness metrics
4. WHEN Zion Alpha researches market patterns, strategy performance, or prediction accuracy, THE Zion_Alpha SHALL store findings in Zikaron procedural memory with backtesting results and confidence scores

##### 43b: Learning Accumulation

5. WHEN an agent completes a task successfully (app published, video uploaded, trade settled), THE agent SHALL extract the execution pattern and store it in Zikaron procedural memory with the specific decisions, parameters, and outcomes that led to success
6. WHEN an agent encounters a failure (app rejected, content underperforms, trade loses), THE agent SHALL store the failure pattern in Zikaron with root cause analysis, so the same mistake is never repeated
7. THE Seraphim_Core SHALL enforce that no agent may operate without first loading its relevant Zikaron context — agents must reference accumulated knowledge before making decisions, not start fresh each session

##### 43c: Knowledge Evolution

8. WHEN new research contradicts or updates existing knowledge in Zikaron, THE agent SHALL flag the conflict, retain both entries with metadata, and update confidence scores — knowledge evolves, it is never silently overwritten
9. WHEN a stored pattern's effectiveness degrades over time (e.g., a design trend becomes outdated, a trading strategy stops working), THE Learning_Engine SHALL detect the degradation and mark the pattern as deprecated with a replacement recommendation
10. THE Seraphim_Core SHALL execute periodic knowledge audits (weekly) that identify stale entries, conflicting information, and gaps in domain expertise across all agents

##### 43d: Cross-Agent Knowledge Sharing

11. WHEN one agent discovers knowledge relevant to another agent's domain (e.g., ZionX discovers a monetization pattern useful for ZXMG), THE Seraphim_Core SHALL propagate the insight to the relevant agent's Domain_Expertise_Profile via Eretz's cross-business synergy engine
12. THE Zikaron SHALL support cross-agent memory queries so that any agent can access relevant knowledge from other agents within the same Tenant, subject to Mishmar authorization
13. WHEN Eretz detects a reusable business pattern from one subsidiary's success, THE Eretz SHALL generalize the pattern and store it in the shared Pattern_Library within Zikaron for all subsidiaries to reference

##### 43e: Memory-Backed Decision Making

14. BEFORE any agent makes a significant decision (app design choice, content strategy, trade entry, budget allocation), THE agent SHALL query Zikaron for relevant historical patterns, past outcomes, and domain expertise — decisions must be informed by accumulated knowledge, not made in isolation
15. WHEN an agent generates a recommendation for the King, THE recommendation SHALL include references to the Zikaron entries that informed it — showing the evidence chain from research to recommendation
16. THE XO_Audit SHALL record which Zikaron entries were consulted for each decision, creating a full traceability chain from knowledge → decision → outcome → learning


---

### Requirement 44: ZXMG Video Development Studio

**User Story:** As the King, I want a full in-browser video production studio inside the ZXMG tab of the Shaar dashboard — where ZXMG autonomously researches trending topics, generates content ideas ranked by predicted performance, produces scripts, generates AI video clips, assembles full videos, and publishes across platforms — so that I have a hands-off content production machine that I can optionally override when I want to ideate, but that operates autonomously by default across all managed YouTube channels.

#### Acceptance Criteria

##### 44a: Autonomous Content Engine (Default Mode)

1. THE ZXMG_Video_Studio SHALL operate in autonomous mode by default — researching trending topics, algorithm signals, competitor performance, and audience behavior without requiring King input
2. WHEN ZXMG identifies a content opportunity through autonomous research, THE ZXMG SHALL generate a content calendar entry with: video concept, predicted views, predicted engagement rate, predicted revenue potential, and recommended publish date
3. THE ZXMG_Video_Studio SHALL maintain a rolling content pipeline of 7 to 14 days ahead for each managed YouTube channel, with auto-generated scripts, thumbnails, titles, descriptions, tags, and scheduling
4. WHEN the King clicks "Generate" on a pipeline item, THE ZXMG SHALL execute the full production pipeline for that item (script → asset creation → video assembly) and present the completed video for review in the preview player
5. WHEN the King clicks "Publish" on a generated video, THE ZXMG_Video_Studio SHALL upload the video to the assigned channel(s) with the prepared metadata, thumbnail, and scheduling — no video shall be published without explicit King approval
6. WHEN the King modifies or rejects a pipeline item, THE ZXMG_Video_Studio SHALL update the pipeline state accordingly and emit the `video.pipeline.updated` hook
7. THE ZXMG_Video_Studio SHALL emit the `video.idea.generated` hook when a new content idea is autonomously generated, enabling downstream notification and approval workflows
8. THE ZXMG_Video_Studio SHALL organize all pipeline views, generation queues, and publishing actions BY CHANNEL — the King selects a channel and sees only that channel's pipeline, generated videos, and publish queue
9. WHEN a video is generated and presented for review, THE King SHALL be able to provide natural language edit feedback (e.g., "make the intro shorter", "change the thumbnail style", "re-do scene 3 with more energy") and THE ZXMG SHALL re-generate the affected portions while preserving the rest of the video
10. THE ZXMG_Video_Studio SHALL support iterative edit cycles — the King can provide feedback multiple times until satisfied, similar to the ZionX App Development Studio's AI edit loop

##### 44b: Script-to-Video Pipeline

7. WHEN the King clicks "Generate" on a pipeline item, THE ZXMG SHALL generate a complete production package: script → scene breakdown → shot list → visual style guide → audio direction
8. WHEN a script is finalized, THE ZXMG_Video_Studio SHALL decompose the script into individual scenes with: duration, visual description, camera direction, audio layer requirements, and character references
9. THE ZXMG_Video_Studio SHALL support video generation up to 15 minutes of consistent content per video with character and visual consistency maintained across all scenes
10. THE ZXMG_Video_Studio SHALL support multiple visual styles including: cinematic, animated, documentary, tutorial, vlog, music video, and custom styles defined per channel
11. THE ZXMG_Video_Studio SHALL emit the `video.script.created` hook when a script is generated for a video

##### 44c: Multi-Model Video Generation

12. WHEN a scene requires video generation, THE ZXMG_Video_Studio SHALL route to the optimal AI model based on shot type: cinematic/dramatic scenes to Sora 2 or Veo 3, fast iteration scenes to Kling or WAN or Minimax, and animation scenes to specialized animation models — with routing decisions managed by Otzar based on quality requirements and budget
13. THE ZXMG_Video_Studio SHALL support text-to-video, image-to-video, and audio-to-video generation modes for each scene
14. THE ZXMG_Video_Studio SHALL support camera simulation including: pan, zoom, dolly, crane, and tracking shot types within generated video clips
15. THE ZXMG_Video_Studio SHALL maintain character persistence across clips within a single video — ensuring consistent face, body, clothing, and mannerisms for recurring characters
16. THE ZXMG_Video_Studio SHALL support lip-sync generation for dialogue scenes, synchronizing generated character mouth movements with voiceover audio
17. THE ZXMG_Video_Studio SHALL emit the `video.scene.rendered` hook when an individual scene clip is generated

##### 44d: Production Studio (Timeline Editor)

18. THE ZXMG_Video_Studio SHALL provide a timeline editor with scene-by-scene control, allowing the King to reorder, trim, extend, or replace individual scenes
19. THE ZXMG_Video_Studio SHALL support audio layer management with separate tracks for: music, sound effects, voiceover, and ambient audio
20. THE ZXMG_Video_Studio SHALL provide transitions and visual effects between scenes including: cuts, fades, dissolves, wipes, and custom motion graphics
21. THE ZXMG_Video_Studio SHALL provide color grading presets applicable per scene or across the entire video
22. THE ZXMG_Video_Studio SHALL support multi-format export: 16:9 for YouTube long-form, 9:16 for Shorts and TikTok and Reels, and 1:1 for Instagram feed
23. THE ZXMG_Video_Studio SHALL emit the `video.assembled` hook when a full video is assembled from individual scenes

##### 44e: Trend Intelligence Engine

24. THE ZXMG_Video_Studio SHALL perform real-time analysis of trending video styles, topics, and formats across YouTube, TikTok, and Instagram using browser automation and platform APIs
25. THE ZXMG_Video_Studio SHALL detect algorithm signals indicating which content types are currently being boosted by each platform's recommendation system
26. THE ZXMG_Video_Studio SHALL analyze competitor channels (channels in the same niche as each managed channel) to identify content strategies that are generating above-average engagement
27. THE ZXMG_Video_Studio SHALL analyze audience retention curves from existing videos to identify where viewers drop off and generate recommendations for improving retention
28. THE ZXMG_Video_Studio SHALL identify content gaps — topics with high search demand but low supply of quality content — and prioritize these in the autonomous content calendar
29. THE ZXMG_Video_Studio SHALL detect viral patterns (hooks, pacing, formats, thumbnail styles) and incorporate them into content generation templates stored in Zikaron procedural memory

##### 44f: Channel Management

30. THE ZXMG_Video_Studio SHALL support management of multiple YouTube channels from a single interface, with per-channel content strategy configuration
31. WHEN the King configures a channel, THE ZXMG_Video_Studio SHALL accept: niche definition, tone of voice, posting cadence, target audience demographics, and content pillars — storing the configuration in Zikaron
32. THE ZXMG_Video_Studio SHALL display per-channel analytics including: views, subscribers, revenue, average retention, click-through rate, and growth rate
33. THE ZXMG_Video_Studio SHALL support cross-channel promotion by automatically referencing other managed channels in content where contextually appropriate
34. THE ZXMG_Video_Studio SHALL monitor channel health metrics (growth rate trend, engagement trend, algorithm standing) and emit alerts when metrics decline below configured thresholds
35. THE ZXMG_Video_Studio SHALL organize ALL content operations by channel — the pipeline view, generation queue, review queue, and publish queue SHALL each be scoped to a specific channel, with a channel selector as the primary navigation element
36. WHEN the King selects a channel, THE ZXMG_Video_Studio SHALL display that channel's: ideation pipeline, videos in generation, videos awaiting review, videos ready to publish, and published video performance — all in one channel-scoped view

##### 44f2: Video Edit and Feedback Loop

37. AFTER a video is generated and before publishing, THE ZXMG_Video_Studio SHALL allow the King to provide natural language feedback on the generated video (e.g., "make the intro shorter", "change the background music", "re-do scene 3 with more energy", "add captions")
38. WHEN the King provides edit feedback, THE ZXMG SHALL apply the requested changes to the video (re-render affected scenes, adjust audio, modify transitions) and present the updated version for review — following the same edit loop pattern as ZionX App Development Studio
39. THE ZXMG_Video_Studio SHALL maintain an undo/redo history for video edits so the King can revert changes
40. THE ZXMG_Video_Studio SHALL support scene-level feedback — the King can click on a specific scene in the timeline and provide feedback for just that scene without affecting the rest of the video
41. THE ZXMG_Video_Studio SHALL only enable the "Publish" button after the King has reviewed the final version — no video can be published in a "generating" or "editing" state

##### 44g: Platform Distribution

35. WHEN a video is ready for publishing, THE ZXMG_Video_Studio SHALL support one-click distribution to: YouTube, TikTok, Instagram Reels, X, Facebook, and Rumble
36. THE ZXMG_Video_Studio SHALL automatically format content per platform requirements: aspect ratio, maximum duration, caption format, hashtag conventions, and thumbnail specifications
37. THE ZXMG_Video_Studio SHALL schedule uploads at optimal times per platform based on audience activity data stored in Zikaron
38. THE ZXMG_Video_Studio SHALL support cross-platform content repurposing — automatically generating Shorts, clips, and teasers from long-form videos
39. THE ZXMG_Video_Studio SHALL emit the `video.scheduled` hook when a video is scheduled for upload and the `video.published` hook when a video is uploaded to a platform

##### 44h: Thumbnail Generation and A/B Testing

40. WHEN a video is produced, THE ZXMG_Video_Studio SHALL generate multiple thumbnail variants (minimum 3) optimized for click-through rate
41. THE ZXMG_Video_Studio SHALL generate title and description variants optimized for YouTube SEO (search ranking and suggested video placement)
42. THE ZXMG_Video_Studio SHALL emit the `video.thumbnail.generated` hook when thumbnail variants are created
43. WHEN A/B test results are available from YouTube, THE ZXMG_Video_Studio SHALL store the performance data in Zikaron and update thumbnail generation models based on what performs best for each channel

##### 44i: UGC and Ad Creative Builder

44. THE ZXMG_Video_Studio SHALL generate authentic-looking user-generated content style videos for brand promotion and product marketing
45. THE ZXMG_Video_Studio SHALL support AI avatar and influencer creation for consistent brand presence across videos, with persistent character identity stored in Zikaron
46. THE ZXMG_Video_Studio SHALL generate ad creative variants in performance ad format (hook → value → call-to-action) for A/B testing across ad platforms

##### 44j: Analytics and Optimization

47. WHEN a video is published, THE ZXMG_Video_Studio SHALL track real-time performance metrics including: views, watch time, engagement rate, click-through rate, and revenue (AdSense, sponsorships, affiliate)
48. THE ZXMG_Video_Studio SHALL generate audience retention heatmaps showing second-by-second viewer engagement for each published video
49. THE ZXMG_Video_Studio SHALL store all content performance patterns in Zikaron procedural memory, enabling the autonomous content engine to learn what works and improve over time
50. THE ZXMG_Video_Studio SHALL emit the `video.performance.update` hook when performance metrics are updated, enabling automated optimization recommendations

##### 44k: Video Preview Panel

51. THE ZXMG_Video_Studio SHALL provide a full video player with timeline scrubbing in the center panel of the studio layout
52. THE ZXMG_Video_Studio SHALL display a scene-by-scene thumbnail strip below the video player for quick navigation between scenes
53. THE ZXMG_Video_Studio SHALL support side-by-side comparison view for before and after edits on any scene
54. THE ZXMG_Video_Studio SHALL provide device preview showing how the video appears on mobile versus desktop viewing contexts
55. THE ZXMG_Video_Studio SHALL display audio waveform visualization synchronized with the video timeline

##### 44l: Studio Layout and Tool Sidebar

56. THE ZXMG_Video_Studio SHALL use a three-panel layout: left panel (1fr) for AI chat and autonomous pipeline view, center panel (2fr) for video preview player with timeline and scene thumbnails, and right panel (64px) for tool sidebar icons
57. THE ZXMG_Video_Studio SHALL provide a tool sidebar with the following buttons: Script, Scenes, Characters, Audio, Effects, Trends, Thumbnails, Captions, Export, Analytics, Publish, Pipeline, and Research
58. WHEN the King selects a tool sidebar button, THE ZXMG_Video_Studio SHALL open the corresponding tool panel overlaying or replacing the relevant section of the layout

##### 44m: Hook Integration and Event-Driven Automation

59. THE ZXMG_Video_Studio SHALL emit the following lifecycle hooks through the existing Event Bus: `video.idea.generated`, `video.script.created`, `video.scene.rendered`, `video.assembled`, `video.thumbnail.generated`, `video.scheduled`, `video.published`, `video.performance.update`, and `video.pipeline.updated`
60. WHEN the `video.performance.update` hook fires with metrics below the channel's performance baseline, THE ZXMG_Video_Studio SHALL generate optimization recommendations and store them in the Recommendation_Queue
61. THE ZXMG_Video_Studio SHALL integrate with existing Shaar WebSocket infrastructure for real-time pipeline status updates, render progress streaming, and analytics delivery to the dashboard

##### 44n: Governance, Memory, and Architecture Integration

62. THE ZXMG_Video_Studio SHALL integrate with Mishmar governance for approval workflows — the King may optionally require approval before autonomous publishing, budget allocation for premium model usage, and authority escalation for cross-pillar resource requests
63. THE ZXMG_Video_Studio SHALL use Zikaron procedural memory to learn what content performs best per channel, storing: successful hooks, optimal video lengths, best posting times, effective thumbnail styles, and high-retention pacing patterns
64. THE ZXMG_Video_Studio SHALL log all studio actions (idea generation, script creation, scene rendering, video assembly, publishing, performance tracking) to XO_Audit with full traceability from research insight to published video
65. THE ZXMG_Video_Studio SHALL integrate with the existing ZXMG agent state machine (planning → script → asset creation → video assembly → upload → monitoring) via WebSocket and REST through the Shaar dashboard
66. THE ZXMG_Video_Studio SHALL route video generation requests to multiple AI model providers through Otzar, which manages model selection based on shot type, quality requirements, and budget constraints


---

### Requirement 45: ZionX Autonomous App Ideation Engine

**User Story:** As the King, I want ZionX to autonomously research app markets, trending niches, competitor gaps, and revenue opportunities — filling a ranked pipeline of app ideas with predicted downloads, revenue, and competition level — so that I can simply click "Generate" on any idea to build it, while still retaining the ability to manually create apps through the existing chat interface.

#### Acceptance Criteria

##### 45a: Autonomous Market Research Engine

1. THE ZionX_App_Ideation_Engine SHALL autonomously research app markets including: App Store category rankings, trending apps, revenue data, review gaps, emerging niches, and competitor weaknesses — without requiring King input
2. WHEN the ZionX_App_Ideation_Engine completes a research cycle, THE ZionX_App_Ideation_Engine SHALL store all findings in Zikaron procedural memory with structured metadata including: source, confidence level, market category, timestamp, and relevance tags
3. THE ZionX_App_Ideation_Engine SHALL perform research across both Apple App Store and Google Play Store, analyzing category-level trends, top-grossing apps, new entrants, and user review sentiment
4. THE ZionX_App_Ideation_Engine SHALL emit the `app.idea.researched` hook when a research cycle completes, enabling downstream notification and pipeline update workflows

##### 45b: Niche Scoring Algorithm

5. THE ZionX_App_Ideation_Engine SHALL score each identified niche using a composite algorithm incorporating: market size (total addressable downloads), competition density (number of established apps), revenue potential (average revenue per app in niche), and technical feasibility (complexity relative to ZionX capabilities)
6. WHEN a niche is scored, THE ZionX_App_Ideation_Engine SHALL produce a normalized score (0-100) with per-factor breakdown so the King can understand why a niche ranks where it does
7. THE ZionX_App_Ideation_Engine SHALL weight scoring factors based on historical success data stored in Zikaron — niches where previous ZionX apps succeeded receive higher feasibility scores

##### 45c: App Idea Generation and Ranking

8. WHEN the ZionX_App_Ideation_Engine identifies a high-scoring niche, THE ZionX_App_Ideation_Engine SHALL generate concrete app ideas with: app name, value proposition, target audience, monetization model, predicted downloads (30-day), predicted revenue (monthly), and competition level (low/medium/high)
9. THE ZionX_App_Ideation_Engine SHALL maintain a ranked pipeline of app ideas sorted by a composite score of predicted downloads, predicted revenue, and inverse competition level
10. THE ZionX_App_Ideation_Engine SHALL emit the `app.idea.ranked` hook when new ideas are added to or re-ranked within the pipeline
11. THE ZionX_App_Ideation_Engine SHALL continuously refresh the pipeline — removing stale ideas (older than 30 days without action), re-scoring existing ideas based on market changes, and adding new ideas from fresh research cycles

##### 45d: Pipeline Management and Human Gates

12. WHEN the King clicks "Generate" on a pipeline idea, THE ZionX_App_Studio SHALL execute the full app generation pipeline for that idea (specification → code generation → preview) using the existing ZionX App Development Studio flow (Requirement 42) — this is Gate 1
13. WHEN the King clicks "Publish" on a generated app, THE ZionX_App_Studio SHALL submit the app to the configured stores using the existing Build/Submit workflow (Requirement 42g) — this is Gate 2
14. THE ZionX_App_Ideation_Engine SHALL support both autonomous pipeline ideas AND manual King-created ideas through the existing chat interface — both paths feed into the same pipeline → Generate → Review → Publish flow
15. THE ZionX_App_Ideation_Engine SHALL emit the `app.pipeline.updated` hook when the pipeline state changes (idea added, removed, re-ranked, or status changed)

##### 45e: Studio UI Integration

16. THE ZionX_App_Studio SHALL display the autonomous pipeline in the left panel alongside the existing ZionX AI chat — showing ranked ideas with "Generate" buttons, predicted metrics, and competition indicators
17. THE ZionX_App_Studio SHALL allow the King to filter pipeline ideas by: category, revenue potential, competition level, and technical feasibility
18. THE ZionX_App_Studio SHALL allow the King to dismiss pipeline ideas (removing them from the active pipeline) or bookmark ideas for later consideration
19. THE ZionX_App_Studio SHALL display pipeline idea details on click: full market analysis, competitor breakdown, revenue model, and niche scoring factors

##### 45f: Learning and Integration

20. WHEN an app generated from a pipeline idea is published and performance data becomes available, THE ZionX_App_Ideation_Engine SHALL store the outcome in Zikaron — correlating the original idea scoring with actual results to improve future predictions
21. THE ZionX_App_Ideation_Engine SHALL integrate with the existing ZionX design intelligence, quality baselines, and GTM engine — pipeline ideas inherit the same quality standards and go-to-market automation as manually created apps
22. THE ZionX_App_Ideation_Engine SHALL log all ideation actions (research cycles, niche scoring, idea generation, pipeline updates) to XO_Audit with full traceability from market research to generated idea

---

### Requirement 46: Eretz Business Command Center

**User Story:** As the King, I want a dedicated full-page Eretz Business Command Center tab in the Shaar dashboard — serving as the single pane of glass for the entire business portfolio — so that I can see total MRR, per-subsidiary performance, active synergies, pattern adoption, training effectiveness, pending recommendations, decline alerts, resource allocation, and strategic priorities all in one view with real-time updates.

#### Acceptance Criteria

##### 46a: Full-Page Dashboard Layout

1. THE Eretz_Command_Center SHALL be a dedicated full-page tab in the Shaar dashboard — equivalent in scope to the ZionX App Studio and ZXMG Video Studio tabs — not a sub-view within an existing dashboard
2. THE Eretz_Command_Center SHALL use a responsive grid layout with configurable card arrangement, allowing the King to see the entire business portfolio at a glance
3. THE Eretz_Command_Center SHALL connect via WebSocket for real-time metric updates — all displayed data SHALL reflect live values from Eretz services without manual refresh

##### 46b: Portfolio Overview Section

4. THE Eretz_Command_Center SHALL display a portfolio overview header showing: total MRR, total revenue, portfolio growth trajectory (sparkline), and overall portfolio health indicator (strong/stable/at_risk/critical)
5. THE Eretz_Command_Center SHALL display per-subsidiary breakdown showing each subsidiary's contribution to total MRR and revenue with percentage share and trend indicators

##### 46c: Per-Subsidiary Cards

6. THE Eretz_Command_Center SHALL display a ZionX subsidiary card showing: total apps count, total app revenue, top 3 apps by revenue, app pipeline count, and growth trend
7. THE Eretz_Command_Center SHALL display a ZXMG subsidiary card showing: total channels count, total views (30-day), total channel revenue, top 3 channels by revenue, and content pipeline count
8. THE Eretz_Command_Center SHALL display a Zion Alpha subsidiary card showing: active positions count, total P&L, win rate percentage, current strategy, and risk exposure level

##### 46d: Synergy Map Visualization

9. THE Eretz_Command_Center SHALL display a synergy map visualization showing active synergies between subsidiaries with connecting lines indicating data flow direction and revenue impact annotations
10. THE Eretz_Command_Center SHALL display synergy revenue impact — the total additional revenue generated through cross-subsidiary synergies versus isolated operation

##### 46e: Pattern Library Browser

11. THE Eretz_Command_Center SHALL display a searchable pattern library browser showing: pattern name, category, source subsidiary, adoption count across subsidiaries, and effectiveness score
12. THE Eretz_Command_Center SHALL allow the King to click a pattern to view full details including: description, implementation examples, adoption history, and measured impact

##### 46f: Training Cascade Effectiveness

13. THE Eretz_Command_Center SHALL display training cascade effectiveness metrics showing: per-subsidiary quality trend (before/after training), training completion rates, and quality score improvements over time
14. THE Eretz_Command_Center SHALL visualize quality trends as line charts per subsidiary showing the trajectory of quality scores across training cycles

##### 46g: Recommendation Queue

15. THE Eretz_Command_Center SHALL display the pending recommendation queue showing: recommendation summary, priority level, source agent, submitted date, and action buttons (approve/reject/modify)
16. WHEN the King clicks "Approve" on a recommendation, THE Eretz_Command_Center SHALL trigger the recommendation execution workflow and update the queue display in real-time
17. WHEN the King clicks "Reject" on a recommendation, THE Eretz_Command_Center SHALL mark the recommendation as rejected with an optional reason field and remove it from the pending queue
18. WHEN the King clicks "Modify" on a recommendation, THE Eretz_Command_Center SHALL open an inline editor allowing the King to adjust the recommendation parameters before approving

##### 46h: Decline Alerts

19. THE Eretz_Command_Center SHALL display real-time decline alerts showing: affected subsidiary, declining metric, severity (warning/critical), decline percentage, and intervention plan summary
20. WHEN a new decline alert is generated by the Portfolio Dashboard service, THE Eretz_Command_Center SHALL display it immediately via WebSocket push without requiring page refresh
21. THE Eretz_Command_Center SHALL allow the King to acknowledge alerts and view the full intervention plan with actionable steps

##### 46i: Resource Allocation View

22. THE Eretz_Command_Center SHALL display the current resource allocation across subsidiaries as a visual breakdown (bar chart or treemap) showing: budget percentage per subsidiary, actual spend, and recommended allocation from the portfolio strategy
23. THE Eretz_Command_Center SHALL allow the King to adjust resource allocation directly from the dashboard — dragging allocation percentages or entering values — with changes propagated to the Eretz portfolio strategy

##### 46j: Strategic Priorities

24. THE Eretz_Command_Center SHALL display the current portfolio strategy including: portfolio thesis, top priorities list, per-subsidiary strategy (scale/maintain/optimize/deprecate), and risk factors
25. THE Eretz_Command_Center SHALL display per-subsidiary strategic priorities with key actions and progress indicators

##### 46k: Data Integration

26. THE Eretz_Command_Center SHALL source all displayed data from existing Eretz services: portfolio-dashboard.ts (metrics, alerts, strategy), synergy-engine.ts (synergies, revenue impact), pattern-library.ts (patterns, adoption), and training-cascade.ts (quality trends, effectiveness)
27. THE Eretz_Command_Center SHALL NOT duplicate business logic — it is a presentation layer that consumes existing Eretz service APIs through the Shaar WebSocket and REST infrastructure


---

### Requirement 47: Seraphim Core Architecture Views (Dashboard Integration)

**User Story:** As the King, I want INCOSE-quality-grade interactive architecture views integrated into the Seraphim Core section of the Shaar dashboard — including an Operational View (OV-1), a System View (SV-1), and live-rendered Requirements, Design, and Capabilities documents — so that I can visualize the full system architecture and review spec documents directly from the dashboard without switching tools.

#### Acceptance Criteria

##### 47a: Navigation Integration

1. THE Dashboard_Views SHALL register five new navigation items under the Seraphim Core section: "OV-1 Operational", "SV-1 System", "Requirements", "Design", and "Capabilities"
2. WHEN the King clicks a Dashboard_Views navigation item, THE Shaar SHALL render the corresponding view in the main content area and highlight the active navigation item
3. THE Dashboard_Views navigation items SHALL appear after the existing Seraphim Core items (Command Center, Governance, Memory, Resources, Audit Trail, Learning, Self-Improvement, Decisions)

##### 47b: OV-1 Operational View Diagram

4. WHEN the OV1_View is mounted, THE Diagram_Renderer SHALL display a color SVG operational architecture diagram following INCOSE OV-1 conventions
5. THE OV1_View diagram SHALL depict: the King as the primary actor, Seraphim Core as the orchestrator, all operational pillars (Eretz, ZionX, ZXMG, Zion Alpha, Otzar), information flows between actors, and external system interfaces
6. THE OV1_View diagram SHALL use distinct colors to differentiate between actor types, pillar domains, command flows, and information flows
7. THE OV1_View diagram SHALL render text labels that are legible at the default zoom level without requiring zoom to read

##### 47c: SV-1 System View Diagram

8. WHEN the SV1_View is mounted, THE Diagram_Renderer SHALL display a color SVG system architecture diagram following INCOSE SV-1 conventions
9. THE SV1_View diagram SHALL depict the six architectural layers: Interface Layer (Shaar), Kernel (Seraphim Core), System Services (Zikaron, Mishmar, Otzar, XO Audit), Application Layer (ZionX, ZXMG, Zion Alpha), Driver Layer (adapters), and Data Layer (Aurora, DynamoDB, S3)
10. THE SV1_View diagram SHALL show component-to-component data flows with directional indicators and labeled connections
11. THE SV1_View diagram SHALL use distinct colors per architectural layer to visually separate concerns
12. THE SV1_View diagram SHALL render text labels that are legible at the default zoom level without requiring zoom to read

##### 47d: Diagram Click-to-Zoom Interaction

13. WHEN the King clicks on the OV1_View diagram or the SV1_View diagram, THE Shaar SHALL open a Diagram_Modal displaying the clicked diagram at full viewport size
14. WHILE the Diagram_Modal is open, THE Pan_Zoom_Controller SHALL allow the King to zoom in and out using mouse wheel, pinch gesture, or dedicated zoom buttons
15. WHILE the Diagram_Modal is open, THE Pan_Zoom_Controller SHALL allow the King to pan the diagram by click-and-drag or touch-and-drag
16. WHEN the King presses the Escape key or clicks a close button, THE Diagram_Modal SHALL close and return to the normal view
17. THE Diagram_Modal SHALL display the diagram with a minimum zoom range of 0.25x to 4x the original size
18. WHILE the Diagram_Modal is open, THE Pan_Zoom_Controller SHALL display the current zoom level as a percentage indicator

##### 47e: Requirements Document View

19. WHEN the Requirements_View is mounted, THE Shaar SHALL fetch the content of the requirements.md Spec_Document_Source and render it as formatted HTML
20. THE Requirements_View SHALL render markdown headings, lists, tables, bold text, and code blocks with appropriate styling consistent with the dashboard theme
21. IF the requirements.md Spec_Document_Source is unavailable, THEN THE Requirements_View SHALL display an informative error message indicating the document could not be loaded

##### 47f: Design Document View

22. WHEN the Design_View is mounted, THE Shaar SHALL fetch the content of the design.md Spec_Document_Source and render it as formatted HTML
23. THE Design_View SHALL render markdown headings, lists, tables, bold text, code blocks, and mermaid diagram blocks with appropriate styling consistent with the dashboard theme
24. IF the design.md Spec_Document_Source is unavailable, THEN THE Design_View SHALL display an informative error message indicating the document could not be loaded

##### 47g: Capabilities Document View

25. WHEN the Capabilities_View is mounted, THE Shaar SHALL fetch the content of the capabilities.md Spec_Document_Source and render it as formatted HTML
26. THE Capabilities_View SHALL render markdown headings, lists, tables, bold text, and code blocks with appropriate styling consistent with the dashboard theme
27. IF the capabilities.md Spec_Document_Source is unavailable, THEN THE Capabilities_View SHALL display an informative error message indicating the document could not be loaded

##### 47h: Auto-Sync on Document Changes

28. WHEN the requirements.md Spec_Document_Source is updated, THE Auto_Sync_Service SHALL propagate the updated content to the Requirements_View within 5 seconds
29. WHEN the design.md Spec_Document_Source is updated, THE Auto_Sync_Service SHALL propagate the updated content to the Design_View within 5 seconds
30. WHEN the capabilities.md Spec_Document_Source is updated, THE Auto_Sync_Service SHALL propagate the updated content to the Capabilities_View within 5 seconds
31. WHILE a document view is actively displayed, THE Auto_Sync_Service SHALL re-render the view content upon receiving an update notification without requiring the King to navigate away and back
32. THE Auto_Sync_Service SHALL use the existing WebSocket connection for real-time change notifications rather than polling

##### 47i: Diagram Color Standards

33. THE Diagram_Renderer SHALL use a defined color palette with at least six distinct colors mapped to architectural layers (Interface, Kernel, System Services, Application, Driver, Data)
34. THE Diagram_Renderer SHALL use consistent colors for the same component type across both OV-1 and SV-1 diagrams
35. THE Diagram_Renderer SHALL ensure all color combinations meet WCAG 2.1 AA contrast ratio (4.5:1) for text on colored backgrounds
36. THE Diagram_Renderer SHALL render connection lines in colors that distinguish command flows from data flows from event flows

##### 47j: Responsive Layout

37. THE Dashboard_Views SHALL render diagrams that scale proportionally to fit the available content area width without horizontal scrolling
38. WHILE the viewport width is below 768px, THE Dashboard_Views SHALL stack diagram and content elements vertically
39. THE Diagram_Modal SHALL occupy the full viewport on all screen sizes with appropriate padding
40. THE document views (Requirements_View, Design_View, Capabilities_View) SHALL constrain content width to a maximum of 900px for readability while centering within the available space

---

### Requirement 48: Persistent Agent Identity and Memory-Backed Conversations

**User Story:** As the King, I want each agent to have a persistent, immutable identity with deep personality, institutional memory, and full conversation history — so that every interaction builds on previous ones, agents never forget context, and the system accumulates intelligence over time rather than starting fresh on each request.

#### Acceptance Criteria

##### 48a: Agent Identity Persistence

1. EACH Agent_Program SHALL define a comprehensive `identityProfile` containing: name, role description, personality traits, communication style, domain expertise areas, decision-making principles, and relationship to other agents in the hierarchy
2. WHEN an Agent is deployed, THE Agent_Runtime SHALL load the agent's full `identityProfile` into its system prompt context, ensuring the agent NEVER breaks character or identifies as a generic AI assistant
3. THE Agent_Runtime SHALL enforce that the `identityProfile` is immutable during a session — no external input may override or modify the agent's core identity
4. WHEN an Agent's `identityProfile` is updated via a new Agent_Program version, THE Agent_Runtime SHALL log the identity change to XO_Audit and store the previous identity in episodic memory for continuity

##### 48b: Conversation Memory and Persistence

5. WHEN a human user sends a message to an Agent via the dashboard, THE Agent_Runtime SHALL store the complete exchange (user message + agent response) in Zikaron episodic memory with tags: `conversation`, `dashboard`, `{agentId}`, `{userId}`
6. WHEN an Agent begins processing a chat task, THE Agent_Runtime SHALL load the last 20 conversation exchanges from Zikaron episodic memory for that agent-user pair, providing full conversational continuity
7. THE Agent_Runtime SHALL include loaded conversation history in the LLM context window as prior messages, enabling the agent to reference and build upon previous interactions naturally
8. WHEN conversation history exceeds the LLM context window, THE Agent_Runtime SHALL use Zikaron vector search to retrieve the most semantically relevant past conversations rather than truncating chronologically
9. ALL conversation data SHALL be persisted to Aurora PostgreSQL via Zikaron, ensuring durability across container restarts, ECS task replacements, and system redeployments

##### 48c: Cross-Session Context Continuity

10. WHEN an Agent starts a new session (container restart, redeployment, or fresh task), THE Agent_Runtime SHALL call `Zikaron.loadAgentContext(agentId)` to restore: working memory (active goals, pending tasks), recent episodic context (last 7 days), and top procedural patterns (learned behaviors)
11. THE Agent_Runtime SHALL persist working memory to Zikaron every 60 seconds during active sessions and immediately upon task completion, ensuring no context is lost on unexpected termination
12. WHEN an Agent is terminated and redeployed, THE Agent_Runtime SHALL verify that the new instance loads identical context to what the previous instance had at termination time
13. THE Zikaron SHALL maintain a `session_continuity` record for each agent tracking: last active timestamp, last persisted working memory hash, and session transition events

##### 48d: Memory-Backed Decision Making

14. BEFORE making any decision or recommendation, THE Agent SHALL query Zikaron for relevant procedural memory (past decisions in similar contexts) and episodic memory (outcomes of previous similar actions)
15. WHEN an Agent makes a decision, THE Agent_Runtime SHALL store the decision context, reasoning, and outcome in episodic memory with tags enabling future retrieval for similar situations
16. THE Agent_Runtime SHALL track decision patterns in procedural memory with success rates, enabling agents to improve their decision-making over time based on historical outcomes
17. WHEN a decision contradicts a previously successful pattern stored in procedural memory, THE Agent SHALL acknowledge the deviation and provide reasoning in its response

##### 48e: Governance-Compliant Memory Access

18. ALL memory reads and writes SHALL be subject to Mishmar authorization — an agent may only access memories within its authorized scope (own memories + cross-agent memories where explicitly permitted)
19. WHEN an Agent accesses another agent's memories, THE Mishmar SHALL validate the access against the requesting agent's authority level and log the cross-agent memory access to XO_Audit
20. THE Zikaron SHALL enforce tenant isolation at the database level — no memory query may return results from a different tenant regardless of the query parameters
21. WHEN the King interacts with any agent, THE conversation SHALL be stored with authority level L1 metadata, making it accessible to all agents within the tenant for institutional knowledge building

##### 48f: Inter-Agent Knowledge Sharing

22. WHEN an Agent learns a new fact, pattern, or procedure that is relevant to other agents, THE Agent_Runtime SHALL publish a `memory.knowledge_shared` event to the Event Bus with the memory entry ID and relevance tags
23. WHEN an Agent receives a `memory.knowledge_shared` event tagged with its pillar or domain, THE Agent SHALL incorporate the shared knowledge into its next context load via Zikaron semantic memory
24. THE Zikaron SHALL maintain a `knowledge_graph` in semantic memory linking agents, decisions, outcomes, and learned patterns — enabling any agent to traverse the institutional knowledge of the entire system
25. WHEN the King asks any agent about a topic that another agent has expertise in, THE responding agent SHALL query cross-agent semantic memory and acknowledge the source agent's contribution in its response

##### 48g: Personality and Communication Style

26. EACH Agent's `identityProfile` SHALL define: tone (formal/casual/technical), verbosity (concise/detailed), proactivity (reactive/proactive), and domain language preferences
27. THE Agent_Runtime SHALL enforce personality consistency by including personality directives in the system prompt that instruct the LLM to maintain character regardless of user prompts attempting to override identity
28. WHEN an Agent's communication style is inconsistent with its defined personality (detected via response analysis), THE Agent_Runtime SHALL log the inconsistency and reinforce the personality in subsequent prompts
29. THE Agent_Runtime SHALL support personality evolution — as an agent accumulates experience (stored in procedural memory), its communication style may naturally evolve while maintaining core identity traits

---

### Requirement 49: Agent Cognition Envelope

**User Story:** As the King, I want every LLM invocation to pass through a structured cognition envelope that assembles full agent context — so that no agent ever responds as a generic chatbot, and every response is informed by identity, memory, authority, tools, and workflow state.

#### Acceptance Criteria

1. THE Agent_Runtime SHALL assemble a Cognition Envelope before every LLM call containing: agent persona/system prompt, authority level, allowed tools, current workflow state, relevant Zikaron memory, current user/session context, active goals, prior decisions, completion contract, available MCP tools, and A2A delegation policy
2. THE Agent_Runtime SHALL NEVER call an LLM directly from a chat handler without first assembling the full Cognition Envelope
3. IF any component of the Cognition Envelope fails to load (memory unavailable, tool registry down), THE Agent_Runtime SHALL proceed with a degraded envelope and log the missing components to XO_Audit
4. THE Cognition Envelope SHALL be serializable and inspectable — Shaar SHALL display the envelope contents for any agent response in an execution trace view
5. WHEN the same LLM API key is used by different agents, THE responses SHALL differ based on the Cognition Envelope contents — proving that agent behavior is driven by context, not just the model

---

### Requirement 50: Agent Planning Engine

**User Story:** As the King, I want agents to decompose complex directives into structured plans before execution — so that multi-step workflows are predictable, auditable, and resumable rather than ad-hoc LLM chain-of-thought.

#### Acceptance Criteria

1. WHEN an Agent receives a complex directive (multi-step, multi-tool, or multi-agent), THE Agent SHALL generate a structured execution plan containing: objective, subtasks, required tools, required agents, dependencies, risks, expected outputs, gates, budget estimate, and approval requirements
2. THE execution plan SHALL be persisted in Zikaron working memory before execution begins, enabling resumption after failure or restart
3. WHEN a plan step fails, THE Agent SHALL dynamically revise the remaining plan rather than failing the entire workflow
4. THE Agent SHALL submit plans requiring L1/L2 authority actions to Mishmar for pre-approval before execution
5. WHEN a plan exceeds the agent's budget estimate, THE Agent SHALL request Otzar approval before proceeding
6. THE Shaar dashboard SHALL display active plans with their current execution state, completed steps, and pending steps

---

### Requirement 51: Dynamic Tool Selection via MCP

**User Story:** As the King, I want agents to discover and select tools dynamically from an MCP registry — so that tool usage is intelligent, cost-aware, and resilient rather than hardcoded.

#### Acceptance Criteria

1. THE Agent_Runtime SHALL maintain an MCP Tool Registry containing all available tools with their capabilities, cost, reliability score, required permissions, and health status
2. WHEN an Agent needs to invoke a tool, THE Agent SHALL query the MCP Registry semantically to find matching tools rather than hardcoding tool names
3. BEFORE invoking any MCP tool, THE Agent SHALL verify Mishmar authorization and Otzar budget availability
4. THE Agent SHALL select tools based on: task fit, cost, reliability history, permissions, and current availability
5. IF an MCP tool invocation fails, THE Agent SHALL attempt fallback to an alternate tool/provider automatically, logging the fallback decision to XO_Audit
6. THE Otzar SHALL track MCP invocation costs per tool, per agent, and per pillar — enabling cost optimization across tool usage
7. THE MCP Registry SHALL support dynamic tool registration — new tools can be added without code deployment

---

### Requirement 52: Agent-to-Agent (A2A) Delegation

**User Story:** As the King, I want agents to delegate subtasks to specialized agents and aggregate results — so that complex workflows leverage the full agent hierarchy rather than one agent doing everything.

#### Acceptance Criteria

1. WHEN an Agent identifies a subtask outside its expertise, THE Agent SHALL delegate to the most appropriate specialized agent by publishing a delegation request containing: scope, constraints, expected output format, timeout, and authority level
2. THE delegating Agent SHALL wait for the delegated agent's response (with configurable timeout) and aggregate the result into its own workflow
3. IF a delegated agent fails or times out, THE delegating Agent SHALL either retry, delegate to an alternate agent, or escalate to the King
4. ALL A2A delegation flows SHALL be logged to XO_Audit with: initiating agent, target agent, task scope, delegation timestamp, result timestamp, and outcome
5. THE Mishmar SHALL enforce that agents may only delegate to explicitly authorized agents according to the A2A delegation policy defined in their Agent_Program
6. THE Shaar dashboard SHALL display active delegation chains showing which agents are working on what, their dependencies, and current status
7. WHEN multiple delegated agents return conflicting results, THE initiating Agent SHALL resolve conflicts using its decision principles and log the resolution reasoning

---

### Requirement 53: Workflow Autonomy Modes (Crawl / Walk / Run)

**User Story:** As the King, I want configurable autonomy levels per agent and workflow type — so that I can gradually increase agent independence as trust is established, with appropriate human gates at each level.

#### Acceptance Criteria

1. THE Agent_Runtime SHALL support three autonomy modes: Crawl (human approves every step), Walk (scripted workflow with human approval at gates), Run (agent plans, delegates, and executes within authority boundaries)
2. THE autonomy mode SHALL be configurable per agent, per workflow type, and per tenant
3. WHEN an Agent operates in Crawl mode, THE Agent SHALL pause before every action and present the proposed action to the King for approval via Shaar
4. WHEN an Agent operates in Walk mode, THE Agent SHALL execute scripted steps autonomously but pause at defined gate points for human approval
5. WHEN an Agent operates in Run mode, THE Agent SHALL plan, delegate, invoke tools, and execute within its authority boundaries without human intervention — escalating only when authority is insufficient
6. THE Agent_Runtime SHALL support dynamic autonomy escalation: workflows may promote from Crawl → Walk → Run based on confidence score, historical success rate, and governance policy
7. FOR ZionX production workflows, THE default mode SHALL be Walk — autonomous build/package/test but gated submission unless explicitly configured otherwise
8. FOR ZXMG production workflows, THE default mode SHALL be Walk — autonomous ideate/script/generate but gated publishing unless explicitly configured otherwise

---

### Requirement 54: Execution Trace and Observability

**User Story:** As the King, I want full execution traces for every agent action — so that I can understand exactly what happened, why decisions were made, and debug issues without guessing.

#### Acceptance Criteria

1. EVERY agent response/action SHALL produce an execution trace containing: plan generated, tools considered, tools selected, agents delegated to, memory retrieved, governance checks performed, budget checks performed, actions taken, results received, and final synthesis
2. THE execution trace SHALL be persisted in XO_Audit and retrievable via the Shaar dashboard
3. THE Shaar dashboard SHALL display execution traces in a timeline view showing each step with its inputs, outputs, and duration
4. WHEN an agent makes a decision, THE execution trace SHALL include the reasoning chain: what memory was consulted, what patterns were matched, and what principles were applied
5. THE execution trace SHALL be machine-readable (JSON) enabling automated analysis of agent behavior patterns by the Learning Engine

---

### Requirement 55: Anti-Chatbot Enforcement

**User Story:** As the King, I want architectural guardrails that prevent the system from degrading into chatbot behavior — so that agents always operate with full context, governance, and memory regardless of how they're invoked.

#### Acceptance Criteria

1. IF any code path calls an LLM directly without going through the Agent_Runtime and Cognition Envelope, THE system SHALL block the call and log a violation to XO_Audit
2. IF an Agent responds without retrieving memory from Zikaron, THE system SHALL log a warning and include a degraded-context flag in the response metadata
3. IF an Agent invokes a tool without Mishmar authorization and Otzar budget check, THE system SHALL block the invocation and log the violation
4. IF A2A delegation is described in an agent's capabilities but not implemented in its execution flow, THE Learning Engine SHALL flag this as an implementation gap
5. IF MCP tools are hardcoded without registry lookup, THE system SHALL log a warning during tool invocation
6. THE CI/CD pipeline SHALL include a test that verifies: the same LLM key produces different behavior through different agent envelopes (proving context-driven behavior, not model-driven)

---

### Requirement 56: Persistent Chat Sessions with History

**User Story:** As the King, I want my conversations with each agent to persist permanently — so that when I return to any agent's chat, I see the full conversation exactly where I left off, and I can browse past conversations like ChatGPT or Claude.

#### Acceptance Criteria

1. WHEN the King navigates to an agent's chat view, THE dashboard SHALL load the current active conversation from the backend and display all previous messages immediately
2. WHEN the King refreshes the page or switches tabs and returns, THE conversation SHALL be fully restored from the backend — no messages lost
3. EACH agent SHALL maintain a "current session" conversation that accumulates messages until the King explicitly starts a new chat
4. WHEN the King clicks "New Chat", THE dashboard SHALL archive the current conversation and start a fresh session — the archived conversation remains accessible
5. THE dashboard SHALL display a conversation history sidebar showing all past sessions for the current agent, with timestamps and preview text
6. WHEN the King clicks a past conversation in the sidebar, THE dashboard SHALL load and display that conversation in read-only mode
7. ALL conversation data SHALL be stored in Zikaron (Aurora PostgreSQL) via the backend — the browser SHALL NOT be the source of truth for any conversation state
8. THE backend SHALL expose REST endpoints for: listing conversations, loading a specific conversation, creating new sessions, and retrieving the current active session
9. WHEN a conversation exceeds 100 messages, THE system SHALL automatically archive it and start a new session, preserving continuity by loading the last 5 messages as context in the new session

---

---

### Requirement 57: Agent-to-Kiro Execution Bridge

**User Story:** As the King, I want my agents to be able to send approved work directly to Kiro (the IDE agent) for execution — so that strategic decisions made in the dashboard translate into immediate code changes, deployments, and system improvements without me having to manually relay instructions.

#### Acceptance Criteria

##### 57a: Approval-Gated Task Dispatch

1. WHEN an Agent proposes work in the dashboard chat, THE Agent SHALL present the proposal with an "Approve for Execution" action
2. WHEN the King approves a proposed task, THE Agent SHALL write a structured task file to `.kiro/agent-tasks/` containing: task description, agent source, approval timestamp, priority, and acceptance criteria
3. THE task file SHALL follow a standardized format that Kiro can parse and execute
4. NO task SHALL be dispatched to Kiro without explicit King approval — this is a governance gate enforced by Mishmar

##### 57b: File-Based Handoff (Immediate)

5. THE system SHALL maintain a `.kiro/agent-tasks/` directory where agents write approved tasks as markdown files
6. A Kiro hook SHALL watch `.kiro/agent-tasks/` for new files and trigger execution when a new task appears
7. EACH task file SHALL contain: title, description, source agent, approval timestamp, priority, specific instructions, and acceptance criteria
8. WHEN Kiro completes a task, THE system SHALL move the task file to `.kiro/agent-tasks/completed/` with execution results appended
9. WHEN Kiro encounters an error, THE system SHALL move the task file to `.kiro/agent-tasks/failed/` with error details

##### 57c: MCP Bridge (Evolution)

10. THE system SHALL support an MCP server that enables bidirectional communication between SeraphimOS agents and Kiro
11. THE MCP bridge SHALL allow agents to: request code changes, trigger builds, run tests, and query codebase state
12. THE MCP bridge SHALL enforce the same Mishmar governance rules as direct agent execution — no unauthorized actions

##### 57d: Monitoring and Visibility

13. THE dashboard SHALL display a "Kiro Tasks" section showing: pending tasks, in-progress tasks, completed tasks, and failed tasks
14. THE King SHALL be able to cancel a pending task before Kiro picks it up
15. ALL task dispatches SHALL be logged to XO_Audit with: source agent, task description, approval timestamp, execution status, and results

---


---

### Requirement 58: Shaar Agent — Human Interface Intelligence and UI/UX Design Authority

**User Story:** As the King, I want Shaar to operate as an autonomous interface intelligence agent that observes SeraphimOS from the human front-end perspective, detects friction, evaluates visual design quality, verifies that agents are usable and visible, audits permissions and data truth, generates improvement recommendations, and creates/verifies Kiro tasks — so that I am not responsible for manually discovering every dashboard, UX, workflow, or communication issue.

#### Acceptance Criteria

##### 58a: Front-End Observation

1. THE Shaar Agent SHALL observe the dashboard using browser automation (Playwright), screenshot analysis, DOM inspection, console log inspection, and workflow execution
2. THE Shaar Agent SHALL evaluate the interface from multiple user perspectives: King, Queen, new user, power user, mobile user, and admin/developer
3. THE Shaar Agent SHALL run automatically after dashboard deployments, daily during active development, before multi-user rollout, and after any failed user-facing workflow

##### 58b: UX Friction Detection

4. THE Shaar Agent SHALL detect UX friction including: unclear labels, missing buttons, dead-end workflows, weak empty states, hidden status, missing loading feedback, confusing navigation, unclear success/failure states, too many clicks, and hidden critical information
5. THE Shaar Agent SHALL compare the observed human experience against expected ideal workflows and flag deviations
6. THE Shaar Agent SHALL evaluate cognitive load, information hierarchy, action clarity, and workflow efficiency for every screen

##### 58c: Expert UI/UX Design Intelligence

7. THE Shaar Agent SHALL function as an expert UI/UX designer evaluating: layout quality, visual hierarchy, spacing, typography, color usage, CTA placement, navigation clarity, empty states, loading states, error states, mobile responsiveness, and accessibility
8. THE Shaar Agent SHALL identify when a page is poorly designed even if the underlying functionality works — visual quality and usability are independent of correctness
9. THE Shaar Agent SHALL generate specific redesign recommendations with: evidence (screenshot), design principle violated, proposed layout changes, affected components, acceptance criteria, and implementation guidance

##### 58d: Data Truth Auditing

10. THE Shaar Agent SHALL audit whether frontend screens reflect real backend state, flagging: mock data, stale data, disconnected metrics, missing timestamps, placeholder values, and unverifiable charts
11. THE Shaar Agent SHALL verify that every metric, status indicator, and data display is backed by a live data source

##### 58e: Agentic Behavior Visibility

12. THE Shaar Agent SHALL verify agentic behavior visibility including: execution traces, memory retrieval indicators, MCP tool usage, A2A delegation status, workflow state, plan progress, and completion contract/gate results
13. THE Shaar Agent SHALL flag screens where agents appear to operate as chatbots rather than showing full agentic execution context

##### 58f: Revenue Workflow Auditing

14. THE Shaar Agent SHALL inspect revenue-critical workflows for ZionX: app preview, screenshots, ads, RevenueCat/payments, store readiness, monetization status
15. THE Shaar Agent SHALL inspect revenue-critical workflows for ZXMG: video generation, thumbnails, publish gates, analytics feedback, monetization tracking
16. THE Shaar Agent SHALL evaluate whether each screen helps the King make money or is just informational

##### 58g: Permission and Security Auditing

17. THE Shaar Agent SHALL test role-based access and permission boundaries, ensuring Queens and other users only see and invoke authorized agents, workflows, screens, and actions
18. THE Shaar Agent SHALL verify that API keys, credentials, and sensitive data are never exposed in the frontend

##### 58h: Readiness Score

19. THE Shaar Agent SHALL generate a Shaar Readiness Score covering: UX quality, visual design, workflow clarity, agentic visibility, revenue workflow support, multi-user readiness, permission safety, data truth, mobile responsiveness, and cost visibility
20. THE Shaar Agent SHALL produce a Top 5 improvements list to reach the next score threshold

##### 58i: Recommendation and Kiro Task Generation

21. THE Shaar Agent SHALL generate structured recommendations with: title, problem, evidence, affected screen, user impact, design principle violated, priority, acceptance criteria, likely files, implementation guidance, verification steps, and estimated effort
22. WHEN a recommendation is approved, THE Shaar Agent SHALL convert it into a structured Kiro task and dispatch it via the Agent-to-Kiro bridge
23. AFTER Kiro implements a task, THE Shaar Agent SHALL retest the affected workflow from the front end and mark the task verified or reopen it with failure evidence

##### 58j: Dedicated Dashboard Tab

24. THE Shaar Agent SHALL have its own dedicated tab in the SeraphimOS dashboard showing: overview with readiness score, page reviews, recommendations, visual audits, Kiro tasks, before/after comparisons, and settings
25. THE King SHALL be able to trigger a manual review of any specific page or workflow from the Shaar Agent tab

---
