/**
 * Build a contact-sheet mosaic of all section-7 screenshots so King can view
 * them in a single image, plus crop the preview-only pane from steps 5-9.
 *
 * Studio grid at 1600px viewport:
 *   220px sidebar / 380px chat / 1fr preview
 * Preview pane starts at x=600, ends at viewport edge (1600).
 * Vertically the studio is 920px tall (viewport 1000 - 80 nav).
 */
import sharp from 'sharp';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const SRC_DIR = 'scripts/section-7-output';
const OUT_DIR = 'scripts/section-7-output/cropped';
mkdirSync(OUT_DIR, { recursive: true });

const FILES = [
  { src: '01-studio-empty.png', label: 'Step 1: Studio empty state w/ 4 example prompts' },
  { src: '02-after-send.png', label: 'Step 2: Habit Tracker example clicked, Send fired' },
  { src: '03-narration.png', label: 'Step 3: Project named "Habit Tracker" in sidebar' },
  { src: '04-stream-done.png', label: 'Step 4: 36 files generated' },
  { src: '05-preview-app.png', label: 'Step 5: Habit tracker app RENDERING' },
  { src: '06-add-flow.png', label: 'Step 6: Add-habit affordance' },
  { src: '07-habit-added.png', label: 'Step 7: Habit interaction registered' },
  { src: '08-habit-complete.png', label: 'Step 8: Mark complete' },
  { src: '09-persistence.png', label: 'Step 9: After refresh - data persists' },
];

async function cropPreview(input: string, output: string): Promise<void> {
  // Crop the preview pane: x=600 to 1600 (preview column), y=80 to 1000 (below nav)
  await sharp(input)
    .extract({ left: 600, top: 80, width: 1000, height: 920 })
    .toFile(output);
}

async function main() {
  console.log('Cropping preview-pane regions from steps 5-9...');
  for (const f of FILES) {
    const src = join(SRC_DIR, f.src);
    if (!existsSync(src)) {
      console.log(`  skip ${f.src} (missing)`);
      continue;
    }
    const out = join(OUT_DIR, `crop-${f.src}`);
    await cropPreview(src, out);
    console.log(`  ${f.src} -> ${out}`);
  }

  console.log('\nBuilding 3x3 mosaic of all 9 screenshots...');
  // Each tile: full screenshot scaled to 533x333. 3 cols x 3 rows.
  const tileW = 533;
  const tileH = 333;
  const tiles: { input: Buffer; top: number; left: number }[] = [];
  for (let i = 0; i < FILES.length; i++) {
    const src = join(SRC_DIR, FILES[i].src);
    if (!existsSync(src)) continue;
    const buffer = await sharp(src).resize(tileW, tileH, { fit: 'cover' }).png().toBuffer();
    const col = i % 3;
    const row = Math.floor(i / 3);
    tiles.push({ input: buffer, top: row * tileH, left: col * tileW });
  }
  const mosaicW = 3 * tileW;
  const mosaicH = 3 * tileH;
  await sharp({ create: { width: mosaicW, height: mosaicH, channels: 3, background: { r: 14, g: 17, b: 26 } } })
    .composite(tiles)
    .png()
    .toFile(join(OUT_DIR, 'MOSAIC-all-9-steps.png'));
  console.log(`  -> ${join(OUT_DIR, 'MOSAIC-all-9-steps.png')}`);

  console.log('\nDone.');
}
void main();
