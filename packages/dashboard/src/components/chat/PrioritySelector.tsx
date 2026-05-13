/**
 * PrioritySelector — Message priority selector component.
 *
 * Allows users to select the priority level for outgoing messages.
 * Supports low, normal, high, and critical priority levels.
 *
 * Requirements: 39.1, 37b.6
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

export interface PrioritySelectorOptions {
  defaultPriority?: MessagePriority;
  onChange: (priority: MessagePriority) => void;
}

// ---------------------------------------------------------------------------
// Priority display configuration
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<MessagePriority, { label: string; color: string; icon: string }> = {
  low: { label: 'Low', color: '#6b7280', icon: '▽' },
  normal: { label: 'Normal', color: '#3b82f6', icon: '◇' },
  high: { label: 'High', color: '#f59e0b', icon: '△' },
  critical: { label: 'Critical', color: '#ef4444', icon: '⚠' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class PrioritySelector {
  private container: HTMLElement;
  private options: PrioritySelectorOptions;
  private selectedPriority: MessagePriority;
  private isOpen = false;

  constructor(container: HTMLElement, options: PrioritySelectorOptions) {
    this.container = container;
    this.options = options;
    this.selectedPriority = options.defaultPriority || 'normal';
    this.render();
  }

  /** Get the currently selected priority. */
  getSelected(): MessagePriority {
    return this.selectedPriority;
  }

  /** Set the priority programmatically. */
  setSelected(priority: MessagePriority): void {
    this.selectedPriority = priority;
    this.options.onChange(priority);
    this.render();
  }

  /** Toggle the dropdown open/closed. */
  toggle(): void {
    this.isOpen = !this.isOpen;
    this.render();
  }

  /** Render the priority selector. */
  render(): void {
    const current = PRIORITY_CONFIG[this.selectedPriority];
    const priorities: MessagePriority[] = ['low', 'normal', 'high', 'critical'];

    const dropdownHtml = this.isOpen
      ? `<ul class="priority-dropdown" role="listbox">
          ${priorities
            .map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              const selected = p === this.selectedPriority ? ' aria-selected="true"' : '';
              return `<li class="priority-option" role="option" data-priority="${p}"${selected}>
                <span class="priority-icon" style="color: ${cfg.color}">${cfg.icon}</span>
                <span class="priority-label">${cfg.label}</span>
              </li>`;
            })
            .join('')}
        </ul>`
      : '';

    this.container.innerHTML = `
      <div class="priority-selector ${this.isOpen ? 'priority-selector--open' : ''}">
        <button class="priority-selector-btn" aria-label="Select message priority: ${current.label}" aria-expanded="${this.isOpen}">
          <span class="priority-icon" style="color: ${current.color}">${current.icon}</span>
          <span class="priority-label">${current.label}</span>
        </button>
        ${dropdownHtml}
      </div>
    `;

    this.attachHandlers();
  }

  private attachHandlers(): void {
    const btn = this.container.querySelector('.priority-selector-btn');
    btn?.addEventListener('click', () => this.toggle());

    const options = this.container.querySelectorAll('.priority-option');
    options.forEach((el) => {
      el.addEventListener('click', () => {
        const priority = (el as HTMLElement).dataset.priority as MessagePriority;
        this.selectedPriority = priority;
        this.isOpen = false;
        this.options.onChange(priority);
        this.render();
      });
    });
  }

  /** Destroy the component. */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
