---
name: trend-research
description: Research YouTube trending content, identify profitable niches, and write findings to the Obsidian vault
trigger: When asked to research trends, scan YouTube, find content opportunities, or analyze niches
---

# YouTube Trend Research Skill

## Steps

1. **Search for trending content** in the specified niche or across all focus areas:
   - AI-generated content (cooking, fitness, education, finance)
   - Faceless channels with rapid growth
   - Short-form content patterns
   - Low-competition high-growth niches

2. **For each opportunity found, analyze:**
   - Channel age vs subscriber count (growth velocity)
   - Average views per video vs subscriber count (engagement ratio)
   - Upload frequency
   - Content format (talking head, faceless, AI voiceover, screen recording)
   - Monetization model (ads, sponsorships, affiliate, products)
   - Production complexity (can ZXMG replicate with AI tools?)

3. **Write findings to vault** at `/opt/vault/02 - Knowledge/ZXMG/`:
   - One file per research session: `Trend Research YYYY-MM-DD.md`
   - Include frontmatter with tags, source, confidence, date
   - Structure: Summary → Top Opportunities → Detailed Analysis → Recommended Actions

4. **If a strong opportunity is found**, write a recommendation to `/opt/vault/00 - Command/Recommendations/`:
   - Use the recommendation frontmatter format (status: Pending, source: ZXMG-Scout)
   - Include: summary, benchmark data, recommended actions, expected ROI, risk

5. **Update production formulas** if a new pattern is discovered:
   - Append to `/opt/vault/02 - Knowledge/ZXMG/Production Formulas.md`
   - Or create a new formula file if it's a distinct approach

## Output Quality Standards
- Every claim must have data (subscriber count, view count, growth rate)
- "Opportunity" means: niche has demand + low competition + ZXMG can produce with AI
- Revenue estimate must be grounded (CPM rates, typical sponsorship rates for niche size)
- Never recommend niches that require real human on-camera (ZXMG uses AI generation)
