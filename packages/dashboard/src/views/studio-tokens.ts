/**
 * Studio design tokens — single source of truth for the App Development
 * dashboard surface. Mirrors the design tokens used in the generated apps
 * (see docs/operations/phase8.5-design-spec.md), so the Studio shell feels
 * coherent with the apps it produces.
 *
 * Imported by studio.ts. Values are CSS-shaped (strings) so they can be
 * dropped directly into template literals.
 */

export const studioTokens = {
  // Color palette — "Focus" (Linear-inspired dark) for the operator surface.
  bg: {
    canvas: '#0d0e14',
    surface: '#161821',
    surfaceRaised: '#1c1f2b',
    border: '#262a37',
    borderActive: '#5e6ad2',
    overlay: 'rgba(13, 14, 20, 0.72)',
  },
  text: {
    primary: '#f4f5f8',
    secondary: '#9aa1b3',
    tertiary: '#6b7081',
    inverse: '#0d0e14',
  },
  accent: {
    primary: '#5e6ad2',
    primaryHover: '#7280e8',
    primarySoft: 'rgba(94, 106, 210, 0.12)',
    cyan: '#00b8d4',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
  },
  // 4pt grid — only these values appear in computed styles.
  space: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    base: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    pill: '999px',
  },
  shadow: {
    level1: '0 2px 8px rgba(0, 0, 0, 0.3)',
    level2: '0 4px 16px rgba(0, 0, 0, 0.4)',
    level3: '0 8px 24px rgba(0, 0, 0, 0.5)',
    inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },
  type: {
    family: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
    sizeXs: '11px',
    sizeSm: '12px',
    sizeMd: '13px',
    sizeBase: '14px',
    sizeLg: '16px',
    sizeXl: '20px',
    weightMedium: '500',
    weightSemibold: '600',
    weightBold: '700',
  },
  motion: {
    fast: '120ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '320ms cubic-bezier(0.4, 0, 0.2, 1)',
    spring: '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

/**
 * Renders a `<style>` block with the full Studio stylesheet.
 * Pulled out of the inline render() string so studio.ts stays focused on
 * structure and the rules can be edited without touching component code.
 */
export function renderStudioStylesheet(): string {
  const t = studioTokens;
  return `<style>
    /* ============================================================== */
    /* Studio shell — 4-column grid, full viewport                     */
    /* ============================================================== */
    .studio {
      display: grid;
      /* VibeCode-style layout — preview takes most of the right side.
         Chat is a fixed 380px column (compact prompt-and-history),
         preview gets all remaining width. At a 1600px viewport this
         leaves the preview at ~1000px which is comfortably above
         Snack's 700px runtime-spawn threshold. */
      grid-template-columns: 220px 380px 1fr;
      /* Lock the studio shell to the viewport height so the preview
         pane stays anchored. Long chat messages SCROLL inside the
         middle column rather than pushing the whole shell taller —
         otherwise the absolute-positioned cropped iframe ends up
         off-screen when the user has long chat history.
         Use !important to override the dashboard's flex parent
         that otherwise stretches us to full content height. */
      height: calc(100vh - 80px) !important;
      max-height: calc(100vh - 80px) !important;
      overflow: hidden !important;
      background: ${t.bg.canvas};
      color: ${t.text.primary};
      font-family: ${t.type.family};
      font-size: ${t.type.sizeBase};
    }
    /* The dashboard wraps each view in #dashboard-view which has
       max-width: 1400px and padding — those constrain the studio
       below the 1200px iframe-width threshold Snack needs. Override
       for the studio specifically: use the full viewport width and
       drop the padding so the preview pane gets enough room. Also
       cap the parent's height so our studio's height calc has a
       constrained context to evaluate against. */
    #dashboard-view:has(.studio) {
      max-width: none !important;
      padding: 0 !important;
      height: calc(100vh - 80px) !important;
      max-height: calc(100vh - 80px) !important;
      overflow: hidden !important;
    }
    .dashboard-main:has(.studio) {
      max-height: 100vh !important;
      overflow: hidden !important;
    }

    /* ============================================================== */
    /* SIDEBAR — project list                                          */
    /* ============================================================== */
    .studio-sidebar {
      border-right: 1px solid ${t.bg.border};
      display: flex;
      flex-direction: column;
      background: ${t.bg.canvas};
      /* Match the studio shell height so the project list scrolls
         internally instead of pushing the grid taller. */
      height: calc(100vh - 80px);
      max-height: calc(100vh - 80px);
      overflow: hidden;
    }
    .studio-sidebar__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: ${t.space.base};
      border-bottom: 1px solid ${t.bg.border};
    }
    .studio-sidebar__header h3 {
      margin: 0;
      font-size: ${t.type.sizeXs};
      font-weight: ${t.type.weightSemibold};
      color: ${t.text.tertiary};
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .studio-sidebar__list {
      flex: 1;
      overflow-y: auto;
      padding: ${t.space.sm};
    }
    .studio-project {
      padding: ${t.space.md};
      border-radius: ${t.radius.md};
      cursor: pointer;
      transition: background ${t.motion.fast}, border-color ${t.motion.fast};
      border: 1px solid transparent;
      margin-bottom: ${t.space.xs};
    }
    .studio-project:hover {
      background: ${t.bg.surface};
    }
    .studio-project.is-active {
      background: ${t.accent.primarySoft};
      border-color: ${t.accent.primary};
    }
    .studio-project__name {
      font-size: ${t.type.sizeMd};
      font-weight: ${t.type.weightMedium};
      color: ${t.text.primary};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .studio-project__meta {
      font-size: ${t.type.sizeXs};
      color: ${t.text.tertiary};
      margin-top: ${t.space.xs};
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: ${t.space.sm};
    }
    .studio-project__saved {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 8px;
      background: rgba(52, 211, 153, 0.12);
      color: rgb(52, 211, 153);
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .studio-sidebar__footer {
      padding: ${t.space.md} ${t.space.base};
      border-top: 1px solid ${t.bg.border};
      font-size: ${t.type.sizeXs};
      color: ${t.text.secondary};
      display: flex;
      flex-direction: column;
      gap: ${t.space.sm};
    }

    /* ============================================================== */
    /* CENTER PANE — tab strip + active panel                         */
    /* ============================================================== */
    .studio-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      /* Explicit pixel cap — max-height:100% does not reliably resolve
         to 100% of grid row the way it does in flex contexts. Match
         the .studio shell height directly. */
      height: calc(100vh - 80px);
      max-height: calc(100vh - 80px);
      overflow: hidden;
      background: ${t.bg.canvas};
    }
    .studio-tabs {
      display: flex;
      align-items: center;
      gap: ${t.space.xs};
      padding: ${t.space.sm} ${t.space.base};
      border-bottom: 1px solid ${t.bg.border};
      background: ${t.bg.surface};
      box-shadow: ${t.shadow.inset};
    }
    .studio-tab {
      background: transparent;
      border: 0;
      color: ${t.text.secondary};
      padding: ${t.space.sm} ${t.space.md};
      border-radius: ${t.radius.sm};
      cursor: pointer;
      font-size: ${t.type.sizeMd};
      font-family: inherit;
      font-weight: ${t.type.weightMedium};
      transition: background ${t.motion.fast}, color ${t.motion.fast};
    }
    .studio-tab.is-active {
      background: ${t.bg.surfaceRaised};
      color: ${t.text.primary};
    }
    .studio-tab:hover:not(.is-active) {
      background: ${t.bg.surfaceRaised};
      color: ${t.text.primary};
    }
    .studio-tabs__spacer { flex: 1; }
    .studio-tab-panel {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /* ============================================================== */
    /* BUTTONS — three variants: primary / ghost / pill               */
    /* ============================================================== */
    .studio-btn {
      padding: ${t.space.sm} ${t.space.md};
      border-radius: ${t.radius.sm};
      border: 1px solid transparent;
      cursor: pointer;
      font-size: ${t.type.sizeMd};
      font-family: inherit;
      font-weight: ${t.type.weightMedium};
      transition: background ${t.motion.fast}, transform ${t.motion.fast}, border-color ${t.motion.fast};
    }
    .studio-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .studio-btn--primary {
      background: ${t.accent.primary};
      color: ${t.text.primary};
      border-color: ${t.accent.primary};
      font-weight: ${t.type.weightSemibold};
    }
    .studio-btn--primary:hover:not(:disabled) {
      background: ${t.accent.primaryHover};
      border-color: ${t.accent.primaryHover};
    }
    .studio-btn--primary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .studio-btn--ghost {
      background: transparent;
      color: ${t.text.secondary};
      border-color: ${t.bg.border};
    }
    .studio-btn--ghost:hover:not(:disabled) {
      background: ${t.bg.surfaceRaised};
      color: ${t.text.primary};
      border-color: ${t.bg.border};
    }
    .studio-btn--sm {
      padding: ${t.space.xs} ${t.space.sm};
      font-size: ${t.type.sizeSm};
    }

    /* ============================================================== */
    /* CHAT — assistant + user bubbles, input row                     */
    /* ============================================================== */
    .studio-chat {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: ${t.space.base};
    }
    /* Empty-state hero with example prompts (VibeCode parity) */
    .studio-empty-hero {
      padding: 32px 8px 12px;
      text-align: center;
    }
    .studio-empty-hero__icon {
      font-size: 48px;
      margin-bottom: 6px;
    }
    .studio-empty-hero__title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 4px;
      color: ${t.text.primary};
    }
    .studio-empty-hero__sub {
      font-size: 12px;
      color: ${t.text.secondary};
      margin: 0 0 16px;
      line-height: 1.4;
    }
    .studio-empty-hero__grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .studio-empty-example {
      background: ${t.bg.surfaceRaised};
      border: 1px solid ${t.bg.border};
      border-radius: 12px;
      padding: 12px 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      color: ${t.text.primary};
      transition: transform 140ms ease-out, border-color 140ms ease-out;
    }
    .studio-empty-example:hover {
      transform: translateY(-2px);
      border-color: ${t.accent.primary};
    }
    .studio-empty-example:active {
      transform: scale(0.97);
    }
    .studio-empty-example__emoji {
      font-size: 24px;
    }
    .studio-empty-example__name {
      font-size: 12px;
      font-weight: 600;
    }
    .studio-messages {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: ${t.space.md};
      padding-bottom: ${t.space.base};
    }
    .studio-msg {
      max-width: 80%;
      padding: ${t.space.md} ${t.space.base};
      border-radius: ${t.radius.lg};
      font-size: ${t.type.sizeBase};
      line-height: 1.5;
      animation: studio-fade-in ${t.motion.base} both;
    }
    .studio-msg--user {
      align-self: flex-end;
      background: ${t.accent.primary};
      color: ${t.text.primary};
    }
    .studio-msg--assistant {
      align-self: flex-start;
      background: ${t.bg.surfaceRaised};
      color: ${t.text.primary};
    }
    .studio-msg--system {
      align-self: center;
      background: ${t.bg.surface};
      font-size: ${t.type.sizeSm};
      color: ${t.text.secondary};
      max-width: 100%;
      border: 1px solid ${t.bg.border};
    }
    .studio-input-row {
      display: flex;
      gap: ${t.space.sm};
      align-items: flex-end;
      border-top: 1px solid ${t.bg.border};
      padding-top: ${t.space.base};
    }
    .studio-input {
      flex: 1;
      background: ${t.bg.surface};
      color: ${t.text.primary};
      border: 1px solid ${t.bg.border};
      border-radius: ${t.radius.md};
      padding: ${t.space.md};
      font-family: inherit;
      font-size: ${t.type.sizeBase};
      resize: vertical;
      min-height: 64px;
      transition: border-color ${t.motion.fast};
    }
    .studio-input:focus {
      outline: none;
      border-color: ${t.accent.primary};
    }

    /* ============================================================== */
    /* FILES tab                                                       */
    /* ============================================================== */
    .studio-files {
      padding: ${t.space.base};
      overflow-y: auto;
      height: 100%;
    }
    .studio-file {
      padding: ${t.space.sm} ${t.space.md};
      border-radius: ${t.radius.sm};
      cursor: pointer;
      font-size: ${t.type.sizeMd};
      font-family: ${t.type.mono};
      display: flex;
      align-items: center;
      gap: ${t.space.sm};
      color: ${t.text.secondary};
      transition: background ${t.motion.fast}, color ${t.motion.fast};
    }
    .studio-file:hover {
      background: ${t.bg.surface};
      color: ${t.text.primary};
    }
    .studio-file.is-streaming {
      color: ${t.accent.warning};
    }
    .studio-file.is-streaming::before { content: '⏳ '; }
    .studio-file.is-complete::before { content: '📄 '; }
    .studio-file.is-active {
      background: ${t.accent.primarySoft};
      color: ${t.text.primary};
    }

    /* ============================================================== */
    /* CODE tab                                                        */
    /* ============================================================== */
    .studio-code {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .studio-code__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: ${t.space.md} ${t.space.base};
      border-bottom: 1px solid ${t.bg.border};
      background: ${t.bg.surface};
    }
    .studio-code__path {
      font-family: ${t.type.mono};
      font-size: ${t.type.sizeMd};
      color: ${t.text.secondary};
    }
    .studio-code__editor { flex: 1; min-height: 0; }

    /* ============================================================== */
    /* LOGS tab                                                        */
    /* ============================================================== */
    .studio-logs {
      padding: ${t.space.base};
      overflow-y: auto;
      height: 100%;
      font-family: ${t.type.mono};
      font-size: ${t.type.sizeSm};
    }
    .studio-log-line {
      padding: ${t.space.xs} 0;
      color: ${t.text.secondary};
      border-bottom: 1px dashed transparent;
    }
    .studio-log-line:hover {
      color: ${t.text.primary};
      border-bottom-color: ${t.bg.border};
    }

    /* ============================================================== */
    /* DESIGN tab — branding picker grid                               */
    /* ============================================================== */
    .studio-design {
      padding: ${t.space.base};
      overflow-y: auto;
      height: 100%;
    }
    .studio-branding-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: ${t.space.md};
      margin-top: ${t.space.md};
    }
    .studio-branding-card {
      background: ${t.bg.surface};
      border: 1px solid ${t.bg.border};
      border-radius: ${t.radius.md};
      overflow: hidden;
      transition: transform ${t.motion.fast}, border-color ${t.motion.fast};
    }
    .studio-branding-card:hover {
      transform: translateY(-2px);
      border-color: ${t.accent.primary};
    }
    .studio-branding-card__swatch { height: 80px; }
    .studio-branding-card__body { padding: ${t.space.md}; }
    .studio-branding-card__name {
      font-size: ${t.type.sizeMd};
      font-weight: ${t.type.weightSemibold};
      margin: 0 0 ${t.space.xs};
    }
    .studio-branding-card__desc {
      font-size: ${t.type.sizeXs};
      color: ${t.text.tertiary};
      margin: 0 0 ${t.space.sm};
      line-height: 1.5;
    }

    /* ============================================================== */
    /* PREVIEW pane                                                    */
    /* ============================================================== */
    .studio-preview {
      border-left: 1px solid ${t.bg.border};
      padding: ${t.space.base};
      display: flex;
      flex-direction: column;
      gap: ${t.space.base};
      background: ${t.bg.canvas};
      /* Anchor for the absolutely-positioned platform tabs toolbar
         (.studio-preview__platform-tabs) which floats in the top-right
         corner over the device frame. */
      position: relative;
      /* Explicit pixel cap matching the studio shell. Same reason as
         .studio-main above — grid items don't resolve max-height: 100%
         the way flex items do. */
      height: calc(100vh - 80px);
      max-height: calc(100vh - 80px);
      overflow: hidden;
    }
    /* The device-frame container fills the preview pane's available
       height. Snack's player area is 716×285 — at scale 1.2 it
       renders as 859×342 visible, which fits comfortably in a
       ~880px-tall preview pane (920 shell - 32px padding - ~8px gap). */
    .studio-preview__device {
      flex: 1;
      min-height: 0;
      display: flex;
      overflow: hidden;
    }
    .studio-device-frame {
      background: ${t.bg.surface};
      border: 1px solid ${t.bg.border};
      border-radius: 36px;
      padding: ${t.space.sm};
      aspect-ratio: 9 / 19;
      max-width: 300px;
      margin: 0 auto;
      width: 100%;
      box-shadow: ${t.shadow.level3};
    }
    /* When the device frame is rendering a real Snack iframe, drop the
       phone-shaped 300px constraint — Snack's web player needs >=700px
       to auto-spawn the runtime sub-frame, otherwise it falls back to
       "Run on device" QR mode and never renders inside the iframe.
       The :has() check targets only frames containing an actual iframe;
       static content (loading spinners, etc.) keeps the phone shape. */
    .studio-device-frame:has(iframe) {
      max-width: none;
      aspect-ratio: auto;
      height: 100%;
      width: 100%;
      flex: 1;
      min-height: 600px;
      border-radius: 14px;
      padding: 0;
      /* The Snack /embedded page is fundamentally split: editor on the
         LEFT, device-pane (285x716px, hard-coded) on the RIGHT. We crop
         to just the device pane and scale it up so the phone-sized
         preview fills the dashboard's preview column.
         The math (probed via scripts/probe-embed-layout.ts):
            iframe width 1200 → editor at x=0 w=915, device at x=915 w=285
            iframe width  700 → editor at x=0 w=415, device at x=415 w=285
            device pane is ALWAYS 285x716 regardless of iframe width
         Strategy: size the iframe so the device pane lands at x=0..285
         within the visible window, then scale up. We push the iframe
         to be 1200px wide (so editor is 915px), translate it left by
         915px, and scale 1.7× so the 285×716 phone fills ~485×1217.
         The container clips overflow. */
      overflow: hidden;
      position: relative;
    }
    .studio-device-frame:has(iframe) .studio-device-screen {
      border-radius: 14px;
      overflow: hidden;
      position: relative;
    }
    .studio-device-frame:has(iframe) .studio-device-screen iframe {
      border-radius: 0 !important;
      position: absolute !important;
      /* Lock iframe to a fixed size so Snack's internal layout is
         deterministic. 1200px wide → editor pane is 915px, device pane
         is 285px. Snack puts the device pane at y=48 (top header band)
         and the player area is 716px tall so device-pane spans y=48..764. */
      width: 1200px !important;
      height: 800px !important;
      /* Pull iframe up by 48px AND left by 915px so the device pane's
         top-left lands at the visible window's (0, 0). */
      left: -915px !important;
      top: -48px !important;
      border: 0 !important;
      /* Origin at the device pane's top-left corner in iframe coords
         (915, 48). Scale 1.2× upscales 285×716 → ~342×859 visible —
         which is the maximum that fits inside the ~880px-tall preview
         pane without cropping the bottom of the running app. */
      transform-origin: 915px 48px !important;
      transform: scale(1.2) !important;
    }
    .studio-device-screen {
      background: ${t.bg.canvas};
      border-radius: 28px;
      height: 100%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      text-align: center;
      flex-direction: column;
      gap: ${t.space.sm};
      font-size: ${t.type.sizeSm};
      color: ${t.text.secondary};
      overflow: hidden;
    }
    .studio-device-screen > *:not(iframe) { padding: 0 ${t.space.base}; }
    .studio-device-screen iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 28px;
    }

    /* ============================================================== */
    /* ANIMATIONS                                                      */
    /* ============================================================== */
    @keyframes studio-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes studio-shimmer {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }

    /* ============================================================== */
    /* COMPLIANCE PILL — sidebar footer                               */
    /* ============================================================== */
    .studio-compliance-pill {
      display: flex;
      align-items: center;
      gap: ${t.space.sm};
      padding: ${t.space.sm} ${t.space.md};
      border-radius: ${t.radius.pill};
      background: ${t.bg.surface};
      border: 1px solid ${t.bg.border};
      font-size: ${t.type.sizeXs};
      cursor: pointer;
      transition: border-color ${t.motion.fast};
    }
    .studio-compliance-pill:hover {
      border-color: ${t.bg.borderActive};
    }
    .studio-compliance-pill--ok { color: ${t.accent.success}; }
    .studio-compliance-pill--warn { color: ${t.accent.warning}; }
    .studio-compliance-pill--error { color: ${t.accent.error}; }
    .studio-compliance-pill__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    /* ============================================================== */
    /* ESCALATION badge                                                */
    /* ============================================================== */
    .studio-escalation-badge {
      background: ${t.accent.error};
      color: ${t.text.primary};
      padding: ${t.space.sm} ${t.space.md};
      border-radius: ${t.radius.md};
      font-size: ${t.type.sizeSm};
      font-weight: ${t.type.weightSemibold};
      cursor: pointer;
      box-shadow: ${t.shadow.level2};
    }

    /* ============================================================== */
    /* Inline design picker (in-chat)                                  */
    /* ============================================================== */
    .studio-design-grid-inline {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: ${t.space.sm};
      margin-top: ${t.space.md};
    }
    .studio-design-card {
      background: ${t.bg.surface};
      border: 1px solid ${t.bg.border};
      border-radius: ${t.radius.md};
      padding: 0;
      cursor: pointer;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      text-align: left;
      color: inherit;
      font-family: inherit;
      transition: transform ${t.motion.fast}, border-color ${t.motion.fast};
    }
    .studio-design-card:hover {
      border-color: ${t.accent.primary};
      transform: translateY(-1px);
    }
    .studio-design-card__swatch {
      display: block;
      height: 44px;
    }
    .studio-design-card__name {
      display: block;
      padding: ${t.space.sm} ${t.space.md} ${t.space.xs};
      font-size: ${t.type.sizeXs};
      font-weight: ${t.type.weightSemibold};
    }
    .studio-design-card__inspo {
      display: block;
      padding: 0 ${t.space.md} ${t.space.sm};
      font-size: ${t.type.sizeXs};
      color: ${t.text.tertiary};
    }

    /* ============================================================== */
    /* PREVIEW pane v2 — platform tabs, actions, modal                 */
    /* ============================================================== */
    /* Floating segmented control in the top-right corner of the preview
       pane. VibeCode-style: the preview is the focus; controls are
       small, unobtrusive, hover-able. */
    .studio-preview__platform-tabs {
      position: absolute;
      top: ${t.space.md};
      right: ${t.space.md};
      z-index: 5;
      display: flex;
      gap: 2px;
      padding: 4px;
      border: 1px solid ${t.bg.border};
      border-radius: ${t.radius.md};
      background: rgba(20, 22, 30, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: ${t.shadow.level2};
    }
    .studio-preview__tab {
      width: 32px;
      height: 32px;
      background: transparent;
      border: 1px solid transparent;
      color: ${t.text.secondary};
      padding: 0;
      border-radius: ${t.radius.sm};
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      font-family: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background ${t.motion.fast}, color ${t.motion.fast};
    }
    .studio-preview__tab:hover {
      background: ${t.bg.surfaceRaised};
      color: ${t.text.primary};
    }
    .studio-preview__tab.is-active {
      background: ${t.accent.primarySoft};
      color: ${t.text.primary};
      border-color: ${t.accent.primary};
    }
    .studio-preview__actions {
      display: flex;
      gap: ${t.space.sm};
      padding: ${t.space.sm} 0;
      justify-content: center;
    }

    /* ----- Open on phone modal ----- */
    .studio-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(13, 14, 20, 0.78);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: studio-fade-in ${t.motion.base} both;
    }
    .studio-modal {
      background: ${t.bg.surfaceRaised};
      border: 1px solid ${t.bg.border};
      border-radius: ${t.radius.lg};
      box-shadow: ${t.shadow.level3};
      padding: ${t.space.xl};
      max-width: 460px;
      width: 90%;
      max-height: 90vh;
      overflow: auto;
      position: relative;
    }
    .studio-modal__close {
      position: absolute;
      top: ${t.space.md};
      right: ${t.space.md};
      background: transparent;
      border: 1px solid ${t.bg.border};
      color: ${t.text.secondary};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background ${t.motion.fast};
    }
    .studio-modal__close:hover {
      background: ${t.bg.surface};
      color: ${t.text.primary};
    }
  </style>`;
}
