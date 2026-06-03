/**
 * Event Bridge Integration
 *
 * Publishes vault events to AWS EventBridge so Seraphim agents can react.
 * Also listens for agent events and writes output to vault.
 */

import { VaultEvent, SeraphimEvent } from './types.js';

/**
 * EventBridge publisher for vault events.
 * In production, this calls AWS SDK. For local dev, logs to console.
 */
export class VaultEventPublisher {
  private eventBusName: string;
  private region: string;
  private dryRun: boolean;

  constructor(options: { eventBusName?: string; region?: string; dryRun?: boolean }) {
    this.eventBusName = options.eventBusName ?? 'seraphim-event-bus';
    this.region = options.region ?? 'us-east-1';
    this.dryRun = options.dryRun ?? (process.env.VAULT_SYNC_DRY_RUN === 'true');
  }

  /**
   * Publish a vault event to EventBridge.
   */
  async publish(vaultEvent: VaultEvent): Promise<string | null> {
    const seraphimEvent: SeraphimEvent = {
      source: 'vault-sync',
      type: `vault.${vaultEvent.type}`,
      detail: {
        path: vaultEvent.path,
        frontmatter: vaultEvent.frontmatter,
        contentPreview: vaultEvent.content.slice(0, 500),
        fullContent: vaultEvent.content,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: vaultEvent.timestamp.toISOString(),
      },
    };

    if (this.dryRun) {
      console.log(`[Event Bridge] (dry-run) Would publish:`, JSON.stringify({
        type: seraphimEvent.type,
        path: vaultEvent.path,
        status: vaultEvent.frontmatter.status,
      }, null, 2));
      return 'dry-run';
    }

    try {
      // Dynamic import to avoid requiring AWS SDK when not needed
      const { EventBridgeClient, PutEventsCommand } = await import('@aws-sdk/client-eventbridge');

      const client = new EventBridgeClient({ region: this.region });
      const command = new PutEventsCommand({
        Entries: [
          {
            Source: seraphimEvent.source,
            DetailType: seraphimEvent.type,
            Detail: JSON.stringify(seraphimEvent.detail),
            EventBusName: this.eventBusName,
          },
        ],
      });

      const result = await client.send(command);
      const eventId = result.Entries?.[0]?.EventId ?? null;
      console.log(`[Event Bridge] Published: ${seraphimEvent.type} → ${eventId}`);
      return eventId;
    } catch (err) {
      console.error(`[Event Bridge] Publish failed:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Map vault events to human-readable summaries.
   */
  summarize(event: VaultEvent): string {
    switch (event.type) {
      case 'directive.activated':
        return `Directive activated: ${event.frontmatter.title ?? event.path}`;
      case 'recommendation.approved':
        return `Recommendation approved: ${event.path}`;
      case 'recommendation.rejected':
        return `Recommendation rejected: ${event.path} (reason: ${event.frontmatter.rejection_reason ?? 'none given'})`;
      case 'escalation.resolved':
        return `Escalation resolved: ${event.path}`;
      default:
        return `Vault change: ${event.type} at ${event.path}`;
    }
  }
}
