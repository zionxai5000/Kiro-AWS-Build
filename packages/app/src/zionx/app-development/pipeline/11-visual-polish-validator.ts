/**
 * Pipeline Hook 11: Visual Polish Validator
 *
 * Trigger: After Hook 2 (code-generator) finishes streaming all files.
 * Action: Score every screen file against 12 polish checks. Fail = retry.
 * Failure mode: NOTIFY (orchestrator decides to re-prompt or ship-with-badge).
 *
 * The 12 checks below collectively encode SECTION 0.5 of prompts.ts. The
 * pass threshold (default 70/100) is configurable via LIMITS.qualityVisualPolishThreshold.
 * Hard-fail items (placeholder copy, missing gradient, missing animation)
 * force the overall result to fail regardless of total score.
 */

import { isHookEnabled } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { QualityCheck, QualityScore } from './quality-types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'visual-polish-validator',
  name: 'Visual Polish Validator',
  triggerType: 'manual',
  failureMode: 'notify',
  timeoutMs: 10_000,
  maxConcurrent: 1,
} as const;

export interface VisualPolishInput {
  projectId: string;
  /** Map of file path -> file content. Hook expects only .tsx / .jsx files. */
  files: Record<string, string>;
}

export interface VisualPolishOutput {
  score: QualityScore;
}


// ---------------------------------------------------------------------------
// 12 Checks — each takes the merged source of all .tsx files and returns
// (passed, evidence). Implemented with regex against source rather than full
// AST because (a) we only check for presence patterns and (b) parsing 30+
// files at every generation costs more than the regex pass.
// ---------------------------------------------------------------------------

type CheckFn = (src: string) => { passed: boolean; evidence?: string };

