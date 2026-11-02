import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWav, parseRange, imageType, isApk, hashPassword, safeEqual } from '../src/lib.js';

function wav({ format = 1, bits = 16, rate = 44100, ch = 2, dataSize = 1000, extra = 0, sub } = {}) {
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
