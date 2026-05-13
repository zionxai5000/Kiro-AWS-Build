/**
 * Unit tests for ZionX App Development Studio — Device Profile Manager
 *
 * Validates: Requirements 42b.6, 42j.31
 *
 * Tests device profile definitions, lookup functions, platform filtering,
 * and dimensional accuracy (screenshot dimensions match scale × screen).
 */

import { describe, it, expect } from 'vitest';
import {
  getDeviceProfile,
  listDeviceProfiles,
  getDeviceProfilesByPlatform,
  getDefaultProfile,
  IPHONE_15_PRO_MAX,
  IPHONE_SE,
  IPAD_PRO_12_9,
  PIXEL_8,
  ANDROID_TABLET_10,
  type DeviceProfile,
} from '../device-profiles.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertValidDimensions(profile: DeviceProfile): void {
  expect(profile.screenWidth).toBeGreaterThan(0);
  expect(profile.screenHeight).toBeGreaterThan(0);
  expect(profile.scaleFactor).toBeGreaterThan(0);
  expect(profile.screenshotWidth).toBeGreaterThan(0);
  expect(profile.screenshotHeight).toBeGreaterThan(0);
  expect(profile.statusBarHeight).toBeGreaterThanOrEqual(0);
  expect(profile.cornerRadius).toBeGreaterThanOrEqual(0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Device Profile Manager', () => {
  describe('profile definitions', () => {
    it('all profiles have valid positive dimensions', () => {
      const profiles = listDeviceProfiles();
      for (const profile of profiles) {
        assertValidDimensions(profile);
      }
    });

    it('all profiles have required fields', () => {
      const profiles = listDeviceProfiles();
      for (const profile of profiles) {
        expect(profile.id).toBeTruthy();
        expect(profile.name).toBeTruthy();
        expect(['ios', 'android']).toContain(profile.platform);
        expect(['phone', 'tablet']).toContain(profile.category);
        expect(['none', 'notch', 'dynamic-island']).toContain(profile.notch.type);
        expect(typeof profile.homeIndicator).toBe('boolean');
        expect(profile.safeAreaInsets).toBeDefined();
        expect(typeof profile.safeAreaInsets.top).toBe('number');
        expect(typeof profile.safeAreaInsets.bottom).toBe('number');
        expect(typeof profile.safeAreaInsets.left).toBe('number');
        expect(typeof profile.safeAreaInsets.right).toBe('number');
      }
    });

    it('screenshot dimensions match scaleFactor × screen dimensions', () => {
      const profiles = listDeviceProfiles();
      for (const profile of profiles) {
        const expectedWidth = Math.round(profile.screenWidth * profile.scaleFactor);
        const expectedHeight = Math.round(profile.screenHeight * profile.scaleFactor);

        // Allow ±2px tolerance for non-integer scale factors (Android density rounding)
        expect(Math.abs(profile.screenshotWidth - expectedWidth)).toBeLessThanOrEqual(2);
        expect(Math.abs(profile.screenshotHeight - expectedHeight)).toBeLessThanOrEqual(2);
      }
    });

    it('all profiles have unique ids', () => {
      const profiles = listDeviceProfiles();
      const ids = profiles.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getDeviceProfile', () => {
    it('returns correct profile by id', () => {
      const profile = getDeviceProfile('iphone-15-pro-max');
      expect(profile).toBeDefined();
      expect(profile!.name).toBe('iPhone 15 Pro Max');
      expect(profile!.platform).toBe('ios');
    });

    it('returns iPhone SE profile by id', () => {
      const profile = getDeviceProfile('iphone-se');
      expect(profile).toBeDefined();
      expect(profile!.name).toBe('iPhone SE (3rd gen)');
      expect(profile!.scaleFactor).toBe(2);
    });

    it('returns iPad Pro profile by id', () => {
      const profile = getDeviceProfile('ipad-pro-12-9');
      expect(profile).toBeDefined();
      expect(profile!.category).toBe('tablet');
    });

    it('returns Pixel 8 profile by id', () => {
      const profile = getDeviceProfile('pixel-8');
      expect(profile).toBeDefined();
      expect(profile!.platform).toBe('android');
      expect(profile!.scaleFactor).toBe(2.625);
    });

    it('returns Android Tablet profile by id', () => {
      const profile = getDeviceProfile('android-tablet-10');
      expect(profile).toBeDefined();
      expect(profile!.category).toBe('tablet');
      expect(profile!.platform).toBe('android');
    });

    it('returns undefined for non-existent id', () => {
      const profile = getDeviceProfile('non-existent-device');
      expect(profile).toBeUndefined();
    });
  });

  describe('listDeviceProfiles', () => {
    it('returns all 5 profiles', () => {
      const profiles = listDeviceProfiles();
      expect(profiles).toHaveLength(5);
    });

    it('returns a new array (not the internal reference)', () => {
      const profiles1 = listDeviceProfiles();
      const profiles2 = listDeviceProfiles();
      expect(profiles1).not.toBe(profiles2);
      expect(profiles1).toEqual(profiles2);
    });
  });

  describe('getDeviceProfilesByPlatform', () => {
    it('returns iOS profiles only', () => {
      const iosProfiles = getDeviceProfilesByPlatform('ios');
      expect(iosProfiles).toHaveLength(3);
      for (const profile of iosProfiles) {
        expect(profile.platform).toBe('ios');
      }
    });

    it('returns Android profiles only', () => {
      const androidProfiles = getDeviceProfilesByPlatform('android');
      expect(androidProfiles).toHaveLength(2);
      for (const profile of androidProfiles) {
        expect(profile.platform).toBe('android');
      }
    });

    it('iOS profiles include iPhone 15 Pro Max, iPhone SE, and iPad Pro', () => {
      const iosProfiles = getDeviceProfilesByPlatform('ios');
      const ids = iosProfiles.map((p) => p.id);
      expect(ids).toContain('iphone-15-pro-max');
      expect(ids).toContain('iphone-se');
      expect(ids).toContain('ipad-pro-12-9');
    });

    it('Android profiles include Pixel 8 and Android Tablet', () => {
      const androidProfiles = getDeviceProfilesByPlatform('android');
      const ids = androidProfiles.map((p) => p.id);
      expect(ids).toContain('pixel-8');
      expect(ids).toContain('android-tablet-10');
    });
  });

  describe('getDefaultProfile', () => {
    it('returns iPhone 15 Pro Max as the default', () => {
      const defaultProfile = getDefaultProfile();
      expect(defaultProfile.id).toBe('iphone-15-pro-max');
      expect(defaultProfile.name).toBe('iPhone 15 Pro Max');
    });

    it('default profile has dynamic island', () => {
      const defaultProfile = getDefaultProfile();
      expect(defaultProfile.notch.type).toBe('dynamic-island');
    });

    it('default profile matches the IPHONE_15_PRO_MAX constant', () => {
      const defaultProfile = getDefaultProfile();
      expect(defaultProfile).toEqual(IPHONE_15_PRO_MAX);
    });
  });

  describe('named constants', () => {
    it('IPHONE_15_PRO_MAX has correct specs', () => {
      expect(IPHONE_15_PRO_MAX.screenWidth).toBe(430);
      expect(IPHONE_15_PRO_MAX.screenHeight).toBe(932);
      expect(IPHONE_15_PRO_MAX.scaleFactor).toBe(3);
      expect(IPHONE_15_PRO_MAX.safeAreaInsets.top).toBe(59);
      expect(IPHONE_15_PRO_MAX.safeAreaInsets.bottom).toBe(34);
      expect(IPHONE_15_PRO_MAX.homeIndicator).toBe(true);
    });

    it('IPHONE_SE has correct specs', () => {
      expect(IPHONE_SE.screenWidth).toBe(375);
      expect(IPHONE_SE.screenHeight).toBe(667);
      expect(IPHONE_SE.scaleFactor).toBe(2);
      expect(IPHONE_SE.statusBarHeight).toBe(20);
      expect(IPHONE_SE.homeIndicator).toBe(false);
      expect(IPHONE_SE.notch.type).toBe('none');
    });

    it('IPAD_PRO_12_9 has correct specs', () => {
      expect(IPAD_PRO_12_9.screenWidth).toBe(1024);
      expect(IPAD_PRO_12_9.screenHeight).toBe(1366);
      expect(IPAD_PRO_12_9.scaleFactor).toBe(2);
      expect(IPAD_PRO_12_9.statusBarHeight).toBe(24);
      expect(IPAD_PRO_12_9.homeIndicator).toBe(false);
    });

    it('PIXEL_8 has correct specs', () => {
      expect(PIXEL_8.screenWidth).toBe(412);
      expect(PIXEL_8.screenHeight).toBe(915);
      expect(PIXEL_8.scaleFactor).toBe(2.625);
      expect(PIXEL_8.statusBarHeight).toBe(24);
      expect(PIXEL_8.homeIndicator).toBe(true);
    });

    it('ANDROID_TABLET_10 has correct specs', () => {
      expect(ANDROID_TABLET_10.screenWidth).toBe(800);
      expect(ANDROID_TABLET_10.screenHeight).toBe(1280);
      expect(ANDROID_TABLET_10.scaleFactor).toBe(1.5);
      expect(ANDROID_TABLET_10.statusBarHeight).toBe(24);
      expect(ANDROID_TABLET_10.homeIndicator).toBe(false);
    });
  });
});
