/**
 * Seed Domain Expertise Profile for Seraphim Core — Platform Orchestrator.
 *
 * Encodes knowledge of:
 * - Autonomous agent architecture patterns
 * - Multi-agent coordination designs
 * - LLM orchestration frameworks
 * - Infrastructure cost optimization techniques
 * - Self-improving system design principles
 *
 * Requirements: 23.6
 */

import type { SeedProfileInput } from '../domain-expertise-profile.js';

export const SERAPHIM_CORE_AGENT_ID = 'agent-seraphim-core';

export const seraphimCoreExpertiseSeed: SeedProfileInput = {
  agentId: SERAPHIM_CORE_AGENT_ID,
  domain: 'ai-orchestration',
  knowledgeEntries: [
    // Autonomous Agent Architecture
    {
      topic: 'Agent Architecture Patterns',
      content:
        'Modern autonomous agent architectures use: 1) ReAct (Reasoning + Acting) for tool-using agents, 2) Plan-and-Execute for multi-step tasks, 3) Reflexion for self-improving agents, 4) Tree-of-Thought for complex reasoning. Hybrid approaches combining multiple patterns yield best results.',
      source: 'ai-agent-research-survey-2024',
      confidence: 0.9,
      lastVerified: new Date('2025-01-01'),
      tags: ['architecture', 'agent-patterns', 'design'],
    },
    {
      topic: 'Agent Memory Systems',
      content:
        'Effective agent memory requires: 1) Short-term working memory (context window), 2) Long-term episodic memory (past experiences), 3) Semantic memory (facts and relationships), 4) Procedural memory (learned workflows). Vector databases enable semantic retrieval across all layers.',
      source: 'cognitive-architecture-research',
      confidence: 0.92,
      lastVerified: new Date('2025-01-01'),
      tags: ['architecture', 'memory', 'cognitive'],
    },
    {
      topic: 'Agent State Management',
      content:
        'Stateful agents require: explicit state machines for lifecycle management, persistent checkpointing for crash recovery, event sourcing for audit trails, and idempotent operations for retry safety. State machines prevent invalid transitions and enable governance enforcement.',
      source: 'distributed-systems-patterns',
      confidence: 0.93,
      lastVerified: new Date('2025-01-01'),
      tags: ['architecture', 'state-management', 'reliability'],
    },
    // Multi-Agent Coordination
    {
      topic: 'Multi-Agent Coordination Patterns',
      content:
        'Coordination patterns: 1) Hierarchical (manager delegates to workers), 2) Peer-to-peer (agents negotiate directly), 3) Blackboard (shared knowledge base), 4) Market-based (auction/bidding for tasks). Hierarchical with event-driven communication scales best for enterprise systems.',
      source: 'multi-agent-systems-handbook',
      confidence: 0.88,
      lastVerified: new Date('2025-01-01'),
      tags: ['coordination', 'multi-agent', 'patterns'],
    },
    {
      topic: 'Agent Communication Protocols',
      content:
        'Effective inter-agent communication uses: 1) Structured message schemas (not free text), 2) Asynchronous event bus for loose coupling, 3) Request-response for synchronous needs, 4) Pub-sub for broadcast updates. Avoid direct agent-to-agent calls — use message bus for observability.',
      source: 'distributed-agent-architecture',
      confidence: 0.9,
      lastVerified: new Date('2025-01-01'),
      tags: ['coordination', 'communication', 'messaging'],
    },
    {
      topic: 'Conflict Resolution in Multi-Agent Systems',
      content:
        'When agents disagree: 1) Authority hierarchy resolves (higher-level agent decides), 2) Voting/consensus for peer decisions, 3) Escalation to human for high-stakes conflicts, 4) Confidence-weighted averaging for probabilistic disagreements. Always log conflicts for learning.',
      source: 'multi-agent-conflict-resolution',
      confidence: 0.85,
      lastVerified: new Date('2025-01-10'),
      tags: ['coordination', 'conflict-resolution', 'governance'],
    },
    // LLM Orchestration
    {
      topic: 'LLM Model Routing Strategy',
      content:
        'Intelligent model routing: 1) Classify task complexity (simple/medium/complex), 2) Route simple tasks to cheap models (GPT-4o-mini, Haiku), 3) Route complex tasks to capable models (Claude Sonnet, GPT-4o), 4) Reserve premium models (Opus) for novel reasoning. This reduces costs 40-60% vs always using top models.',
      source: 'llm-cost-optimization-research',
      confidence: 0.91,
      lastVerified: new Date('2025-01-15'),
      tags: ['llm', 'routing', 'cost-optimization'],
    },
    {
      topic: 'Prompt Engineering Best Practices',
      content:
        'Key practices: 1) System prompts define persona and constraints, 2) Few-shot examples improve consistency, 3) Chain-of-thought for reasoning tasks, 4) Structured output (JSON mode) for reliable parsing, 5) Temperature 0 for deterministic tasks, 0.7-1.0 for creative tasks.',
      source: 'prompt-engineering-guide-2024',
      confidence: 0.89,
      lastVerified: new Date('2025-01-15'),
      tags: ['llm', 'prompting', 'best-practices'],
    },
    {
      topic: 'LLM Caching and Deduplication',
      content:
        'Reduce LLM costs via: 1) Semantic caching (cache responses for similar queries), 2) Prompt deduplication (detect repeated requests), 3) Response streaming for long outputs, 4) Batch processing for non-urgent tasks. Semantic caching alone can reduce costs 20-30%.',
      source: 'llm-infrastructure-optimization',
      confidence: 0.87,
      lastVerified: new Date('2025-01-15'),
      tags: ['llm', 'caching', 'cost-optimization'],
    },
    // Infrastructure Cost Optimization
    {
      topic: 'AWS Cost Optimization Strategies',
      content:
        'Key strategies: 1) Right-size compute (Fargate spot for non-critical), 2) Reserved capacity for predictable workloads, 3) S3 Intelligent-Tiering for storage, 4) Aurora Serverless v2 for variable database load, 5) Lambda for event-driven short tasks. Target: 30-50% savings vs on-demand.',
      source: 'aws-well-architected-cost',
      confidence: 0.9,
      lastVerified: new Date('2025-01-01'),
      tags: ['infrastructure', 'cost', 'aws'],
    },
    {
      topic: 'Compute Scaling Patterns',
      content:
        'Scaling strategies: 1) Predictive scaling for known patterns (daily cycles), 2) Reactive scaling for unexpected load (CPU/memory thresholds), 3) Scheduled scaling for planned events, 4) Scale-to-zero for dev/test environments. Combine predictive + reactive for production.',
      source: 'cloud-architecture-patterns',
      confidence: 0.88,
      lastVerified: new Date('2025-01-01'),
      tags: ['infrastructure', 'scaling', 'compute'],
    },
    // Self-Improving System Design
    {
      topic: 'Self-Improvement Loop Design',
      content:
        'Effective self-improvement requires: 1) Metrics collection (what to improve), 2) Pattern detection (identify recurring issues), 3) Hypothesis generation (propose fixes), 4) Safe experimentation (A/B test changes), 5) Rollback capability (revert if worse). Human oversight for high-risk changes.',
      source: 'autonomous-systems-research',
      confidence: 0.86,
      lastVerified: new Date('2025-01-10'),
      tags: ['self-improvement', 'automation', 'learning'],
    },
    {
      topic: 'Capability Maturity Model',
      content:
        'System maturity levels: 1) Manual (human does everything), 2) Assisted (AI suggests, human executes), 3) Semi-autonomous (AI executes routine, human approves novel), 4) Autonomous (AI executes within bounds, human reviews), 5) Self-improving (AI improves its own processes). Progress through levels incrementally.',
      source: 'autonomous-systems-maturity-framework',
      confidence: 0.84,
      lastVerified: new Date('2025-01-10'),
      tags: ['self-improvement', 'maturity', 'autonomy'],
    },
    {
      topic: 'Feedback Loop Architecture',
      content:
        'Every autonomous action needs: 1) Outcome measurement (did it work?), 2) Attribution (what caused the outcome?), 3) Learning storage (persist the lesson), 4) Behavior update (adjust future actions). Without closed feedback loops, systems cannot improve.',
      source: 'reinforcement-learning-systems',
      confidence: 0.91,
      lastVerified: new Date('2025-01-10'),
      tags: ['self-improvement', 'feedback-loops', 'learning'],
    },
  ],
  decisionFrameworks: [
    {
      name: 'Model Selection for Task',
      description:
        'Select the optimal LLM model based on task complexity, cost constraints, and quality requirements',
      inputs: ['task_complexity', 'cost_budget', 'quality_requirement', 'latency_requirement'],
      decisionTree: [
        {
          condition: 'Is task simple (classification, extraction, summarization)?',
          trueAction: 'Use Tier 1 model (GPT-4o-mini, Haiku) — lowest cost',
          falseAction: {
            condition: 'Is task complex (novel reasoning, architecture, critical decision)?',
            trueAction: 'Use Tier 3 model (Opus, GPT-4.5) — highest capability',
            falseAction: 'Use Tier 2 model (Sonnet, GPT-4o) — balanced cost/quality',
          },
        },
      ],
      historicalAccuracy: 0.82,
      lastCalibrated: new Date('2025-01-01'),
    },
    {
      name: 'Agent Scaling Decision',
      description:
        'Decide when to scale agent instances or decompose into sub-agents',
      inputs: ['task_queue_depth', 'average_latency', 'error_rate', 'cost_per_task'],
      decisionTree: [
        {
          condition: 'Is task queue depth > 10 and average latency > 30s?',
          trueAction: {
            condition: 'Are tasks independent (no shared state)?',
            trueAction: 'Scale horizontally — add more agent instances',
            falseAction: 'Decompose into specialized sub-agents with coordination',
          },
          falseAction: {
            condition: 'Is error rate > 5%?',
            trueAction: 'Investigate root cause before scaling — may be model/prompt issue',
            falseAction: 'Current capacity is sufficient — no action needed',
          },
        },
      ],
      historicalAccuracy: 0.75,
      lastCalibrated: new Date('2025-01-01'),
    },
  ],
  qualityBenchmarks: [
    {
      metric: 'Autonomous Resolution Rate',
      worldClass: 0.9,
      current: 0,
      unit: 'percentage',
      source: 'autonomous-systems-benchmarks',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Mean Time to Resolution',
      worldClass: 300,
      current: 0,
      unit: 'seconds',
      source: 'incident-response-benchmarks',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'System Uptime',
      worldClass: 0.999,
      current: 0,
      unit: 'percentage',
      source: 'cloud-reliability-standards',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Cost per Agent Task',
      worldClass: 0.05,
      current: 0,
      unit: 'USD',
      source: 'llm-cost-benchmarks',
      lastUpdated: new Date('2025-01-01'),
    },
  ],
  bestPractices: [
    {
      title: 'Defense in Depth for Agent Actions',
      description:
        'Layer multiple safety mechanisms: permission checks → state machine validation → completion contract verification → audit logging → human review for high-risk actions. No single mechanism is sufficient alone.',
      domain: 'ai-orchestration',
      source: 'autonomous-systems-safety',
      confidence: 0.94,
      tags: ['safety', 'governance', 'defense-in-depth'],
    },
    {
      title: 'Graceful Degradation',
      description:
        'Design for partial failure: if LLM provider is down, fall back to cached responses or simpler models. If memory service is slow, use working memory only. Never let a single component failure cascade to full system outage.',
      domain: 'ai-orchestration',
      source: 'distributed-systems-resilience',
      confidence: 0.92,
      tags: ['reliability', 'resilience', 'fallback'],
    },
  ],
  knowledgeGaps: [
    'Optimal agent decomposition strategies for complex domains',
    'Federated learning across multiple SeraphimOS instances',
    'Real-time model performance monitoring and automatic switching',
  ],
  researchBacklog: [
    {
      topic: 'New LLM models and capabilities (monthly scan)',
      priority: 9,
      reason: 'New models can improve quality and reduce costs',
      addedAt: new Date('2025-01-01'),
    },
    {
      topic: 'Agent-to-agent learning transfer mechanisms',
      priority: 8,
      reason: 'Could accelerate improvement across all sub-agents',
      addedAt: new Date('2025-01-01'),
    },
  ],
};
