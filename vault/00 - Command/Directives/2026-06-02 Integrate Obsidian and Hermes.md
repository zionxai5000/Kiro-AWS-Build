---
tags: [directive, architecture, integration]
status: active
priority: high
target_pillar: seraphim
created: 2026-06-02
---

# Directive: Integrate Obsidian + Hermes into SeraphimOS

## Vision

Use Obsidian as the King's strategic command interface and knowledge browser. Use Hermes Agent instances as operational sub-agents that can run autonomously while the full Seraphim platform matures. Bidirectional sync between all three.

## Context

The Seraphim dashboard is live but the human interface is underdeveloped. Obsidian provides an immediate, rich knowledge management layer. Hermes provides working self-improving agents today without waiting for Phase 2-5 completion.

## Constraints

- Obsidian vault must live inside the Git repo for version control
- Hermes instances must use credentials from AWS Secrets Manager
- No vendor lock-in — both products are scaffolding, not permanent dependencies
- Human interface must be usable within 1 week

## Success Criteria

- [ ] King can write directives in Obsidian and see them executed
- [ ] Agent recommendations appear in Obsidian for approval/rejection
- [ ] At least one Hermes instance running autonomously (ZXMG or ZionX)
- [ ] Knowledge learned by agents is browsable in Obsidian graph view
- [ ] Daily portfolio summary auto-generated in vault
