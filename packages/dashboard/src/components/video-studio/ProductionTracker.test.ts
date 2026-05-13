/**
 * Unit tests for ZXMG Video Studio — End-to-End Production Tracker
 *
 * Validates: Requirements 44b.7, 44g.35, 44g.36
 *
 * Tests timeline rendering, status dots, time-in-stage,
 * upload queue, platform health, and error states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EndToEndProductionTracker,
  type ProductionTrackerData,
  type VideoProduction,
} from './ProductionTracker.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestData(overrides?: Partial<ProductionTrackerData>): ProductionTrackerData {
  return {
    productions: [
      {
        id: 'vid-1',
        title: 'Tech Review Ep 42',
        createdAt: new Date().toISOString(),
        stages: [
          { stage: 'script', status: 'complete', durationMs: 120000 },
          { stage: 'scenes', status: 'complete', durationMs: 300000 },
          { stage: 'render', status: 'in_progress', startedAt: new Date().toISOString() },
          { stage: 'assemble', status: 'pending' },
          { stage: 'review', status: 'pending' },
          { stage: 'publish', status: 'pending' },
          { stage: 'distribute', status: 'pending' },
          { stage: 'live', status: 'pending' },
        ],
      },
      {
        id: 'vid-2',
        title: 'Cooking Tips Ep 10',
        createdAt: new Date().toISOString(),
        stages: [
          { stage: 'script', status: 'complete', durationMs: 90000 },
          { stage: 'scenes', status: 'complete', durationMs: 240000 },
          { stage: 'render', status: 'complete', durationMs: 600000 },
          { stage: 'assemble', status: 'complete', durationMs: 180000 },
          { stage: 'review', status: 'complete', durationMs: 60000 },
          { stage: 'publish', status: 'complete', durationMs: 30000 },
          { stage: 'distribute', status: 'complete', durationMs: 45000 },
          { stage: 'live', status: 'complete', durationMs: 0 },
        ],
      },
    ],
    uploadQueue: [
      { id: 'up-1', videoId: 'vid-1', platform: 'YouTube', status: 'uploading', progress: 65 },
      { id: 'up-2', videoId: 'vid-1', platform: 'TikTok', status: 'queued', progress: 0 },
      { id: 'up-3', videoId: 'vid-2', platform: 'Instagram', status: 'failed', progress: 30 },
    ],
    platformConnections: [
      { platform: 'YouTube', health: 'connected', lastChecked: new Date().toISOString() },
      { platform: 'TikTok', health: 'connected', lastChecked: new Date().toISOString() },
      { platform: 'Instagram', health: 'rate_limited', lastChecked: new Date().toISOString() },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let container: HTMLElement;

beforeEach(() => {
  container = createContainer();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Timeline Renders All Stages with Correct Status Dots
// ---------------------------------------------------------------------------

describe('EndToEndProductionTracker — Timeline Rendering', () => {
  it('should render production tracker with title', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    expect(container.querySelector('.production-tracker__title')?.textContent).toContain('Production Tracker');
  });

  it('should render timelines for each video', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const timelines = container.querySelectorAll('.production-tracker__timeline');
    expect(timelines.length).toBe(2);
  });

  it('should render 8 stages per timeline', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const firstTimeline = container.querySelector('[data-video-id="vid-1"]');
    const stages = firstTimeline?.querySelectorAll('.production-tracker__stage');
    expect(stages?.length).toBe(8);
  });

  it('should show correct status colors on dots', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const firstTimeline = container.querySelector('[data-video-id="vid-1"]');

    // Script = complete = green
    const scriptStage = firstTimeline?.querySelector('[data-stage="script"]');
    expect(scriptStage?.querySelector('.production-tracker__dot--green')).toBeTruthy();

    // Render = in_progress = blue
    const renderStage = firstTimeline?.querySelector('[data-stage="render"]');
    expect(renderStage?.querySelector('.production-tracker__dot--blue')).toBeTruthy();

    // Assemble = pending = gray
    const assembleStage = firstTimeline?.querySelector('[data-stage="assemble"]');
    expect(assembleStage?.querySelector('.production-tracker__dot--gray')).toBeTruthy();
  });

  it('should show video title on each timeline', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const titles = container.querySelectorAll('.production-tracker__video-title');
    const titleTexts = Array.from(titles).map((el) => el.textContent);
    expect(titleTexts).toContain('Tech Review Ep 42');
    expect(titleTexts).toContain('Cooking Tips Ep 10');
  });
});

// ---------------------------------------------------------------------------
// Time-in-Stage Calculates Duration Correctly
// ---------------------------------------------------------------------------

describe('EndToEndProductionTracker — Time in Stage', () => {
  it('should display duration for completed stages', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const firstTimeline = container.querySelector('[data-video-id="vid-1"]');
    const scriptStage = firstTimeline?.querySelector('[data-stage="script"]');
    const duration = scriptStage?.querySelector('.production-tracker__stage-duration');
    expect(duration?.textContent).toBe('2m'); // 120000ms = 2 minutes
  });

  it('should show minutes for longer durations', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const firstTimeline = container.querySelector('[data-video-id="vid-1"]');
    const scenesStage = firstTimeline?.querySelector('[data-stage="scenes"]');
    const duration = scenesStage?.querySelector('.production-tracker__stage-duration');
    expect(duration?.textContent).toBe('5m'); // 300000ms = 5 minutes
  });

  it('should not show duration for pending stages', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const firstTimeline = container.querySelector('[data-video-id="vid-1"]');
    const assembleStage = firstTimeline?.querySelector('[data-stage="assemble"]');
    const duration = assembleStage?.querySelector('.production-tracker__stage-duration');
    expect(duration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Upload Queue Shows Pending Uploads Per Platform
// ---------------------------------------------------------------------------

describe('EndToEndProductionTracker — Upload Queue', () => {
  it('should render upload queue section', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    expect(container.querySelector('.production-tracker__queue')).toBeTruthy();
    expect(container.querySelector('.production-tracker__queue-title')?.textContent).toContain('Upload Queue');
  });

  it('should show uploads with platform and status', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const uploads = container.querySelectorAll('.production-tracker__upload');
    expect(uploads.length).toBe(3);

    const firstUpload = container.querySelector('[data-upload-id="up-1"]');
    expect(firstUpload?.querySelector('.production-tracker__upload-platform')?.textContent).toBe('YouTube');
    expect(firstUpload?.querySelector('.production-tracker__upload-status')?.textContent).toBe('uploading');
  });

  it('should show retry button for failed uploads', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const failedUpload = container.querySelector('[data-upload-id="up-3"]');
    expect(failedUpload?.querySelector('.production-tracker__retry-btn')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Platform Connection Health Indicators
// ---------------------------------------------------------------------------

describe('EndToEndProductionTracker — Platform Health', () => {
  it('should render platform connections', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const platforms = container.querySelectorAll('.production-tracker__platform');
    expect(platforms.length).toBe(3);
  });

  it('should show correct health status per platform', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const youtube = container.querySelector('[data-platform="YouTube"]');
    expect(youtube?.querySelector('.production-tracker__platform-health--connected')).toBeTruthy();

    const instagram = container.querySelector('[data-platform="Instagram"]');
    expect(instagram?.querySelector('.production-tracker__platform-health--rate_limited')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Failed Stage Shows Red Dot with Error
// ---------------------------------------------------------------------------

describe('EndToEndProductionTracker — Failed Stages', () => {
  it('should show red dot for failed stage', () => {
    const data = createTestData({
      productions: [{
        id: 'vid-fail',
        title: 'Failed Video',
        createdAt: new Date().toISOString(),
        stages: [
          { stage: 'script', status: 'complete', durationMs: 60000 },
          { stage: 'scenes', status: 'failed', error: 'Scene generation timeout' },
        ],
      }],
    });
    const tracker = new EndToEndProductionTracker(container, data);
    tracker.mount();

    const timeline = container.querySelector('[data-video-id="vid-fail"]');
    const failedStage = timeline?.querySelector('[data-stage="scenes"]');
    expect(failedStage?.querySelector('.production-tracker__dot--red')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Completed Videos Show Full Green Timeline
// ---------------------------------------------------------------------------

describe('EndToEndProductionTracker — Completed Videos', () => {
  it('should show all green dots for completed video', () => {
    const tracker = new EndToEndProductionTracker(container, createTestData());
    tracker.mount();

    const completedTimeline = container.querySelector('[data-video-id="vid-2"]');
    const greenDots = completedTimeline?.querySelectorAll('.production-tracker__dot--green');
    expect(greenDots?.length).toBe(8);
  });
});
