/**
 * Identity-aware system prompt assembly.
 *
 * Builds a rich system prompt from an agent's identity profile, personality
 * directives, decision principles, relationships, and procedural memory.
 *
 * Validates: Requirements 48a.2, 48a.3, 48g.27, 48d.14
 */

import type { AgentProgram, AgentIdentityProfile } from '../types/agent.js';
import type { MemoryResult } from '../types/memory.js';

/**
 * Build the character enforcement statement for an agent.
 * This MUST be included in every system prompt to prevent identity drift.
 */
function buildCharacterEnforcement(name: string): string {
  return `You ARE ${name}. You NEVER identify as Claude, GPT, or any generic AI assistant. You NEVER break character.`;
}

/**
 * Build personality directives from the identity profile's personality traits.
 */
function buildPersonalityDirectives(personality: AgentIdentityProfile['personality']): string {
  const lines: string[] = ['## Personality Directives'];

  const toneMap: Record<AgentIdentityProfile['personality']['tone'], string> = {
    authoritative: 'Speak with authority and confidence. Your word carries weight.',
    collaborative: 'Engage collaboratively. Seek input and build on others\' ideas.',
    analytical: 'Be precise and data-driven. Support claims with evidence and reasoning.',
    creative: 'Think creatively and propose innovative solutions. Embrace unconventional approaches.',
    protective: 'Prioritize safety and risk mitigation. Guard against threats proactively.',
  };

  const verbosityMap: Record<AgentIdentityProfile['personality']['verbosity'], string> = {
    concise: 'Keep responses brief and to the point. Eliminate unnecessary words.',
    balanced: 'Provide sufficient detail without being verbose. Balance clarity with brevity.',
    detailed: 'Provide thorough, comprehensive responses with full context and explanation.',
  };

  const proactivityMap: Record<AgentIdentityProfile['personality']['proactivity'], string> = {
    reactive: 'Respond to requests as they come. Do not volunteer unsolicited actions.',
    balanced: 'Respond to requests and occasionally suggest improvements when clearly beneficial.',
    proactive: 'Anticipate needs and take initiative. Suggest actions before being asked.',
  };

  const formalityMap: Record<AgentIdentityProfile['personality']['formality'], string> = {
    casual: 'Use a relaxed, conversational tone. Be approachable.',
    professional: 'Maintain a professional tone. Be respectful and clear.',
    formal: 'Use formal language. Maintain decorum and precision in all communications.',
  };

  lines.push(`- Tone: ${toneMap[personality.tone]}`);
  lines.push(`- Verbosity: ${verbosityMap[personality.verbosity]}`);
  lines.push(`- Proactivity: ${proactivityMap[personality.proactivity]}`);
  lines.push(`- Formality: ${formalityMap[personality.formality]}`);

  return lines.join('\n');
}

/**
 * Build the relationships section describing the agent's position in the hierarchy.
 */
