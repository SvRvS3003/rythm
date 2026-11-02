// TypeScript, scripts/build.ts, node 24: compiles client/ into dist/web, the only place JavaScript exists.
import { build } from 'esbuild';
import { cpSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const OUT = 'dist/web';
rmSync(OUT, { recursive: true, force: true });
cpSync('web', OUT, { recursive: true });
await build({ entryPoints: ['client/app.ts'], outdir: OUT, bundle: true, splitting: true, format: 'esm', minify: true, target: ['safari15', 'chrome90'], chunkNames: 'chunks/[name]-[hash]', logLevel: 'warning' });
// The worker's file list and version come from the finished output, so a new build replaces the app atomically.
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(OUT).filter(f => !f.endsWith('_headers'));
const id = createHash('sha256').update(files.sort().map(f => readFileSync(f)).join('')).digest('hex').slice(0, 12);
const shell = ['/', ...files.map(f => f.slice(OUT.length)).filter(f => f !== '/index.html')];
await build({ entryPoints: ['client/sw.ts'], outfile: `${OUT}/sw.js`, bundle: true, minify: true, target: 'es2020', define: { BUILD_ID: JSON.stringify(id), SHELL_FILES: JSON.stringify(shell) }, logLevel: 'warning' });
console.log(`built ${id}: ${files.length + 1} files`);
