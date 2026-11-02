// JavaScript, test/load.ts, node: small real load run. Usage: node test/load.ts <base> [requests] [concurrency]
const [B, N = '3000', C = '60'] = process.argv.slice(2);
const em = `load${Date.now()}@test.uz`;
const r = await fetch(B + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'L', email: em, password: 'parol12345' }) });
const c = r.headers.get('set-cookie').split(';')[0];
async function run(name: string, path: string, opts: any = {}) {
  const lat: number[] = [], codes: Record<string, number> = {}; let left = +N; const t0 = Date.now();
  await Promise.all([...Array(+C)].map(async () => { while (left-- > 0) { const s = Date.now(); try { const x = await fetch(B + path, { ...opts, headers: { cookie: c, ...opts.headers } }); await x.arrayBuffer(); codes[x.status] = (codes[x.status] || 0) + 1; } catch { codes.net = (codes.net || 0) + 1; } lat.push(Date.now() - s); } }));
  lat.sort((a, b) => a - b); const q = p => lat[Math.floor(lat.length * p)];
  console.log(`${name}: ${(lat.length / ((Date.now() - t0) / 1000)).toFixed(0)} req/s p50=${q(.5)}ms p95=${q(.95)}ms p99=${q(.99)}ms ${JSON.stringify(codes)}`);
}
await run('home', '/api/home');
await run('me', '/api/me');
await run('static', '/app.js');
export {};
