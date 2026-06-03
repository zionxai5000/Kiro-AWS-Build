---
tags: [service, otzar, resources, cost, model-routing, architecture]
source: system
date: 2026-06-02
---

# Otzar Resource Manager

> Intelligent resource management — model routing, token budgets, cost tracking, and semantic caching.

## Purpose

Otzar selects the optimal LLM for every task, enforces budgets at agent/pillar/system levels, tracks costs in real-time, and caches repeated queries to reduce spend.

## Core Capabilities

### Model Routing (Req 5.1)
Decision flow:
1. Classify task type and complexity → determine recommended tier
2. Check agent/pillar budget — downgrade tier if near limit
3. Apply pillar routing policy overrides and constraints
4. Check performance history — upgrade if high failure rate
5. Select best model from resolved tier
6. Log decision rationale to XO Audit

### Budget Enforcement (Req 5.2, 5.3)
- Daily and monthly budgets per agent
- System-wide budget caps ($100/day, $2000/month default)
- Blocks requests when budget exhausted
- Estimates cost before execution

### Cost Reporting (Req 5.4, 5.6)
- Real-time usage recording
- Breakdowns by agent, pillar, and model
- Daily optimization reports identifying waste patterns
- Savings opportunities with actionable recommendations

### Semantic Caching (Req 5.5)
- SHA-256 hash of task pattern + inputs = cache key
- Task-specific TTLs (classification: 24h, code_gen: 30min)
- Novel reasoning and critical decisions are never cached
- Cache hit rate tracking and pruning

## Model Catalog

| Tier | Provider | Model | Cost/1K tokens |
|------|----------|-------|----------------|
| 1 (Economy) | OpenAI | gpt-4o-mini | $0.00015 |
| 1 (Economy) | Anthropic | claude-haiku | $0.00025 |
| 2 (Standard) | OpenAI | gpt-4o | $0.005 |
| 2 (Standard) | Anthropic | claude-sonnet | $0.003 |
| 3 (Premium) | Anthropic | claude-opus | $0.015 |
| 3 (Premium) | OpenAI | gpt-4.5 | $0.02 |

## Task Classification

| Task Type | Default Tier |
|-----------|-------------|
| summarization, classification, data_extraction | Tier 1 |
| code_generation, code_review, analysis, creative | Tier 2 |
| novel_reasoning, multi_step_planning, critical_decision | Tier 3 |

## Requirements Covered

5.1, 5.2, 5.3, 5.4, 5.5, 5.6

## Location

`packages/services/src/otzar/service.ts`

## Related

- [[Mishmar Governance Service]]
- [[XO Audit Service]]
- [[Cost Overview]]
- [[Architecture Overview]]
