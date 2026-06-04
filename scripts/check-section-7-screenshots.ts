/**
 * Inspect each section-7 screenshot for visual stats.
 */
import sharp from 'sharp';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

async function main() {
  const dir = 'scripts/section-7-output';
  const files = ['01-studio-empty.png', '02-after-send.png', '03-narration.png', '04-stream-done.png', '05-preview-app.png', '06-add-flow.png', '07-habit-added.png', '08-habit-complete.png', '09-persistence.png', '10-iterate.png'];
  for (const f of files) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      console.log(`${f.padEnd(30)} MISSING`);
      continue;
    }
    const stats = await sharp(p).stats();
    const meta = await sharp(p).metadata();
    const channels = stats.channels.slice(0, 3);
    const brightness = channels.reduce((s, c) => s + c.mean, 0) / channels.length;
    const variance = channels.reduce((s, c) => s + (c.stdev * c.stdev), 0) / channels.length;
    console.log(`${f.padEnd(30)} ${meta.width}x${meta.height}  brightness=${Math.round(brightness)}  variance=${Math.round(variance)}`);
  }
}
void main();
