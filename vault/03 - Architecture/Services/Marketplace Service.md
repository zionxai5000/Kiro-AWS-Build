---
tags: [architecture, services, marketplace, agents]
updated: 2025-01-20
---

# Marketplace Service

> Agent program marketplace for publishing, discovering, and installing validated agent programs.

## Overview

The Marketplace enables sharing of Agent_Programs between tenants with quality validation. Published programs must include test suites, Completion_Contracts, and documentation. Installed programs operate within the tenant's Mishmar authorization and Otzar budget constraints.

Package: `packages/services/src/marketplace/service.ts`

---

## Interface

```typescript
interface MarketplaceService {
  publishProgram(program: AgentProgram): Promise<string>
  installProgram(programId: string, tenantId: string): Promise<void>
  listPrograms(filters?: MarketplaceFilters): Promise<MarketplaceListing[]>
  rateProgram(programId: string, rating: number): Promise<void>
  getMetrics(programId: string): Promise<ProgramMetrics>
}
```

---

## Publication Validation

Before a program is accepted into the marketplace, it must pass:
- ✅ Versioned Agent_Program definition
- ✅ Test suite with passing tests
- ✅ Completion_Contracts defined for all outputs
- ✅ Documentation (description, capabilities, requirements)
- ✅ Code quality standards met

---

## Installation Flow

1. Validate program compatibility with target tenant
2. Deploy agent within tenant's isolated environment
3. Apply tenant's Mishmar authorization rules
4. Apply tenant's Otzar budget constraints
5. Run integration tests in tenant context
6. Activate agent only if all checks pass

---

## Catalog Features

- Searchable by capability, domain, rating
- Installation count and verified performance metrics
- Ratings from installing tenants
- Quality badge for programs exceeding benchmarks

## Related

- [[Architecture Overview]]
- [[Mishmar Governance Service]]
- [[Otzar Resource Manager]]
- [[SME Intelligence System]]
