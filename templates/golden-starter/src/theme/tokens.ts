/**
 * Design system tokens — the only place styling literals live.
 * Calm-inspired (soft, warm, low-contrast).
 *
 * Allowlisted by `.kiro/scripts/check-no-static-data.mjs` (theme/** is config).
 */

export const colors = {
  dark: {
    bgBase: '#0E1424',
    bgElevated: '#161E33',
    bgElevated2: '#1E2740',
    textPrimary: '#EDF0FA',
    textSecondary: '#A7AECB',
    textTertiary: '#6C7494',
    accent: '#7C83FF',
    accentSoft: '#2A2F5C',
    calmTeal: '#5FB6A6',
    warm: '#E8B58A',
    borderSubtle: '#26304D',
    success: '#5FB682',
    danger: '#E2807C',
  },
  light: {
    bgBase: '#F7F6FB',
    bgElevated: '#FFFFFF',
    bgElevated2: '#F0EEF8',
    textPrimary: '#1B2138',
    textSecondary: '#5A6080',
    textTertiary: '#8A90AC',
    accent: '#5A62E8',
    accentSoft: '#E6E7FB',
    calmTeal: '#3E9E8E',
    warm: '#D79A66',
    borderSubtle: '#E4E2F0',
    success: '#3E9E63',
    danger: '#C9554F',
  },
} as const;

export const typography = {
  caption: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyEmph: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const },
  display: { fontSize: 40, lineHeight: 46, fontWeight: '600' as const, letterSpacing: -0.5 },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const;

export const radius = { sm: 8, md: 12, card: 16, sheet: 24, pill: 999 } as const;

export const elevation = {
  level1: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  level2: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8 },
} as const;

export const motion = {
  durationFast: 200,
  durationBase: 320,
  durationSlow: 480,
  easeOut: 'cubic-bezier(0.32, 0.72, 0, 1)',
  spring: { damping: 18, stiffness: 200 },
} as const;
