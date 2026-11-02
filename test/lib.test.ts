import test from 'node:test';
import assert from 'node:assert/strict';
import { unseen } from '../client/queue.ts';
import { analyzeWav, BANDS, FPS } from '../client/rhythm.ts';
import { parseWav, parseRange, imageType, isApk, hashPassword, safeEqual } from '../src/lib.ts';

function wav({ format = 1, bits = 16, rate = 44100, ch = 2, dataSize = 1000, extra = 0, sub = 0 }: { format?: number; bits?: number; rate?: number; ch?: number; dataSize?: number; extra?: number; sub?: number } = {}) {
  const fmtSize = sub ? 40 : 16;
  const b = new Uint8Array(12 + (extra ? 8 + extra : 0) + 8 + fmtSize + 8 + dataSize), v = new DataView(b.buffer);
  const s = (o, t) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  s(0, 'RIFF'); s(8, 'WAVE');
  let p = 12;
  if (extra) { s(p, 'LIST'); v.setUint32(p + 4, extra, true); p += 8 + extra; }
  s(p, 'fmt '); v.setUint32(p + 4, fmtSize, true);
  v.setUint16(p + 8, format, true); v.setUint16(p + 10, ch, true); v.setUint32(p + 12, rate, true);
  v.setUint32(p + 16, rate * ch * bits / 8, true); v.setUint16(p + 22, bits, true);
  if (sub) v.setUint16(p + 8 + 24, sub, true);
  p += 8 + fmtSize; s(p, 'data'); v.setUint32(p + 4, dataSize, true);
  return b;
}

test('accepts PCM, float, extensible and leading LIST chunks', () => {
  assert.equal(parseWav(wav()).sampleRate, 44100);
  assert.equal(parseWav(wav({ format: 3, bits: 32, rate: 96000 })).bitDepth, 32);
  assert.equal(parseWav(wav({ format: 0xfffe, sub: 1, bits: 24 })).bitDepth, 24);
  assert.equal(parseWav(wav({ extra: 200 })).channels, 2);
  assert.equal(parseWav(wav({ rate: 1000 * 8, ch: 1, bits: 8, dataSize: 8000 })).duration, 1);
});

test('rejects non-WAV, compressed payloads and truncated files', () => {
  assert.throws(() => parseWav(new TextEncoder().encode('ID3 this is an mp3 file....')));
  assert.throws(() => parseWav(wav({ format: 0x55 })), /Siqilgan/);
  assert.throws(() => parseWav(wav({ format: 0xfffe, sub: 0x55 })), /Siqilgan/);
  assert.throws(() => parseWav(wav({ dataSize: 1000 }), 500), /to'liq emas/);
  assert.throws(() => parseWav(wav({ dataSize: 0 })));
});

test('range parsing matches what Safari sends', () => {
  assert.equal(parseRange(null, 100), null);
  assert.deepEqual(parseRange('bytes=0-1', 100), { offset: 0, length: 2 });
  assert.deepEqual(parseRange('bytes=50-', 100), { offset: 50, length: 50 });
  assert.deepEqual(parseRange('bytes=-10', 100), { offset: 90, length: 10 });
  assert.deepEqual(parseRange('bytes=90-500', 100), { offset: 90, length: 10 });
  assert.equal(parseRange('bytes=100-', 100), 'invalid');
  assert.equal(parseRange('items=0-1', 100), 'invalid');
});

test('file sniffing', () => {
  assert.equal(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0])), 'jpg');
  assert.equal(imageType(new TextEncoder().encode('<svg onload=alert(1)>')), null);
  assert.ok(isApk(new Uint8Array([0x50, 0x4b, 3, 4])));
});

test('password hashing round trip', async () => {
  const { hash, salt } = await hashPassword('secret123');
  assert.ok(safeEqual(hash, (await hashPassword('secret123', salt)).hash));
  assert.ok(!safeEqual(hash, (await hashPassword('wrong', salt)).hash));
});

test('beat map follows the real bass hits in the PCM', () => {
  const rate = 48000, secs = 4, n = rate * secs;
  for (const bits of [16, 24]) {
    const w = wav({ bits, rate, ch: 1, dataSize: n * bits / 8 });
    const v = new DataView(w.buffer), start = w.length - n * bits / 8;
    for (let i = 0; i < n; i++) {
      const on = (i / rate) % 0.5 < 0.1; // a 100 ms, 80 Hz hit every half second
      const s = on ? Math.sin(2 * Math.PI * 80 * i / rate) * 0.9 : 0;
      const p = start + i * bits / 8;
      if (bits === 16) v.setInt16(p, s * 32767, true);
      else { const x = Math.round(s * 8388607); v.setUint16(p, x & 0xffff, true); v.setInt8(p + 2, x >> 16); }
    }
    const map = analyzeWav(w);
    assert.equal(map.length, secs * FPS * BANDS);
    const bass = (t: number) => map[Math.round(t * FPS) * BANDS + 2];
    for (const hit of [1, 1.5, 2, 2.5, 3]) {
      assert.ok(bass(hit) > 150, `${bits}-bit hit at ${hit}s = ${bass(hit)}`);
      assert.ok(bass(hit + 0.3) < 30, `${bits}-bit gap after ${hit}s = ${bass(hit + 0.3)}`);
    }
  }
});

test('queue never takes a song twice, even after a full cycle', () => {
  const q = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(unseen(q, [{ id: 'b' }, { id: 'c' }, { id: 'c' }]).map(t => t.id), ['c']);
  assert.deepEqual(unseen(q, [{ id: 'a' }, { id: 'b' }]), []);
});
