/**
 * ZionX App Development Studio — Device Profile Manager
 *
 * Defines device frame profiles used by the preview runtime to render apps
 * inside accurate device frames in the browser. Each profile includes physical
 * dimensions, scale factors, safe area insets, notch/dynamic island specs,
 * and status bar heights for pixel-perfect previews.
 *
 * Requirements: 42b.6, 42j.31
 */

// ---------------------------------------------------------------------------
// Device Profile Interface
// ---------------------------------------------------------------------------

export interface DeviceProfile {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  category: 'phone' | 'tablet';

  /** Physical screen width in logical points */
  screenWidth: number;
  /** Physical screen height in logical points */
  screenHeight: number;

  /** Display scale factor (e.g., 3x for iPhone 15 Pro Max) */
  scaleFactor: number;

  /** Safe area insets in logical points */
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };

  /** Status bar height in logical points */
  statusBarHeight: number;

  /** Notch or Dynamic Island specification */
  notch: {
    type: 'none' | 'notch' | 'dynamic-island';
    width?: number;
    height?: number;
  };

  /** Whether the device uses a home indicator (gesture-based navigation) */
  homeIndicator: boolean;

  /** Corner radius for the device frame in logical points */
  cornerRadius: number;

  /** Screenshot width in pixels (for store assets) */
  screenshotWidth: number;
  /** Screenshot height in pixels (for store assets) */
  screenshotHeight: number;
}

// ---------------------------------------------------------------------------
// Device Profile Definitions
// ---------------------------------------------------------------------------

export const IPHONE_15_PRO_MAX: DeviceProfile = {
  id: 'iphone-15-pro-max',
  name: 'iPhone 15 Pro Max',
  platform: 'ios',
  category: 'phone',
  screenWidth: 430,
  screenHeight: 932,
  scaleFactor: 3,
  safeAreaInsets: {
    top: 59,
    bottom: 34,
    left: 0,
    right: 0,
  },
  statusBarHeight: 59,
  notch: {
    type: 'dynamic-island',
    width: 126,
    height: 37,
  },
  homeIndicator: true,
  cornerRadius: 55,
  screenshotWidth: 1290,
  screenshotHeight: 2796,
};

export const IPHONE_SE: DeviceProfile = {
  id: 'iphone-se',
  name: 'iPhone SE (3rd gen)',
  platform: 'ios',
  category: 'phone',
  screenWidth: 375,
  screenHeight: 667,
  scaleFactor: 2,
  safeAreaInsets: {
    top: 20,
    bottom: 0,
    left: 0,
    right: 0,
  },
  statusBarHeight: 20,
  notch: {
    type: 'none',
  },
  homeIndicator: false,
  cornerRadius: 0,
  screenshotWidth: 750,
  screenshotHeight: 1334,
};

export const IPAD_PRO_12_9: DeviceProfile = {
  id: 'ipad-pro-12-9',
  name: 'iPad Pro 12.9"',
  platform: 'ios',
  category: 'tablet',
  screenWidth: 1024,
  screenHeight: 1366,
  scaleFactor: 2,
  safeAreaInsets: {
    top: 24,
    bottom: 20,
    left: 0,
    right: 0,
  },
  statusBarHeight: 24,
  notch: {
    type: 'none',
  },
  homeIndicator: false,
  cornerRadius: 18,
  screenshotWidth: 2048,
  screenshotHeight: 2732,
};

export const PIXEL_8: DeviceProfile = {
  id: 'pixel-8',
  name: 'Pixel 8',
  platform: 'android',
  category: 'phone',
  screenWidth: 412,
  screenHeight: 915,
  scaleFactor: 2.625,
  safeAreaInsets: {
    top: 24,
    bottom: 16,
    left: 0,
    right: 0,
  },
  statusBarHeight: 24,
  notch: {
    type: 'notch',
    width: 32,
    height: 32,
  },
  homeIndicator: true,
  cornerRadius: 42,
  screenshotWidth: 1080,
  screenshotHeight: 2400,
};

export const ANDROID_TABLET_10: DeviceProfile = {
  id: 'android-tablet-10',
  name: 'Android Tablet 10"',
  platform: 'android',
  category: 'tablet',
  screenWidth: 800,
  screenHeight: 1280,
  scaleFactor: 1.5,
  safeAreaInsets: {
    top: 24,
    bottom: 0,
    left: 0,
    right: 0,
  },
  statusBarHeight: 24,
  notch: {
    type: 'none',
  },
  homeIndicator: false,
  cornerRadius: 12,
  screenshotWidth: 1200,
  screenshotHeight: 1920,
};

// ---------------------------------------------------------------------------
// Profile Registry
// ---------------------------------------------------------------------------

const ALL_PROFILES: DeviceProfile[] = [
  IPHONE_15_PRO_MAX,
  IPHONE_SE,
  IPAD_PRO_12_9,
  PIXEL_8,
  ANDROID_TABLET_10,
];

const PROFILE_MAP: Map<string, DeviceProfile> = new Map(
  ALL_PROFILES.map((profile) => [profile.id, profile]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve a device profile by its unique id.
 * Returns undefined if no profile matches the given id.
 */
export function getDeviceProfile(id: string): DeviceProfile | undefined {
  return PROFILE_MAP.get(id);
}

/**
 * List all available device profiles.
 */
export function listDeviceProfiles(): DeviceProfile[] {
  return [...ALL_PROFILES];
}

/**
 * Filter device profiles by platform.
 */
export function getDeviceProfilesByPlatform(
  platform: 'ios' | 'android',
): DeviceProfile[] {
  return ALL_PROFILES.filter((profile) => profile.platform === platform);
}

/**
 * Returns the default device profile used for initial preview rendering.
 * Defaults to iPhone 15 Pro Max as the primary development target.
 */
export function getDefaultProfile(): DeviceProfile {
  return IPHONE_15_PRO_MAX;
}