const CHECKS: Array<{ id: string; label: string; weight: number; hardFail: boolean; fn: CheckFn }> = [
  {
    id: 'gradient-rendered',
    label: 'expo-linear-gradient imported AND <LinearGradient> rendered',
    weight: 5,
    hardFail: true,
    fn: (s) => ({
      passed: /from ['"]expo-linear-gradient['"]/.test(s) && /<LinearGradient[\s>]/.test(s),
      evidence: 'No <LinearGradient> tag found in any screen.',
    }),
  },
  {
    id: 'body-gradient-absolute-fill',
    label: 'Body gradient is StyleSheet.absoluteFill (covers full screen, not just a card)',
    weight: 15,
    hardFail: true,
    fn: (s) => ({
      passed: /<LinearGradient[\s\S]{0,400}style=\{?\s*StyleSheet\.absoluteFill/i.test(s) ||
              /<LinearGradient[\s\S]{0,400}absoluteFillObject/i.test(s),
      evidence: 'No body-level gradient. Add <LinearGradient style={StyleSheet.absoluteFill} colors={["#0A0E1F","#14182E","#1B1F3A"]} /> as first child of the root container.',
    }),
  },
  {
    id: 'gradient-3-stops',
    label: 'Body gradient has 3+ stops (richer depth)',
    weight: 5,
    hardFail: false,
    fn: (s) => ({
      passed: /colors=\{?\s*\[\s*['"]#[0-9A-Fa-f]{3,8}['"]\s*,\s*['"]#[0-9A-Fa-f]{3,8}['"]\s*,\s*['"]#[0-9A-Fa-f]{3,8}['"]/.test(s),
      evidence: 'No 3-stop gradient detected. Use colors={["#0A0E1F","#14182E","#1B1F3A"]} for the body.',
    }),
  },
  {
    id: 'palette-violet-or-gold',
    label: 'Uses violet (#A78BFA) or gold (#F5C97B) accent — Midnight Aurora palette',
    weight: 10,
    hardFail: true,
    fn: (s) => {
      const hasViolet = /#A78BFA|#E0AAFF/i.test(s);
      const hasGold = /#F5C97B|#FF7B9C/i.test(s);
      const hasTeal = /#4FD1C5/i.test(s);
      return {
        passed: hasViolet || hasGold || hasTeal,
        evidence: 'No Midnight Aurora palette colors found. Use #A78BFA, #E0AAFF, #F5C97B, #FF7B9C, or #4FD1C5 for accents.',
      };
    },
  },
  {
    id: 'no-banned-hex',
    label: 'No banned hex codes (#FF8C00, white body, #10B981 emerald, etc.)',
    weight: 15,
    hardFail: true,
    fn: (s) => {
      // Banned ANYWHERE (these colors are AI-cliché regardless of position)
      const bannedAnywhere = [
        '#FF8C00', '#F97316', '#FFA500', '#FF6B35', '#FF7700',
        '#10B981', '#3B82F6', '#EF4444', '#6366F1', '#FF4889',
        '#00D4FF', '#FFD166',
      ];
      const offenders = bannedAnywhere.filter((c) => new RegExp(c, 'i').test(s));
      // White / black are only banned as backgroundColor on the body (not as
      // text/icon/border colors — those are fine and common).
      const hasWhiteBody = /backgroundColor\s*:\s*['"]#?(FFF(FFF)?|fff(fff)?|white)['"]/i.test(s);
      const hasBlackBody = /backgroundColor\s*:\s*['"]#?(000(000)?|black)['"]/i.test(s);
      const passed = offenders.length === 0 && !hasWhiteBody && !hasBlackBody;
      return {
        passed,
        evidence: passed
          ? undefined
          : `Banned colors detected: ${[...offenders, hasWhiteBody ? 'white body' : '', hasBlackBody ? 'black body' : ''].filter(Boolean).join(', ')}. Use the Midnight Aurora palette only.`,
      };
    },
  },
  {
    id: 'entry-animation',
    label: 'MotiView OR Animated.View with from/animate entry props',
    weight: 10,
    hardFail: true,
    fn: (s) => ({
      passed: /<MotiView[\s\S]{0,400}?(from|animate)=/.test(s) ||
              /<Animated\.View[\s\S]{0,400}?(entering|exiting)=/.test(s),
      evidence: 'No entry animation found (need <MotiView from={...}> or <Animated.View entering={...}>).',
    }),
  },
  {
    id: 'spring-on-tap',
    label: 'withSpring OR withTiming used (tap feedback)',
    weight: 10,
    hardFail: true,
    fn: (s) => ({
      passed: /withSpring\s*\(/.test(s) || /withTiming\s*\(/.test(s),
      evidence: 'No withSpring/withTiming calls. Tap interactions need scale-spring feedback.',
    }),
  },
  {
    id: 'haptics-on-tap',
    label: 'Haptics.impactAsync OR notificationAsync called',
    weight: 10,
    hardFail: true,
    fn: (s) => ({
      passed: /Haptics\.(impactAsync|notificationAsync|selectionAsync)\s*\(/.test(s),
      evidence: 'No Haptics calls. Every primary tap should fire Haptics.impactAsync(Light) at minimum.',
    }),
  },
  {
    id: 'shadows-set',
    label: 'shadowOpacity AND shadowRadius set in ≥3 places (cards have depth)',
    weight: 10,
    hardFail: false,
    fn: (s) => {
      const shadowOpacityCount = (s.match(/shadowOpacity\s*:/g) ?? []).length;
      return {
        passed: shadowOpacityCount >= 3,
        evidence: `Only ${shadowOpacityCount} shadowOpacity declarations found (need ≥3 — cards, CTAs, hero block).`,
      };
    },
  },
  {
    id: 'accent-color',
    label: 'Custom accent color (not pure white/black/grayscale) used in styles',
    weight: 10,
    hardFail: true,
    fn: (s) => {
      // Find hex colors in styles. Reject pure white/black and grayscale.
      const hexColors = s.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      const isAccent = (h: string): boolean => {
        const r = parseInt(h.slice(1, 3), 16);
        const g = parseInt(h.slice(3, 5), 16);
        const b = parseInt(h.slice(5, 7), 16);
        // Reject grayscale (R≈G≈B within 8 units)
        if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) return false;
        return true;
      };
      const accents = hexColors.filter(isAccent);
      return {
        passed: accents.length >= 1,
        evidence: `Found ${hexColors.length} hex colors but ${accents.length} accent colors. Need at least one non-grayscale brand color.`,
      };
    },
  },
  {
    id: 'safearea-wrap',
    label: 'SafeAreaView OR useSafeAreaInsets used in screens',
    weight: 5,
    hardFail: false,
    fn: (s) => ({
      passed: /SafeAreaView/.test(s) || /useSafeAreaInsets/.test(s),
      evidence: 'No SafeAreaView wrapper detected — screens may clip on notch devices.',
    }),
  },
  {
    id: 'card-radius',
    label: 'Cards use borderRadius >= 12 (rounded, not square)',
    weight: 10,
    hardFail: false,
    fn: (s) => {
      const radii = Array.from(s.matchAll(/borderRadius\s*:\s*(\d+)/g)).map((m) => parseInt(m[1]!, 10));
      const ok = radii.filter((r) => r >= 12).length;
      return {
        passed: ok >= 2,
        evidence: `Only ${ok} borderRadius values >=12 found. Cards/buttons should be 12-20px rounded.`,
      };
    },
  },
  {
    id: 'typography-weights',
    label: 'Typography uses ≥2 distinct fontWeight values (visual hierarchy)',
    weight: 10,
    hardFail: false,
    fn: (s) => {
      const weights = new Set(Array.from(s.matchAll(/fontWeight\s*:\s*['"]?(\d+|bold|normal|semibold)/g)).map((m) => m[1]));
      return {
        passed: weights.size >= 2,
        evidence: `Only ${weights.size} distinct fontWeight values used (${[...weights].join(', ')}). Need 2+ for hierarchy.`,
      };
    },
  },
  {
    id: 'no-placeholder-copy',
    label: 'No "Lorem ipsum" / "Coming soon" / "Item N" placeholder copy',
    weight: 10,
    hardFail: true,
    fn: (s) => {
      const placeholders = [
        /\blorem ipsum\b/i,
        /\bcoming soon\b/i,
        /\btodo\s*:\s*[a-z]/i,  // "todo: implement"
        /['"](Item|Habit|Task|Entry)\s*\d+['"]/,  // "Item 1", "Habit 2"
        /\bplaceholder text\b/i,
        /['"]hello world['"]/i,
      ];
      const hits = placeholders.filter((re) => re.test(s));
      return {
        passed: hits.length === 0,
        evidence: hits.length ? `Found ${hits.length} placeholder pattern(s): ${hits.map(String).join(', ')}` : undefined,
      };
    },
  },
  {
    id: 'custom-button-component',
    label: 'Custom Button or CTA component (not bare RN <Button>)',
    weight: 5,
    hardFail: false,
    fn: (s) => {
      const usesNativeButton = /<Button[\s>]/.test(s) && !/from ['"]\.\.\/.+\/Button['"]/.test(s);
      // Pass if a custom Button is imported from theme/components, OR Pressable wraps the CTA
      const hasCustomCTA = /from ['"][\.\/].*\/Button['"]/.test(s) || /<Pressable[^>]*style=\{?\[?\s*\{?\s*backgroundColor/.test(s);
      return {
        passed: hasCustomCTA && !usesNativeButton,
        evidence: usesNativeButton ? 'Bare React Native <Button> used — replace with Pressable+gradient.' : undefined,
      };
    },
  },
  {
    id: 'two-pressables-or-more',
    label: 'At least 2 Pressable instances (interactive surfaces)',
    weight: 5,
    hardFail: false,
    fn: (s) => {
      const count = (s.match(/<Pressable[\s>]/g) ?? []).length;
      return {
        passed: count >= 2,
        evidence: `${count} Pressable(s) found — need ≥2 to count as interactive.`,
      };
    },
  },
  {
    id: 'no-scrollview-empty-state',
    label: 'Empty state is NOT wrapped in ScrollView (causes top-cutoff bug)',
    weight: 5,
    hardFail: false,
    fn: (s) => {
      const hasEmptyState = /(start\s+your\s+first|add\s+your\s+first|no\s+habits|empty)/i.test(s);
      const wrappedInScrollView = /<ScrollView[\s\S]{0,500}(start\s+your\s+first|add\s+your\s+first)/i.test(s);
      return {
        passed: !(hasEmptyState && wrappedInScrollView),
        evidence: 'Empty state should use <View flex:1 justifyContent:center>, not <ScrollView>. Causes top-cutoff bug.',
      };
    },
  },
];


// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: VisualPolishInput,
  ctx: HookContext,
): Promise<HookResult<VisualPolishOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: {
        score: { total: 100, breakdown: [], passed: true, passThreshold: 0, failedChecks: [] },
      },
      durationMs: Date.now() - start,
    };
  }

  // ----------------------------------------------------------------------
  // Per-screen scoring (V3 fix). The previous implementation merged every
  // .tsx file before scoring — which let polish hide in unused files (e.g.
  // gradient imported in onboarding/finish.tsx, never visible in the main
  // tab). We now score each user-facing screen independently and the
  // overall score = MIN(per-screen scores). This forces every visible
  // screen to be polished, not just somewhere in the project.
  //
  // What counts as a "user-facing screen":
  //   - .tsx file under app/(tabs)/ or app/screens/ or app/<route>.tsx
  //   - has `export default function` (a screen export)
  //   - excludes _layout.tsx, +not-found.tsx, components/, hooks/, store/
  // ----------------------------------------------------------------------
  const tsxFiles = Object.entries(input.files).filter(([p]) => /\.(tsx|jsx)$/.test(p));
  if (tsxFiles.length === 0) {
    ctx.log(`[${HOOK_METADATA.id}] no .tsx files in input`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      error: 'no_tsx_files',
      durationMs: Date.now() - start,
    };
  }

  const screenFiles = tsxFiles.filter(([p, content]) => {
    if (!/^(app|src\/screens|src\/app|screens)\//.test(p)) return false;
    if (/_layout\./.test(p) || /\+not-found/.test(p)) return false;
    if (/^components?\//.test(p) || /^hooks?\//.test(p) || /^stores?\//.test(p)) return false;
    if (/onboarding/i.test(p)) return false; // onboarding has its own gate (Hook 15)
    return /export\s+default\s+function/.test(content);
  });

  // Fall back to merged-source if no screen file matched (legacy projects).
  if (screenFiles.length === 0) {
    ctx.log(`[${HOOK_METADATA.id}] no recognized screen files — falling back to merged-source scoring`);
    const merged = tsxFiles.map(([, c]) => c).join('\n\n');
    return scoreOne(merged, '__merged__', start, ctx);
  }

  // Score each screen. Take the WORST score as the overall.
  type PerScreen = { path: string; score: QualityScore };
  const perScreen: PerScreen[] = screenFiles.map(([path, content]) => {
    const breakdown: QualityCheck[] = CHECKS.map((c) => {
      const r = c.fn(content);
      return {
        id: c.id,
        label: `[${path}] ${c.label}`,
        weight: c.weight,
        hardFail: c.hardFail,
        passed: r.passed,
        evidence: r.passed ? undefined : r.evidence,
      };
    });
    const total = Math.min(100, breakdown.reduce((s, c) => s + (c.passed ? c.weight : 0), 0));
    const failedChecks = breakdown.filter((c) => !c.passed);
    const hardFailHit = failedChecks.some((c) => c.hardFail);
    const passThreshold = LIMITS.qualityVisualPolishThreshold ?? 70;
    return {
      path,
      score: {
        total,
        breakdown,
        failedChecks,
        passed: !hardFailHit && total >= passThreshold,
        passThreshold,
      },
    };
  });

  // Overall = the worst per-screen score. Aggregate failedChecks from any failed screens.
  const worst = perScreen.reduce((a, b) => (a.score.total <= b.score.total ? a : b));
  const allFailed = perScreen.flatMap((s) => s.score.passed ? [] : s.score.failedChecks);
  const score: QualityScore = {
    total: worst.score.total,
    breakdown: worst.score.breakdown,
    failedChecks: allFailed.length ? allFailed : worst.score.failedChecks,
    passed: perScreen.every((s) => s.score.passed),
    passThreshold: worst.score.passThreshold,
  };

  ctx.log(
    `[${HOOK_METADATA.id}] per-screen scoring: ${perScreen.length} screens, ` +
    `worst=${worst.score.total} (${worst.path}), pass=${score.passed}`,
  );

  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: ctx.dryRun,
    data: { score },
    durationMs: Date.now() - start,
  };
}

/** Helper for the legacy merged-source path. */
function scoreOne(src: string, label: string, start: number, ctx: HookContext): HookResult<VisualPolishOutput> {
  const breakdown: QualityCheck[] = CHECKS.map((c) => {
    const r = c.fn(src);
    return { id: c.id, label: c.label, weight: c.weight, hardFail: c.hardFail, passed: r.passed, evidence: r.passed ? undefined : r.evidence };
  });
  const total = Math.min(100, breakdown.reduce((s, c) => s + (c.passed ? c.weight : 0), 0));
  const failedChecks = breakdown.filter((c) => !c.passed);
  const hardFailHit = failedChecks.some((c) => c.hardFail);
  const passThreshold = LIMITS.qualityVisualPolishThreshold ?? 70;
  const passed = !hardFailHit && total >= passThreshold;
  ctx.log(`[${HOOK_METADATA.id}] merged-source score=${total} pass=${passed} (${label})`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: ctx.dryRun,
    data: { score: { total, breakdown, failedChecks, passed, passThreshold } },
    durationMs: Date.now() - start,
  };
}
