---
tags: [architecture, services, tenant, multi-tenant, queen]
updated: 2025-01-20
---

# Tenant Service

> Multi-tenant isolation with Queen provisioning and cross-tenant coordination.

## Overview

The Tenant Service provides complete tenant isolation with independent resources. Queens receive scoped authorization limiting them to designated pillars and action types, while still enabling authorized cross-tenant coordination via Execution_Tokens.

Package: `packages/services/src/tenant/service.ts`

---

## Capabilities

| Feature | Description |
|---------|-------------|
| Tenant provisioning | Create isolated tenant with default pillars, fresh Zikaron, independent budgets |
| Queen provisioning | Scoped Mishmar authorization profile limiting access to designated pillars |
| Cross-tenant coordination | Authorized Queen workflows trigger actions in King's pillars with Execution_Tokens |
| Tenant-scoped Shaar | Queen interactions scoped to authorized pillars and actions |
| Data isolation | Row-level security on all tables filtering by `tenant_id` |
| Network isolation | VPC security groups per tenant tier |

---

## Authorization Model

| Role | Access |
|------|--------|
| King | Full access to all pillars and actions (L1 authority) |
| Queen | Access limited to designated pillars (configurable) |
| Agent | Access within deployed tenant only |

---

## Isolation Boundaries

- Database: row-level security with `tenant_id` filtering
- Memory: Zikaron queries always include `tenant_id`
- Budget: independent Otzar budgets per tenant
- Events: EventBridge rules scoped by `tenant_id`
- Network: VPC security groups per tier (CDK)

## Related

- [[Mishmar Governance Service]]
- [[Chain of Command]]
- [[Architecture Overview]]
