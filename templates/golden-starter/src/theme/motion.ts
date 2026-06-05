/**
 * Motion tokens — durations 280-480ms, easing cubic-bezier(0.32, 0.72, 0, 1)
 * for enters, standard ease-in-out for the rest. Honors reduced-motion.
 */

import { motion as base } from './tokens';

export const motion = base;

export const springs = {
  /** Default Reanimated config — calm and responsive. */
  gentle: { damping: 18, stiffness: 180, mass: 1 },
  /** Bouncier — for celebratory moments. */
  bouncy: { damping: 12, stiffness: 200, mass: 1 },
  /** Snappier — for tap feedback. */
  snappy: { damping: 22, stiffness: 240, mass: 0.8 },
};

export const transitions = {
  fast: 200,
  base: 320,
  slow: 480,
  /** Page-level enters — fade + 8px upward translate. */
  enter: { type: 'spring', ...springs.gentle } as const,
  /** Stagger 30ms per item on list mounts. */
  staggerMs: 30,
};
