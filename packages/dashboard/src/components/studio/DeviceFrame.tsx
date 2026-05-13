/**
 * ZionX App Development Studio — Device Frame Component
 *
 * Presentational component that renders device chrome (bezel, notch/dynamic island,
 * status bar, home indicator) around the preview content. Accepts a DeviceProfile
 * and renders the correct frame with accurate dimensions.
 *
 * Requirements: 42b.6, 42j.31
 */

import type { DeviceProfile } from '@seraphim/app/zionx/studio/device-profiles.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceFrameProps {
  deviceProfile: DeviceProfile;
  children: HTMLElement | string;
  scale?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BEZEL_PADDING = 12;
const FRAME_BORDER_WIDTH = 3;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function createStatusBar(profile: DeviceProfile): string {
  const height = profile.statusBarHeight;
  if (height <= 0) return '';

  return `
    <div class="device-frame__status-bar" style="
      height: ${height}px;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      box-sizing: border-box;
      font-size: 12px;
      font-weight: 600;
      color: #000;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 10;
      pointer-events: none;
    ">
      <span>9:41</span>
      <span style="display: flex; gap: 4px; align-items: center;">
        <span>&#9679;&#9679;&#9679;&#9679;</span>
        <span>&#128267;</span>
      </span>
    </div>
  `;
}

function createNotch(profile: DeviceProfile): string {
  const { notch } = profile;

  if (notch.type === 'none') return '';

  if (notch.type === 'dynamic-island') {
    const width = notch.width ?? 126;
    const height = notch.height ?? 37;
    return `
      <div class="device-frame__dynamic-island" style="
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        width: ${width}px;
        height: ${height}px;
        background: #000;
        border-radius: ${height / 2}px;
        z-index: 20;
        pointer-events: none;
      "></div>
    `;
  }

  if (notch.type === 'notch') {
    const width = notch.width ?? 32;
    const height = notch.height ?? 32;
    return `
      <div class="device-frame__notch" style="
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: ${width}px;
        height: ${height}px;
        background: #000;
        border-radius: 0 0 ${height / 2}px ${height / 2}px;
        z-index: 20;
        pointer-events: none;
      "></div>
    `;
  }

  return '';
}

function createHomeIndicator(profile: DeviceProfile): string {
  if (!profile.homeIndicator) return '';

  return `
    <div class="device-frame__home-indicator" style="
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      width: 134px;
      height: 5px;
      background: #000;
      border-radius: 3px;
      z-index: 20;
      pointer-events: none;
    "></div>
  `;
}

// ---------------------------------------------------------------------------
// Device Frame Renderer
// ---------------------------------------------------------------------------

/**
 * Renders a device frame as an HTML string that wraps the provided content.
 * Used by the PreviewRuntime to display the iframe inside an accurate device chrome.
 */
export function renderDeviceFrame(props: DeviceFrameProps): string {
  const { deviceProfile, children, scale = 1 } = props;

  const frameWidth = deviceProfile.screenWidth + BEZEL_PADDING * 2 + FRAME_BORDER_WIDTH * 2;
  const frameHeight = deviceProfile.screenHeight + BEZEL_PADDING * 2 + FRAME_BORDER_WIDTH * 2;

  const contentHtml = typeof children === 'string' ? children : '';

  return `
    <div class="device-frame" data-device-id="${deviceProfile.id}" style="
      width: ${frameWidth}px;
      height: ${frameHeight}px;
      transform: scale(${scale});
      transform-origin: top center;
      border: ${FRAME_BORDER_WIDTH}px solid #1a1a1a;
      border-radius: ${deviceProfile.cornerRadius + BEZEL_PADDING}px;
      background: #000;
      padding: ${BEZEL_PADDING}px;
      position: relative;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25),
                  0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      overflow: hidden;
    ">
      <div class="device-frame__screen" style="
        width: ${deviceProfile.screenWidth}px;
        height: ${deviceProfile.screenHeight}px;
        border-radius: ${deviceProfile.cornerRadius}px;
        overflow: hidden;
        position: relative;
        background: #fff;
      ">
        ${createStatusBar(deviceProfile)}
        ${createNotch(deviceProfile)}
        ${contentHtml}
        ${createHomeIndicator(deviceProfile)}
      </div>
    </div>
  `;
}

/**
 * Creates a DOM element for the device frame.
 * Useful for imperative DOM manipulation in the dashboard.
 */
export function createDeviceFrameElement(props: DeviceFrameProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderDeviceFrame(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Returns the computed dimensions of the device frame (including bezel).
 */
export function getFrameDimensions(profile: DeviceProfile): {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
} {
  return {
    width: profile.screenWidth + BEZEL_PADDING * 2 + FRAME_BORDER_WIDTH * 2,
    height: profile.screenHeight + BEZEL_PADDING * 2 + FRAME_BORDER_WIDTH * 2,
    innerWidth: profile.screenWidth,
    innerHeight: profile.screenHeight,
  };
}
