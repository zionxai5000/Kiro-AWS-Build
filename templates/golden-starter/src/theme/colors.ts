/**
 * Semantic color tokens — re-exported from `tokens.ts` so screens can import
 * either `'../theme'` (everything) or `'../theme/colors'` (just colors).
 *
 * Mirrors `.kiro/steering/10-design-system.md` (the rulebook).
 */

import { colors as paletteColors } from './tokens';

export const colors = paletteColors;

/** Semantic helpers — used in places where the rulebook calls for a name. */
export const semantic = {
  /** App canvas — subtle gradient base, never pure #FFF/#000. */
  background: paletteColors.dark.bgBase,
  /** Cards / sheets. */
  surface: paletteColors.dark.bgElevated,
  /** Modals / popovers. */
  surfaceElevated: paletteColors.dark.bgElevated2,
  /** Hairline 1px, low-opacity. */
  border: paletteColors.dark.borderSubtle,
  /** ~95% opacity body text. */
  textPrimary: paletteColors.dark.textPrimary,
  /** ~60%. */
  textSecondary: paletteColors.dark.textSecondary,
  /** ~38%. */
  textTertiary: paletteColors.dark.textTertiary,
  /** The ONE brand color — CTAs, active states. */
  accent: paletteColors.dark.accent,
  /** Accent backgrounds, chip tints. */
  accentMuted: paletteColors.dark.accentSoft,
  success: paletteColors.dark.success,
  warning: paletteColors.dark.gold,
  danger: paletteColors.dark.danger,
} as const;

export type SemanticColor = keyof typeof semantic;
