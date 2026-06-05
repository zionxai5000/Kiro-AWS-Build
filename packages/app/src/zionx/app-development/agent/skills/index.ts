/**
 * Skills registry — always loaded into the agent's system prompt as a short
 * index (name + 1-line description). The body of each skill is loaded ONLY
 * when the agent calls the `load_skill` tool.
 *
 * Why lazy: jamming all skill bodies into every prompt would consume ~50KB of
 * context tokens for irrelevant content. Lazy loading keeps the working
 * context lean.
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

export interface Skill {
  /** Stable identifier — the agent uses this in `load_skill('<name>')`. */
  name: string;
  /** One-line description shown to the agent in the index. */
  description: string;
  /** Filename within this directory (relative). */
  file: string;
}

export const SKILLS: readonly Skill[] = [
  {
    name: 'frontend-app-design',
    description:
      'Load BEFORE writing any screen or component. Quality bar (Linear/Arc/Calm), tokens, layout law, motion, per-domain recipes, rejection list.',
    file: 'frontend-app-design.md',
  },
  {
    name: 'zustand-persistence',
    description:
      'Load BEFORE writing any data store. Canonical zustand + persist + AsyncStorage pattern, named storage keys, migration rules. No static data.',
    file: 'zustand-persistence.md',
  },
  {
    name: 'expo-router-app',
    description:
      'Load BEFORE laying out screens. File-based routing, tabs+stack pattern, state-driven Add (Hook 13 rule), deep-link config.',
    file: 'expo-router-app.md',
  },
  {
    name: 'ai-apis-claude',
    description:
      'Load when integrating Claude (chat, summarize). Server-only keys, prompt caching, streaming with token-batching, designed error states.',
    file: 'ai-apis-claude.md',
  },
  {
    name: 'upload-assets',
    description:
      'Load when the app accepts images/audio/files. Pick → manipulate → display → optimistic UI → designed permission-denied states.',
    file: 'upload-assets.md',
  },
  {
    name: 'appstore-preflight',
    description:
      'Load BEFORE submitting to stores. Full preflight checklist (icons, splash, screenshots, metadata, privacy manifest). Returns JSON.',
    file: 'appstore-preflight.md',
  },
  {
    name: 'security-review',
    description:
      'Reviewer subagent. Secret hygiene, auth boundaries, input validation, sandbox guardrails. Returns severity-ranked JSON findings.',
    file: 'security-review.md',
  },
  {
    name: 'code-review',
    description:
      'Reviewer subagent. Type safety, error handling, dead code, naming, complexity. Returns severity-ranked JSON findings.',
    file: 'code-review.md',
  },
] as const;

/** Look up a skill by name. */
export function findSkill(name: string): Skill | undefined {
  return SKILLS.find((s) => s.name === name);
}

/** Resolve the absolute path to a skill body. */
export function resolveSkillPath(skill: Skill): string {
  // Compiled output is CommonJS (Node16) — __dirname is available at runtime.
  return join(__dirname, skill.file);
}

/** Render the index that ships in the system prompt. */
export function renderSkillsIndex(): string {
  const lines = [
    'Available skills (load with the `load_skill` tool when relevant):',
    ...SKILLS.map((s) => `- ${s.name}: ${s.description}`),
  ];
  return lines.join('\n');
}

/** Read a skill body. Used by the `load_skill` tool. */
export async function readSkillBody(name: string): Promise<string | null> {
  const skill = findSkill(name);
  if (!skill) return null;
  const path = resolveSkillPath(skill);
  return await readFile(path, 'utf-8');
}
