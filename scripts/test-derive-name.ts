/**
 * Smoke test for deriveProjectName heuristic.
 * Mirrors the dashboard's logic so we can run it as a node script.
 */

function toTitleCase(s: string): string {
  return s.split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function deriveProjectName(prompt: string): string {
  const text = prompt.trim();
  if (!text) return 'New App';

  const namedMatch = text.match(/(?:called|named)\s+["']?([A-Za-z][A-Za-z0-9 -]{2,29})["']?/i);
  if (namedMatch?.[1]) return toTitleCase(namedMatch[1].trim()).slice(0, 30);

  const stripped = text
    .replace(/^(build|make|create|develop|design|generate)\s+(me\s+)?(a|an|the)?\s*/i, '')
    .replace(/^(i\s+want|i\s+need|please|can\s+you)\s+(to\s+)?(build|make|create)?\s*(me\s+)?(a|an|the)?\s*/i, '')
    .trim();

  const appKeywords = /(tracker|game|list|app|timer|journal|manager|planner|generator|tool|reminder|log|diary|notebook|board|dashboard|wallet|chatbot|player|recipe[s]?)\b/i;
  const km = stripped.match(new RegExp(`(?:[a-z][a-z0-9-]*\\s+){0,3}${appKeywords.source}`, 'i'));
  if (km?.[0]) return toTitleCase(km[0].replace(/[-_]/g, ' ').trim()).slice(0, 30);

  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(with|that|where|which|and|the|for|from|into|onto|when|while|like)$/i.test(w))
    .slice(0, 4);
  if (words.length) return toTitleCase(words.join(' ').replace(/[^A-Za-z0-9 -]/g, '')).slice(0, 30) || 'New App';
  return 'New App';
}

const cases: Array<[string, string]> = [
  ['Build me a tic-tac-toe game with proper game state', 'Tic Tac Toe Game'],
  ['Build me a habit tracker app where I can add habits, mark them complete each day, see streaks', 'Habit Tracker App'],
  ['Create a todo list with swipe to delete', 'Todo List'],
  ['Make a recipe manager called RecipeBook', 'Recipebook'],
  ['I want a workout log with progress charts', 'Workout Log'],
  ['Build a weather app for surfers', 'Weather App'],
  ['Create me a journal where I can write daily', 'Journal'],
  ['Build a Pomodoro timer', 'Pomodoro Timer'],
  ['Build me an app named "ZenTime"', 'Zentime'],
  ['', 'New App'],
];

let pass = 0;
let fail = 0;
for (const [input, expected] of cases) {
  const actual = deriveProjectName(input);
  const ok = actual === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✅' : '❌'}  ${JSON.stringify(input).slice(0, 60).padEnd(60)} -> "${actual}"${ok ? '' : `  (expected: "${expected}")`}`);
}
console.log(`\n${pass}/${cases.length} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