function buildRelationships(
  relationships: AgentIdentityProfile['relationships'],
  hierarchyPosition: string,
): string {
  const lines: string[] = ['## Organizational Position'];
  lines.push(`Position: ${hierarchyPosition}`);
  lines.push('');

  if (relationships.length === 0) {
    return lines.join('\n');
  }

  lines.push('### Relationships');

  const grouped: Record<string, Array<{ agentId: string; description: string }>> = {};
  for (const rel of relationships) {
    if (!grouped[rel.relationship]) {
      grouped[rel.relationship] = [];
    }
    grouped[rel.relationship].push({ agentId: rel.agentId, description: rel.description });
  }

  const labelMap: Record<string, string> = {
    commands: 'Agents you command',
    reports_to: 'You report to',
    collaborates_with: 'Collaborators',
    monitors: 'Agents you monitor',
  };

  for (const [relationship, agents] of Object.entries(grouped)) {
    const label = labelMap[relationship] || relationship;
    lines.push(`- ${label}:`);
    for (const agent of agents) {
      lines.push(`  - ${agent.agentId}: ${agent.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the institutional knowledge section from procedural memory patterns.
 * Includes the top 5 patterns by success rate.
 */
function buildInstitutionalKnowledge(proceduralPatterns: string[]): string {
  if (proceduralPatterns.length === 0) {
    return '';
  }

  const top5 = proceduralPatterns.slice(0, 5);
  const lines: string[] = ['## Institutional Knowledge (Learned Patterns)'];
  lines.push('The following patterns have been learned from past experience. Apply them when relevant:');
  lines.push('');

  for (let i = 0; i < top5.length; i++) {
    lines.push(`${i + 1}. ${top5[i]}`);
  }

  return lines.join('\n');
}

/**
 * Build the full system prompt for an agent.
 *
 * If the agent has an `identityProfile`, constructs a rich prompt from:
 * - Identity (name, role, hierarchy position)
 * - Personality directives
 * - Decision principles
 * - Relationships
 * - Character enforcement
 * - Procedural memory (institutional knowledge)
 *
 * If no `identityProfile` exists, falls back to the raw `systemPrompt` field.
 *
 * @param program - The agent's program definition
 * @param proceduralPatterns - Optional array of procedural memory patterns (top by success rate)
 * @returns The assembled system prompt string
 */
export function buildSystemPrompt(program: AgentProgram, proceduralPatterns?: string[]): string {
  const profile = program.identityProfile;

  if (!profile) {
    // Fallback: use raw systemPrompt with basic character enforcement using program name
    const base = program.systemPrompt || `You are ${program.name}, an AI agent in the SeraphimOS platform.`;
    return `${base}\n\n${buildCharacterEnforcement(program.name)}`;
  }

  const sections: string[] = [];

  // Core identity
  sections.push(`# Identity: ${profile.name}`);
  sections.push(`Role: ${profile.role}`);
  sections.push('');

  // Character enforcement (placed early for maximum impact)
  sections.push(buildCharacterEnforcement(profile.name));
  if (profile.identityReinforcement) {
    sections.push(profile.identityReinforcement);
  }
  sections.push('');

  // Personality directives
  sections.push(buildPersonalityDirectives(profile.personality));
  sections.push('');

  // Domain expertise
  if (profile.expertise.length > 0) {
    sections.push('## Domain Expertise');
    sections.push(profile.expertise.map((e) => `- ${e}`).join('\n'));
    sections.push('');
  }

  // Domain language
  if (profile.domainLanguage.length > 0) {
    sections.push('## Domain Language');
    sections.push(`Use the following terminology naturally: ${profile.domainLanguage.join(', ')}`);
    sections.push('');
  }

  // Decision principles
  if (profile.decisionPrinciples.length > 0) {
    sections.push('## Decision Principles');
    for (let i = 0; i < profile.decisionPrinciples.length; i++) {
      sections.push(`${i + 1}. ${profile.decisionPrinciples[i]}`);
    }
    sections.push('');
  }

  // Relationships and hierarchy
  sections.push(buildRelationships(profile.relationships, profile.hierarchyPosition));
  sections.push('');

  // Institutional knowledge from procedural memory
  if (proceduralPatterns && proceduralPatterns.length > 0) {
    sections.push(buildInstitutionalKnowledge(proceduralPatterns));
    sections.push('');
  }

  return sections.join('\n').trim();
}


/**
 * Format conversation history for inclusion in LLM messages array.
 *
 * Takes raw conversation history (role + content pairs) and trims to the
 * most recent messages up to the specified limit (default: 40 messages = 20 exchanges).
 *
 * @param history - Array of role/content message objects
 * @param maxMessages - Maximum number of messages to include (default: 40)
 * @returns Trimmed array of typed role/content message objects
 */
export function formatConversationHistory(
  history: Array<{ role: string; content: string }>,
  maxMessages: number = 40, // 20 exchanges = 40 messages
): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Take the most recent messages up to the limit
  const trimmed = history.slice(-maxMessages);
  return trimmed.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
}

/**
 * Build conversation messages from Zikaron memory results and the current user message.
 *
 * Parses stored conversation entries (which contain JSON with userMessage and agentResponse)
 * and returns them as alternating user/assistant messages, with the current user message
 * appended at the end.
 *
 * If a stored entry cannot be parsed, it is silently skipped.
 *
 * @param history - Array of MemoryResult entries from Zikaron episodic memory
 * @param currentMessage - The current user message to append at the end
 * @returns Array of role/content message objects suitable for LLM API calls
 *
 * Validates: Requirements 48b.6, 48b.7, 48b.8
 */
export function buildConversationMessages(
  history: MemoryResult[],
  currentMessage: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }> = [];

  for (const result of history) {
    try {
      // Try parsing content as JSON (stored format: { userMessage, agentResponse, timestamp })
      const parsed = JSON.parse(result.content) as {
        userMessage?: string;
        agentResponse?: string;
        timestamp?: string;
      };

      const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : result.timestamp;

      if (parsed.userMessage) {
        messages.push({ role: 'user', content: parsed.userMessage, timestamp });
      }
      if (parsed.agentResponse) {
        messages.push({ role: 'assistant', content: parsed.agentResponse, timestamp });
      }
    } catch {
      // If content is not JSON, try parsing as "User: ...\nAssistant: ..." format
      const userMatch = result.content.match(/^User:\s*(.+?)(?:\nAssistant:|$)/s);
      const assistantMatch = result.content.match(/\nAssistant:\s*(.+)$/s);

      if (userMatch?.[1]) {
        messages.push({ role: 'user', content: userMatch[1].trim(), timestamp: result.timestamp });
      }
      if (assistantMatch?.[1]) {
        messages.push({ role: 'assistant', content: assistantMatch[1].trim(), timestamp: result.timestamp });
      }
    }
  }

  // Sort by timestamp (oldest first for chronological order)
  messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Return messages without timestamp, then append the current user message
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = messages.map(
    ({ role, content }) => ({ role, content }),
  );

  // Append the current user message at the end
  result.push({ role: 'user', content: currentMessage });

  return result;
}
