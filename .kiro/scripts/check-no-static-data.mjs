#!/usr/bin/env node
// check-no-static-data.mjs
// Fails (exit 1) if shipped source contains hardcoded data driving the UI.
//
// Heuristics, deliberately conservative to avoid false positives:
//   1. Known mock markers: mockData, sampleData, dummyData, fakeData, "lorem ipsum",
//      placeholderData, seedData used OUTSIDE allowlisted folders.
//   2. Large array-of-object literals (>= MIN_OBJECTS) assigned to a data-ish
//      identifier (items, data, list, posts, products, entries, records, ...).
//
// Allowlisted (literals are expected, so skipped): the theme folder, token files,
// config files, constants, i18n/locales, test/stories files, node_modules, build
// output. See the ALLOW array below for exact patterns.
//
// Tune MIN_OBJECTS / DATA_NAMES below if a project legitimately needs more.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();
const SRC_DIRS = ["src", "app", "components", "screens"].filter((d) =>
  existsSync(join(ROOT, d))
);
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const MIN_OBJECTS = 4; // an array of >= 4 object literals reads as a dataset

const DATA_NAMES =
  /\b(?:const|let|var)\s+([A-Za-z0-9_]*(?:items?|data|list|posts?|products?|entries|records|users?|messages?|tasks?|notes?|cards?|feed|results?))\s*[:=]/i;

const MOCK_MARKERS =
  /\b(mock[A-Za-z]*|sample[A-Za-z]*|dummy[A-Za-z]*|fake[A-Za-z]*|placeholder[A-Za-z]*Data|seedData)\b|lorem ipsum/i;

const ALLOW = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)(dist|build|\.expo|\.next|coverage)(\/|$)/,
  /(^|\/)theme(\/|$)/,
  /tokens\.[tj]sx?$/,
  /\.config\.[tj]sx?$/,
  /(^|\/)constants(\/|$)/,
  /(^|\/)(i18n|locales)(\/|$)/,
  /\.(test|spec|stories)\.[tj]sx?$/,
  /(^|\/)__tests__(\/|$)/,
  /(^|\/)stores?(\/|$)/,
  /(^|\/)data(\/|$)/,
];

const isAllowed = (rel) => ALLOW.some((re) => re.test(rel));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (isAllowed(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(name))) out.push(full);
  }
  return out;
}

// Count consecutive object-open braces inside the nearest array literal after idx.
function looksLikeDataset(src, fromIdx) {
  const slice = src.slice(fromIdx, fromIdx + 4000);
  const arr = slice.match(/=\s*\[([\s\S]*?)\]/);
  if (!arr) return false;
  const objects = (arr[1].match(/\{/g) || []).length;
  return objects >= MIN_OBJECTS;
}

const violations = [];

for (const dir of SRC_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");

    lines.forEach((line, i) => {
      if (MOCK_MARKERS.test(line) && !/import|from ["']/.test(line)) {
        // Allow SEED_*, INITIAL_*, DEFAULT_* in any allowlisted folder
        if (/\b(SEED|INITIAL|DEFAULT|EXAMPLE)_/i.test(line)) return;
        violations.push(`${rel}:${i + 1}  mock/sample marker: ${line.trim().slice(0, 80)}`);
      }
    });

    let m;
    const re = new RegExp(DATA_NAMES, "gi");
    while ((m = re.exec(src))) {
      // Skip SEED_*/INITIAL_*/DEFAULT_*
      const name = m[1] ?? '';
      if (/^(SEED|INITIAL|DEFAULT|EXAMPLE|MOCK)_/i.test(name)) continue;
      if (looksLikeDataset(src, m.index)) {
        const lineNo = src.slice(0, m.index).split("\n").length;
        violations.push(
          `${rel}:${lineNo}  hardcoded dataset assigned to "${m[1]}" (>= ${MIN_OBJECTS} objects)`
        );
      }
    }
  }
}

if (violations.length) {
  console.error("\n  NO-STATIC-DATA CHECK FAILED\n");
  for (const v of [...new Set(violations)]) console.error("   - " + v);
  console.error(
    `\n  ${violations.length} issue(s). Move this data behind the data layer (src/data/) ` +
      `and load it at runtime. Config/theme/i18n are allowlisted.\n`
  );
  process.exit(1);
}

console.log("  no-static-data check passed");
