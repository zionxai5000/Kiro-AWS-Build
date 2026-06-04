// frame-diff.ts — catch the "four identical frames passed" bug.
//
// Why this exists: brightness + variance are PER-FRAME stats. A stuck screen
// produces the same brightness/variance every capture, so it "passes" four times.
// Only a frame-TO-frame diff proves an action (tap / navigate / add) actually
// changed the UI. After an action that SHOULD change the screen, a near-identical
// frame is a FAIL, not a pass — the tap did nothing, or the runtime has the
// router bypassed (the Snack web preview does exactly this).
//
// Dependency: pngjs (npm i pngjs).  Works on PNG buffers or raw RGBA arrays.

import { PNG } from 'pngjs';

export interface Decoded {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, length = width*height*4
}

export function decodePng(buf: Buffer | Uint8Array): Decoded {
  const png = PNG.sync.read(Buffer.from(buf));
  return { width: png.width, height: png.height, data: png.data };
}

export interface DiffResult {
  diffRatio: number; // fraction of pixels that changed (0..1)
  meanDelta: number; // mean per-channel absolute difference (0..255)
  comparable: boolean; // false if dimensions differ (treated as "changed")
}

export interface DiffOptions {
  /** per-channel 0-255 delta below which a pixel counts as unchanged (ignores
   *  compression / antialiasing noise). Default 12. */
  pixelTolerance?: number;
}

export function frameDiff(a: Decoded, b: Decoded, opts: DiffOptions = {}): DiffResult {
  const tol = opts.pixelTolerance ?? 12;
  if (a.width !== b.width || a.height !== b.height) {
    return { diffRatio: 1, meanDelta: 255, comparable: false };
  }
  const da = a.data;
  const db = b.data;
  const px = a.width * a.height;
  let changed = 0;
  let sum = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const dr = Math.abs(da[o]! - db[o]!);
    const dg = Math.abs(da[o + 1]! - db[o + 1]!);
    const dbb = Math.abs(da[o + 2]! - db[o + 2]!);
    sum += (dr + dg + dbb) / 3;
    if (dr > tol || dg > tol || dbb > tol) changed++;
  }
  return { diffRatio: changed / px, meanDelta: sum / px, comparable: true };
}

export interface ChangeCheck {
  ok: boolean;
  reason: string;
  diffRatio: number;
  meanDelta: number;
}

/**
 * Assert that `curr` is meaningfully different from `prev` after an action that
 * was supposed to change the screen. Near-identical frames => the action did
 * nothing => FAIL. Use this on every POST-ACTION capture (not the first frame).
 *
 * @param minChangeRatio fraction of pixels that must change to count as "moved".
 *        Default 0.02 (2%). Raise it if your app has busy idle animation.
 */
export function assertChangedAfterAction(
  prev: Buffer | Uint8Array,
  curr: Buffer | Uint8Array,
  label: string,
  minChangeRatio = 0.02,
  opts: DiffOptions = {},
): ChangeCheck {
  const d = frameDiff(decodePng(prev), decodePng(curr), opts);
  if (!d.comparable) {
    return {
      ok: true,
      reason: `${label}: ok — frame size changed`,
      diffRatio: d.diffRatio,
      meanDelta: d.meanDelta,
    };
  }
  if (d.diffRatio < minChangeRatio) {
    return {
      ok: false,
      reason:
        `${label}: FAIL — screen did not change after the action ` +
        `(diffRatio=${d.diffRatio.toFixed(4)} < ${minChangeRatio}). The tap/navigation ` +
        `did nothing, or the runtime has the router bypassed. This is a stuck screen, ` +
        `not a passing capture.`,
      diffRatio: d.diffRatio,
      meanDelta: d.meanDelta,
    };
  }
  return {
    ok: true,
    reason: `${label}: ok — screen changed (diffRatio=${d.diffRatio.toFixed(4)})`,
    diffRatio: d.diffRatio,
    meanDelta: d.meanDelta,
  };
}

/**
 * Guard against the exact failure you hit: a whole run of captures that are all
 * the same image. Pass the ordered frame buffers; returns the indices that are
 * duplicates of the frame before them. A non-empty result means the capture run
 * is invalid and must NOT be reported as "all screens captured".
 */
export function findStuckFrames(
  frames: (Buffer | Uint8Array)[],
  minChangeRatio = 0.02,
  opts: DiffOptions = {},
): number[] {
  const stuck: number[] = [];
  let prev = frames.length ? decodePng(frames[0]!) : null;
  for (let i = 1; i < frames.length; i++) {
    const cur = decodePng(frames[i]!);
    const d = frameDiff(prev!, cur, opts);
    if (d.comparable && d.diffRatio < minChangeRatio) stuck.push(i);
    prev = cur;
  }
  return stuck;
}
