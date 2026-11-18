import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const svg = readFileSync('web/icon.svg', 'utf8');
const b = await chromium.launch();
for (const [out, size] of ([['web/icon-512.png', 512], ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192]] as [string, number][])) {
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#0b0a0d">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: out });
}
await b.close();
