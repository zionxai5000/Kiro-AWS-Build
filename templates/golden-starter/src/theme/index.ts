/**
 * Theme — public API.
 *
 * Single import surface for design tokens. Screens do:
 *   import { colors, type, space, radius, shadows, motion } from '../theme';
 *
 * Or via `useTheme()` for theme-mode-aware values:
 *   const { colors, isDark } = useTheme();
 *
 * `tokens.ts` is the canonical source; `colors.ts`, `type.ts`, etc. are
 * named re-exports so callers can pick whichever import path matches the
 * skill recipe they're following.
 */

import { useColorScheme } from 'react-native';
import { colors as palette, gradients, typography, spacing, radius, elevation, motion } from './tokens';

export { palette as colors, gradients, typography, spacing, radius, elevation, motion };
export { semantic } from './colors';
export { type, sizes, weights, lineHeights, letterSpacing } from './type';
export { space } from './spacing';
export { shadows } from './shadows';
export { springs, transitions } from './motion';

export interface Theme {
  isDark: boolean;
  colors: typeof palette.dark;
  gradients: typeof gradients;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  motion: typeof motion;
}

/**
 * Theme hook — returns the active mode + tokens. Honors the OS color scheme.
 * Override by wrapping the app in a custom provider that returns `isDark` from
 * a persisted store (e.g. settings screen toggle).
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return {
    isDark,
    colors: isDark ? palette.dark : palette.light,
    gradients,
    typography,
    spacing,
    radius,
    elevation,
    motion,
  };
}
