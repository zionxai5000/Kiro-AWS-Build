/**
 * Unit tests for ZXMG Video Development Studio — Timeline Editor
 *
 * Validates: Requirements 44c.17, 44c.18, 44c.19, 44c.20, 44c.21, 44c.22
 *
 * Tests load timeline, reorder scenes, trim scenes, replace scenes,
 * add/remove audio tracks, set transitions, set color grades, and
 * export formats (16:9, 9:16, 1:1).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultVideoTimelineEditor,
  type VideoTimelineEditor,
  type TimelineEventBus,
  type TimelineScene,
  type AudioTrack,
} from '../timeline-editor.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockEventBus(): TimelineEventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createScenes(count: number = 4): TimelineScene[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `scene-${i + 1}`,
    order: i,
    clipUrl: `https://cdn.example.com/scene-${i + 1}.mp4`,
    startTime: 0, // will be computed by loadTimeline
    duration: 10 + i * 5, // 10, 15, 20, 25
    transition: (['cut', 'fade', 'dissolve', 'wipe'] as const)[i % 4],
  }));
}

function createAudioTracks(): AudioTrack[] {
  return [
    {
      id: 'track-music',
      type: 'music',
      url: 'https://cdn.example.com/music.mp3',
      startTime: 0,
      duration: 70,
      volume: 0.6,
    },
    {
      id: 'track-voiceover',
      type: 'voiceover',
      url: 'https://cdn.example.com/voiceover.mp3',
      startTime: 5,
      duration: 60,
      volume: 1.0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultVideoTimelineEditor', () => {
  let editor: VideoTimelineEditor;
  let eventBus: ReturnType<typeof createMockEventBus>;
  const videoId = 'video-1';

  beforeEach(() => {
    eventBus = createMockEventBus();
    editor = new DefaultVideoTimelineEditor(eventBus);
  });

  // -------------------------------------------------------------------------
  // Load timeline
  // -------------------------------------------------------------------------

  describe('loadTimeline', () => {
    it('loads scenes and computes start times', () => {
      const scenes = createScenes();
      const audioTracks = createAudioTracks();

      const state = editor.loadTimeline(videoId, scenes, audioTracks);

      expect(state.videoId).toBe(videoId);
      expect(state.scenes.length).toBe(4);
      expect(state.audioTracks.length).toBe(2);

      // Start times should be cumulative
      expect(state.scenes[0].startTime).toBe(0);
      expect(state.scenes[1].startTime).toBe(10); // 0 + 10
      expect(state.scenes[2].startTime).toBe(25); // 0 + 10 + 15
      expect(state.scenes[3].startTime).toBe(45); // 0 + 10 + 15 + 20
    });

    it('computes total duration from all scenes', () => {
      const scenes = createScenes();
      const state = editor.loadTimeline(videoId, scenes, []);

      // 10 + 15 + 20 + 25 = 70
      expect(state.totalDuration).toBe(70);
    });

    it('sorts scenes by order', () => {
      const scenes = createScenes();
      // Shuffle the order
      const shuffled = [scenes[2], scenes[0], scenes[3], scenes[1]];

      const state = editor.loadTimeline(videoId, shuffled, []);

      expect(state.scenes[0].id).toBe('scene-1');
      expect(state.scenes[1].id).toBe('scene-2');
      expect(state.scenes[2].id).toBe('scene-3');
      expect(state.scenes[3].id).toBe('scene-4');
    });

    it('includes audio tracks in state', () => {
      const audioTracks = createAudioTracks();
      const state = editor.loadTimeline(videoId, createScenes(), audioTracks);

      expect(state.audioTracks.length).toBe(2);
      expect(state.audioTracks[0].id).toBe('track-music');
      expect(state.audioTracks[1].id).toBe('track-voiceover');
    });
  });

  // -------------------------------------------------------------------------
  // Reorder scenes
  // -------------------------------------------------------------------------

  describe('reorderScene', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), []);
    });

    it('moves a scene to a new position', () => {
      // Move scene-1 (index 0) to position 2
      const state = editor.reorderScene(videoId, 'scene-1', 2);

      expect(state.scenes[0].id).toBe('scene-2');
      expect(state.scenes[1].id).toBe('scene-3');
      expect(state.scenes[2].id).toBe('scene-1');
      expect(state.scenes[3].id).toBe('scene-4');
    });

    it('recalculates start times after reorder', () => {
      const state = editor.reorderScene(videoId, 'scene-1', 2);

      expect(state.scenes[0].startTime).toBe(0);
      expect(state.scenes[1].startTime).toBe(state.scenes[0].duration);
    });

    it('recalculates order indices', () => {
      const state = editor.reorderScene(videoId, 'scene-4', 0);

      for (let i = 0; i < state.scenes.length; i++) {
        expect(state.scenes[i].order).toBe(i);
      }
    });

    it('clamps newOrder to valid range (too high)', () => {
      const state = editor.reorderScene(videoId, 'scene-1', 100);

      // Should be at the end
      expect(state.scenes[state.scenes.length - 1].id).toBe('scene-1');
    });

    it('clamps newOrder to valid range (negative)', () => {
      const state = editor.reorderScene(videoId, 'scene-4', -5);

      // Should be at the beginning
      expect(state.scenes[0].id).toBe('scene-4');
    });

    it('throws for unknown scene id', () => {
      expect(() => editor.reorderScene(videoId, 'nonexistent', 0)).toThrow(
        /Scene "nonexistent" not found/,
      );
    });

    it('throws for unknown video id', () => {
      expect(() => editor.reorderScene('unknown-video', 'scene-1', 0)).toThrow(
        /Timeline "unknown-video" not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Trim scenes
  // -------------------------------------------------------------------------

  describe('trimScene', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), []);
    });

    it('changes scene duration', () => {
      const state = editor.trimScene(videoId, 'scene-2', 8);

      const scene = state.scenes.find((s) => s.id === 'scene-2')!;
      expect(scene.duration).toBe(8);
    });

    it('recalculates start times and total duration', () => {
      // Original: scene-1=10, scene-2=15, scene-3=20, scene-4=25 → total=70
      const state = editor.trimScene(videoId, 'scene-2', 5);

      // New: scene-1=10, scene-2=5, scene-3=20, scene-4=25 → total=60
      expect(state.totalDuration).toBe(60);
      expect(state.scenes[1].startTime).toBe(10);
      expect(state.scenes[2].startTime).toBe(15); // 10 + 5
    });

    it('throws for zero duration', () => {
      expect(() => editor.trimScene(videoId, 'scene-1', 0)).toThrow(
        /Duration must be greater than 0/,
      );
    });

    it('throws for negative duration', () => {
      expect(() => editor.trimScene(videoId, 'scene-1', -5)).toThrow(
        /Duration must be greater than 0/,
      );
    });

    it('throws for unknown scene', () => {
      expect(() => editor.trimScene(videoId, 'nonexistent', 10)).toThrow(
        /Scene "nonexistent" not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Replace scenes
  // -------------------------------------------------------------------------

  describe('replaceScene', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), []);
    });

    it('replaces the clip URL of a scene', () => {
      const newUrl = 'https://cdn.example.com/new-clip.mp4';
      const state = editor.replaceScene(videoId, 'scene-2', newUrl);

      const scene = state.scenes.find((s) => s.id === 'scene-2')!;
      expect(scene.clipUrl).toBe(newUrl);
    });

    it('does not change duration or order', () => {
      const stateBefore = editor.trimScene(videoId, 'scene-1', 10); // just to get state
      const originalScene = stateBefore.scenes.find((s) => s.id === 'scene-2')!;

      const stateAfter = editor.replaceScene(videoId, 'scene-2', 'https://new.mp4');
      const updatedScene = stateAfter.scenes.find((s) => s.id === 'scene-2')!;

      expect(updatedScene.duration).toBe(originalScene.duration);
      expect(updatedScene.order).toBe(originalScene.order);
    });

    it('throws for unknown scene', () => {
      expect(() => editor.replaceScene(videoId, 'nonexistent', 'url')).toThrow(
        /Scene "nonexistent" not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Add/remove audio tracks
  // -------------------------------------------------------------------------

  describe('addAudioTrack', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), createAudioTracks());
    });

    it('adds a new audio track to the timeline', () => {
      const newTrack: AudioTrack = {
        id: 'track-sfx',
        type: 'sfx',
        url: 'https://cdn.example.com/sfx.mp3',
        startTime: 10,
        duration: 5,
        volume: 0.8,
      };

      const state = editor.addAudioTrack(videoId, newTrack);

      expect(state.audioTracks.length).toBe(3);
      const added = state.audioTracks.find((t) => t.id === 'track-sfx');
      expect(added).toBeDefined();
      expect(added!.type).toBe('sfx');
      expect(added!.volume).toBe(0.8);
    });

    it('throws for invalid volume (> 1)', () => {
      const badTrack: AudioTrack = {
        id: 'track-bad',
        type: 'music',
        url: 'url',
        startTime: 0,
        duration: 10,
        volume: 1.5,
      };

      expect(() => editor.addAudioTrack(videoId, badTrack)).toThrow(
        /Volume must be between 0 and 1/,
      );
    });

    it('throws for invalid volume (< 0)', () => {
      const badTrack: AudioTrack = {
        id: 'track-bad',
        type: 'music',
        url: 'url',
        startTime: 0,
        duration: 10,
        volume: -0.1,
      };

      expect(() => editor.addAudioTrack(videoId, badTrack)).toThrow(
        /Volume must be between 0 and 1/,
      );
    });
  });

  describe('removeAudioTrack', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), createAudioTracks());
    });

    it('removes an audio track by id', () => {
      const state = editor.removeAudioTrack(videoId, 'track-music');

      expect(state.audioTracks.length).toBe(1);
      expect(state.audioTracks[0].id).toBe('track-voiceover');
    });

    it('throws for unknown track id', () => {
      expect(() => editor.removeAudioTrack(videoId, 'nonexistent')).toThrow(
        /Audio track "nonexistent" not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Set transitions
  // -------------------------------------------------------------------------

  describe('setTransition', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), []);
    });

    it('sets transition type for a scene', () => {
      const state = editor.setTransition(videoId, 'scene-1', 'dissolve');

      const scene = state.scenes.find((s) => s.id === 'scene-1')!;
      expect(scene.transition).toBe('dissolve');
    });

    it('supports all valid transition types', () => {
      const transitions = ['cut', 'fade', 'dissolve', 'wipe'];

      for (const transition of transitions) {
        const state = editor.setTransition(videoId, 'scene-1', transition);
        const scene = state.scenes.find((s) => s.id === 'scene-1')!;
        expect(scene.transition).toBe(transition);
      }
    });

    it('throws for invalid transition type', () => {
      expect(() => editor.setTransition(videoId, 'scene-1', 'slide')).toThrow(
        /Invalid transition "slide"/,
      );
    });

    it('throws for unknown scene', () => {
      expect(() => editor.setTransition(videoId, 'nonexistent', 'cut')).toThrow(
        /Scene "nonexistent" not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Set color grades
  // -------------------------------------------------------------------------

  describe('setColorGrade', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), []);
    });

    it('sets color grade for a scene', () => {
      const state = editor.setColorGrade(videoId, 'scene-1', 'warm-cinematic');

      const scene = state.scenes.find((s) => s.id === 'scene-1')!;
      expect(scene.colorGrade).toBe('warm-cinematic');
    });

    it('can update color grade multiple times', () => {
      editor.setColorGrade(videoId, 'scene-1', 'warm-cinematic');
      const state = editor.setColorGrade(videoId, 'scene-1', 'cool-blue');

      const scene = state.scenes.find((s) => s.id === 'scene-1')!;
      expect(scene.colorGrade).toBe('cool-blue');
    });

    it('different scenes can have different color grades', () => {
      editor.setColorGrade(videoId, 'scene-1', 'warm-cinematic');
      const state = editor.setColorGrade(videoId, 'scene-2', 'noir');

      const scene1 = state.scenes.find((s) => s.id === 'scene-1')!;
      const scene2 = state.scenes.find((s) => s.id === 'scene-2')!;
      expect(scene1.colorGrade).toBe('warm-cinematic');
      expect(scene2.colorGrade).toBe('noir');
    });

    it('throws for unknown scene', () => {
      expect(() => editor.setColorGrade(videoId, 'nonexistent', 'warm')).toThrow(
        /Scene "nonexistent" not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Export formats (16:9, 9:16, 1:1)
  // -------------------------------------------------------------------------

  describe('exportFormats', () => {
    beforeEach(() => {
      editor.loadTimeline(videoId, createScenes(), []);
    });

    it('returns three export formats', () => {
      const formats = editor.exportFormats(videoId);

      expect(formats.length).toBe(3);
    });

    it('includes landscape 16:9 format', () => {
      const formats = editor.exportFormats(videoId);
      const landscape = formats.find((f) => f.aspectRatio === '16:9');

      expect(landscape).toBeDefined();
      expect(landscape!.format).toBe('landscape');
    });

    it('includes portrait 9:16 format', () => {
      const formats = editor.exportFormats(videoId);
      const portrait = formats.find((f) => f.aspectRatio === '9:16');

      expect(portrait).toBeDefined();
      expect(portrait!.format).toBe('portrait');
    });

    it('includes square 1:1 format', () => {
      const formats = editor.exportFormats(videoId);
      const square = formats.find((f) => f.aspectRatio === '1:1');

      expect(square).toBeDefined();
      expect(square!.format).toBe('square');
    });

    it('all formats have the same duration as the timeline', () => {
      const formats = editor.exportFormats(videoId);

      // Total duration = 10 + 15 + 20 + 25 = 70
      for (const format of formats) {
        expect(format.duration).toBe(70);
      }
    });

    it('throws for unknown video id', () => {
      expect(() => editor.exportFormats('unknown-video')).toThrow(
        /Timeline "unknown-video" not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // State immutability
  // -------------------------------------------------------------------------

  describe('state immutability', () => {
    it('returned state is a copy (mutations do not affect internal state)', () => {
      const state = editor.loadTimeline(videoId, createScenes(), createAudioTracks());

      // Mutate the returned state
      state.scenes.push({
        id: 'injected',
        order: 99,
        clipUrl: 'bad',
        startTime: 0,
        duration: 1,
        transition: 'cut',
      });

      // Internal state should be unaffected
      const freshState = editor.exportFormats(videoId);
      // If internal state was mutated, totalDuration would change
      expect(freshState[0].duration).toBe(70); // original total
    });
  });
});
