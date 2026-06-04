/**
 * Pipeline Hook 13: Domain Fitness Auditor
 *
 * Trigger: After Hook 2 completes (parallel with Hooks 11 + 12).
 * Action: Detect the app's domain from the prompt, then run domain-specific
 *         checks (e.g. habit tracker → streak field rendered, Add flow,
 *         calendar/heatmap component).
 * Failure mode: NOTIFY (orchestrator decides re-prompt vs ship).
 *
 * Domains supported: habit, todo, recipe, workout, game, journal, generic.
 * Each domain encodes the per-domain visual recipe from SECTION 0.5 of
 * prompts.ts. If output doesn't match the recipe, the agent gets re-prompted
 * with the gap.
 */

import { isHookEnabled } from '../config/hooks.config.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { QualityCheck, QualityScore } from './quality-types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'domain-fitness-auditor',
  name: 'Domain Fitness Auditor',
  triggerType: 'manual',
  failureMode: 'notify',
  timeoutMs: 5_000,
  maxConcurrent: 1,
} as const;

export type AppDomain = 'habit' | 'todo' | 'recipe' | 'workout' | 'game' | 'journal' | 'generic';

export interface DomainFitnessInput {
  projectId: string;
  prompt: string;
  files: Record<string, string>;
}

export interface DomainFitnessOutput {
  domain: AppDomain;
  score: QualityScore;
}


// ---------------------------------------------------------------------------
// Domain detection
// ---------------------------------------------------------------------------

export function detectDomain(prompt: string): AppDomain {
  const p = prompt.toLowerCase();
  if (/\b(habit|streak|daily check|routine)\b/.test(p)) return 'habit';
  if (/\b(todo|to-do|task list|to do)\b/.test(p)) return 'todo';
  if (/\b(recipe|cook|meal|ingredient)\b/.test(p)) return 'recipe';
  if (/\b(workout|exercise|fitness|gym|reps|sets)\b/.test(p)) return 'workout';
  if (/\b(game|tic[\s-]?tac[\s-]?toe|chess|puzzle|board game|arcade)\b/.test(p)) return 'game';
  if (/\b(journal|diary|mood|reflection|notebook)\b/.test(p)) return 'journal';
  return 'generic';
}

// ---------------------------------------------------------------------------
// Per-domain check sets
// ---------------------------------------------------------------------------

type CheckFn = (src: string) => { passed: boolean; evidence?: string };
type CheckDef = { id: string; label: string; weight: number; hardFail: boolean; fn: CheckFn };

