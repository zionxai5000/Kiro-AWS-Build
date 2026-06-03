---
name: write-to-vault
description: Write structured markdown notes to the SeraphimOS Obsidian vault
trigger: When producing any output that should be persisted (findings, recommendations, knowledge)
---

# Write to Vault Skill

## Purpose
All meaningful output must be written to the Obsidian vault at /opt/vault/ so that:
- The King can see it in Obsidian
- The vault-sync layer publishes it to EventBridge
- Other Seraphim agents can access the knowledge

## Paths

| Content Type | Path |
|---|---|
| Research findings | /opt/vault/02 - Knowledge/ZXMG/{filename}.md |
| Recommendations | /opt/vault/00 - Command/Recommendations/{filename}.md |
| Daily reports | /opt/vault/01 - Operations/Daily/{YYYY-MM-DD}.md |
| Production formulas | /opt/vault/02 - Knowledge/ZXMG/Production Formulas.md (append) |

## Frontmatter Requirements

Every file MUST start with YAML frontmatter:

```yaml
---
tags: [appropriate, tags]
source: ZXMG-Scout
date: YYYY-MM-DD
---
```

### For recommendations specifically:
```yaml
---
tags: [recommendation, zxmg]
status: Pending
source: ZXMG-Scout
priority: high
expected_impact: "Clear one-line description"
date: YYYY-MM-DD
---
```

## Steps
1. Determine the content type (research, recommendation, report)
2. Choose the correct vault path
3. Format with proper frontmatter
4. Write the file using terminal tools (cat or echo to file)
5. Confirm the file was written successfully

## Verification
After writing, verify the file exists and has valid frontmatter by reading it back.
