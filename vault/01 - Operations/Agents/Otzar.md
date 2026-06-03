---
tags: [agent, system-service, otzar, resources]
pillar: Resources
authority_level: L2
status: ready
---

# Otzar — Resource Manager

> Intelligent resource management. Budget enforcement, model routing, cost optimization.

## Role

- Automatic LLM model selection per task (Model Router)
- Enforce token budgets per agent, per pillar, system-wide
- Cache repeated queries (semantic caching)
- Track and report real-time cost data
- Generate daily cost optimization reports
- Manage credential access via AWS Secrets Manager

## Model Router Tiers

| Tier | Models | Use Case |
|------|--------|----------|
| Tier 1 (Economy) | GPT-4o-mini, Claude Haiku | Summarization, classification, data extraction |
| Tier 2 (Standard) | GPT-4o, Claude Sonnet | Code generation, analysis, creative tasks |
| Tier 3 (Premium) | Claude Opus, GPT-4.5 | Complex reasoning, architecture, critical decisions |

## Cost Target

- 50% LLM cost reduction through intelligent routing (vs. using Tier 3 for everything)
- Additional 20% via semantic caching of repeated query patterns

## Key Relationships

- Enforces budgets for: ALL agents
- Issues Execution Tokens with: [[Mishmar]]
- Reports costs to: [[Seraphim Core]], [[The King's Vision|King]]
