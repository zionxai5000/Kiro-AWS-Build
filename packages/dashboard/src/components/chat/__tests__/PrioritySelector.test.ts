/**
 * Unit tests for PrioritySelector component.
 *
 * Requirements: 39.1, 37b.6, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrioritySelector } from '../PrioritySelector.js';
import type { MessagePriority } from '../PrioritySelector.js';

describe('PrioritySelector', () => {
  let container: HTMLElement;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    onChange = vi.fn();
  });

  function createSelector(defaultPriority?: MessagePriority) {
    return new PrioritySelector(container, { defaultPriority, onChange });
  }

  it('renders with default normal priority', () => {
    createSelector();
    expect(container.querySelector('.priority-label')?.textContent).toBe('Normal');
  });

  it('renders with specified default priority', () => {
    createSelector('high');
    expect(container.querySelector('.priority-label')?.textContent).toBe('High');
  });

  it('getSelected returns current priority', () => {
    const selector = createSelector('critical');
    expect(selector.getSelected()).toBe('critical');
  });

  it('setSelected changes priority and calls onChange', () => {
    const selector = createSelector('normal');
    selector.setSelected('high');

    expect(selector.getSelected()).toBe('high');
    expect(onChange).toHaveBeenCalledWith('high');
    expect(container.querySelector('.priority-label')?.textContent).toBe('High');
  });

  it('toggle opens the dropdown', () => {
    const selector = createSelector();
    selector.toggle();

    expect(container.querySelector('.priority-dropdown')).not.toBeNull();
    const options = container.querySelectorAll('.priority-option');
    expect(options.length).toBe(4); // low, normal, high, critical
  });

  it('dropdown is closed by default', () => {
    createSelector();
    expect(container.querySelector('.priority-dropdown')).toBeNull();
  });

  it('has proper aria-label on button', () => {
    createSelector('normal');
    const btn = container.querySelector('.priority-selector-btn');
    expect(btn?.getAttribute('aria-label')).toContain('Normal');
  });

  it('destroy cleans up the container', () => {
    const selector = createSelector();
    selector.destroy();
    expect(container.innerHTML).toBe('');
  });
});
