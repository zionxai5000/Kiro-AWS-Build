/**
 * Eretz Command Center — Standing Orders Panel
 *
 * Persistent directives display: order text, assigned agent, status,
 * creation date, completion date. King CRUD: add, modify, cancel orders.
 * Completion tracking with progress percentage.
 *
 * Requirements: 46j.24, 46g.15
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderStatus = 'active' | 'completed' | 'cancelled';

export interface StandingOrder {
  id: string;
  text: string;
  assignedAgent: string;
  status: OrderStatus;
  progress: number; // 0-100
  createdAt: string;
  completedAt?: string;
  lastActivityAt: string;
}

export interface StandingOrdersPanelData {
  orders: StandingOrder[];
  availableAgents: string[];
}

export interface StandingOrdersPanelOptions {
  onAddOrder?: (text: string, agent: string) => void;
  onModifyOrder?: (id: string, text: string) => void;
  onCancelOrder?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// StandingOrdersPanel
// ---------------------------------------------------------------------------

export class StandingOrdersPanel {
  private container: HTMLElement;
  private data: StandingOrdersPanelData;
  private options: StandingOrdersPanelOptions;
  private editingOrderId: string | null = null;
  private showAddForm: boolean = false;

  constructor(container: HTMLElement, data: StandingOrdersPanelData, options: StandingOrdersPanelOptions = {}) {
    this.container = container;
    this.data = data;
    this.options = options;
  }

  mount(): void {
    this.render();
    this.attachListeners();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: StandingOrdersPanelData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const activeOrders = this.data.orders.filter((o) => o.status === 'active');
    const completedOrders = this.data.orders.filter((o) => o.status === 'completed');
    const cancelledOrders = this.data.orders.filter((o) => o.status === 'cancelled');

    this.container.innerHTML = `
      <div class="standing-orders" role="region" aria-label="Standing Orders">
        <div class="standing-orders__header">
          <h3 class="standing-orders__title">📜 Standing Orders</h3>
          <button class="standing-orders__add-btn" data-action="show-add" aria-label="Add new order">+ New Order</button>
        </div>
        ${this.showAddForm ? this.renderAddForm() : ''}
        <div class="standing-orders__active">
          <h4 class="standing-orders__section-title">Active Orders (${activeOrders.length})</h4>
          ${activeOrders.length > 0
            ? activeOrders.map((o) => this.renderOrder(o)).join('')
            : '<div class="standing-orders__empty">No active orders</div>'
          }
        </div>
        ${completedOrders.length > 0 ? this.renderCompletedSection(completedOrders) : ''}
        ${cancelledOrders.length > 0 ? this.renderCancelledSection(cancelledOrders) : ''}
      </div>
    `;
  }

  private renderAddForm(): string {
    const agentOptions = this.data.availableAgents.map((agent) =>
      `<option value="${agent}">${agent}</option>`
    ).join('');

    return `
      <div class="standing-orders__add-form">
        <textarea class="standing-orders__input" id="new-order-text" placeholder="Enter order directive..." rows="2" aria-label="Order text"></textarea>
        <select class="standing-orders__select" id="new-order-agent" aria-label="Assign agent">
          <option value="">Select agent...</option>
          ${agentOptions}
        </select>
        <div class="standing-orders__form-actions">
          <button class="standing-orders__btn standing-orders__btn--submit" data-action="submit-add">Create Order</button>
          <button class="standing-orders__btn standing-orders__btn--cancel" data-action="cancel-add">Cancel</button>
        </div>
      </div>
    `;
  }

  private renderOrder(order: StandingOrder): string {
    const isEditing = this.editingOrderId === order.id;
    const relativeActivity = this.getRelativeTime(order.lastActivityAt);

    return `
      <div class="standing-orders__order" data-order-id="${order.id}">
        <div class="standing-orders__order-header">
          <span class="standing-orders__order-agent">${order.assignedAgent}</span>
          <span class="standing-orders__order-status standing-orders__order-status--${order.status}">${order.status}</span>
        </div>
        ${isEditing ? this.renderEditForm(order) : `
          <div class="standing-orders__order-text">${order.text}</div>
        `}
        <div class="standing-orders__order-progress">
          <span class="standing-orders__progress-label">Progress: ${order.progress}%</span>
          <div class="standing-orders__progress-bar">
            <div class="standing-orders__progress-fill" style="width: ${order.progress}%"></div>
          </div>
        </div>
        <div class="standing-orders__order-meta">
          <span class="standing-orders__order-created">Created: ${new Date(order.createdAt).toLocaleDateString()}</span>
          <span class="standing-orders__order-activity">Last activity: ${relativeActivity}</span>
        </div>
        <div class="standing-orders__order-actions">
          ${!isEditing ? `<button class="standing-orders__btn standing-orders__btn--modify" data-modify-id="${order.id}">✎ Modify</button>` : ''}
          <button class="standing-orders__btn standing-orders__btn--cancel-order" data-cancel-id="${order.id}">✗ Cancel</button>
        </div>
      </div>
    `;
  }

  private renderEditForm(order: StandingOrder): string {
    return `
      <div class="standing-orders__edit-form" data-edit-id="${order.id}">
        <textarea class="standing-orders__input" id="edit-order-text-${order.id}" rows="2" aria-label="Edit order text">${order.text}</textarea>
        <div class="standing-orders__form-actions">
          <button class="standing-orders__btn standing-orders__btn--submit" data-action="submit-edit" data-edit-order-id="${order.id}">Save</button>
          <button class="standing-orders__btn standing-orders__btn--cancel" data-action="cancel-edit">Cancel</button>
        </div>
      </div>
    `;
  }

  private renderCompletedSection(orders: StandingOrder[]): string {
    const items = orders.map((o) => `
      <div class="standing-orders__history-item" data-order-id="${o.id}">
        <span class="standing-orders__history-text">${o.text}</span>
        <span class="standing-orders__history-agent">${o.assignedAgent}</span>
        <span class="standing-orders__history-date">${o.completedAt ? new Date(o.completedAt).toLocaleDateString() : ''}</span>
      </div>
    `).join('');

    return `
      <div class="standing-orders__completed">
        <h4 class="standing-orders__section-title">✅ Completed (${orders.length})</h4>
        ${items}
      </div>
    `;
  }

  private renderCancelledSection(orders: StandingOrder[]): string {
    const items = orders.map((o) => `
      <div class="standing-orders__history-item standing-orders__history-item--cancelled" data-order-id="${o.id}">
        <span class="standing-orders__history-text">${o.text}</span>
        <span class="standing-orders__history-agent">${o.assignedAgent}</span>
      </div>
    `).join('');

    return `
      <div class="standing-orders__cancelled">
        <h4 class="standing-orders__section-title">❌ Cancelled (${orders.length})</h4>
        ${items}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Show add form
    this.container.querySelector('[data-action="show-add"]')?.addEventListener('click', () => {
      this.showAddForm = true;
      this.render();
      this.attachListeners();
    });

    // Cancel add form
    this.container.querySelector('[data-action="cancel-add"]')?.addEventListener('click', () => {
      this.showAddForm = false;
      this.render();
      this.attachListeners();
    });

    // Submit add form
    this.container.querySelector('[data-action="submit-add"]')?.addEventListener('click', () => {
      const textEl = this.container.querySelector('#new-order-text') as HTMLTextAreaElement;
      const agentEl = this.container.querySelector('#new-order-agent') as HTMLSelectElement;
      const text = textEl?.value?.trim();
      const agent = agentEl?.value;

      if (text && agent) {
        this.options.onAddOrder?.(text, agent);
        this.showAddForm = false;
        this.render();
        this.attachListeners();
      }
    });

    // Modify buttons
    this.container.querySelectorAll('[data-modify-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.modifyId!;
        this.editingOrderId = id;
        this.render();
        this.attachListeners();
      });
    });

    // Cancel edit
    this.container.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => {
      this.editingOrderId = null;
      this.render();
      this.attachListeners();
    });

    // Submit edit
    this.container.querySelectorAll('[data-action="submit-edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = (btn as HTMLElement).dataset.editOrderId!;
        const textEl = this.container.querySelector(`#edit-order-text-${orderId}`) as HTMLTextAreaElement;
        const newText = textEl?.value?.trim();
        if (newText) {
          this.options.onModifyOrder?.(orderId, newText);
          this.editingOrderId = null;
          this.render();
          this.attachListeners();
        }
      });
    });

    // Cancel order buttons
    this.container.querySelectorAll('[data-cancel-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.cancelId!;
        const order = this.data.orders.find((o) => o.id === id);
        if (order) {
          order.status = 'cancelled';
          this.options.onCancelOrder?.(id);
          this.render();
          this.attachListeners();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getRelativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;

    if (diffMs < 60000) return 'just now';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
