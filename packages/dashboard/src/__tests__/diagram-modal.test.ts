import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiagramModal } from '../views/seraphim-core/diagram-modal.js';
import { PanZoomController } from '../views/seraphim-core/pan-zoom-controller.js';

describe('DiagramModal', () => {
  let modal: DiagramModal;
  const testSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';

  beforeEach(() => {
    modal = new DiagramModal();
  });

  afterEach(() => {
    modal.destroy();
  });

  it('should open with SVG content in a full-viewport overlay', () => {
    modal.open(testSvg);

    const overlay = document.querySelector('.diagram-modal');
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute('role')).toBe('dialog');
    expect(overlay!.getAttribute('aria-modal')).toBe('true');

    const content = document.querySelector('.diagram-modal__content');
    expect(content).not.toBeNull();
    expect(content!.innerHTML).toContain('<svg');
    expect(content!.innerHTML).toContain('viewBox="0 0 100 100"');
  });

  it('should report isOpen correctly', () => {
    expect(modal.isOpen()).toBe(false);
    modal.open(testSvg);
    expect(modal.isOpen()).toBe(true);
    modal.destroy();
    expect(modal.isOpen()).toBe(false);
  });

  it('should not open a second overlay if already open', () => {
    modal.open(testSvg);
    modal.open(testSvg);

    const overlays = document.querySelectorAll('.diagram-modal');
    expect(overlays.length).toBe(1);
  });

  it('should display zoom +/- buttons and a reset button', () => {
    modal.open(testSvg);

    const zoomIn = document.querySelector('[data-action="zoom-in"]');
    const zoomOut = document.querySelector('[data-action="zoom-out"]');
    const reset = document.querySelector('[data-action="reset"]');

    expect(zoomIn).not.toBeNull();
    expect(zoomOut).not.toBeNull();
    expect(reset).not.toBeNull();
  });

  it('should display a zoom percentage indicator starting at 100%', () => {
    modal.open(testSvg);

    const indicator = document.querySelector('.diagram-modal__zoom-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toBe('100%');
  });

  it('should close on Escape key press', () => {
    vi.useFakeTimers();
    modal.open(testSvg);

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    // After animation timeout
    vi.advanceTimersByTime(200);

    expect(modal.isOpen()).toBe(false);
    expect(document.querySelector('.diagram-modal')).toBeNull();
    vi.useRealTimers();
  });

  it('should close on close button click', () => {
    vi.useFakeTimers();
    modal.open(testSvg);

    const closeBtn = document.querySelector('[data-action="close"]') as HTMLElement;
    closeBtn.click();

    vi.advanceTimersByTime(200);

    expect(modal.isOpen()).toBe(false);
    vi.useRealTimers();
  });

  it('should close on backdrop click', () => {
    vi.useFakeTimers();
    modal.open(testSvg);

    const backdrop = document.querySelector('.diagram-modal__backdrop') as HTMLElement;
    backdrop.click();

    vi.advanceTimersByTime(200);

    expect(modal.isOpen()).toBe(false);
    vi.useRealTimers();
  });

  it('should add open class for animation', () => {
    vi.useFakeTimers();
    modal.open(testSvg);

    // Before rAF
    const overlay = document.querySelector('.diagram-modal');
    expect(overlay!.classList.contains('diagram-modal--open')).toBe(false);

    // After rAF
    vi.advanceTimersByTime(16);
    expect(overlay!.classList.contains('diagram-modal--open')).toBe(true);
    vi.useRealTimers();
  });

  it('should add closing class during close animation', () => {
    vi.useFakeTimers();
    modal.open(testSvg);
    vi.advanceTimersByTime(16); // rAF

    modal.close();

    const overlay = document.querySelector('.diagram-modal');
    expect(overlay!.classList.contains('diagram-modal--closing')).toBe(true);
    expect(overlay!.classList.contains('diagram-modal--open')).toBe(false);

    vi.advanceTimersByTime(200);
    expect(document.querySelector('.diagram-modal')).toBeNull();
    vi.useRealTimers();
  });

  it('should update zoom indicator when zoom-in button is clicked', () => {
    modal.open(testSvg);

    const zoomIn = document.querySelector('[data-action="zoom-in"]') as HTMLElement;
    zoomIn.click();

    const indicator = document.querySelector('.diagram-modal__zoom-indicator');
    expect(indicator!.textContent).toBe('110%');
  });

  it('should update zoom indicator when zoom-out button is clicked', () => {
    modal.open(testSvg);

    const zoomOut = document.querySelector('[data-action="zoom-out"]') as HTMLElement;
    zoomOut.click();

    const indicator = document.querySelector('.diagram-modal__zoom-indicator');
    expect(indicator!.textContent).toBe('90%');
  });

  it('should reset zoom to 100% when reset button is clicked', () => {
    modal.open(testSvg);

    // Zoom in first
    const zoomIn = document.querySelector('[data-action="zoom-in"]') as HTMLElement;
    zoomIn.click();
    zoomIn.click();

    const indicator = document.querySelector('.diagram-modal__zoom-indicator');
    expect(indicator!.textContent).toBe('120%');

    // Reset
    const reset = document.querySelector('[data-action="reset"]') as HTMLElement;
    reset.click();

    expect(indicator!.textContent).toBe('100%');
  });

  it('should have accessible labels on buttons', () => {
    modal.open(testSvg);

    const zoomIn = document.querySelector('[data-action="zoom-in"]');
    const zoomOut = document.querySelector('[data-action="zoom-out"]');
    const close = document.querySelector('[data-action="close"]');
    const reset = document.querySelector('[data-action="reset"]');

    expect(zoomIn!.getAttribute('aria-label')).toBe('Zoom in');
    expect(zoomOut!.getAttribute('aria-label')).toBe('Zoom out');
    expect(close!.getAttribute('aria-label')).toBe('Close diagram');
    expect(reset!.getAttribute('aria-label')).toBe('Reset zoom');
  });

  it('should have aria-live on zoom indicator for screen readers', () => {
    modal.open(testSvg);

    const indicator = document.querySelector('.diagram-modal__zoom-indicator');
    expect(indicator!.getAttribute('aria-live')).toBe('polite');
  });
});