const HABIT_CHECKS: CheckDef[] = [
  {
    id: 'streak-rendered',
    label: 'Streak field rendered (text or component)',
    weight: 20,
    hardFail: true,
    fn: (s) => ({
      // Pass if the source mentions "streak" as a value being rendered:
      // - {streak} interpolation
      // - "streak: <value>" or "streak <number>" label form
      // - "<n> day streak" / "X days streak" suffix form
      passed:
        /\{[^}]*streak[^}]*\}/i.test(s) ||
        /streak\s*[:=]/i.test(s) ||
        /streak\s+\d/i.test(s) ||
        /day[s]?\s+streak/i.test(s) ||
        /streak\s+day/i.test(s),
      evidence: 'No streak rendering found. Habit trackers MUST surface the streak number prominently.',
    }),
  },
  {
    id: 'add-habit-flow',
    label: 'Add Habit flow (button + form/sheet)',
    weight: 20,
    hardFail: true,
    fn: (s) => ({
      passed: /add\s*habit/i.test(s) || /\baddHabit\b/.test(s) || /(['"]\+['"][^]{0,200}<Pressable)/.test(s),
      evidence: 'No Add Habit affordance detected (need a "+ button" or addHabit() handler).',
    }),
  },
  {
    id: 'add-flow-state-driven',
    label: 'Add Habit flow is STATE-DRIVEN (modal/sheet, not router-based)',
    weight: 20,
    hardFail: true,
    fn: (s) => {
      // Look for: useState toggling Add visibility AND/OR a Modal/BottomSheet inside the screen.
      const hasUseState = /useState\s*[<(]\s*(boolean|false|true)/i.test(s) ||
                          /(showAdd|showSheet|isAddOpen|addOpen|isModalOpen)\s*[,=]/i.test(s);
      const hasModal = /<Modal\b|<BottomSheet\b|<Sheet\b/.test(s);
      const onlyRouter = /router\.(push|navigate)\s*\(\s*['"][^'"]*add/i.test(s) && !hasUseState && !hasModal;
      const passed = (hasUseState || hasModal) && !onlyRouter;
      return {
        passed,
        evidence: passed
          ? undefined
          : 'Primary Add flow appears router-based. Use useState + a Modal/Sheet inside the screen so the web preview and tests can exercise the create flow.',
      };
    },
  },
  {
    id: 'calendar-or-heatmap',
    label: 'Calendar or heatmap component (history view)',
    weight: 20,
    hardFail: false,
    fn: (s) => ({
      passed: /<Calendar\b|<Heatmap\b|heatmap|HabitGrid|CalendarGrid|getDay\(/i.test(s) ||
              /\.map\([^)]*\)[^<]*<View[^>]*style[^>]*backgroundColor/i.test(s),
      evidence: 'No calendar/heatmap component. The history screen should visualize past completions.',
    }),
  },
  {
    id: 'complete-tap',
    label: 'Tap-to-complete handler (Pressable + completion state mutation)',
    weight: 20,
    hardFail: true,
    fn: (s) => ({
      passed: /(toggle|complete|markDone|markComplete)\s*\(/i.test(s) && /<Pressable/.test(s),
      evidence: 'No tap-to-complete handler. Tapping a habit must update the persisted store.',
    }),
  },
];


const TODO_CHECKS: CheckDef[] = [
  {
    id: 'sectioned-list',
    label: 'Section grouping (Today/Tomorrow/Later or similar)',
    weight: 25,
    hardFail: false,
    fn: (s) => ({
      passed: /(SectionList|sections\s*=|today|tomorrow|later|tonight)/i.test(s),
      evidence: 'No section grouping. Todos benefit from Today/Later sections.',
    }),
  },
  {
    id: 'swipe-action',
    label: 'Swipeable from gesture-handler (swipe-to-delete/complete)',
    weight: 35,
    hardFail: true,
    fn: (s) => ({
      passed: /<Swipeable\b/.test(s) || /from ['"]react-native-gesture-handler['"][^]*Swipeable/i.test(s),
      evidence: 'No swipe-to-delete. Use react-native-gesture-handler Swipeable.',
    }),
  },
  {
    id: 'animated-checkbox',
    label: 'Animated checkbox or check-fill on tap',
    weight: 40,
    hardFail: true,
    fn: (s) => ({
      passed: /(withSpring|withTiming).*?(check|complete|done)/is.test(s) || /<MotiView[^]{0,300}check/i.test(s),
      evidence: 'No animated checkbox. The check-fill animation is the satisfaction moment.',
    }),
  },
];

const RECIPE_CHECKS: CheckDef[] = [
  {
    id: 'image-grid',
    label: 'Image grid using expo-image',
    weight: 50,
    hardFail: true,
    fn: (s) => ({
      passed: /from ['"]expo-image['"]/.test(s) && /<Image\s+source/.test(s),
      evidence: 'expo-image not used. Recipe cards need optimized images with blurhash.',
    }),
  },
  {
    id: 'parallax-detail',
    label: 'Parallax detail screen (Animated.ScrollView)',
    weight: 50,
    hardFail: false,
    fn: (s) => ({
      passed: /<Animated\.ScrollView/.test(s) && /(Animated\.event|interpolate)/.test(s),
      evidence: 'No parallax scrolling on detail. Recipe headers should parallax with scroll.',
    }),
  },
];

const WORKOUT_CHECKS: CheckDef[] = [
  {
    id: 'progress-ring',
    label: 'Progress ring (Skia Canvas or react-native-svg)',
    weight: 35,
    hardFail: false,
    fn: (s) => ({
      passed: /(<Canvas\b[^]{0,400}<Path)|(<Svg\b[^]{0,400}<Circle\b)/.test(s),
      evidence: 'No progress ring component. Workout sets need a circular progress indicator.',
    }),
  },
  {
    id: 'rest-timer',
    label: 'Rest timer with countdown (setInterval or rAF)',
    weight: 35,
    hardFail: true,
    fn: (s) => ({
      passed: /(setInterval|requestAnimationFrame)[\s\S]{0,300}(timer|rest|countdown)/i.test(s),
      evidence: 'No rest timer. Workouts need a countdown between sets.',
    }),
  },
  {
    id: 'exercise-list',
    label: 'Exercise list with reps/sets fields',
    weight: 30,
    hardFail: false,
    fn: (s) => ({
      passed: /\b(reps|sets)\b/i.test(s) && /<FlatList|\.map\(/.test(s),
      evidence: 'No exercise list with reps/sets columns.',
    }),
  },
];


const GAME_CHECKS: CheckDef[] = [
  {
    id: 'no-alert-modal',
    label: 'Custom win/loss modal (NOT Alert.alert)',
    weight: 40,
    hardFail: true,
    fn: (s) => ({
      passed: !/Alert\.alert\s*\(/.test(s) && (/<Modal\b/.test(s) || /<MotiView[^]{0,400}(winner|won|game\s*over)/i.test(s)),
      evidence: /Alert\.alert/.test(s) ? 'Alert.alert used for win/loss — replace with custom Modal/MotiView.' : 'No custom win modal found.',
    }),
  },
  {
    id: 'reset-cta',
    label: 'Reset / Play Again CTA',
    weight: 30,
    hardFail: true,
    fn: (s) => ({
      passed: /(reset|play\s*again|new\s*game)/i.test(s) && /<Pressable/.test(s),
      evidence: 'No Reset / New Game button found.',
    }),
  },
  {
    id: 'board-area',
    label: 'Board takes meaningful screen real-estate (Dimensions or flex)',
    weight: 30,
    hardFail: false,
    fn: (s) => ({
      passed: /Dimensions\.get\b/.test(s) || /flex\s*:\s*[2-9]\b/.test(s),
      evidence: 'Board sizing not bound to screen — likely too small.',
    }),
  },
];

const JOURNAL_CHECKS: CheckDef[] = [
  {
    id: 'mood-selector',
    label: 'Mood selector (5 emojis or sentiment buttons)',
    weight: 50,
    hardFail: true,
    fn: (s) => ({
      passed: /\bmood\b/i.test(s) && /(['"]😀|['"]😢|['"]😊|['"]😐|['"]😡|MoodPicker|moodOptions)/.test(s),
      evidence: 'No mood selector. Journals need a 5-mood picker.',
    }),
  },
  {
    id: 'date-strip',
    label: 'Horizontal date strip (FlatList horizontal)',
    weight: 50,
    hardFail: false,
    fn: (s) => ({
      passed: /<FlatList\b[^>]*horizontal/i.test(s),
      evidence: 'No horizontal date strip — common journal navigation pattern.',
    }),
  },
];

const GENERIC_CHECKS: CheckDef[] = [
  {
    id: 'multi-screen',
    label: 'At least 2 distinct screens',
    weight: 50,
    hardFail: false,
    fn: (s) => {
      const exportCount = (s.match(/^\s*export\s+default\s+function\s+\w+/gm) ?? []).length;
      return {
        passed: exportCount >= 2,
        evidence: `Found ${exportCount} screen exports. Need ≥2 for non-trivial apps.`,
      };
    },
  },
  {
    id: 'tab-or-stack-nav',
    label: 'Tabs or Stack navigator declared',
    weight: 50,
    hardFail: false,
    fn: (s) => ({
      passed: /(<Tabs\b|<Stack\b|createBottomTabNavigator|createStackNavigator)/.test(s),
      evidence: 'No navigator declared. Even simple apps benefit from a tab or stack.',
    }),
  },
];

const DOMAIN_CHECKS: Record<AppDomain, CheckDef[]> = {
  habit: HABIT_CHECKS,
  todo: TODO_CHECKS,
  recipe: RECIPE_CHECKS,
  workout: WORKOUT_CHECKS,
  game: GAME_CHECKS,
  journal: JOURNAL_CHECKS,
  generic: GENERIC_CHECKS,
};


// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: DomainFitnessInput,
  ctx: HookContext,
): Promise<HookResult<DomainFitnessOutput>> {
  const start = Date.now();
  const domain = detectDomain(input.prompt);

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] disabled — domain=${domain}`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { domain, score: { total: 100, breakdown: [], passed: true, passThreshold: 0, failedChecks: [] } },
      durationMs: Date.now() - start,
    };
  }

  const tsx = Object.entries(input.files).filter(([p]) => /\.(tsx|jsx)$/.test(p));
  const merged = tsx.map(([, c]) => c).join('\n\n');

  const checkSet = DOMAIN_CHECKS[domain];
  const breakdown: QualityCheck[] = checkSet.map((c) => {
    const r = c.fn(merged);
    return {
      id: c.id,
      label: c.label,
      weight: c.weight,
      hardFail: c.hardFail,
      passed: r.passed,
      evidence: r.passed ? undefined : r.evidence,
    };
  });

  const total = breakdown.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const failedChecks = breakdown.filter((c) => !c.passed);
  const hardFailHit = failedChecks.some((c) => c.hardFail);
  const passed = !hardFailHit && total >= 70;

  const score: QualityScore = { total, breakdown, failedChecks, passed, passThreshold: 70 };

  ctx.log(
    `[${HOOK_METADATA.id}] domain=${domain} score=${total}/100 pass=${passed} ` +
    `failed=${failedChecks.length} hardFail=${hardFailHit}`,
  );

  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: ctx.dryRun,
    data: { domain, score },
    durationMs: Date.now() - start,
  };
}
