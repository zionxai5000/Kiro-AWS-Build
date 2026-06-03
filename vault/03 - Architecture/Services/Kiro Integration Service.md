---
tags: [architecture, services, kiro, steering, integration]
updated: 2025-01-20
---

# Kiro Integration Service

> Generates Kiro steering files, skill definitions, and hook configurations from agent expertise profiles.

## Overview

The Kiro Integration Service bridges the SME Intelligence System with the Kiro IDE. It generates `.kiro/steering/`, `.kiro/skills/`, and `.kiro/hooks/` files from Domain Expertise Profiles, ensuring the IDE always has up-to-date domain knowledge.

Package: `packages/services/src/kiro/integration-service.ts`

---

## Interface

```typescript
interface KiroIntegrationService {
  generateSteeringFile(agentId: string): Promise<SteeringFile>
  generateMasterSteering(): Promise<SteeringFile>
  updateSteeringFromExpertise(agentId: string): Promise<void>
  updateSteeringFromIndustryScan(scanResults): Promise<void>
  generateSkillDefinition(agentId: string): Promise<SkillDefinition>
  generateHookDefinitions(): Promise<HookDefinition[]>
  convertRecommendationToKiroTask(rec): Promise<KiroTask>
}
```

---

## Generated Artifacts

| Artifact Type | Output Location | Trigger |
|---------------|----------------|---------|
| Domain steering file | `.kiro/steering/{domain}-expertise.md` | Heartbeat review complete |
| Master steering file | `.kiro/steering/seraphimos.md` | System assessment |
| Skill definitions | `.kiro/skills/{domain}-sme.md` | Profile update |
| Hook definitions | `.kiro/hooks/*.kiro.hook` | Recommendation approved |
| Kiro tasks | `.kiro/agent-tasks/*.md` | Recommendation → task conversion |

---

## Steering File Structure

Generated steering files follow standard structure:
1. Domain overview
2. Current state
3. Decision frameworks
4. Best practices
5. Quality standards
6. Common pitfalls
7. Tech stack
8. Research findings

---

## Recommendation → Kiro Task Conversion

When a recommendation is approved, it's converted to a structured Kiro task containing:
- Acceptance criteria
- Implementation guidance
- Verification steps
- Research references
- Rollback plan

The task file is written to `.kiro/agent-tasks/`, which triggers the [[Hooks and Steering|Agent Task Executor hook]].

## Related

- [[SME Intelligence System]]
- [[Hooks and Steering]]
- [[Kiro Integration]]
- [[Architecture Overview]]
