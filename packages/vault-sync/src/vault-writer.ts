/**
 * Vault Writer — Agent Output → Obsidian Notes
 *
 * Provides structured methods for agents to write content to the vault.
 * Handles formatting, frontmatter, and file placement.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';

export class VaultWriter {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Write a recommendation to the vault.
   */
  async writeRecommendation(options: {
    title: string;
    source: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    benchmark: string;
    actions: string[];
    expectedImpact: string;
    risk: string;
  }): Promise<string> {
    const filename = `${options.title.replace(/[^a-zA-Z0-9 -]/g, '').trim()}.md`;
    const relativePath = `00 - Command/Recommendations/${filename}`;

    const frontmatter = {
      tags: ['recommendation', options.source.toLowerCase()],
      status: 'Pending',
      source: options.source,
      priority: options.priority,
      expected_impact: options.expectedImpact,
      date: new Date().toISOString().split('T')[0],
    };

    const content = [
      `# Recommendation: ${options.title}`,
      '',
      '## Summary',
      '',
      options.summary,
      '',
      '## Benchmark',
      '',
      options.benchmark,
      '',
      '## Recommended Action',
      '',
      ...options.actions.map((a, i) => `${i + 1}. ${a}`),
      '',
      '## Expected Impact',
      '',
      options.expectedImpact,
      '',
      '## Risk',
      '',
      options.risk,
      '',
      '---',
      '',
      '*To approve: change `status: Pending` to `status: Approved` and add `approved_date:`*',
      '*To reject: change to `status: Rejected` and add `rejection_reason:`*',
    ].join('\n');

    await this.writeFile(relativePath, frontmatter, content);
    return relativePath;
  }

  /**
   * Write a daily report to the vault.
   */
  async writeDailyReport(options: {
    date: string;
    agentStatus: Array<{ name: string; status: string; notes: string }>;
    costs: { aws: number; llm: number; total: number };
    activity: string;
    issues: string[];
  }): Promise<string> {
    const relativePath = `01 - Operations/Daily/${options.date}.md`;

    const frontmatter = {
      tags: ['daily', 'report', 'operations'],
      date: options.date,
    };

    const agentRows = options.agentStatus
      .map((a) => `| ${a.name} | ${a.status} | ${a.notes} |`)
      .join('\n');

    const content = [
      `# Daily Report — ${options.date}`,
      '',
      '## System Health',
      '',
      '| Agent | Status | Notes |',
      '|-------|--------|-------|',
      agentRows,
      '',
      '## Cost Summary',
      '',
      `| Category | Amount |`,
      `|----------|--------|`,
      `| AWS Infrastructure | $${options.costs.aws.toFixed(2)} |`,
      `| LLM API | $${options.costs.llm.toFixed(2)} |`,
      `| **Total** | **$${options.costs.total.toFixed(2)}** |`,
      '',
      '## Activity',
      '',
      options.activity,
      '',
      '## Issues',
      '',
      ...(options.issues.length > 0
        ? options.issues.map((i) => `- ${i}`)
        : ['- None']),
    ].join('\n');

    await this.writeFile(relativePath, frontmatter, content);
    return relativePath;
  }

  /**
   * Write a knowledge entry to the vault.
   */
  async writeKnowledge(options: {
    domain: string;  // "ZionX", "ZXMG", "Zion Alpha", "Eretz"
    title: string;
    source: string;
    content: string;
    implications: string;
    confidence: 'high' | 'medium' | 'low';
  }): Promise<string> {
    const filename = `${options.title.replace(/[^a-zA-Z0-9 -]/g, '').trim()}.md`;
    const relativePath = `02 - Knowledge/${options.domain}/${filename}`;

    const frontmatter = {
      tags: ['knowledge', options.domain.toLowerCase().replace(' ', '-')],
      source: options.source,
      domain: options.domain,
      confidence: options.confidence,
      date: new Date().toISOString().split('T')[0],
    };

    const noteContent = [
      `# ${options.title}`,
      '',
      '## What Was Learned',
      '',
      options.content,
      '',
      '## Implications',
      '',
      options.implications,
      '',
      `## Source`,
      '',
      `Learned by: ${options.source}`,
      `Confidence: ${options.confidence}`,
      `Date: ${frontmatter.date}`,
    ].join('\n');

    await this.writeFile(relativePath, frontmatter, noteContent);
    return relativePath;
  }

  /**
   * Write an escalation to the vault.
   */
  async writeEscalation(options: {
    source: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    context: string;
    recommendedAction: string;
  }): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${timestamp} - ${options.source}.md`;
    const relativePath = `00 - Command/Escalations/${filename}`;

    const frontmatter = {
      tags: ['escalation', options.source.toLowerCase()],
      status: 'active',
      source: options.source,
      urgency: options.urgency,
      date: new Date().toISOString().split('T')[0],
    };

    const content = [
      `# Escalation: ${options.summary}`,
      '',
      `**Source:** ${options.source}`,
      `**Urgency:** ${options.urgency}`,
      `**Status:** Active`,
      '',
      '## Context',
      '',
      options.context,
      '',
      '## Recommended Action',
      '',
      options.recommendedAction,
      '',
      '---',
      '',
      '*To resolve: change `status: active` to `status: resolved` and add `resolution:` field*',
    ].join('\n');

    await this.writeFile(relativePath, frontmatter, content);
    return relativePath;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async writeFile(
    relativePath: string,
    frontmatter: Record<string, unknown>,
    content: string,
  ): Promise<void> {
    const fullPath = path.join(this.vaultPath, relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fileContent = matter.stringify(content, frontmatter);
    fs.writeFileSync(fullPath, fileContent, 'utf-8');
    console.log(`[Vault Writer] Wrote: ${relativePath}`);
  }
}
