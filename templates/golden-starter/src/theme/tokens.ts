/**
 * Design system tokens — "Midnight Aurora" 2026 luxury palette.
 *
 * The ONLY place styling literals live. Allowlisted by the no-static-data
 * scanner. Every screen must consume these tokens; ad-hoc inline hex codes
 * are banned by Hook 11.
 *
 * Gradient pairings (use these, not random colors):
 *   - Background:    [#0A0E1F, #14182E, #1B1F3A]   (3-stop deep indigo)
 *   - Hero card:     [#A78BFA, #E0AAFF]            (electric violet → pink)
 *   - Primary CTA:   [#F5C97B, #FF7B9C]            (champagne gold → rose)
 *   - Streak chip:   [#4FD1C5, #A78BFA]            (aurora teal → violet)
 */

export const colors = {
  dark: {
    bgBase: '#0A0E1F',         // deep midnight indigo
    bgElevated: '#14182E',     // card surface
    bgElevated2: '#1B1F3A',    // nested surface
    textPrimary: '#F0F2FF',    // near-white, cool tint
    textSecondary: '#8B92B2',  // muted lavender-gray
    textTertiary: '#5A6080',   // hints
    accent: '#A78BFA',         // electric violet
    accentGlow: '#E0AAFF',     // pink-violet for gradient stops
    accentSoft: '#2A2750',     // accent backgrounds
    gold: '#F5C97B',           // champagne gold
    rose: '#FF7B9C',           // sunset coral
    teal: '#4FD1C5',           // aurora teal
    borderSubtle: '#26304D',
    success: '#4FD1C5',
    danger: '#FF7B9C',
  },
  light: {
    bgBase: '#FAFAFC',
    bgElevated: '#FFFFFF',
    bgElevated2: '#F2F0FA',
    textPrimary: '#0A0E1F',
    textSecondary: '#5A6080',
    textTertiary: '#8B92B2',
    accent: '#7C5BE0',
    accentGlow: '#A78BFA',
    accentSoft: '#E6E1FB',
    gold: '#D9A84A',
    rose: '#E0507C',
    teal: '#3CB0A4',
    borderSubtle: '#E4E2F0',
    success: '#3CB0A4',
    danger: '#E0507C',
  },
} as const;

/** Canonical gradient color stops — Hook 11 enforces these. */
export const gradients = {
  background: ['#0A0E1F', '#14182E', '#1B1F3A'],
  hero: ['#A78BFA', '#E0AAFF'],
  cta: ['#F5C97B', '#FF7B9C'],
  streak: ['#4FD1C5', '#A78BFA'],
  glow: ['#A78BFA', '#E0AAFF', '#FF7B9C'],
} as const;

export const typography = {
  caption: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyEmph: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  display: { fontSize: 40, lineHeight: 46, fontWeight: '800' as const, letterSpacing: -0.8 },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const;

export const radius = { sm: 8, md: 12, card: 16, sheet: 24, pill: 999 } as const;

export const elevation = {
  level1: { shadowColor: '#A78BFA', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 6 },
  level2: { shadowColor: '#0A0E1F', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.32, shadowRadius: 36, elevation: 12 },
  glow: { shadowColor: '#E0AAFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 8 },
} as const;

export const motion = {
  durationFast: 200,
  durationBase: 320,
  durationSlow: 480,
  easeOut: 'cubic-bezier(0.32, 0.72, 0, 1)',
  spring: { damping: 18, stiffness: 200 },
} as const;
