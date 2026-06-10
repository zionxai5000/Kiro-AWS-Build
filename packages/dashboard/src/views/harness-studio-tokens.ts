/**
 * Harness Studio — design tokens + stylesheet for the new 3-column UI.
 *
 * Built fresh against King's UI spec:
 *   - 56px top nav
 *   - 220px sidebar / 400px chat / ~980px preview
 *   - locked to viewport (no full-page scroll)
 *   - glass + depth (BlurView-style stack: blur + tint + hairline + highlight)
 *   - subtle gradient bg, single accent, 8px grid, real type scale
 *   - spring motion on panel/chip mount
 *
 * Mirrors `.kiro/steering/10-design-system.md` tokens. The dashboard CSS
 * variable bridge means the studio can swap palettes without touching
 * components.
 */

export const harnessTokens = {
  // Tranquil dark canvas + soft elevated surfaces (steering 10-design-system.md).
  bg: {
    base: '#0E1424',
    elevated: '#161E33',
    elevated2: '#1E2740',
    /** Used as the body gradient `bg.base → bg.gradientTop`. */
    gradientTop: '#1B2138',
  },
  text: {
    primary: '#EDF0FA',
    secondary: '#A7AECB',
    tertiary: '#6C7494',
  },
  border: {
    subtle: '#26304D',
    hairline: 'rgba(167, 174, 203, 0.12)',
    focus: '#7C83FF',
  },
  accent: {
    primary: '#7C83FF',     // periwinkle
    primarySoft: 'rgba(124, 131, 255, 0.16)',
    primaryHover: '#9097FF',
    teal: '#5FB6A6',
    warm: '#E8B58A',
  },
  status: {
    success: '#5FB682',
    warning: '#E8B58A',
    danger: '#E2807C',
    successSoft: 'rgba(95, 182, 130, 0.14)',
    dangerSoft: 'rgba(226, 128, 124, 0.16)',
  },
  // 8pt grid — these values, only.
  space: { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 48 } as const,
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const,
  type: {
    family: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    sizes: { xs: 11, sm: 13, base: 15, md: 17, lg: 22, xl: 28, '2xl': 40 },
  },
  motion: {
    fast: '180ms cubic-bezier(0.32, 0.72, 0, 1)',
    base: '320ms cubic-bezier(0.32, 0.72, 0, 1)',
    slow: '480ms cubic-bezier(0.32, 0.72, 0, 1)',
    spring: '380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  shadow: {
    card: '0 2px 8px rgba(0, 0, 0, 0.32)',
    sheet: '0 8px 24px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
    modal: '0 16px 40px rgba(0, 0, 0, 0.55)',
  },
} as const;

/**
 * Render the harness-studio stylesheet. Locked to a fixed three-column grid
 * inside a viewport-height shell. No full-page scroll; chat scrolls inside
 * its own column. Glass effect via blur+tint+hairline+highlight.
 */
