/**
 * ZionX App Development Studio — Device Selector Component
 *
 * Device selector dropdown for switching between preview device profiles.
 * Renders device name, platform icon, and dimensions. Emits selection change events.
 *
 * Requirements: 42b.4, 42b.5, 42b.6
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DevicePlatform = 'ios' | 'android';

export interface DeviceOption {
  id: string;
  name: string;
  platform: DevicePlatform;
  width: number;
  height: number;
}

export interface DeviceSelectorProps {
  devices: DeviceOption[];
  selectedDeviceId: string;
  onDeviceChange?: (deviceId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_ICONS: Record<DevicePlatform, string> = {
  ios: '🍎',
  android: '🤖',
};

export const DEFAULT_DEVICES: DeviceOption[] = [
  { id: 'iphone-15', name: 'iPhone 15', platform: 'ios', width: 393, height: 852 },
  { id: 'iphone-se', name: 'iPhone SE', platform: 'ios', width: 375, height: 667 },
  { id: 'ipad', name: 'iPad', platform: 'ios', width: 820, height: 1180 },
  { id: 'pixel-8', name: 'Pixel 8', platform: 'android', width: 412, height: 932 },
  { id: 'android-tablet', name: 'Android Tablet', platform: 'android', width: 800, height: 1280 },
];

// ---------------------------------------------------------------------------
// Render Functions
// ---------------------------------------------------------------------------

function renderDeviceOption(device: DeviceOption, isSelected: boolean): string {
  return `
    <option
      value="${device.id}"
      ${isSelected ? 'selected' : ''}
    >
      ${PLATFORM_ICONS[device.platform]} ${device.name} (${device.width}×${device.height})
    </option>
  `;
}

/**
 * Renders the device selector dropdown as an HTML string.
 */
export function renderDeviceSelector(props: DeviceSelectorProps): string {
  const options = props.devices
    .map((device) => renderDeviceOption(device, device.id === props.selectedDeviceId))
    .join('');

  const selectedDevice = props.devices.find((d) => d.id === props.selectedDeviceId);
  const platformLabel = selectedDevice
    ? `${PLATFORM_ICONS[selectedDevice.platform]} ${selectedDevice.platform.toUpperCase()}`
    : '';

  return `
    <div class="studio-device-selector">
      <label class="studio-device-selector__label">
        <span class="studio-device-selector__platform">${platformLabel}</span>
        <select class="studio-device-selector__select" data-device-selector>
          ${options}
        </select>
      </label>
      ${selectedDevice ? `<span class="studio-device-selector__dimensions">${selectedDevice.width} × ${selectedDevice.height}</span>` : ''}
    </div>
  `;
}

/**
 * Creates a DOM element for the device selector.
 */
export function createDeviceSelectorElement(props: DeviceSelectorProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderDeviceSelector(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Attaches the change event listener to the device selector dropdown.
 */
export function attachDeviceSelectorListener(
  root: HTMLElement,
  onDeviceChange: (deviceId: string) => void,
): void {
  const select = root.querySelector<HTMLSelectElement>('[data-device-selector]');
  if (select) {
    select.addEventListener('change', () => {
      onDeviceChange(select.value);
    });
  }
}
