import type { Tool, ToolResult } from '../types.js';
import { findSkill, readSkillBody, SKILLS } from '../skills/index.js';

interface Input { name: string; }

/** Lazy-load a skill body. The system prompt only contains the index. */
export const loadSkillTool: Tool<Input, { name: string; body: string }> = {
  name: 'load_skill',
  description:
    'Load the body of a skill from the registry. The system prompt only contains the ' +
    'short skills index — call this BEFORE doing work in that skill\'s domain.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Skill identifier (e.g. "frontend-app-design").' },
    },
    required: ['name'],
    additionalProperties: false,
  },
  async run({ name }, ctx): Promise<ToolResult<{ name: string; body: string }>> {
    const skill = findSkill(name);
    if (!skill) {
      const available = SKILLS.map((s) => s.name).join(', ');
      return {
        content: `load_skill: unknown skill "${name}". Available: ${available}`,
        isError: true,
      };
    }
    const body = await readSkillBody(name);
    if (!body) {
      return { content: `load_skill: failed to read body for "${name}"`, isError: true };
    }
    ctx.emit({ type: 'skill.loaded', name });
    return {
      content: `# Skill: ${name}\n\n${body}`,
      data: { name, body },
    };
  },
};
