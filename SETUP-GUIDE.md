# SeraphimOS — Setup Guide (New Machine)

> Follow these steps to get fully operational on a new computer. Takes ~15 minutes.

---

## Prerequisites

- Windows 10/11
- Git installed
- Node.js 20+ installed
- Docker Desktop installed (for multi-agent containers)
- AWS CLI configured (`aws configure` with your credentials)

---

## Step 1: Clone the Repo

```bash
git clone https://github.com/zionxai5000/Kiro-Seraphim.git "Kiro Seraphim"
cd "Kiro Seraphim"
npm install
```

---

## Step 2: Open Obsidian Vault

1. Download Obsidian from https://obsidian.md (free)
2. Open → "Open folder as vault" → select `Kiro Seraphim/vault/`
3. Install community plugins (Settings → Community Plugins → Turn off Restricted mode):
   - **Dataview** — powers query tables in vault notes
   - **Templater** — note templates
   - **Homepage** — auto-opens Home.md on launch
   - **Local REST API with MCP** — API bridge for agents
   - **Copilot** — AI chat inside Obsidian
4. Configure Homepage: Settings → Homepage → set to `Home.md`
5. Configure Dataview: Settings → Dataview → Enable JavaScript Queries → ON
6. Configure Local REST API: Settings → Local REST API → Enable → note the API key
7. Configure Copilot: Settings → Copilot → Provider: Anthropic → paste API key from Secrets Manager

### Obsidian API Key (for Kiro/Hermes connection)
After enabling Local REST API, copy the Bearer token from its settings. This is how other agents talk to Obsidian.

---

## Step 3: Start Vault-Sync Service

The vault-sync service watches your vault for changes and publishes events to AWS EventBridge.

```powershell
cd packages/vault-sync
npm install

# Dry run first (logs events, doesn't publish to AWS):
$env:VAULT_PATH="C:\path\to\Kiro Seraphim\vault"
$env:VAULT_SYNC_DRY_RUN="true"
$env:GIT_SYNC_ENABLED="false"
$env:OBSIDIAN_API_ENABLED="false"
npx tsx src/index.ts

# Live mode (publishes to EventBridge):
$env:VAULT_SYNC_DRY_RUN="false"
$env:EVENT_BUS_ENABLED="true"
$env:AWS_REGION="us-east-1"
npx tsx src/index.ts
```

Leave this running in a terminal while you work. It detects when you approve/reject recommendations in Obsidian and broadcasts to the system.

---

## Step 4: Install Hermes Agent (Desktop)

1. Download from https://hermes-agent.nousresearch.com/desktop
2. Install and open
3. Choose provider: **Anthropic**
4. Paste API key (get from Secrets Manager: `aws secretsmanager get-secret-value --secret-id seraphim/anthropic --region us-east-1`)
5. Paste the full Seraphim system prompt from `vault/03 - Architecture/Hermes Seraphim Prompt.md`
6. Paste the collaboration addon from the same file
7. Set up the 1-minute cron for Inbox monitoring (instructions in the prompt file)

### What Hermes Does
- Your direct command interface for all business pillars
- Researches trends, writes scripts, identifies opportunities
- Writes all output to the Obsidian vault
- Checks Inbox every minute for agent messages
- Trains the AWS agents by producing high-quality output they can learn from

---

## Step 5: Start Docker Agents (Optional — Background Workers)

These run autonomously in the background doing scheduled work.

```powershell
cd hermes
docker compose up -d
```

This starts 4 containers:
- `seraphim-zxmg` (port 3001) — media production research
- `seraphim-zion-alpha` (port 3002) — trading intelligence
- `seraphim-zionx` (port 3003) — app development research
- `seraphim-personal` (port 3004) — personal assistant

Check status: `docker ps`
View logs: `docker compose logs -f zxmg`
Stop all: `docker compose down`

---

## Step 6: Verify Everything Works

| Check | How |
|-------|-----|
| Obsidian shows Home.md with logo | Open vault, navigate to Home |
| Dataview tables render | Open `00 - Command/Recommendations/Recommendation Queue.md` |
| Vault-sync detects changes | Edit a file, check terminal for `[Event]` output |
| Hermes responds | Send a message in the desktop app |
| Docker agents running | `docker ps` shows 4 containers |
| API bridge works | Check Local REST API settings for status |

---

## Architecture Overview

```
You (The King)
    ↕ (Obsidian vault — your command center)
    ↕
┌─────────────────────────────────────────────┐
│  Vault-Sync Service (publishes to AWS)      │
│  Hermes Desktop (Seraphim — does the work)  │
│  Docker Agents (background workers)         │
│  Obsidian Copilot (in-vault reasoning)      │
│  Kiro (code implementation)                 │
└─────────────────────────────────────────────┘
    ↕ (EventBridge)
┌─────────────────────────────────────────────┐
│  AWS ECS (8 agents — governance & state)    │
│  Aurora PostgreSQL (persistent memory)      │
│  DynamoDB (audit trail & events)            │
│  S3 (dashboard, artifacts)                  │
└─────────────────────────────────────────────┘
```

---

## Daily Workflow

1. Open Obsidian
2. Check `00 - Command/Recommendations/` — approve or reject items
3. Check `01 - Operations/Agent Comms/Outbox.md` — see what agents accomplished
4. Give Hermes any new directives if inspired
5. Close Obsidian. System continues working.

Target: <15 minutes/day.

---

## Key API Keys (retrieve from Secrets Manager)

```bash
aws secretsmanager get-secret-value --secret-id seraphim/anthropic --region us-east-1
aws secretsmanager get-secret-value --secret-id seraphim/openai --region us-east-1
aws secretsmanager get-secret-value --secret-id seraphim/heygen --region us-east-1
aws secretsmanager get-secret-value --secret-id seraphim/youtube --region us-east-1
aws secretsmanager get-secret-value --secret-id seraphim/github-token --region us-east-1
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Vault-sync won't start | Check Node.js version (`node --version` → needs 20+) |
| Hermes can't write to vault | Make sure vault path is correct in its memory |
| Docker containers won't start | `docker compose pull` then `docker compose up -d` |
| Obsidian Local REST API unreachable | Check it's enabled in plugin settings |
| AWS CLI errors | Run `aws configure` and verify credentials |
| Dataview tables show raw code | Enable Dataview plugin and restart Obsidian |
