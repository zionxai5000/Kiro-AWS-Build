---
tags: [escalation, queue]
---

# Escalation Queue

Items requiring L1 (King) approval. These cannot proceed without your decision.

## Active Escalations

```dataview
TABLE source AS "Agent", urgency, summary, date
FROM "00 - Command/Escalations"
WHERE status = "active"
SORT urgency DESC
```

## Resolution Process

1. Read the escalation context
2. Make a decision (approve, deny, redirect)
3. Change `status: active` to `status: resolved`
4. Add `resolution:` field with your decision
5. System will execute your resolution

---

*No active escalations right now. The system is operating within autonomous bounds.*
