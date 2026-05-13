/**
 * Shaar Dashboard — Pan/Zoom Controller
 *
 * Manages transform state (zoom level, pan offset) and handles all input
 * events for the Diagram Modal: mouse wheel zoom (centered on cursor),
 * pinch-to-zoom gesture, click-and-drag pan, touch-and-drag pan, and
 * zoom +/- button controls.
 *
 * Requirements: 47d.14, 47d.15, 47d.17, 47d.18
 */

export interface PanZoomState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PanZoomOptions {
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
  onStateChange?: (state: PanZoomState) => void;
}

const DEFAULT_OPTIONS: PanZoomOptions = {
  minZoom: 0.25,
  maxZoom: 4,
  zoomStep: 0.1,
};

export class PanZoomController {
  private state: PanZoomState = { zoom: 1, panX: 0, panY: 0 };
  private options: PanZoomOptions;
  private element: HTMLElement | null = null;

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  // Pinch state
  private lastPinchDistance = 0;

  // Bound handlers for cleanup
  private boundHandleWheel: (e: WheelEvent) => void;
  private boundHandleMouseDown: (e: MouseEvent) => void;
  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleMouseUp: (e: MouseEvent) => void;
  private boundHandleTouchStart: (e: TouchEvent) => void;
  private boundHandleTouchMove: (e: TouchEvent) => void;
  private boundHandleTouchEnd: (e: TouchEvent) => void;

  constructor(options?: Partial<PanZoomOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.boundHandleWheel = this.handleWheel.bind(this);
    this.boundHandleMouseDown = this.handleMouseDown.bind(this);
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleMouseUp = this.handleMouseUp.bind(this);
    this.boundHandleTouchStart = this.handleTouchStart.bind(this);
    this.boundHandleTouchMove = this.handleTouchMove.bind(this);
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
  }

  /**
   * Attach the controller to a DOM element, registering all event listeners.
   */
  attach(element: HTMLElement): void {
    this.element = element;

    element.addEventListener('wheel', this.boundHandleWheel, { passive: false });
    element.addEventListener('mousedown', this.boundHandleMouseDown);
    element.addEventListener('mousemove', this.boundHandleMouseMove);
    element.addEventListener('mouseup', this.boundHandleMouseUp);
    element.addEventListener('mouseleave', this.boundHandleMouseUp);
    element.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
    element.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
    element.addEventListener('touchend', this.boundHandleTouchEnd);
  }

  /**
   * Detach the controller from the DOM element, removing all event listeners.
   */
  detach(): void {
    if (!this.element) return;

    this.element.removeEventListener('wheel', this.boundHandleWheel);
    this.element.removeEventListener('mousedown', this.boundHandleMouseDown);
    this.element.removeEventListener('mousemove', this.boundHandleMouseMove);
    this.element.removeEventListener('mouseup', this.boundHandleMouseUp);
    this.element.removeEventListener('mouseleave', this.boundHandleMouseUp);
    this.element.removeEventListener('touchstart', this.boundHandleTouchStart);
    this.element.removeEventListener('touchmove', this.boundHandleTouchMove);
    this.element.removeEventListener('touchend', this.boundHandleTouchEnd);

    this.element = null;
  }

  /**
   * Get the current pan/zoom state.
   */
  getState(): PanZoomState {
    return { ...this.state };
  }

  /**
   * Get the current zoom level as a percentage (e.g. 100 for 1x).
   */
  getZoomPercentage(): number {
    return Math.round(this.state.zoom * 100);
  }

  /**
   * Zoom in by one step.
   */
  zoomIn(): void {
    this.setZoom(this.state.zoom + this.options.zoomStep);
  }

  /**
   * Zoom out by one step.
   */
  zoomOut(): void {
    this.setZoom(this.state.zoom - this.options.zoomStep);
  }

  /**
   * Reset zoom and pan to defaults.
   */
  reset(): void {
    this.state = { zoom: 1, panX: 0, panY: 0 };
    this.notifyStateChange();
  }

  /**
   * Set zoom level, clamped to min/max bounds.
   */
  setZoom(zoom: number): void {
    this.state.zoom = this.clampZoom(zoom);
    this.notifyStateChange();
  }

  /**
   * Zoom centered on a specific point (e.g. cursor position).
   */
  zoomAtPoint(newZoom: number, pointX: number, pointY: number): void {
    const clampedZoom = this.clampZoom(newZoom);
    const zoomRatio = clampedZoom / this.state.zoom;

    // Adjust pan so the point stays in the same position after zoom
    this.state.panX = pointX - (pointX - this.state.panX) * zoomRatio;
    this.state.panY = pointY - (pointY - this.state.panY) * zoomRatio;
    this.state.zoom = clampedZoom;

    this.notifyStateChange();
  }

  /**
   * Get the CSS transform string for the current state.
   */
  getTransform(): string {
    return `translate(${this.state.panX}px, ${this.state.panY}px) scale(${this.state.zoom})`;
  }

  // --- Private event handlers ---

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    const rect = this.element!.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? -this.options.zoomStep : this.options.zoomStep;
    const newZoom = this.state.zoom + delta;

    this.zoomAtPoint(newZoom, cursorX, cursorY);
  }

  private handleMouseDown(e: MouseEvent): void {
    // Only left button
    if (e.button !== 0) return;

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.panStartX = this.state.panX;
    this.panStartY = this.state.panY;

    if (this.element) {
      this.element.style.cursor = 'grabbing';
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    this.state.panX = this.panStartX + dx;
    this.state.panY = this.panStartY + dy;

    this.notifyStateChange();
  }

  private handleMouseUp(_e: MouseEvent): void {
    if (!this.isDragging) return;

    this.isDragging = false;

    if (this.element) {
      this.element.style.cursor = 'grab';
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      // Single touch: pan
      this.isDragging = true;
      this.dragStartX = e.touches[0].clientX;
      this.dragStartY = e.touches[0].clientY;
      this.panStartX = this.state.panX;
      this.panStartY = this.state.panY;
    } else if (e.touches.length === 2) {
      // Two touches: pinch zoom
      e.preventDefault();
      this.isDragging = false;
      this.lastPinchDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1 && this.isDragging) {
      // Single touch: pan
      const dx = e.touches[0].clientX - this.dragStartX;
      const dy = e.touches[0].clientY - this.dragStartY;

      this.state.panX = this.panStartX + dx;
      this.state.panY = this.panStartY + dy;

      this.notifyStateChange();
    } else if (e.touches.length === 2) {
      // Two touches: pinch zoom
      e.preventDefault();
      const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);

      if (this.lastPinchDistance > 0) {
        const scale = currentDistance / this.lastPinchDistance;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        const rect = this.element!.getBoundingClientRect();
        const pointX = midX - rect.left;
        const pointY = midY - rect.top;

        this.zoomAtPoint(this.state.zoom * scale, pointX, pointY);
      }

      this.lastPinchDistance = currentDistance;
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) {
      this.lastPinchDistance = 0;
    }
    if (e.touches.length === 0) {
      this.isDragging = false;
    }
  }

  // --- Utilities ---

  private clampZoom(zoom: number): number {
    return Math.min(this.options.maxZoom, Math.max(this.options.minZoom, zoom));
  }

  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private notifyStateChange(): void {
    if (this.options.onStateChange) {
      this.options.onStateChange(this.getState());
    }
  }
}
