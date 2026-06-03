---
tags: [recommendations, queue]
---

# Recommendation Queue

All agent recommendations land here. Review, annotate, approve or reject.

## Pending Approval

```dataview
TABLE source AS "Agent", priority, expected_impact AS "Impact", date
FROM "00 - Command/Recommendations"
WHERE status = "Pending"
SORT priority DESC
```

## Recently Approved

```dataview
TABLE source AS "Agent", approved_date, execution_status AS "Status"
FROM "00 - Command/Recommendations"
WHERE status = "Approved"
SORT approved_date DESC
LIMIT 10
```

## Recently Rejected

```dataview
TABLE source AS "Agent", rejection_reason AS "Reason", date
FROM "00 - Command/Recommendations"
WHERE status = "Rejected"
SORT date DESC
LIMIT 5
```

---

## How to Approve/Reject

1. Open the recommendation note
2. Change `status:` in frontmatter:
   - `Pending` → `Approved` (with `approved_date: YYYY-MM-DD`)
   - `Pending` → `Rejected` (add `rejection_reason:` field)
3. Save. The system will pick up approved items and execute them.
