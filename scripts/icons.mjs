// JavaScript, scripts/icons.mjs, node + playwright: renders icon.svg to the PNGs iOS and Android require.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const b = await chromium.launch();
for (const [out, size] of [['public/icon-512.png', 512], ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192]]) {
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#0b0a0d">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: out });
}
await b.close();
