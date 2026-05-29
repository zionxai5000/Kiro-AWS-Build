/**
 * Render the two schema SVGs to PNG so they display reliably in any viewer.
 * Uses sharp (already installed in packages/app/package.json).
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function render(name: string, density = 200) {
  const svgPath = join(process.cwd(), 'docs/diagrams', `${name}.svg`);
  const pngPath = join(process.cwd(), 'docs/diagrams', `${name}.png`);
  const svg = readFileSync(svgPath);
  await sharp(svg, { density }).png().toFile(pngPath);
  console.log(`✓ ${name}.png`);
}

async function main() {
  await render('backend-schema');
  await render('dashboard-schema');
}
main().catch((err) => { console.error(err); process.exit(1); });
