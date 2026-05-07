import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Nav, type ViewName } from '../components/nav.js';

describe('Nav', () => {
  let container: HTMLElement;
  let onNavigate: (view: ViewName) => void;

  beforeEach(() => {
    container = document.createElement('div');
    onNavigate = vi.fn<(view: ViewName) => void>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all navigation links', () => {
    new Nav(container, { onNavigate });

    const links = container.querySelectorAll('a[data-view]');
    expect(links.length).toBe(5);

    const viewNames = Array.from(links).map((a) => a.getAttribute('data-view'));
    expect(viewNames).toEqual(['agents', 'pillars', 'costs', 'audit', 'health']);
  });

  it('calls onNavigate callback when link clicked', () => {
    new Nav(container, { onNavigate });

    const costsLink = container.querySelector<HTMLAnchorElement>('a[data-view="costs"]')!;
    costsLink.click();

    expect(onNavigate).toHaveBeenCalledWith('costs');
  });

  it('highlights active view', () => {
    new Nav(container, { onNavigate });

    // Default active is 'agents'
    const agentsLink = container.querySelector<HTMLAnchorElement>('a[data-view="agents"]')!;
    expect(agentsLink.classList.contains('active')).toBe(true);

    const costsLink = container.querySelector<HTMLAnchorElement>('a[data-view="costs"]')!;
    expect(costsLink.classList.contains('active')).toBe(false);
  });

  it('setActive() updates the active link', () => {
    const nav = new Nav(container, { onNavigate });

    nav.setActive('health');

    const healthLink = container.querySelector<HTMLAnchorElement>('a[data-view="health"]')!;
    expect(healthLink.classList.contains('active')).toBe(true);

    const agentsLink = container.querySelector<HTMLAnchorElement>('a[data-view="agents"]')!;
    expect(agentsLink.classList.contains('active')).toBe(false);
  });
});
