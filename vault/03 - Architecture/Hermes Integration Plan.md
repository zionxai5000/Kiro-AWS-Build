---
tags: [architecture, hermes, integration, plan]
---

# Hermes Agent Integration Plan

> How Hermes Agent instances accelerate SeraphimOS while the full platform matures.

## What Hermes Provides (That We Haven't Built Yet)

| Capability | Hermes | SeraphimOS Phase |
|---|---|---|
| Persistent memory across sessions | `user.md` + `memory.md` | Zikaron (Phase 2) |
| Self-improving behavior | Skill auto-creation | Learning Engine (Phase 5) |
| Scheduled autonomous work | Natural language crons | Scheduler (Phase 2) |
| Model-agnostic routing | Any OpenAI-compatible endpoint | Model Router (Phase 2) |
| Multi-agent isolation | Docker containers | ECS task isolation |
| Learning from mistakes | Skill updates from feedback | Learning Engine (Phase 5) |

## Active Hermes Deployment

### Desktop Agent: Seraphim (Unified Commander)
- **Purpose**: Single conversational interface for all pillars — the King talks to Seraphim and directs all work
- **Memory**: Full platform context, all pillar knowledge, King's preferences
- **Skills**: Research, write to vault, draft recommendations, coordinate across pillars
- **Mode**: Interactive — King gives commands, Seraphim executes and writes to vault

### Docker Agents (Background Workers — Running)
Each runs autonomously on crons, writes to vault silently.

| Container | Agent | Port | Role |
|-----------|-------|------|------|
| seraphim-zxmg | ZXMG | 3001 | YouTube trend research, content calendar, script drafting |
| seraphim-zion-alpha | Zion Alpha | 3002 | Prediction market scanning, edge detection, trade recommendations |
| seraphim-zionx | ZionX | 3003 | App store analysis, niche identification, concept development |
| seraphim-personal | Personal Assistant | 3004 | Daily briefings, evening summaries, priority tracking |

### How They Relate
- Desktop Seraphim = the general (interactive, all-domain, King-facing)
- Docker agents = soldiers (background, single-domain, autonomous)
- Both write to the same Obsidian vault
- King sees all output in Obsidian regardless of source

## Architecture

```
Obsidian Vault (King's interface)
       ↕ (Local REST API)
Seraphim Core (orchestrator)
       ↕ (Event Bus)
┌─────────────────────────────────────────────────┐
│  Hermes Instances (Docker on VPS or ECS)        │
│                                                 │
│  [PA Instance] [ZXMG Scout] [ZionX Scout]      │
│  [Zion Alpha Watcher]                           │
│                                                 │
│  Each has: own memory, own skills, own crons    │
│  Each writes: to Obsidian vault + Event Bus     │
└─────────────────────────────────────────────────┘
       ↕ (Driver APIs)
External Services (YouTube, App Store, Kalshi, etc.)
```

## Migration Path

As SeraphimOS native capabilities mature:
1. Phase 2 (Zikaron live) → Hermes memory syncs to Zikaron
2. Phase 2 (Scheduler live) → Hermes crons migrate to native scheduler
3. Phase 5 (Learning Engine live) → Hermes skills migrate to procedural memory
4. Eventually: Hermes instances replaced by native ECS agents with full governance

## Credentials

Each Hermes instance gets scoped credentials from AWS Secrets Manager:
- PA: Anthropic key only
- ZXMG Scout: YouTube API, social media APIs
- ZionX Scout: App Store Connect read-only
- Zion Alpha: Kalshi read-only, Polymarket read-only

## Related

- [[Architecture Overview]]
- [[Capability Map]]
- [[Obsidian Integration]]
