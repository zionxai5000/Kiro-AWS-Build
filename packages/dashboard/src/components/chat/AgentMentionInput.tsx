/**
 * AgentMentionInput — Input component with @-mention autocomplete.
 *
 * Provides a text input that supports @agent_name mentions with
 * autocomplete suggestions for cross-agent tagging.
 *
 * Requirements: 37c.10, 37a.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentInfo {
  id: string;
  name: string;
  pillar: string;
}

export interface AgentMentionInputOptions {
  availableAgents: AgentInfo[];
  placeholder?: string;
  onSubmit: (content: string, taggedAgents: string[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class AgentMentionInput {
  private container: HTMLElement;
  private options: AgentMentionInputOptions;
  private inputValue = '';
  private showSuggestions = false;
  private filteredAgents: AgentInfo[] = [];
  private mentionStartIndex = -1;

  constructor(container: HTMLElement, options: AgentMentionInputOptions) {
    this.container = container;
    this.options = options;
    this.render();
  }

  /** Get the current input value. */
  getValue(): string {
    return this.inputValue;
  }

  /** Set the input value programmatically. */
  setValue(value: string): void {
    this.inputValue = value;
    this.render();
  }

  /** Clear the input. */
  clear(): void {
    this.inputValue = '';
    this.showSuggestions = false;
    this.filteredAgents = [];
    this.render();
  }

  /** Extract tagged agent IDs from the current input. */
  getTaggedAgents(): string[] {
    const mentions = this.inputValue.match(/@(\w+)/g) || [];
    const tagged: string[] = [];
    for (const mention of mentions) {
      const name = mention.slice(1).toLowerCase();
      const agent = this.options.availableAgents.find(
        (a) => a.name.toLowerCase() === name,
      );
      if (agent) tagged.push(agent.id);
    }
    return tagged;
  }

  /** Update the list of available agents. */
  setAvailableAgents(agents: AgentInfo[]): void {
    this.options.availableAgents = agents;
  }

  /** Render the input component. */
  render(): void {
    const suggestionsHtml = this.showSuggestions && this.filteredAgents.length > 0
      ? `<ul class="mention-suggestions" role="listbox">
          ${this.filteredAgents
            .map(
              (agent) =>
                `<li class="mention-suggestion" role="option" data-agent-id="${agent.id}" data-agent-name="${agent.name}">
              <span class="mention-agent-name">@${agent.name}</span>
              <span class="mention-agent-pillar">${agent.pillar}</span>
            </li>`,
            )
            .join('')}
        </ul>`
      : '';

    this.container.innerHTML = `
      <div class="agent-mention-input">
        <input
          type="text"
          class="mention-input-field"
          placeholder="${this.options.placeholder || 'Type a message... Use @ to mention agents'}"
          value="${this.inputValue}"
          aria-label="Message input with agent mentions"
          aria-autocomplete="list"
          autocomplete="off"
        />
        ${suggestionsHtml}
      </div>
    `;

    this.attachHandlers();
  }

  private attachHandlers(): void {
    const input = this.container.querySelector<HTMLInputElement>('.mention-input-field');
    if (!input) return;

    input.addEventListener('input', (e) => {
      this.inputValue = (e.target as HTMLInputElement).value;
      this.checkForMention();
    });

    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !this.showSuggestions) {
        e.preventDefault();
        const tagged = this.getTaggedAgents();
        this.options.onSubmit(this.inputValue, tagged);
        this.clear();
      }
    });

    // Handle suggestion clicks
    const suggestions = this.container.querySelectorAll('.mention-suggestion');
    suggestions.forEach((el) => {
      el.addEventListener('click', () => {
        const name = (el as HTMLElement).dataset.agentName!;
        this.insertMention(name);
      });
    });
  }

  private checkForMention(): void {
    const lastAtIndex = this.inputValue.lastIndexOf('@');
    if (lastAtIndex === -1 || lastAtIndex < this.inputValue.lastIndexOf(' ')) {
      this.showSuggestions = false;
      this.filteredAgents = [];
      this.renderSuggestions();
      return;
    }

    this.mentionStartIndex = lastAtIndex;
    const query = this.inputValue.slice(lastAtIndex + 1).toLowerCase();
    this.filteredAgents = this.options.availableAgents.filter((a) =>
      a.name.toLowerCase().startsWith(query),
    );
    this.showSuggestions = this.filteredAgents.length > 0;
    this.renderSuggestions();
  }

  private insertMention(agentName: string): void {
    if (this.mentionStartIndex >= 0) {
      this.inputValue =
        this.inputValue.slice(0, this.mentionStartIndex) + `@${agentName} `;
    }
    this.showSuggestions = false;
    this.filteredAgents = [];
    this.render();
  }

  private renderSuggestions(): void {
    const existing = this.container.querySelector('.mention-suggestions');
    if (!this.showSuggestions || this.filteredAgents.length === 0) {
      existing?.remove();
      return;
    }
    // Re-render to update suggestions
    this.render();
  }

  /** Destroy the component. */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
