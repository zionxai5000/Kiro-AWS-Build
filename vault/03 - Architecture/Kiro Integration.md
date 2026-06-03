---
tags: [architecture, kiro, development, integration]
---

# Kiro Integration

> SeraphimOS is entirely built and maintained by AI through Kiro IDE. This documents the development workflow.

## Active Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| Agent Task Dispatch | file event | Dispatches agent tasks from queue |
| Check Secrets Before Giving Up | pre-tool | Checks AWS Secrets Manager before reporting auth failures |
| Deployment Safety Check | pre-deploy | Validates deployment won't break production |
| Push to Git After Task | post-task | Auto-commits and pushes after task completion |
| Session Continuity | session start | Loads session-summary.md for context |
| Verify Deployment Health | post-deploy | Checks ALB health after deployment |

## Steering Files

| File | Purpose |
|------|---------|
| `credentials-access.md` | Rules for accessing AWS Secrets Manager |
| `deployment-safety.md` | Rules preventing destructive deployments |

## Spec Structure

```
.kiro/specs/seraphim-os-core/
├── requirements.md      ← 21 requirements, acceptance criteria
├── design.md           ← Full technical design (7000+ lines)
├── tasks.md            ← Implementation task breakdown
├── capabilities.md     ← Phase-by-phase capability map
└── session-notes/      ← Historical session decisions
```

## Development Workflow

1. King provides directive (vision)
2. Kiro/Seraphim translates to spec updates
3. Tasks generated from spec
4. Kiro executes tasks (code generation, testing, deployment)
5. Git push on success
6. ECS picks up new deployment

## Future: Seraphim-Kiro MCP Bridge

Phase 8 ✅ **IMPLEMENTED** capability:
- Bidirectional MCP connection between Kiro IDE and SeraphimOS agents
- Agents can request code changes through Kiro
- Kiro can query agent state through MCP
- Automated heartbeat review → Kiro task generation
- See [[MCP Integration]] for full implementation details

## Related

- [[Hooks and Steering]] — Detailed documentation of all hooks and steering rules
- [[Kiro Integration Service]] — Service that generates steering files from expertise
- [[MCP Integration]] — Bidirectional Kiro-Seraphim tool bridge
- [[Architecture Overview]]
- [[Deployment Guide]]
- [[Technology Stack]]
