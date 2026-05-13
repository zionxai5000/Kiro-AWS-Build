/**
 * Unit tests for ZXMG Video Development Studio — UGC/Ad Creative Builder
 *
 * Validates: Requirements 44d.21, 44d.22, 44d.23, 44d.24
 *
 * Tests UGC generation, ad creative generation with hook→value→CTA structure,
 * avatar creation, avatar-based video generation, and avatar listing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultUGCBuilder,
  type UGCBuilder,
  type VideoGenerator,
  type AvatarStore,
  type AIAvatar,
} from '../ugc-builder.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockVideoGenerator(): VideoGenerator {
  return {
    generateVideo: vi.fn().mockResolvedValue({
      videoUrl: 'https://cdn.example.com/video-001.mp4',
      format: 'mp4',
      duration: 60,
    }),
  };
}

function createMockAvatarStore(): AvatarStore {
  const avatars = new Map<string, AIAvatar>();
  return {
    save: vi.fn(async (avatar: AIAvatar) => {
      avatars.set(avatar.id, avatar);
    }),
    get: vi.fn(async (avatarId: string) => avatars.get(avatarId) ?? null),
    list: vi.fn(async () => Array.from(avatars.values())),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultUGCBuilder', () => {
  let builder: UGCBuilder;
  let videoGenerator: ReturnType<typeof createMockVideoGenerator>;
  let avatarStore: ReturnType<typeof createMockAvatarStore>;

  beforeEach(() => {
    videoGenerator = createMockVideoGenerator();
    avatarStore = createMockAvatarStore();
    builder = new DefaultUGCBuilder(videoGenerator, avatarStore);
  });

  // -------------------------------------------------------------------------
  // UGC Generation
  // -------------------------------------------------------------------------

  describe('generateUGC', () => {
    it('generates a UGC creative with correct type and style', async () => {
      const creative = await builder.generateUGC('ch-1', 'AI tools review', 'casual-vlog');

      expect(creative.id).toBeTruthy();
      expect(creative.type).toBe('ugc');
      expect(creative.videoUrl).toBe('https://cdn.example.com/video-001.mp4');
      expect(creative.format).toBe('mp4');
      expect(creative.duration).toBe(60);
      expect(creative.style).toBe('casual-vlog');
    });

    it('calls video generator with UGC type and style', async () => {
      await builder.generateUGC('ch-1', 'productivity tips', 'talking-head');

      expect(videoGenerator.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ugc',
          style: 'talking-head',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Ad Creative Generation
  // -------------------------------------------------------------------------

  describe('generateAdCreative', () => {
    it('generates an ad creative with hook→value→CTA structure', async () => {
      const creative = await builder.generateAdCreative(
        'ch-1',
        'Stop scrolling!',
        'This tool saves 3 hours daily',
        'Try it free today',
      );

      expect(creative.id).toBeTruthy();
      expect(creative.type).toBe('ad');
      expect(creative.videoUrl).toBe('https://cdn.example.com/video-001.mp4');
      expect(creative.format).toBe('mp4');
      expect(creative.style).toBe('ad-creative');
    });

    it('passes hook, value, and CTA in the script to video generator', async () => {
      await builder.generateAdCreative(
        'ch-1',
        'Did you know?',
        'AI can write your scripts',
        'Click the link below',
      );

      expect(videoGenerator.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ad',
          style: 'ad-creative',
          script: expect.stringContaining('Did you know?'),
        }),
      );

      const call = (videoGenerator.generateVideo as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.script).toContain('AI can write your scripts');
      expect(call.script).toContain('Click the link below');
    });
  });

  // -------------------------------------------------------------------------
  // Avatar Management
  // -------------------------------------------------------------------------

  describe('createAvatar', () => {
    it('creates an avatar with name, appearance, and voice profile', async () => {
      const avatar = await builder.createAvatar(
        'Alex',
        'young-professional-male',
        'warm-baritone',
      );

      expect(avatar.id).toBeTruthy();
      expect(avatar.name).toBe('Alex');
      expect(avatar.appearance).toBe('young-professional-male');
      expect(avatar.voiceProfile).toBe('warm-baritone');
    });

    it('persists avatar to store', async () => {
      const avatar = await builder.createAvatar('Sam', 'casual-female', 'energetic-alto');

      expect(avatarStore.save).toHaveBeenCalledWith(avatar);
    });
  });

  describe('generateWithAvatar', () => {
    it('generates a video using an existing avatar', async () => {
      const avatar = await builder.createAvatar(
        'Jordan',
        'tech-presenter',
        'clear-tenor',
      );

      const creative = await builder.generateWithAvatar(avatar.id, 'Welcome to the show!');

      expect(creative.id).toBeTruthy();
      expect(creative.type).toBe('avatar');
      expect(creative.videoUrl).toBe('https://cdn.example.com/video-001.mp4');
      expect(creative.style).toBe('tech-presenter');
    });

    it('passes avatar ID and script to video generator', async () => {
      const avatar = await builder.createAvatar('Pat', 'news-anchor', 'authoritative');

      await builder.generateWithAvatar(avatar.id, 'Breaking news today');

      expect(videoGenerator.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'avatar',
          avatarId: avatar.id,
          script: 'Breaking news today',
        }),
      );
    });

    it('throws error when avatar not found', async () => {
      await expect(
        builder.generateWithAvatar('nonexistent-id', 'Hello world'),
      ).rejects.toThrow('Avatar not found: nonexistent-id');
    });
  });

  describe('listAvatars', () => {
    it('returns all created avatars', async () => {
      await builder.createAvatar('Avatar1', 'style-a', 'voice-a');
      await builder.createAvatar('Avatar2', 'style-b', 'voice-b');

      const avatars = await builder.listAvatars();

      expect(avatars.length).toBe(2);
      expect(avatars.map((a) => a.name)).toContain('Avatar1');
      expect(avatars.map((a) => a.name)).toContain('Avatar2');
    });

    it('returns empty array when no avatars exist', async () => {
      const avatars = await builder.listAvatars();

      expect(avatars).toEqual([]);
    });
  });
});
