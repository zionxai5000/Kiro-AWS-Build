/**
 * Skills registry tests — every skill listed in the registry has a body,
 * the index renders into the system prompt, and the bodies satisfy basic
 * structural rules (front-matter present, no obvious placeholders).
 */

import { describe, it, expect } from 'vitest';
import { SKILLS, findSkill, readSkillBody, renderSkillsIndex } from '../skills/index.js';

describe('agent/skills registry', () => {
  it('lists all 8 skills', () => {
    const names = SKILLS.map((s) => s.name).sort();
    expect(names).toEqual([
      'ai-apis-claude',
      'appstore-preflight',
      'code-review',
      'expo-router-app',
      'frontend-app-design',
      'security-review',
      'upload-assets',
      'zustand-persistence',
    ]);
  });

  it('every skill has a description', () => {
    for (const s of SKILLS) {
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.file).toMatch(/\.md$/);
    }
  });

  it('findSkill returns the right entry or undefined', () => {
    expect(findSkill('frontend-app-design')?.file).toBe('frontend-app-design.md');
    expect(findSkill('not-a-real-skill')).toBeUndefined();
  });

  it('readSkillBody returns markdown with YAML front-matter', async () => {
    const body = await readSkillBody('frontend-app-design');
    expect(body).toBeTruthy();
    expect(body!.startsWith('---')).toBe(true);
    expect(body!).toContain('name: frontend-app-design');
    // Quality bar — the rulebook MUST have these key sections.
    expect(body!).toMatch(/Non-negotiables|non-negotiable/i);
    expect(body!).toMatch(/Per-domain home-screen recipes|domain.*recipe/i);
    expect(body!).toMatch(/REJECTION LIST|reject/i);
  });

  it('zustand-persistence skill includes the four hard rules', async () => {
    const body = await readSkillBody('zustand-persistence');
    expect(body!).toContain('persist');
    expect(body!).toContain('AsyncStorage');
    expect(body!).toContain('Named storage key');
  });

  it('expo-router-app skill enforces state-driven Add', async () => {
    const body = await readSkillBody('expo-router-app');
    expect(body!).toMatch(/state-driven Add|Hook 13/);
  });

  it('renderSkillsIndex produces the system-prompt block', () => {
    const idx = renderSkillsIndex();
    expect(idx).toContain('frontend-app-design');
    expect(idx).toContain('zustand-persistence');
    expect(idx).toContain('load_skill');
  });

  it('every skill body parses without obvious placeholders', async () => {
    for (const s of SKILLS) {
      const body = await readSkillBody(s.name);
      expect(body, `skill ${s.name} missing body`).toBeTruthy();
      expect(body!.length, `skill ${s.name} body too short`).toBeGreaterThan(500);
      // TODO/TKTK/FIXME are real placeholders. Lorem ipsum / "Habit 1" appear in
      // skill bodies as NEGATIVE examples (don't ship this) — those are fine.
      expect(body!, `skill ${s.name} has unfinished marker`).not.toMatch(/\bTODO\b|\bTKTK\b|\bFIXME\b/);
    }
  });
});
