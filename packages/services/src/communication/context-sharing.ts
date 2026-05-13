/**
 * Context Sharing Engine — Implementation
 *
 * Provides cross-agent context sharing with relevance analysis,
 * explicit @-mention routing, handoff summaries, and configurable
 * sharing modes.
 *
 * Requirements: 37c.9, 37c.10, 37c.11, 37c.12, 37d.13, 37d.14
 */

import type {
  ContextSharingEngine,
  ContextSharingConfig,
  RelevanceResult,
  HandoffMode,
  ChatMessage,
  ContextShareEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default relevance threshold for auto-sharing. */
const DEFAULT_RELEVANCE_THRESHOLD = 0.7;

/** Maximum number of recent messages to include in a handoff summary. */
const HANDOFF_SUMMARY_MESSAGE_COUNT = 5;

/** Default agent domain keywords. */
const DEFAULT_AGENT_DOMAINS: Map<string, string[]> = new Map([
  ['seraphim', ['system', 'health', 'strategy']],
  ['eretz', ['business', 'portfolio', 'synergy']],
  ['zionx', ['app', 'development', 'design']],
  ['zxmg', ['content', 'video', 'media']],
  ['zion-alpha', ['trading', 'market', 'position']],
]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * ContextSharingEngineImpl manages cross-agent context sharing.
 *
 * Features:
 * - Keyword-based relevance analysis (Req 37c.9)
 * - Automatic context propagation above threshold (Req 37c.10)
 * - Explicit @-mention parsing and routing (Req 37c.11)
 * - Handoff summary generation (Req 37c.12)
 * - Configurable handoff modes per user (Req 37d.13, 37d.14)
 */
export class ContextSharingEngineImpl implements ContextSharingEngine {
  /** Relevance threshold for auto-sharing. */
  private relevanceThreshold: number = DEFAULT_RELEVANCE_THRESHOLD;

  /** Agent domain keywords for relevance matching. */
  private agentDomains: Map<string, string[]> = new Map(DEFAULT_AGENT_DOMAINS);

  /** Per-user handoff mode configuration. */
  private userHandoffModes: Map<string, HandoffMode> = new Map();

  /** Log of all context share events: agentId → events received. */
  private shareLog: Map<string, ContextShareEvent[]> = new Map();

  /** Counter for generating unique event IDs. */
  private eventCounter = 0;

  // -------------------------------------------------------------------------
  // Relevance Analysis (Req 37c.9)
  // -------------------------------------------------------------------------

  /**
   * Analyze relevance of a message to a set of agents.
   *
   * Uses keyword overlap between message content and each agent's
   * domain keywords to compute a relevance score. Returns results
   * for all agents (including those below threshold) so callers
   * can make informed decisions.
   */
  async analyzeRelevance(message: ChatMessage, agents: string[]): Promise<RelevanceResult[]> {
    const messageWords = this.tokenize(message.content);
    const results: RelevanceResult[] = [];

    for (const agentId of agents) {
      // Skip the agent that owns the message
      if (agentId === message.agentId) {
        continue;
      }

      const domainKeywords = this.agentDomains.get(agentId) ?? [];
      if (domainKeywords.length === 0) {
        results.push({
          agentId,
          relevanceScore: 0,
          reason: 'No domain keywords configured for agent',
          suggestedAction: 'no_action',
        });
        continue;
      }

      const { score, matchedKeywords } = this.computeKeywordRelevance(messageWords, domainKeywords);

      let suggestedAction: RelevanceResult['suggestedAction'];
      if (score >= this.relevanceThreshold) {
        suggestedAction = 'share_full';
      } else if (score >= this.relevanceThreshold * 0.5) {
        suggestedAction = 'share_summary';
      } else {
        suggestedAction = 'no_action';
      }

      const reason = matchedKeywords.length > 0
        ? `Matched keywords: ${matchedKeywords.join(', ')}`
        : 'No keyword matches found';

      results.push({
        agentId,
        relevanceScore: score,
        reason,
        suggestedAction,
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Context Propagation (Req 37c.10)
  // -------------------------------------------------------------------------

  /**
   * Propagate context to target agents by creating ContextShareEvent entries.
   *
   * Each target agent receives a share event with the message content
   * and relevance metadata. Events are stored in the share log.
   */
  async propagateContext(
    message: ChatMessage,
    targetAgents: string[],
    reason: 'auto_detected' | 'explicit_tag',
  ): Promise<ContextShareEvent[]> {
    const events: ContextShareEvent[] = [];

    for (const targetAgentId of targetAgents) {
      // Compute relevance score for the event
      const messageWords = this.tokenize(message.content);
      const domainKeywords = this.agentDomains.get(targetAgentId) ?? [];
      const { score } = this.computeKeywordRelevance(messageWords, domainKeywords);

      this.eventCounter++;
      const event: ContextShareEvent = {
        id: `ctx-share-${this.eventCounter}-${Date.now()}`,
        fromAgentId: message.agentId,
        toAgentId: targetAgentId,
        messageId: message.id,
        reason,
        relevanceScore: reason === 'explicit_tag' ? 1.0 : score,
        sharedContent: message.content,
        timestamp: new Date(),
        acknowledged: false,
      };

      events.push(event);
      this.storeShareEvent(event);
    }

    return events;
  }

  // -------------------------------------------------------------------------
  // @-Mention Parsing (Req 37c.11)
  // -------------------------------------------------------------------------

  /**
   * Parse @agent_name mentions from message content.
   *
   * Detects patterns like @agent-name or @agent_name in the message
   * and returns the list of mentioned agent identifiers.
   */
  parseAgentMentions(content: string): string[] {
    const mentionRegex = /@([\w-]+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    return [...new Set(mentions)];
  }

  // -------------------------------------------------------------------------
  // Handoff Summary (Req 37c.12)
  // -------------------------------------------------------------------------

  /**
   * Generate a handoff summary when a user switches from one agent to another.
   *
   * Takes the most recent messages from the conversation and produces
   * a concise bullet-point summary for the receiving agent.
   */
  async generateHandoffSummary(
    userId: string,
    fromAgentId: string,
    toAgentId: string,
    recentMessages: ChatMessage[],
  ): Promise<string> {
    // Filter messages relevant to the user and source agent
    const relevantMessages = recentMessages
      .filter((msg) => msg.userId === userId && msg.agentId === fromAgentId)
      .slice(-HANDOFF_SUMMARY_MESSAGE_COUNT);

    if (relevantMessages.length === 0) {
      return `No recent conversation history between user ${userId} and ${fromAgentId} to summarize.`;
    }

    const summaryLines = relevantMessages.map((msg) => {
      const sender = msg.sender === 'user' ? userId : fromAgentId;
      return `- [${sender}]: ${msg.content}`;
    });

    return [
      `Handoff Summary: ${fromAgentId} → ${toAgentId}`,
      `User: ${userId}`,
      `Recent conversation (last ${relevantMessages.length} messages):`,
      ...summaryLines,
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Handoff Mode Configuration (Req 37d.13, 37d.14)
  // -------------------------------------------------------------------------

  /**
   * Set the handoff mode for a specific user.
   */
  setHandoffMode(userId: string, mode: HandoffMode): void {
    this.userHandoffModes.set(userId, mode);
  }

  /**
   * Get the handoff mode for a specific user.
   * Defaults to 'automatic' if not explicitly configured.
   */
  getHandoffMode(userId: string): HandoffMode {
    return this.userHandoffModes.get(userId) ?? 'automatic';
  }

  // -------------------------------------------------------------------------
  // Share Log (Req 37c.10)
  // -------------------------------------------------------------------------

  /**
   * Get all context share events received by an agent.
   */
  getShareLog(agentId: string): ContextShareEvent[] {
    return this.shareLog.get(agentId) ?? [];
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Update engine configuration.
   */
  configure(config: ContextSharingConfig): void {
    if (config.relevanceThreshold !== undefined) {
      this.relevanceThreshold = config.relevanceThreshold;
    }
    if (config.agentDomains !== undefined) {
      this.agentDomains = new Map(config.agentDomains);
    }
    if (config.userHandoffModes !== undefined) {
      for (const [userId, mode] of config.userHandoffModes) {
        this.userHandoffModes.set(userId, mode);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Keyword Relevance Computation
  // -------------------------------------------------------------------------

  /**
   * Tokenize message content into lowercase words.
   */
  private tokenize(content: string): string[] {
    return content
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 0);
  }

  /**
   * Compute keyword relevance between message words and domain keywords.
   *
   * Uses a weighted overlap approach: each matched keyword contributes
   * proportionally to the total domain keywords. Multiple matches of
   * the same keyword don't stack, but having more unique matches
   * increases the score.
   */
  private computeKeywordRelevance(
    messageWords: string[],
    domainKeywords: string[],
  ): { score: number; matchedKeywords: string[] } {
    if (domainKeywords.length === 0) {
      return { score: 0, matchedKeywords: [] };
    }

    const matchedKeywords: string[] = [];

    for (const keyword of domainKeywords) {
      const keywordLower = keyword.toLowerCase();
      // Check if any message word contains the keyword or vice versa
      const found = messageWords.some(
        (word) => word.includes(keywordLower) || keywordLower.includes(word),
      );
      if (found) {
        matchedKeywords.push(keyword);
      }
    }

    // Score is the ratio of matched keywords to total domain keywords
    const score = matchedKeywords.length / domainKeywords.length;

    return { score, matchedKeywords };
  }

  /**
   * Store a context share event in the share log.
   */
  private storeShareEvent(event: ContextShareEvent): void {
    let agentEvents = this.shareLog.get(event.toAgentId);
    if (!agentEvents) {
      agentEvents = [];
      this.shareLog.set(event.toAgentId, agentEvents);
    }
    agentEvents.push(event);
  }
}
