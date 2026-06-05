/**
 * Typography scale — pulled from `tokens.ts` and re-exported with the names
 * the design rulebook uses (caption / body / bodyEmph / title / largeTitle / display).
 *
 * Scale: 32 / 28 / 22 / 17 / 15 / 13 / 11.
 * Weights: 400 / 500 / 600 / 700 (700 reserved for hero numbers).
 */

import { typography as base } from './tokens';

export const type = base;

/** Numeric scale — handy when a component needs a raw size. */
export const sizes = {
  caption: 13,
  body: 15,
  bodyEmph: 17,
  title: 22,
  largeTitle: 28,
  display: 40,
  /** Reserved for tiny labels — chips, badges. */
  micro: 11,
} as const;

export const weights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const lineHeights = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.55,
};

export const letterSpacing = {
  /** Tighten on display headings. */
  display: -0.8,
  /** Slight tighten on large titles. */
  title: -0.5,
  /** Normal body. */
  body: 0,
};