export function renderHarnessStylesheet(): string {
  const t = harnessTokens;
  const px = (n: number) => `${n}px`;
  const s = t.space;
  return `<style>
    .harness-studio {
      display: grid;
      grid-template-rows: 56px 1fr;
      height: 100vh;
      background:
        radial-gradient(1200px 600px at 80% -10%, rgba(124,131,255,0.08), transparent 60%),
        linear-gradient(180deg, ${t.bg.base} 0%, ${t.bg.gradientTop} 100%);
      color: ${t.text.primary};
      font-family: ${t.type.family};
      font-size: ${t.type.sizes.base}px;
      letter-spacing: -0.005em;
      overflow: hidden;
    }

    /* ---------- Top nav (56) ---------- */
    .harness-nav {
      display: flex;
      align-items: center;
      gap: ${px(s.lg)};
      padding: 0 ${px(s.xl)};
      border-bottom: 1px solid ${t.border.hairline};
      background: rgba(14, 20, 36, 0.7);
      backdrop-filter: blur(24px) saturate(160%);
      -webkit-backdrop-filter: blur(24px) saturate(160%);
    }
    .harness-nav__logo {
      font-weight: ${t.type.weights.semibold};
      font-size: ${t.type.sizes.md}px;
      letter-spacing: 0.04em;
      display: inline-flex;
      align-items: center;
      gap: ${px(s.sm)};
      color: ${t.text.primary};
    }
    .harness-nav__logo-mark {
      width: 22px; height: 22px;
      border-radius: ${px(t.radius.sm)};
      background: linear-gradient(135deg, ${t.accent.primary} 0%, ${t.accent.teal} 100%);
      box-shadow: 0 0 24px ${t.accent.primarySoft};
    }
    .harness-nav__tabs { display: flex; gap: ${px(s.xs)}; margin-left: ${px(s.lg)}; }
    .harness-nav__tab {
      padding: ${px(s.sm)} ${px(s.md)};
      font-size: ${t.type.sizes.sm}px;
      color: ${t.text.secondary};
      background: transparent;
      border: 0;
      border-radius: ${px(t.radius.md)};
      cursor: pointer;
      transition: ${t.motion.fast};
    }
    .harness-nav__tab:hover { color: ${t.text.primary}; background: ${t.bg.elevated}; }
    .harness-nav__tab[aria-current="page"] {
      color: ${t.text.primary};
      background: ${t.accent.primarySoft};
    }
    .harness-nav__spacer { flex: 1; }
    .harness-nav__cta {
      padding: ${px(s.sm)} ${px(s.base)};
      background: linear-gradient(135deg, ${t.accent.primary} 0%, ${t.accent.primaryHover} 100%);
      color: white;
      font-size: ${t.type.sizes.sm}px;
      font-weight: ${t.type.weights.semibold};
      border: 0;
      border-radius: ${px(t.radius.pill)};
      cursor: pointer;
      transition: ${t.motion.fast};
      box-shadow: 0 4px 12px rgba(124, 131, 255, 0.3);
    }
    .harness-nav__cta:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124, 131, 255, 0.45); }
    .harness-nav__cta:active { transform: scale(0.97); }
    .harness-nav__icon-button {
      width: 36px; height: 36px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent;
      border: 1px solid ${t.border.hairline};
      border-radius: ${px(t.radius.md)};
      color: ${t.text.secondary};
      cursor: pointer;
      transition: ${t.motion.fast};
    }
    .harness-nav__icon-button:hover { color: ${t.text.primary}; background: ${t.bg.elevated}; }

    /* ---------- 3-column shell ---------- */
    .harness-body {
      display: grid;
      grid-template-columns: 220px 400px 1fr;
      min-height: 0;          /* critical — children scroll, not the shell */
    }

    /* ---------- Sidebar (220) ---------- */
    .harness-sidebar {
      display: flex; flex-direction: column;
      padding: ${px(s.base)};
      gap: ${px(s.md)};
      border-right: 1px solid ${t.border.hairline};
      overflow-y: auto;
      background: rgba(22, 30, 51, 0.4);
      backdrop-filter: blur(20px) saturate(140%);
    }
    .harness-sidebar__section-title {
      font-size: ${t.type.sizes.xs}px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${t.text.tertiary};
      padding: ${px(s.sm)} ${px(s.sm)} 0;
    }
    .harness-sidebar__new {
      width: 100%;
      padding: ${px(s.md)} ${px(s.base)};
      background: ${t.accent.primarySoft};
      color: ${t.accent.primary};
      font-size: ${t.type.sizes.sm}px;
      font-weight: ${t.type.weights.semibold};
      border: 1px dashed ${t.accent.primary};
      border-radius: ${px(t.radius.md)};
      cursor: pointer;
      transition: ${t.motion.fast};
    }
    .harness-sidebar__new:hover { background: rgba(124, 131, 255, 0.24); }
    .harness-sidebar__new:active { transform: scale(0.98); }
    .harness-sidebar__projects { display: flex; flex-direction: column; gap: ${px(s.xs)}; }
    .harness-project-row {
      display: flex; flex-direction: column;
      gap: ${px(s.xs)};
      padding: ${px(s.md)};
      background: transparent;
      border: 1px solid transparent;
      border-radius: ${px(t.radius.md)};
      text-align: left;
      cursor: pointer;
      transition: ${t.motion.fast};
    }
    .harness-project-row:hover {
      background: ${t.bg.elevated};
      border-color: ${t.border.hairline};
    }
    .harness-project-row[data-active="true"] {
      background: ${t.bg.elevated2};
      border-color: ${t.accent.primary};
    }
    .harness-project-row__name { font-size: ${t.type.sizes.sm}px; font-weight: ${t.type.weights.semibold}; color: ${t.text.primary}; }
    .harness-project-row__meta {
      display: flex; align-items: center; gap: ${px(s.sm)};
      font-size: ${t.type.sizes.xs}px;
      color: ${t.text.tertiary};
    }
    .harness-project-row__pill {
      padding: 2px 8px;
      border-radius: ${px(t.radius.pill)};
      font-size: 10px;
      font-weight: ${t.type.weights.semibold};
    }
    .harness-pill--ok    { background: ${t.status.successSoft}; color: ${t.status.success}; }
    .harness-pill--warn  { background: ${t.status.dangerSoft}; color: ${t.status.danger}; }
    .harness-pill--stub  { background: ${t.bg.elevated2}; color: ${t.text.tertiary}; }
    .harness-pill--saved { background: ${t.bg.elevated2}; color: ${t.text.secondary}; }

    .harness-sidebar__util {
      margin-top: auto;
      padding-top: ${px(s.lg)};
      border-top: 1px solid ${t.border.hairline};
      display: flex; flex-direction: column; gap: ${px(s.xs)};
    }
    .harness-sidebar__util button {
      padding: ${px(s.sm)} ${px(s.md)};
      background: transparent;
      color: ${t.text.secondary};
      font-size: ${t.type.sizes.sm}px;
      border: 0;
      border-radius: ${px(t.radius.md)};
      text-align: left;
      cursor: pointer;
      transition: ${t.motion.fast};
    }
    .harness-sidebar__util button:hover { background: ${t.bg.elevated}; color: ${t.text.primary}; }

    .harness-sidebar__status {
      display: flex; align-items: center; gap: ${px(s.sm)};
      padding: ${px(s.sm)} ${px(s.md)};
      font-size: ${t.type.sizes.xs}px;
      color: ${t.text.tertiary};
    }
    .harness-status-dot {
      width: 8px; height: 8px; border-radius: ${px(t.radius.pill)};
      background: ${t.text.tertiary};
    }
    .harness-status-dot[data-state="awake"]  { background: ${t.status.success}; box-shadow: 0 0 8px ${t.status.success}; }
    .harness-status-dot[data-state="waking"] { background: ${t.status.warning}; }
    .harness-status-dot[data-state="error"]  { background: ${t.status.danger}; }

    /* ---------- Chat (400) ---------- */
    .harness-chat {
      display: grid;
      grid-template-rows: auto 1fr auto;
      border-right: 1px solid ${t.border.hairline};
      min-height: 0;
      background: rgba(14, 20, 36, 0.5);
    }
    .harness-chat__plan {
      margin: ${px(s.base)};
      padding: ${px(s.base)};
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.lg)};
      box-shadow: ${t.shadow.card};
      animation: harness-rise 380ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .harness-chat__plan-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: ${px(s.sm)};
      font-size: ${t.type.sizes.xs}px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${t.text.tertiary};
    }
    .harness-chat__plan-toggle {
      padding: 2px 8px;
      background: transparent;
      border: 0;
      color: ${t.text.tertiary};
      cursor: pointer;
      font-size: ${t.type.sizes.xs}px;
    }
    .harness-chat__plan-body {
      margin-top: ${px(s.md)};
      font-size: ${t.type.sizes.sm}px;
      line-height: 1.55;
      color: ${t.text.primary};
    }
    .harness-chat__plan-keys { display: grid; gap: ${px(s.xs)}; margin-top: ${px(s.sm)}; }
    .harness-chat__plan-key {
      display: grid;
      grid-template-columns: 80px 1fr;
      gap: ${px(s.sm)};
      font-size: ${t.type.sizes.sm}px;
    }
    .harness-chat__plan-key b { color: ${t.accent.primary}; font-weight: ${t.type.weights.semibold}; }

    .harness-chat__stream {
      overflow-y: auto;
      padding: 0 ${px(s.base)} ${px(s.base)};
      display: flex; flex-direction: column; gap: ${px(s.md)};
    }
    .harness-chat__row {
      display: flex; align-items: flex-start;
      gap: ${px(s.sm)};
      animation: harness-fade-rise 380ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .harness-chat__icon { width: 22px; flex: 0 0 22px; text-align: center; color: ${t.text.tertiary}; font-size: ${t.type.sizes.sm}px; }
    .harness-chat__text { flex: 1; font-size: ${t.type.sizes.sm}px; line-height: 1.5; color: ${t.text.secondary}; }
    .harness-chat__text--user { color: ${t.text.primary}; font-weight: ${t.type.weights.medium}; }
    .harness-chat__text--agent { color: ${t.text.primary}; }
    .harness-chat__chip {
      display: inline-flex; align-items: center; gap: ${px(s.xs)};
      padding: 4px 10px;
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.pill)};
      font-size: 11px;
      color: ${t.text.secondary};
      animation: harness-fade-rise 240ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .harness-chat__chip--write   { color: ${t.accent.warm};    border-color: rgba(232, 181, 138, 0.3); }
    .harness-chat__chip--edit    { color: ${t.accent.primary}; border-color: rgba(124, 131, 255, 0.3); }
    .harness-chat__chip--read    { color: ${t.accent.teal};    border-color: rgba(95, 182, 166, 0.3); }
    .harness-chat__chip--run     { color: ${t.status.success}; border-color: rgba(95, 182, 130, 0.3); }
    .harness-chat__chip--review  { color: ${t.accent.primary}; border-color: rgba(124, 131, 255, 0.3); }
    .harness-chat__chip--error   { color: ${t.status.danger};  border-color: rgba(226, 128, 124, 0.3); }

    .harness-quality-pill {
      display: inline-flex; align-items: center; gap: ${px(s.sm)};
      padding: ${px(s.sm)} ${px(s.md)};
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.pill)};
      font-size: ${t.type.sizes.xs}px;
      color: ${t.text.secondary};
    }
    .harness-quality-pill--pass { color: ${t.status.success}; border-color: rgba(95, 182, 130, 0.4); background: ${t.status.successSoft}; }
    .harness-quality-pill--fail { color: ${t.status.danger};  border-color: rgba(226, 128, 124, 0.4); background: ${t.status.dangerSoft}; }

    .harness-chat__input {
      padding: ${px(s.base)};
      border-top: 1px solid ${t.border.hairline};
      background: rgba(22, 30, 51, 0.5);
      backdrop-filter: blur(20px);
    }
    .harness-input-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: ${px(s.sm)};
      align-items: end;
    }
    .harness-input-textarea {
      min-height: 52px;
      max-height: 180px;
      width: 100%;
      padding: ${px(s.md)} ${px(s.base)};
      background: ${t.bg.elevated};
      color: ${t.text.primary};
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.md)};
      font-family: inherit;
      font-size: ${t.type.sizes.base}px;
      resize: none;
      transition: border-color ${t.motion.fast};
    }
    .harness-input-textarea:focus {
      outline: none;
      border-color: ${t.accent.primary};
      box-shadow: 0 0 0 3px ${t.accent.primarySoft};
    }
    .harness-input-buttons { display: flex; gap: ${px(s.xs)}; }
    .harness-input-button {
      width: 44px; height: 44px;
      border-radius: ${px(t.radius.md)};
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      color: ${t.text.secondary};
      cursor: pointer;
      transition: ${t.motion.fast};
      font-size: 18px;
    }
    .harness-input-button:hover { color: ${t.text.primary}; background: ${t.bg.elevated2}; }
    .harness-input-button--send {
      background: linear-gradient(135deg, ${t.accent.primary}, ${t.accent.primaryHover});
      color: white;
      border-color: transparent;
      box-shadow: 0 4px 12px rgba(124, 131, 255, 0.3);
    }
    .harness-input-button--send:hover { box-shadow: 0 6px 18px rgba(124, 131, 255, 0.45); }
    .harness-input-button--send:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
    .harness-input-button--stop {
      background: ${t.status.dangerSoft};
      color: ${t.status.danger};
      border-color: rgba(226, 128, 124, 0.3);
    }

    .harness-input-examples {
      display: flex; flex-wrap: wrap; gap: ${px(s.xs)};
      margin-top: ${px(s.md)};
    }
    .harness-input-examples button {
      padding: ${px(s.xs)} ${px(s.md)};
      background: transparent;
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.pill)};
      color: ${t.text.secondary};
      font-size: ${t.type.sizes.xs}px;
      cursor: pointer;
      transition: ${t.motion.fast};
    }
    .harness-input-examples button:hover { color: ${t.text.primary}; border-color: ${t.accent.primary}; }

    /* ---------- Preview (~980) ---------- */
    .harness-preview {
      display: grid;
      grid-template-rows: 44px 1fr 28px;
      min-height: 0;
      background: ${t.bg.base};
    }
    .harness-preview__toolbar {
      display: flex; align-items: center;
      gap: ${px(s.md)};
      padding: 0 ${px(s.base)};
      border-bottom: 1px solid ${t.border.hairline};
      background: rgba(14, 20, 36, 0.6);
      backdrop-filter: blur(20px);
    }
    .harness-preview__platform {
      display: inline-flex; gap: 0;
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.md)};
      padding: 2px;
    }
    .harness-preview__platform button {
      padding: ${px(s.xs)} ${px(s.md)};
      background: transparent;
      color: ${t.text.tertiary};
      font-size: ${t.type.sizes.sm}px;
      border: 0;
      border-radius: ${px(t.radius.sm)};
      cursor: pointer;
      transition: ${t.motion.fast};
    }
    .harness-preview__platform button[aria-pressed="true"] {
      background: ${t.accent.primary};
      color: white;
    }
    .harness-preview__action {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent;
      border: 1px solid ${t.border.hairline};
      border-radius: ${px(t.radius.md)};
      color: ${t.text.secondary};
      cursor: pointer;
      transition: ${t.motion.fast};
      font-size: 14px;
    }
    .harness-preview__action:hover { color: ${t.text.primary}; background: ${t.bg.elevated}; }
    .harness-preview__spacer { flex: 1; }

    .harness-preview__viewport {
      position: relative;
      overflow: hidden;
      min-height: 0;
      background: #0b0e14;
    }

    /* SCALE-TO-FIT mode (default) — wraps the iframe in a fixed-size
       device frame and scales it down to fit the column. The CSS variable
       --harness-scale is set by the controller via ResizeObserver. */
    .harness-preview__viewport.is-scale {
      display: grid;
      place-items: center;
    }
    .harness-preview__viewport.is-scale .harness-device-frame {
      width: 390px; height: 844px;
      flex: none;
      transform: scale(var(--harness-scale, 1));
      transform-origin: center;
      border-radius: 36px;
      border: 8px solid #1c2230;
      overflow: hidden;
      background: #000;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45);
    }
    .harness-preview__viewport.is-scale .harness-device-frame iframe {
      width: 100%; height: 100%; border: 0; background: transparent;
    }

    /* SCROLL mode — iframe at column width, full app height; user
       scrolls inside the column to see the rest of the app. */
    .harness-preview__viewport.is-scroll {
      display: block;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .harness-preview__viewport.is-scroll .harness-device-frame {
      width: 100%; min-height: 100%;
      border: 0; border-radius: 0;
      background: transparent;
    }
    .harness-preview__viewport.is-scroll .harness-device-frame iframe {
      width: 100%; height: 100vh; border: 0; background: transparent;
      display: block;
    }

    /* Toolbar mode-toggle pill */
    .harness-preview__viewmode {
      display: inline-flex; gap: 0;
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.md)};
      padding: 2px;
    }
    .harness-preview__viewmode button {
      padding: 4px 10px; min-width: 60px;
      background: transparent; border: 0;
      color: ${t.text.tertiary};
      font-size: ${t.type.sizes.xs}px;
      cursor: pointer; border-radius: ${px(t.radius.sm)};
      transition: background ${t.motion.fast}, color ${t.motion.fast};
    }
    .harness-preview__viewmode button[aria-pressed="true"] {
      background: ${t.accent.primarySoft};
      color: ${t.text.primary};
    }

    .harness-preview__statusbar {
      display: flex; align-items: center;
      gap: ${px(s.sm)};
      padding: 0 ${px(s.base)};
      border-top: 1px solid ${t.border.hairline};
      font-size: ${t.type.sizes.xs}px;
      color: ${t.text.tertiary};
      background: rgba(14, 20, 36, 0.6);
    }

    /* ---------- Empty studio ---------- */
    .harness-empty {
      grid-column: 1 / -1;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: ${px(s['3xl'])};
      gap: ${px(s.lg)};
      text-align: center;
    }
    .harness-empty__title {
      font-size: ${t.type.sizes.lg}px;
      font-weight: ${t.type.weights.semibold};
      color: ${t.text.primary};
    }
    .harness-empty__sub {
      font-size: ${t.type.sizes.base}px;
      color: ${t.text.secondary};
      max-width: 420px;
      line-height: 1.55;
    }
    .harness-empty__chips {
      display: flex; flex-wrap: wrap; gap: ${px(s.sm)};
      margin-top: ${px(s.lg)};
      justify-content: center;
    }

    /* ---------- Building / waking / error overlays ---------- */
    .harness-preview__overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: ${px(s.lg)};
      background:
        radial-gradient(600px 300px at 50% 30%, ${t.accent.primarySoft}, transparent 70%),
        rgba(14, 20, 36, 0.92);
      backdrop-filter: blur(8px);
    }
    .harness-skeleton {
      width: 60%; height: 8px;
      background: linear-gradient(90deg, ${t.bg.elevated}, ${t.bg.elevated2}, ${t.bg.elevated});
      background-size: 200% 100%;
      border-radius: ${px(t.radius.pill)};
      animation: harness-shimmer 1400ms infinite ease-in-out;
    }
    .harness-spinner {
      width: 36px; height: 36px;
      border: 3px solid ${t.border.subtle};
      border-top-color: ${t.accent.primary};
      border-radius: ${px(t.radius.pill)};
      animation: harness-spin 900ms linear infinite;
    }

    /* ---------- QR modal ---------- */
    .harness-modal__backdrop {
      position: fixed; inset: 0;
      background: rgba(14, 20, 36, 0.72);
      backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
      animation: harness-fade 200ms ease-out;
    }
    .harness-modal {
      max-width: 360px;
      padding: ${px(s.xl)};
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      border-radius: ${px(t.radius.xl)};
      box-shadow: ${t.shadow.modal};
      animation: harness-rise 380ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .harness-modal h3 {
      margin: 0 0 ${px(s.sm)};
      font-size: ${t.type.sizes.lg}px;
      font-weight: ${t.type.weights.semibold};
    }
    .harness-modal p { margin: 0 0 ${px(s.base)}; color: ${t.text.secondary}; line-height: 1.5; }
    .harness-modal__qr {
      width: 240px; height: 240px;
      background: white;
      border-radius: ${px(t.radius.md)};
      padding: ${px(s.sm)};
      margin: ${px(s.base)} auto;
      display: block;
    }

    /* ---------- Animations ---------- */
    @keyframes harness-fade-rise {
      0%   { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes harness-rise {
      0%   { opacity: 0; transform: translateY(12px) scale(0.98); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes harness-fade {
      0%   { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes harness-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes harness-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    /* ---------- Code tab ---------- */
    .harness-code-tab {
      position: absolute; inset: 0;
      display: grid;
      grid-template-columns: 240px 1fr;
      background: ${t.bg.elevated};
    }
    .harness-code-files {
      overflow-y: auto;
      border-right: 1px solid ${t.border.subtle};
      padding: ${s.sm}px 0;
      background: ${t.bg.base};
    }
    .harness-file-row {
      display: block; width: 100%;
      padding: ${s.xs}px ${s.md}px;
      background: transparent; border: 0; cursor: pointer;
      color: ${t.text.secondary};
      font: ${t.type.sizes.sm}px/1.4 ${t.type.mono};
      text-align: left;
      white-space: nowrap; text-overflow: ellipsis; overflow: hidden;
    }
    .harness-file-row:hover { background: ${t.bg.elevated2}; color: ${t.text.primary}; }
    .harness-file-row.is-active { background: ${t.accent.primarySoft}; color: ${t.text.primary}; }
    .harness-code-editor {
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .harness-code-toolbar {
      display: flex; align-items: center; gap: ${s.sm}px;
      padding: ${s.sm}px ${s.md}px;
      border-bottom: 1px solid ${t.border.subtle};
      background: ${t.bg.elevated};
    }
    .harness-code-path {
      color: ${t.text.primary};
      font: ${t.type.sizes.sm}px/1.4 ${t.type.mono};
    }
    .harness-code-textarea {
      flex: 1; min-height: 0;
      width: 100%;
      padding: ${s.md}px;
      border: 0; outline: 0; resize: none;
      background: ${t.bg.base};
      color: ${t.text.primary};
      font: 13px/1.55 ${t.type.mono};
      tab-size: 2;
    }
    .harness-pane-empty {
      display: flex; align-items: center; justify-content: center;
      height: 100%; color: ${t.text.tertiary};
      font-size: ${t.type.sizes.sm}px;
    }

    /* ---------- Ship tab ---------- */
    .harness-ship-tab {
      position: absolute; inset: 0;
      overflow-y: auto;
      padding: ${s.lg}px;
      background: ${t.bg.base};
      display: flex; flex-direction: column; gap: ${s.md}px;
    }
    .harness-ship-card {
      background: ${t.bg.elevated};
      border: 1px solid ${t.border.subtle};
      border-radius: 12px;
      padding: ${s.md}px ${s.lg}px;
    }
    .harness-ship-card h3 {
      margin: 0 0 ${s.xs}px 0;
      font-size: ${t.type.sizes.lg}px;
      font-weight: ${t.type.weights.semibold};
      color: ${t.text.primary};
    }
    .harness-ship-sub {
      margin: 0 0 ${s.sm}px 0;
      color: ${t.text.secondary};
      font-size: ${t.type.sizes.sm}px;
    }
    .harness-ship-actions {
      display: flex; gap: ${s.sm}px; flex-wrap: wrap;
      margin: ${s.sm}px 0;
    }
    .harness-ship-status {
      margin-top: ${s.sm}px;
      color: ${t.text.tertiary};
      font: ${t.type.sizes.sm}px/1.4 ${t.type.mono};
    }
    .harness-ship-artifact { margin-top: ${s.xs}px; }
    .harness-ship-artifact a {
      color: ${t.accent.primary};
      text-decoration: none;
      font-size: ${t.type.sizes.sm}px;
    }
    .harness-ship-listing {
      margin-top: ${s.sm}px;
      padding: ${s.sm}px ${s.md}px;
      background: ${t.bg.base};
      border-radius: 8px;
      color: ${t.text.primary};
      font-size: ${t.type.sizes.sm}px;
      line-height: 1.55;
    }
    .harness-ship-listing-desc {
      margin-top: ${s.xs}px;
      color: ${t.text.secondary};
      white-space: pre-wrap;
    }
    .harness-ship-listing-meta {
      margin-top: ${s.xs}px;
      color: ${t.text.tertiary};
      font-size: ${t.type.sizes.xs}px;
    }
    .harness-ship-checklist {
      margin-top: ${s.sm}px;
      display: flex; flex-direction: column; gap: ${s.xs}px;
    }
    .harness-ship-check {
      display: flex; gap: ${s.sm}px; align-items: flex-start;
      color: ${t.text.primary};
      font-size: ${t.type.sizes.sm}px;
    }
    .harness-ship-crash {
      padding: ${s.xs}px 0;
      color: ${t.text.secondary};
      font: ${t.type.sizes.sm}px/1.4 ${t.type.mono};
      border-top: 1px solid ${t.border.subtle};
    }
    .harness-ship-crash:first-child { border-top: 0; }

    /* Honor reduced-motion. */
    @media (prefers-reduced-motion: reduce) {
      .harness-studio *, .harness-studio *::before, .harness-studio *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    }
  </style>`;
}
