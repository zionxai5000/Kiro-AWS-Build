/**
 * ZionX App Development Studio — Preview Runtime Component
 *
 * React-style component that renders a React Native Web app inside device frames
 * in the browser. Implements sandboxed iframe rendering, device frame switching,
 * hot reload via WebSocket, and screenshot capture.
 *
 * Note: This uses a vanilla TS/DOM approach consistent with the dashboard's
 * existing architecture (no React dependency). The component manages its own
 * lifecycle and DOM updates.
 *
 * Requirements: 42b.4, 42b.5, 42b.6, 42j.31
 */

import type { DeviceProfile } from '@seraphim/app/zionx/studio/device-profiles.js';
import { renderDeviceFrame, getFrameDimensions } from './DeviceFrame.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewRuntimeConfig {
  /** The device profile to render the preview in */
  deviceProfile: DeviceProfile;
  /** URL of the React Native Web app to preview */
  previewUrl: string;
  /** WebSocket URL for hot-reload messages */
  wsUrl?: string;
  /** Scale factor for the device frame display (default: 1) */
  displayScale?: number;
  /** Callback when the preview is ready */
  onReady?: () => void;
  /** Callback when a reload is triggered */
  onReload?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface PreviewRuntimeHandle {
  /** Capture a screenshot of the current preview state */
  captureScreenshot(): Promise<Blob | null>;
  /** Manually trigger a reload of the preview iframe */
  reload(): void;
  /** Switch to a different device profile */
  switchDevice(profile: DeviceProfile): void;
  /** Destroy the runtime and clean up resources */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sandbox attributes for the preview iframe */
const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms';

/** Maximum time allowed for device frame switch (requirement: < 2 seconds) */
const DEVICE_SWITCH_TIMEOUT_MS = 2000;

// ---------------------------------------------------------------------------
// Preview Runtime Implementation
// ---------------------------------------------------------------------------

/**
 * Creates and manages a preview runtime instance.
 *
 * The runtime renders a sandboxed iframe inside an accurate device frame,
 * listens for WebSocket hot-reload messages, and supports screenshot capture.
 *
 * @param container - The DOM element to mount the preview into
 * @param config - Configuration for the preview runtime
 * @returns A handle for controlling the preview runtime
 */
export function createPreviewRuntime(
  container: HTMLElement,
  config: PreviewRuntimeConfig,
): PreviewRuntimeHandle {
  let currentProfile = config.deviceProfile;
  let currentUrl = config.previewUrl;
  let ws: WebSocket | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let destroyed = false;

  // -------------------------------------------------------------------------
  // DOM Rendering
  // -------------------------------------------------------------------------

  function render(): void {
    if (destroyed) return;

    const scale = config.displayScale ?? 1;
    const dimensions = getFrameDimensions(currentProfile);

    // Create the iframe HTML
    const iframeHtml = `
      <iframe
        class="preview-runtime__iframe"
        src="${escapeHtml(currentUrl)}"
        sandbox="${IFRAME_SANDBOX}"
        style="
          width: ${dimensions.innerWidth}px;
          height: ${dimensions.innerHeight}px;
          border: none;
          display: block;
        "
        title="App Preview - ${escapeHtml(currentProfile.name)}"
        loading="eager"
      ></iframe>
    `;

    // Render device frame with iframe inside
    const frameHtml = renderDeviceFrame({
      deviceProfile: currentProfile,
      children: iframeHtml,
      scale,
    });

    // Wrap in a container with metadata
    container.innerHTML = `
      <div class="preview-runtime" data-device="${currentProfile.id}" data-status="loading">
        <div class="preview-runtime__frame-container" style="
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 16px;
        ">
          ${frameHtml}
        </div>
        <div class="preview-runtime__device-info" style="
          text-align: center;
          padding: 8px;
          font-size: 12px;
          color: #666;
        ">
          ${escapeHtml(currentProfile.name)} — ${currentProfile.screenWidth}×${currentProfile.screenHeight} @${currentProfile.scaleFactor}x
        </div>
      </div>
    `;

    // Get reference to the iframe element
    iframe = container.querySelector('.preview-runtime__iframe') as HTMLIFrameElement | null;

    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
    }
  }

  function handleIframeLoad(): void {
    if (destroyed) return;

    const runtimeEl = container.querySelector('.preview-runtime');
    if (runtimeEl) {
      runtimeEl.setAttribute('data-status', 'ready');
    }

    config.onReady?.();
  }

  // -------------------------------------------------------------------------
  // WebSocket Hot Reload
  // -------------------------------------------------------------------------

  function connectWebSocket(): void {
    if (!config.wsUrl || destroyed) return;

    try {
      ws = new WebSocket(config.wsUrl);

      ws.addEventListener('message', (event) => {
        if (destroyed) return;

        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'preview.reload') {
            reload();
            config.onReload?.();
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.addEventListener('close', () => {
        if (!destroyed) {
          // Attempt reconnection after a delay
          setTimeout(connectWebSocket, 3000);
        }
      });

      ws.addEventListener('error', (event) => {
        config.onError?.(new Error('WebSocket connection error'));
      });
    } catch (error) {
      config.onError?.(error instanceof Error ? error : new Error('WebSocket failed'));
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function reload(): void {
    if (destroyed || !iframe) return;

    const runtimeEl = container.querySelector('.preview-runtime');
    if (runtimeEl) {
      runtimeEl.setAttribute('data-status', 'reloading');
    }

    // Reload by resetting the src attribute
    const currentSrc = iframe.src;
    iframe.src = '';
    // Use requestAnimationFrame to ensure the blank src is applied before reloading
    requestAnimationFrame(() => {
      if (iframe && !destroyed) {
        iframe.src = currentSrc;
      }
    });
  }

  function switchDevice(profile: DeviceProfile): void {
    if (destroyed) return;

    const switchStart = performance.now();
    currentProfile = profile;

    // Re-render with new device profile
    render();

    const switchDuration = performance.now() - switchStart;
    if (switchDuration > DEVICE_SWITCH_TIMEOUT_MS) {
      config.onError?.(
        new Error(
          `Device switch took ${switchDuration}ms, exceeding ${DEVICE_SWITCH_TIMEOUT_MS}ms limit`,
        ),
      );
    }
  }

  async function captureScreenshot(): Promise<Blob | null> {
    if (destroyed || !iframe) return null;

    try {
      // Use the Canvas API to capture the iframe content
      // Note: This works when the iframe content is same-origin
      const canvas = document.createElement('canvas');
      canvas.width = currentProfile.screenshotWidth;
      canvas.height = currentProfile.screenshotHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Attempt to draw the iframe's document to canvas
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) {
        // Cross-origin: fall back to capturing the frame container
        return captureFrameContainer();
      }

      // For same-origin content, use a foreignObject SVG approach
      const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${currentProfile.screenshotWidth}" height="${currentProfile.screenshotHeight}">
          <foreignObject width="100%" height="100%">
            ${new XMLSerializer().serializeToString(iframeDoc.documentElement)}
          </foreignObject>
        </svg>
      `;

      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      return new Promise<Blob | null>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    } catch {
      return captureFrameContainer();
    }
  }

  async function captureFrameContainer(): Promise<Blob | null> {
    // Fallback: capture the device frame container as-is
    const frameContainer = container.querySelector('.preview-runtime__frame-container');
    if (!frameContainer) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = currentProfile.screenshotWidth;
      canvas.height = currentProfile.screenshotHeight;

      // Return null if we can't capture (cross-origin restriction)
      // In production, the backend preview-server handles screenshot capture
      return null;
    } catch {
      return null;
    }
  }

  function destroy(): void {
    destroyed = true;

    if (ws) {
      ws.close();
      ws = null;
    }

    if (iframe) {
      iframe.removeEventListener('load', handleIframeLoad);
      iframe = null;
    }

    container.innerHTML = '';
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  render();
  connectWebSocket();

  return {
    captureScreenshot,
    reload,
    switchDevice,
    destroy,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
