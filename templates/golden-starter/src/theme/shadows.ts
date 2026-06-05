/**
 * Shadow tiers — soft, never harsh.
 *   card  = y2 blur8 8% opacity
 *   sheet = y8 blur24 14% opacity
 *   modal = y16 blur40 20% opacity
 */

import { elevation } from './tokens';

export const shadows = {
  /** Cards on the canvas. */
  card: elevation.level1,
  /** Bottom sheets, popovers. */
  sheet: elevation.level2,
  /** Modal dialogs. */
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 16,
  },
  /** Subtle accent glow — for hero cards / streak chips. */
  glow: elevation.glow,
} as const;
