// Generates PWA/app icons from assets/logo.svg. Run: pnpm --filter @tienlen/web icons
// Outputs are committed, so this only needs to run when the logo changes.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const logo = await readFile(path.join(root, 'assets/logo.svg'), 'utf8');

// Full-bleed variant: square background, artwork scaled into the 80% maskable safe zone.
const cards = logo.match(/<g id="cards">[\s\S]*<\/g>\s*<\/svg>/)?.[0].replace(/<\/svg>$/, '');
if (!cards) throw new Error('Could not find the <g id="cards"> group in assets/logo.svg');
const fullBleed = logo
  .replace(/<rect width="512" height="512" rx="112"/, '<rect width="512" height="512"')
  .replace(cards, `<g transform="translate(51.2 51.2) scale(0.8)">${cards}</g>`);

const outputs = [
  { file: 'public/icons/icon-192.png', svg: logo, size: 192 },
  { file: 'public/icons/icon-512.png', svg: logo, size: 512 },
  { file: 'public/icons/icon-maskable-512.png', svg: fullBleed, size: 512 },
  // iOS applies its own rounded mask and ignores transparency.
  { file: 'app/apple-icon.png', svg: fullBleed, size: 180 },
];

for (const { file, svg, size } of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(root, file));
  console.log(`wrote ${file} (${size}×${size})`);
}
await writeFile(path.join(root, 'app/icon.svg'), logo);
console.log('wrote app/icon.svg');
