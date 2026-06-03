/**
 * @seraphim/vault-sync — Main Entry Point
 *
 * Three-layer Obsidian-Seraphim sync:
 *   Layer 1: Git (durable baseline — auto-commit + push)
 *   Layer 2: File Watcher (real-time local — detect status changes, emit events)
 *   Layer 3: Obsidian REST API (programmatic — agents read/write vault directly)
 *
 * Usage:
 *   npx tsx src/index.ts          (development)
 *   node dist/index.js            (production)
 *   VAULT_SYNC_DRY_RUN=true ...   (dry run — logs events, doesn't publish to EventBridge)
 */

import * as path from 'node:path';
import { GitSync } from './layer1-git.js';
import { VaultWatcher } from './layer2-watcher.js';
import { ObsidianApiDriver } from './layer3-obsidian-api.js';
import { VaultEventPublisher } from './event-bridge.js';
import { VaultWriter } from './vault-writer.js';
import { VaultSyncConfig } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function loadConfig(): VaultSyncConfig {
  const vaultPath = process.env.VAULT_PATH
    ?? path.resolve(__dirname, '..', '..', '..', 'vault');

  return {
    vaultPath,

    // Layer 1: Git
    gitEnabled: process.env.GIT_SYNC_ENABLED !== 'false',
    gitRemote: process.env.GIT_REMOTE ?? 'origin',
    gitBranch: process.env.GIT_BRANCH ?? 'main',
    gitAutoCommitInterval: parseInt(process.env.GIT_COMMIT_INTERVAL ?? '60000', 10),

    // Layer 2: File Watcher
    watcherEnabled: process.env.WATCHER_ENABLED !== 'false',
    watchDebounceMs: parseInt(process.env.WATCH_DEBOUNCE_MS ?? '1000', 10),

    // Layer 3: Obsidian API
    obsidianApiEnabled: process.env.OBSIDIAN_API_ENABLED !== 'false',
    obsidianApiUrl: process.env.OBSIDIAN_API_URL ?? 'https://127.0.0.1:27124',
    obsidianApiToken: process.env.OBSIDIAN_API_TOKEN,

    // Event Bus
    eventBusEnabled: process.env.EVENT_BUS_ENABLED !== 'false',
    awsRegion: process.env.AWS_REGION ?? 'us-east-1',
    eventBusName: process.env.EVENT_BUS_NAME ?? 'seraphim-event-bus',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();
  console.log('=== SeraphimOS Vault Sync ===');
  console.log(`Vault path: ${config.vaultPath}`);
  console.log(`Git sync: ${config.gitEnabled ? 'ON' : 'OFF'}`);
  console.log(`File watcher: ${config.watcherEnabled ? 'ON' : 'OFF'}`);
  console.log(`Obsidian API: ${config.obsidianApiEnabled ? 'ON' : 'OFF'}`);
  console.log(`Event Bus: ${config.eventBusEnabled ? 'ON' : 'OFF'}`);
  console.log('');

  // Initialize components
  const eventPublisher = new VaultEventPublisher({
    eventBusName: config.eventBusName,
    region: config.awsRegion,
    dryRun: !config.eventBusEnabled || process.env.VAULT_SYNC_DRY_RUN === 'true',
  });

  const vaultWriter = new VaultWriter(config.vaultPath);

  // Layer 1: Git sync
  let gitSync: GitSync | null = null;
  if (config.gitEnabled) {
    gitSync = new GitSync(config);
    await gitSync.start();
  }

  // Layer 2: File watcher
  let watcher: VaultWatcher | null = null;
  if (config.watcherEnabled) {
    watcher = new VaultWatcher(config);

    // Handle vault events
    watcher.onEvent(async (event) => {
      console.log(`[Event] ${event.type}: ${event.path}`);

      // Publish to EventBridge
      await eventPublisher.publish(event);

      // Log summary
      console.log(`  → ${eventPublisher.summarize(event)}`);

      // Force git sync on important events
      if (
        event.type === 'directive.activated' ||
        event.type === 'recommendation.approved' ||
        event.type === 'escalation.resolved'
      ) {
        await gitSync?.forceSync();
      }
    });

    watcher.start();
  }

  // Layer 3: Obsidian API
  let obsidianApi: ObsidianApiDriver | null = null;
  if (config.obsidianApiEnabled) {
    obsidianApi = new ObsidianApiDriver(config);
    const result = await obsidianApi.connect();
    if (!result.connected) {
      console.warn(`[Obsidian API] Not available (is Obsidian running with Local REST API?): ${result.message}`);
      console.warn('[Obsidian API] Layer 3 disabled — Layers 1 & 2 still active.');
    }
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Vault Sync] Shutting down...');
    gitSync?.stop();
    watcher?.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Vault Sync] Terminated.');
    gitSync?.stop();
    watcher?.stop();
    process.exit(0);
  });

  console.log('\n[Vault Sync] Running. Press Ctrl+C to stop.\n');

  // Keep alive
  await new Promise(() => {}); // never resolves — stays running
}

// ---------------------------------------------------------------------------
// Exports (for use as a library)
// ---------------------------------------------------------------------------

export { GitSync } from './layer1-git.js';
export { VaultWatcher } from './layer2-watcher.js';
export { ObsidianApiDriver } from './layer3-obsidian-api.js';
export { VaultEventPublisher } from './event-bridge.js';
export { VaultWriter } from './vault-writer.js';
export type * from './types.js';

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
