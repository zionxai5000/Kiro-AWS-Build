/**
 * Shaar Dashboard — Auto-Sync Handler
 *
 * Listens for `spec.document.updated` WebSocket messages and triggers
 * view re-renders when document content changes. Compares received
 * content hashes with last known hashes to avoid unnecessary re-fetches.
 *
 * Target: < 5 seconds from file save to dashboard update.
 *
 * Requirements: 47h.28, 47h.29, 47h.30, 47h.31, 47h.32
 */

import type {
  DashboardWebSocket,
  WebSocketMessage,
  SpecDocumentType,
} from '../../api.js';
import { fetchSpecDocument } from '../../api.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback invoked when updated document content is available. */
export type DocumentUpdateCallback = (content: string) => void;

/** Internal subscription state per document type. */
interface Subscription {
  documentType: SpecDocumentType;
  onUpdate: DocumentUpdateCallback;
  lastHash: string | null;
}

// ---------------------------------------------------------------------------
// AutoSyncHandler
// ---------------------------------------------------------------------------

/**
 * AutoSyncHandler subscribes to real-time spec document change notifications
 * via WebSocket and triggers view re-renders when content changes.
 *
 * Usage:
 * ```typescript
 * const sync = new AutoSyncHandler(ws);
 * sync.subscribe('requirements', (content) => renderMarkdown(content));
 * // Later:
 * sync.unsubscribe('requirements');
 * sync.destroy();
 * ```
 */
export class AutoSyncHandler {
  private ws: DashboardWebSocket;
  private subscriptions = new Map<SpecDocumentType, Subscription>();
  private boundHandler: (message: WebSocketMessage) => void;

  constructor(ws: DashboardWebSocket) {
    this.ws = ws;
    this.boundHandler = this.handleMessage.bind(this);
    this.ws.on('spec.document.updated', this.boundHandler);
  }

  /**
   * Subscribe to updates for a specific document type.
   * When the document changes on disk, the callback receives the new content.
   *
   * @param documentType - The spec document to watch
   * @param onUpdate - Callback invoked with the new markdown content
   */
  subscribe(documentType: SpecDocumentType, onUpdate: DocumentUpdateCallback): void {
    this.subscriptions.set(documentType, {
      documentType,
      onUpdate,
      lastHash: null,
    });
  }

  /**
   * Unsubscribe from updates for a specific document type.
   *
   * @param documentType - The spec document to stop watching
   */
  unsubscribe(documentType: SpecDocumentType): void {
    this.subscriptions.delete(documentType);
  }

  /**
   * Clean up all subscriptions and remove the WebSocket listener.
   * Call this when the view is unmounted or the handler is no longer needed.
   */
  destroy(): void {
    this.ws.off('spec.document.updated', this.boundHandler);
    this.subscriptions.clear();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private handleMessage(message: WebSocketMessage): void {
    const data = message.data as {
      documentType?: SpecDocumentType;
      hash?: string;
      timestamp?: string;
    };

    if (!data.documentType || !data.hash) return;

    const subscription = this.subscriptions.get(data.documentType);
    if (!subscription) return;

    // Compare hash — skip re-fetch if content hasn't changed
    if (subscription.lastHash === data.hash) return;

    // Update the last known hash and fetch new content
    subscription.lastHash = data.hash;
    this.fetchAndNotify(subscription);
  }

  private async fetchAndNotify(subscription: Subscription): Promise<void> {
    try {
      const response = await fetchSpecDocument(subscription.documentType);
      subscription.onUpdate(response.content);
    } catch (err) {
      console.warn(
        `[AutoSyncHandler] Failed to fetch ${subscription.documentType}:`,
        (err as Error).message,
      );
    }
  }
}
