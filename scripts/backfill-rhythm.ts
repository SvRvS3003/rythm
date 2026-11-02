// TypeScript, scripts/backfill-rhythm.ts, node 24: prepares beat maps for songs uploaded before they existed. Reads the WAV, never rewrites it.
// Usage: node scripts/backfill-rhythm.ts <baseUrl>
import { readFileSync } from 'node:fs';
import { analyzeFull } from '../client/rhythm.ts';
import { makeFingerprint } from '../client/fingerprint.ts';
const B = process.argv[2], v = readFileSync('.prod.vars', 'utf8');
const r = await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: v.match(/ADMIN_LOGIN=(.*)/)![1].trim(), password: v.match(/ADMIN_PASSWORD=(.*)/)![1].trim() }) });
const cookie = r.headers.get('set-cookie')!.split(';')[0];
const headers = { cookie, 'content-type': 'application/json' };
const { tracks } = await (await fetch(`${B}/api/admin/tracks`, { headers })).json();
const have = new Set((await (await fetch(`${B}/api/admin/fingerprints`, { headers })).json()).tracks.map((t: { id: string }) => t.id));
for (const t of tracks.filter((x: { rhythm: string | null; id: string }) => !x.rhythm || !have.has(x.id))) {
  const grant = await (await fetch(`${B}/api/play`, { method: 'POST', headers, body: JSON.stringify({ trackId: t.id }) })).json();
  const wav = new Uint8Array(await (await fetch(B + grant.url)).arrayBuffer());
  const { map, bandPeaks } = analyzeFull(wav);
  const fp = makeFingerprint(map, bandPeaks);
  const put = await fetch(`${B}/api/admin/tracks/${t.id}/rhythm`, { method: 'PUT', headers: { cookie }, body: map as BodyInit });
  const put2 = await fetch(`${B}/api/admin/tracks/${t.id}/fingerprint`, { method: 'PUT', headers, body: JSON.stringify({ fp }) });
  console.log(t.title, `${(wav.length / 1e6).toFixed(1)} MB -> map ${(map.length / 1e3).toFixed(0)} KB, tempo ${fp.t}`, put.status, put2.status);
}
