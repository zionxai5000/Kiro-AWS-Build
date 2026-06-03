---
tags: [directive, strategy, plan, hermes, aws]
status: active
priority: critical
target_pillar: all
created: 2026-06-02
---

# Directive: Dual System Activation Plan

> Hermes does the work NOW. AWS agents shadow and learn. AWS blockers get fixed in parallel. Systems converge.

---

## Phase A — Immediate (Today/Tomorrow)

### A1. Configure Hermes as ZXMG Content Scout
- [ ] Set up `user.md` with King's preferences (direct, revenue-focused, structured output)
- [ ] Set up `memory.md` with ZXMG role, vault path context, output format requirements
- [ ] Create skill: "write findings to vault folder as markdown with frontmatter"
- [ ] First command: "Research the top 5 faceless YouTube niches that went from 0 to 100K subs in 2026. Write findings as a structured note."
- [ ] Verify output appears in Obsidian vault under `02 - Knowledge/ZXMG/`

### A2. Vault-Sync Verification
- [x] Vault-sync running and publishing to EventBridge ✅
- [ ] Verify: when Hermes writes to vault, event appears in EventBridge
- [ ] Confirm end-to-end: Hermes → vault file → event published

### A3. First Revenue Decision
- [ ] Review Hermes ZXMG research in Obsidian
- [ ] Approve one niche by changing recommendation status to "Approved"
- [ ] Direct Hermes: "Write a script for the first video in [approved niche]"

---

## Phase B — This Week (Days 2-5)

### B1. Fix AWS Blocker: Aurora PostgreSQL
- [ ] Add VPC Endpoint for Secrets Manager in CDK stack
- [ ] Deploy CDK update
- [ ] Verify: ECS container can reach Secrets Manager
- [ ] Verify: Aurora PostgreSQL bootstrap succeeds (no more timeout)
- [ ] Result: Agent memory persists across deployments

### B2. Fix AWS Blocker: WebSocket
- [ ] Diagnose ALB WebSocket handshake failure
- [ ] Fix ALB listener configuration for WebSocket upgrade
- [ ] Verify: Dashboard receives real-time updates
- [ ] Result: Dashboard shows live agent activity

### B3. Hermes ZXMG Produces First Content Package
- [ ] Script approved in Obsidian
- [ ] Hermes generates: thumbnail concepts, title variants, description, tags
- [ ] You produce video using HeyGen or other AI tool
- [ ] Publish to YouTube
- [ ] First video LIVE

### B4. Shadow Learning Starts
- [ ] Configure EventBridge rule: `vault.note.created` where source=ZXMG-Scout → log to DynamoDB
- [ ] AWS ZXMG agent starts accumulating Hermes output as training data
- [ ] Every Hermes note that gets "Approved" by King → stored as "good pattern"
- [ ] Every "Rejected" → stored as "bad pattern" with rejection reason

---

## Phase C — Week 2

### C1. Fix AWS Blocker: Driver Credential Wiring
- [ ] Wire credential retrieval from Secrets Manager into driver initialization
- [ ] Test: YouTube driver can authenticate and list channels
- [ ] Test: At least one driver fully operational in production
- [ ] Result: ECS agents can interact with external services

### C2. Add Native Scheduler to ECS
- [ ] Implement simple cron-based scheduler using EventBridge scheduled rules
- [ ] Configure: ZXMG heartbeat review (daily trend scan)
- [ ] Configure: Zion Alpha market scan (every 6 hours)
- [ ] Result: AWS agents start doing work autonomously (even if simple)

### C3. Hermes Expands to Zion Alpha
- [ ] Deploy second Hermes profile for Zion Alpha
- [ ] Job: Scan Kalshi/Polymarket every 6 hours, identify opportunities
- [ ] Output: Recommendations written to vault for King approval
- [ ] Approved opportunities → execute via driver (once wired)

### C4. ZXMG Revenue Check
- [ ] First video published — check analytics
- [ ] If performing: Hermes generates content calendar (7-day pipeline)
- [ ] If not performing: Hermes analyzes what went wrong, proposes adjustment
- [ ] Either way: learning stored in vault knowledge

---

## Phase D — Week 3-4

### D1. AWS Agents Graduate
- [ ] AWS ZXMG agent has accumulated 20+ patterns from shadow learning
- [ ] Implement native scheduler trigger: daily trend research
- [ ] AWS ZXMG agent produces its first autonomous recommendation
- [ ] Compare quality to Hermes output — if comparable, begin transition

### D2. Hermes Scope Narrows
- [ ] Hermes ZXMG → transitions from "do everything" to "quality check AWS output"
- [ ] Hermes becomes the reviewer, AWS becomes the producer
- [ ] Eventually: Hermes retires when AWS agent quality is consistent

### D3. Full Obsidian Workflow Live
- [ ] Recommendations auto-generated daily by AWS agents
- [ ] King reviews in Obsidian (5-15 min/day)
- [ ] Approved items execute autonomously
- [ ] Revenue flowing from at least one pillar
- [ ] System demonstrably self-improving

---

## Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| First content published | 1 video live on YouTube | Day 5 |
| First revenue | $1+ from ads/views | Day 14 |
| AWS agents autonomous | At least 1 producing without Hermes | Week 3 |
| King daily time | <15 min in Obsidian | Week 2 |
| Repeat failure rate | 0 (learning from rejections) | Week 4 |

---

## The King's Daily Workflow (Target State)

```
7:00 AM — Open Obsidian
├── Review 3-5 recommendations (approve/reject)
├── Glance at daily portfolio summary
├── Note any new directives if inspired
└── Close Obsidian. Done for the day.

System executes all day autonomously.

10:00 PM — Optional: check evening summary note.
```

---

## Architecture

```
King (Obsidian) ←→ Vault-Sync ←→ EventBridge ←→ AWS Agents (shadow/learn)
                         ↕
                    Hermes (do work)
                         ↓
                    Vault (shared output)
```

Both systems write to vault. King sees everything in one place. AWS learns from Hermes. Hermes retires when AWS is ready.
