---
tags: [architecture, glossary, reference]
---

# Glossary

> All SeraphimOS terminology in one place. Each term links to its detailed documentation.

## Core Platform

| Term | Definition |
|------|-----------|
| **SeraphimOS** | The complete AI-powered autonomous orchestration platform |
| **[[Seraphim Core]]** | The kernel — orchestrator agent, runtime, state machines, permissions |
| **Agent** | An autonomous AI unit performing tasks within authority boundaries |
| **Agent_Program** | A versioned package defining an agent's behavior, tools, permissions, state machine |
| **King** | Primary user who provides vision and approves key decisions |
| **Queen** | Family member with scoped access to specific pillars |
| **Tenant** | A user/family unit with their own isolated SeraphimOS instance |
| **Pillar** | A top-level domain of operation (Eretz, ZionX, ZXMG, Zion Alpha) |

## System Services

| Term | Definition |
|------|-----------|
| **[[Zikaron]]** | 4-layer persistent memory (episodic, semantic, procedural, working) + vector search |
| **[[Mishmar]]** | Governance-as-code enforcement (authorization, role separation, completion contracts) |
| **[[Otzar]]** | Resource management (token budgets, model routing, cost optimization) |
| **[[XO Audit]]** | Immutable audit trail of all system actions and decisions |
| **Event Bus** | Asynchronous messaging backbone (EventBridge + SQS) |
| **Learning Engine** | Continuous improvement through pattern detection and automated fixes |

## Business Pillars

| Term | Definition |
|------|-----------|
| **[[Eretz]]** | Master business orchestrator managing all subsidiaries |
| **[[ZionX]]** | App factory (iOS + Android submission) |
| **[[ZXMG]]** | Media production at scale (YouTube, social) |
| **[[Zion Alpha]]** | Autonomous prediction market trading (Kalshi, Polymarket) |

## Governance Concepts

| Term | Definition |
|------|-----------|
| **Authority Level (L1-L4)** | L1=King approval, L2=designated authority, L3=peer verification, L4=autonomous |
| **Completion Contract** | JSON Schema defining required outputs for workflow completion |
| **Execution Token** | Cryptographic artifact required before performing controlled actions |
| **Gate** | Verification checkpoint that must pass before state transition |
| **State Machine** | Formal definition of allowed states and transitions for an entity |
| **Role Separation** | No agent may both decide AND execute the same controlled action |

## Integration Concepts

| Term | Definition |
|------|-----------|
| **Driver** | Standard adapter connecting SeraphimOS to an external service |
| **[[Shaar Guardian]]** | The dashboard observer agent |
| **Model Router** | Otzar component that auto-selects the optimal LLM per task |
| **Directive Enrichment** | Process where Eretz adds intelligence to directives before forwarding |
| **Synergy Engine** | Eretz component detecting cross-business revenue opportunities |
| **[[Pattern Library]]** | Reusable business patterns proven in one subsidiary, available to all |
| **Heartbeat Review** | Scheduled proactive research and benchmarking per agent |
| **Recommendation Queue** | Centralized queue where agents submit proposals for King approval |

## New Integrations

| Term | Definition |
|------|-----------|
| **Obsidian** | Local-first markdown knowledge management (King's strategic interface) |
| **Hermes Agent** | Self-improving AI agent framework (operational sub-agents) |
| **Obsidian Driver** | SeraphimOS Driver for reading/writing to the Obsidian vault |
| **MCP** | Model Context Protocol — standardized agent-to-agent communication |
