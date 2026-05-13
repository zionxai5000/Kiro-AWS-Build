/**
 * ZXMG Video Development Studio — Timeline Editor
 *
 * Provides scene-by-scene control over assembled videos. Supports reordering,
 * trimming, replacing scenes, managing audio tracks, setting transitions and
 * color grades, and exporting to multiple formats/aspect ratios.
 *
 * Requirements: 44c.17, 44c.18, 44c.19, 44c.20, 44c.21, 44c.22
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineState {
  videoId: string;
  scenes: TimelineScene[];
  audioTracks: AudioTrack[];
  totalDuration: number;
}

export interface TimelineScene {
  id: string;
  order: number;
  clipUrl: string;
  startTime: number;
  duration: number;
  transition: 'cut' | 'fade' | 'dissolve' | 'wipe';
  colorGrade?: string;
}

export interface AudioTrack {
  id: string;
  type: 'music' | 'sfx' | 'voiceover' | 'ambient';
  url: string;
  startTime: number;
  duration: number;
  volume: number; // 0-1
}

export interface ExportFormat {
  format: string;
  aspectRatio: string;
  duration: number;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface TimelineEventBus {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface VideoTimelineEditor {
  loadTimeline(videoId: string, scenes: TimelineScene[], audioTracks: AudioTrack[]): TimelineState;
  reorderScene(videoId: string, sceneId: string, newOrder: number): TimelineState;
  trimScene(videoId: string, sceneId: string, newDuration: number): TimelineState;
  replaceScene(videoId: string, sceneId: string, newClipUrl: string): TimelineState;
  addAudioTrack(videoId: string, track: AudioTrack): TimelineState;
  removeAudioTrack(videoId: string, trackId: string): TimelineState;
  setTransition(videoId: string, sceneId: string, transition: string): TimelineState;
  setColorGrade(videoId: string, sceneId: string, grade: string): TimelineState;
  exportFormats(videoId: string): ExportFormat[];
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of VideoTimelineEditor.
 *
 * Maintains in-memory timeline state per video. Provides scene manipulation,
 * audio track management, and multi-format export capabilities.
 */
export class DefaultVideoTimelineEditor implements VideoTimelineEditor {
  private static readonly EVENT_SOURCE = 'zxmg.studio.timeline-editor';

  /** In-memory timeline storage: videoId → TimelineState */
  private readonly timelines = new Map<string, TimelineState>();

  constructor(private readonly eventBus: TimelineEventBus) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Loads a timeline from scenes and audio tracks, computing start times
   * and total duration.
   *
   * Requirement: 44c.17
   */
  loadTimeline(
    videoId: string,
    scenes: TimelineScene[],
    audioTracks: AudioTrack[],
  ): TimelineState {
    // Sort scenes by order and compute start times
    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
    let currentTime = 0;
    for (const scene of sortedScenes) {
      scene.startTime = currentTime;
      currentTime += scene.duration;
    }

    const totalDuration = currentTime;

    const state: TimelineState = {
      videoId,
      scenes: sortedScenes,
      audioTracks: [...audioTracks],
      totalDuration,
    };

    this.timelines.set(videoId, state);
    return { ...state, scenes: [...state.scenes], audioTracks: [...state.audioTracks] };
  }

  /**
   * Reorders a scene to a new position, recalculating all start times.
   *
   * Requirement: 44c.18
   */
  reorderScene(videoId: string, sceneId: string, newOrder: number): TimelineState {
    const state = this.getTimelineOrThrow(videoId);
    const sceneIndex = state.scenes.findIndex((s) => s.id === sceneId);

    if (sceneIndex === -1) {
      throw new Error(`Scene "${sceneId}" not found in timeline "${videoId}".`);
    }

    // Remove scene from current position
    const [scene] = state.scenes.splice(sceneIndex, 1);

    // Clamp newOrder to valid range
    const clampedOrder = Math.max(0, Math.min(newOrder, state.scenes.length));

    // Insert at new position
    state.scenes.splice(clampedOrder, 0, scene);

    // Recalculate orders and start times
    this.recalculateTimeline(state);

    return this.cloneState(state);
  }

