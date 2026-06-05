/**
 * Spacing — 8pt grid. These values, only.
 * Screen horizontal padding = 20. Card padding = 16.
 */

import { spacing as base } from './tokens';

export const spacing = base;

/** Numeric scale (in pt). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  /** Standard screen horizontal padding. */
  lg: 20,
  /** Section padding. */
  xl: 24,
  /** Section break. */
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;