describe('PanZoomController', () => {
  let controller: PanZoomController;
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    // Give the element dimensions for getBoundingClientRect
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    document.body.appendChild(element);
  });

  afterEach(() => {
    if (controller) {
      controller.detach();
    }
    document.body.removeChild(element);
  });

  it('should initialize with zoom 1 and pan 0,0', () => {
    controller = new PanZoomController();
    const state = controller.getState();

    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  it('should report zoom percentage correctly', () => {
    controller = new PanZoomController();
    expect(controller.getZoomPercentage()).toBe(100);

    controller.setZoom(0.5);
    expect(controller.getZoomPercentage()).toBe(50);

    controller.setZoom(2);
    expect(controller.getZoomPercentage()).toBe(200);
  });

  it('should zoom in by step', () => {
    controller = new PanZoomController({ zoomStep: 0.1 });
    controller.zoomIn();

    expect(controller.getState().zoom).toBeCloseTo(1.1);
  });

  it('should zoom out by step', () => {
    controller = new PanZoomController({ zoomStep: 0.1 });
    controller.zoomOut();

    expect(controller.getState().zoom).toBeCloseTo(0.9);
  });

  it('should clamp zoom to minimum 0.25x', () => {
    controller = new PanZoomController({ minZoom: 0.25 });
    controller.setZoom(0.1);

    expect(controller.getState().zoom).toBe(0.25);
  });

  it('should clamp zoom to maximum 4x', () => {
    controller = new PanZoomController({ maxZoom: 4 });
    controller.setZoom(5);

    expect(controller.getState().zoom).toBe(4);
  });

  it('should reset to zoom 1 and pan 0,0', () => {
    controller = new PanZoomController();
    controller.setZoom(2);
    controller.attach(element);

    // Simulate some pan
    const mousedown = new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 });
    element.dispatchEvent(mousedown);
    const mousemove = new MouseEvent('mousemove', { clientX: 150, clientY: 120 });
    element.dispatchEvent(mousemove);
    const mouseup = new MouseEvent('mouseup', { clientX: 150, clientY: 120 });
    element.dispatchEvent(mouseup);

    controller.reset();

    const state = controller.getState();
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  it('should zoom via mouse wheel within bounds', () => {
    controller = new PanZoomController({ zoomStep: 0.1, minZoom: 0.25, maxZoom: 4 });
    controller.attach(element);

    // Wheel up (zoom in)
    const wheelUp = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
    });
    element.dispatchEvent(wheelUp);

    expect(controller.getState().zoom).toBeCloseTo(1.1);

    // Wheel down (zoom out)
    const wheelDown = new WheelEvent('wheel', {
      deltaY: 100,
      clientX: 400,
      clientY: 300,
    });
    element.dispatchEvent(wheelDown);

    expect(controller.getState().zoom).toBeCloseTo(1.0);
  });

  it('should not exceed max zoom via mouse wheel', () => {
    controller = new PanZoomController({ zoomStep: 0.5, maxZoom: 4 });
    controller.setZoom(3.9);
    controller.attach(element);

    const wheelUp = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
    });
    element.dispatchEvent(wheelUp);

    expect(controller.getState().zoom).toBe(4);
  });

  it('should not go below min zoom via mouse wheel', () => {
    controller = new PanZoomController({ zoomStep: 0.5, minZoom: 0.25 });
    controller.setZoom(0.3);
    controller.attach(element);

    const wheelDown = new WheelEvent('wheel', {
      deltaY: 100,
      clientX: 400,
      clientY: 300,
    });
    element.dispatchEvent(wheelDown);

    expect(controller.getState().zoom).toBe(0.25);
  });

  it('should pan via click-and-drag', () => {
    controller = new PanZoomController();
    controller.attach(element);

    const mousedown = new MouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0 });
    element.dispatchEvent(mousedown);

    const mousemove = new MouseEvent('mousemove', { clientX: 250, clientY: 230 });
    element.dispatchEvent(mousemove);

    const mouseup = new MouseEvent('mouseup', { clientX: 250, clientY: 230 });
    element.dispatchEvent(mouseup);

    const state = controller.getState();
    expect(state.panX).toBe(50);
    expect(state.panY).toBe(30);
  });

  it('should not pan on right-click', () => {
    controller = new PanZoomController();
    controller.attach(element);

    const mousedown = new MouseEvent('mousedown', { clientX: 200, clientY: 200, button: 2 });
    element.dispatchEvent(mousedown);

    const mousemove = new MouseEvent('mousemove', { clientX: 250, clientY: 230 });
    element.dispatchEvent(mousemove);

    const state = controller.getState();
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  it('should call onStateChange callback on zoom', () => {
    const onStateChange = vi.fn();
    controller = new PanZoomController({ onStateChange });

    controller.zoomIn();

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.closeTo(1.1) })
    );
  });

  it('should call onStateChange callback on pan', () => {
    const onStateChange = vi.fn();
    controller = new PanZoomController({ onStateChange });
    controller.attach(element);

    const mousedown = new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 });
    element.dispatchEvent(mousedown);

    const mousemove = new MouseEvent('mousemove', { clientX: 120, clientY: 110 });
    element.dispatchEvent(mousemove);

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ panX: 20, panY: 10 })
    );
  });

  it('should generate correct CSS transform string', () => {
    controller = new PanZoomController();
    controller.setZoom(1.5);

    // Pan manually via drag
    controller.attach(element);
    const mousedown = new MouseEvent('mousedown', { clientX: 0, clientY: 0, button: 0 });
    element.dispatchEvent(mousedown);
    const mousemove = new MouseEvent('mousemove', { clientX: 10, clientY: 20 });
    element.dispatchEvent(mousemove);
    const mouseup = new MouseEvent('mouseup', { clientX: 10, clientY: 20 });
    element.dispatchEvent(mouseup);

    const transform = controller.getTransform();
    expect(transform).toContain('translate(10px, 20px)');
    expect(transform).toContain('scale(1.5)');
  });

  it('should handle pinch gesture for zoom', () => {
    controller = new PanZoomController({ minZoom: 0.25, maxZoom: 4 });
    controller.attach(element);

    // Simulate two-finger touch start
    const touchStart = new TouchEvent('touchstart', {
      touches: [
        new Touch({ identifier: 0, target: element, clientX: 300, clientY: 300 }),
        new Touch({ identifier: 1, target: element, clientX: 400, clientY: 300 }),
      ],
    });
    element.dispatchEvent(touchStart);

    // Simulate pinch out (fingers move apart)
    const touchMove = new TouchEvent('touchmove', {
      touches: [
        new Touch({ identifier: 0, target: element, clientX: 250, clientY: 300 }),
        new Touch({ identifier: 1, target: element, clientX: 450, clientY: 300 }),
      ],
    });
    element.dispatchEvent(touchMove);

    // Zoom should have increased (fingers moved apart = zoom in)
    expect(controller.getState().zoom).toBeGreaterThan(1);
  });

  it('should pan via single touch drag', () => {
    controller = new PanZoomController();
    controller.attach(element);

    const touchStart = new TouchEvent('touchstart', {
      touches: [
        new Touch({ identifier: 0, target: element, clientX: 200, clientY: 200 }),
      ],
    });
    element.dispatchEvent(touchStart);

    const touchMove = new TouchEvent('touchmove', {
      touches: [
        new Touch({ identifier: 0, target: element, clientX: 230, clientY: 250 }),
      ],
    });
    element.dispatchEvent(touchMove);

    const state = controller.getState();
    expect(state.panX).toBe(30);
    expect(state.panY).toBe(50);
  });

  it('should detach and stop responding to events', () => {
    controller = new PanZoomController();
    controller.attach(element);
    controller.detach();

    const wheelUp = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
    });
    element.dispatchEvent(wheelUp);

    // Should still be at default since detached
    expect(controller.getState().zoom).toBe(1);
  });

  it('should zoom centered on cursor position', () => {
    controller = new PanZoomController({ zoomStep: 0.5 });
    controller.attach(element);

    // Directly test zoomAtPoint which is the underlying mechanism
    controller.zoomAtPoint(1.5, 400, 300);

    const state = controller.getState();
    // Zoom should increase
    expect(state.zoom).toBeCloseTo(1.5);
    // Pan should adjust to keep cursor point stable
    // panX = pointX - (pointX - panX) * zoomRatio = 400 - (400 - 0) * (1.5/1) = 400 - 600 = -200
    expect(state.panX).toBeCloseTo(-200);
    expect(state.panY).toBeCloseTo(-150);
  });
});
