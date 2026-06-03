---
tags: [home, dashboard]
---

<div style="text-align: center;">

![[seraphim-logo.png|300]]

</div>

# 👑 SeraphimOS — Command Center

> *"The King provides vision. Seraphim translates it into strategy. The House of Zion executes."*

---

## Quick Actions

| Action | Link |
|--------|------|
| ✍️ Write a new directive | [[New Directive]] |
| 📋 Review pending recommendations | [[Recommendation Queue]] |
| 📊 Today's portfolio summary | [[01 - Operations/Daily/]] |
| 🔴 Active escalations | [[Escalation Queue]] |
| 💰 Cost dashboard | [[Cost Overview]] |

---

## System Status

> 🟢 **LIVE** — 8 agents deployed, all healthy
> Last updated: 2026-05-13

| Agent | Status | Pillar |
|-------|--------|--------|
| [[Seraphim Core]] | 🟢 Ready | Kernel |
| [[Eretz]] | 🟢 Ready | Business |
| [[ZionX]] | 🟢 Ready | Apps |
| [[ZXMG]] | 🟢 Ready | Media |
| [[Zion Alpha]] | 🟢 Ready | Trading |
| [[Mishmar]] | 🟢 Ready | Governance |
| [[Otzar]] | 🟢 Ready | Resources |
| [[Shaar Guardian]] | 🟢 Ready | Interface |

---

## Active Priorities

1. Revenue generation through ZionX app submissions
2. ZXMG content pipeline activation
3. Zion Alpha trading execution
4. System self-improvement (Learning Engine)
5. Token cost optimization

---

## Recent Activity

```dataview
TABLE status, source, date
FROM "00 - Command/Recommendations"
WHERE status = "Pending"
SORT date DESC
LIMIT 5
```

---

## Quick Links

- [[Architecture Overview]]
- [[Implementation Progress]]
- [[Services Index]]
- [[Drivers Catalog]]
- [[Dashboard Views]]
- [[Hooks and Steering]]
- [[Docker Agents]]
- [[Vault Sync Service]]
- [[Capability Map]]
- [[Known Issues]]
- [[Deployment Guide]]
- [[The King's Vision]]

---

*Open the [[Seraphim Dashboard]] in your browser for real-time operational metrics.*
*Dashboard URL: http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com*
