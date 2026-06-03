# Obsidian Setup for SeraphimOS

## Required Plugins (Install from Community Plugins)

1. **Dataview** — Query your vault like a database. Used for recommendation tracking, task status, agent metrics.
2. **Tasks** — Checkbox management with dates, priorities, and recurrence. Used for approval workflows.
3. **Templater** — Advanced templates for directives, recommendations, and reports.
4. **Calendar** — Daily notes view. Your daily system reports show up here.
5. **Kanban** — Board view for recommendations and pipeline management.

## Recommended Plugins

6. **Surfing** — Browser inside Obsidian. Embed your Seraphim dashboard.
7. **Mermaid Tools** — Enhanced Mermaid diagram support (architecture diagrams render natively).
8. **Obsidian Local REST API** — Exposes vault to external services. This is how Seraphim agents write to your vault.
9. **Graph Analysis** — Enhanced graph view with clustering and analytics.
10. **Homepage** — Set `Home.md` as your startup page.

## Configuration

After installing plugins:

1. Set `Home.md` as your homepage
2. Enable Dataview JavaScript queries (Settings → Dataview → Enable JavaScript Queries)
3. Configure Local REST API (Settings → Local REST API → Enable, set port 27124)
4. Set daily note folder to `01 - Operations/Daily/`
5. Set daily note template to `Templates/Daily Report.md`

## Appearance

- Recommended theme: **Minimal** or **AnuPpuccin** (clean, information-dense)
- Enable **Readable line length** OFF for wide tables
- Enable **Show frontmatter** for metadata visibility
