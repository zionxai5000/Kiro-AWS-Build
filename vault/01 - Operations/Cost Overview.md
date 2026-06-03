---
tags: [operations, cost, otzar]
updated: 2026-06-02
---

# Cost Overview

## Current Spend

> *Note: Otzar cost tracking is designed but not yet live (Phase 2). These are manual estimates.*

### AWS Infrastructure (Monthly)
| Service | Estimated Cost |
|---------|---------------|
| ECS Fargate (1 task) | ~$30/mo |
| Aurora PostgreSQL | ~$50/mo (serverless v2 min) |
| S3 + CloudFront | ~$5/mo |
| DynamoDB | ~$5/mo |
| EventBridge + SQS | ~$2/mo |
| Secrets Manager | ~$3/mo |
| **Total AWS** | **~$95/mo** |

### LLM API Costs (Monthly)
| Provider | Usage | Estimated Cost |
|----------|-------|---------------|
| Anthropic (Claude) | Development sessions via Kiro | ~$50-100/mo |
| OpenAI | Agent tasks (GPT-4o-mini) | ~$20/mo |
| **Total LLM** | | **~$70-120/mo** |

### Total Monthly Burn: ~$165-215/mo

## Cost Targets

- After Model Router (Phase 2): Target 50% LLM cost reduction via smart routing
- After semantic caching: Target additional 20% reduction on repeated queries
- Revenue target: First ZionX app revenue should cover infrastructure costs within 60 days

## When Otzar Goes Live

This page will show real-time data from the Otzar Resource Manager:
- Per-agent token spend
- Per-pillar cost allocation
- Model utilization percentages
- Waste pattern alerts
- Daily optimization recommendations