  /**
   * Trims a scene to a new duration, recalculating subsequent start times.
   *
   * Requirement: 44c.19
   */
  trimScene(videoId: string, sceneId: string, newDuration: number): TimelineState {
    const state = this.getTimelineOrThrow(videoId);
    const scene = state.scenes.find((s) => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene "${sceneId}" not found in timeline "${videoId}".`);
    }

    if (newDuration <= 0) {
      throw new Error('Duration must be greater than 0.');
    }

    scene.duration = newDuration;
    this.recalculateTimeline(state);

    return this.cloneState(state);
  }

  /**
   * Replaces a scene's clip URL (e.g., after re-generation).
   *
   * Requirement: 44c.19
   */
  replaceScene(videoId: string, sceneId: string, newClipUrl: string): TimelineState {
    const state = this.getTimelineOrThrow(videoId);
    const scene = state.scenes.find((s) => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene "${sceneId}" not found in timeline "${videoId}".`);
    }

    scene.clipUrl = newClipUrl;

    return this.cloneState(state);
  }

  /**
   * Adds an audio track to the timeline.
   *
   * Requirement: 44c.20
   */
  addAudioTrack(videoId: string, track: AudioTrack): TimelineState {
    const state = this.getTimelineOrThrow(videoId);

    if (track.volume < 0 || track.volume > 1) {
      throw new Error('Volume must be between 0 and 1.');
    }

    state.audioTracks.push({ ...track });

    return this.cloneState(state);
  }

  /**
   * Removes an audio track from the timeline.
   *
   * Requirement: 44c.20
   */
  removeAudioTrack(videoId: string, trackId: string): TimelineState {
    const state = this.getTimelineOrThrow(videoId);
    const trackIndex = state.audioTracks.findIndex((t) => t.id === trackId);

    if (trackIndex === -1) {
      throw new Error(`Audio track "${trackId}" not found in timeline "${videoId}".`);
    }

    state.audioTracks.splice(trackIndex, 1);

    return this.cloneState(state);
  }

  /**
   * Sets the transition type for a scene.
   *
   * Requirement: 44c.21
   */
  setTransition(videoId: string, sceneId: string, transition: string): TimelineState {
    const state = this.getTimelineOrThrow(videoId);
    const scene = state.scenes.find((s) => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene "${sceneId}" not found in timeline "${videoId}".`);
    }

    const validTransitions = ['cut', 'fade', 'dissolve', 'wipe'];
    if (!validTransitions.includes(transition)) {
      throw new Error(`Invalid transition "${transition}". Must be one of: ${validTransitions.join(', ')}`);
    }

    scene.transition = transition as 'cut' | 'fade' | 'dissolve' | 'wipe';

    return this.cloneState(state);
  }

  /**
   * Sets the color grade for a scene.
   *
   * Requirement: 44c.22
   */
  setColorGrade(videoId: string, sceneId: string, grade: string): TimelineState {
    const state = this.getTimelineOrThrow(videoId);
    const scene = state.scenes.find((s) => s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene "${sceneId}" not found in timeline "${videoId}".`);
    }

    scene.colorGrade = grade;

    return this.cloneState(state);
  }

  /**
   * Returns available export formats for the video (16:9, 9:16, 1:1).
   *
   * Requirement: 44c.22
   */
  exportFormats(videoId: string): ExportFormat[] {
    const state = this.getTimelineOrThrow(videoId);

    return [
      { format: 'landscape', aspectRatio: '16:9', duration: state.totalDuration },
      { format: 'portrait', aspectRatio: '9:16', duration: state.totalDuration },
      { format: 'square', aspectRatio: '1:1', duration: state.totalDuration },
    ];
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private getTimelineOrThrow(videoId: string): TimelineState {
    const state = this.timelines.get(videoId);
    if (!state) {
      throw new Error(`Timeline "${videoId}" not found. Load it first with loadTimeline().`);
    }
    return state;
  }

  /**
   * Recalculates order indices, start times, and total duration after mutations.
   */
  private recalculateTimeline(state: TimelineState): void {
    let currentTime = 0;
    for (let i = 0; i < state.scenes.length; i++) {
      state.scenes[i].order = i;
      state.scenes[i].startTime = currentTime;
      currentTime += state.scenes[i].duration;
    }
    state.totalDuration = currentTime;
  }

  /**
   * Returns a shallow clone of the timeline state for immutable return values.
   */
  private cloneState(state: TimelineState): TimelineState {
    return {
      videoId: state.videoId,
      scenes: state.scenes.map((s) => ({ ...s })),
      audioTracks: state.audioTracks.map((t) => ({ ...t })),
      totalDuration: state.totalDuration,
    };
  }
}
