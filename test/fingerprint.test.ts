import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeFull } from '../client/rhythm.ts';
import { makeFingerprint, compare, type Fingerprint } from '../client/fingerprint.ts';

const dir = mkdtempSync(join(tmpdir(), 'fp-'));
const render = (name: string, filter: string, extra: string[] = [], secs = 50): Fingerprint => {
  const f = join(dir, `${name}.wav`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='${filter}':s=44100:d=${secs}`, ...extra, f]);
  const { map, bandPeaks } = analyzeFull(new Uint8Array(readFileSync(f)));
  return makeFingerprint(map, bandPeaks);
};

const song = (bpm: number, roots: number[], kick = 60, hat = 0.15): string => {
  const beat = 60 / bpm, chord = roots.map((r, i) => `gt(${i + 1}\\,mod(floor(t/${beat * 4})\\,${roots.length}))*lt(${i - 1}\\,mod(floor(t/${beat * 4})\\,${roots.length}))*eq(${i}\\,mod(floor(t/${beat * 4})\\,${roots.length}))*(sin(2*PI*${r}*t)+sin(2*PI*${r * 1.26}*t)+sin(2*PI*${r * 1.5}*t))`).join('+');
  return `0.12*(${chord})+0.5*exp(-18*mod(t\\,${beat}))*sin(2*PI*${kick}*t)+${hat}*random(0)*exp(-50*mod(t+${beat / 2}\\,${beat}))`;
};
const A = song(120, [220, 277, 330, 247]);
const original = render('original', A);

const copies: [string, Fingerprint][] = [
  ['quieter by 9 dB', render('quiet', A, ['-af', 'volume=-9dB'])],
  ['louder with limiter', render('loud', A, ['-af', 'volume=4dB,alimiter'])],
  ['resampled to 48 kHz, 24-bit', render('hd', A, ['-ar', '48000', '-c:a', 'pcm_s24le'])],
  ['stereo', render('stereo', A, ['-ac', '2'])],
  ['8 s cut from the start', render('trim', A, ['-af', 'atrim=start=8,asetpts=N/SR/TB'])],
  ['only the middle 30 s', render('middle', A, ['-af', 'atrim=start=10:end=40,asetpts=N/SR/TB'])],
  ['3 s of silence added first', render('pad', A, ['-af', 'adelay=3000:all=1'])],
  ['through an MP3 and back', (() => { const m = join(dir, 'c.mp3'), w = join(dir, 'c.wav'); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'original.wav'), '-b:a', '128k', m]); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', m, w]); const r = analyzeFull(new Uint8Array(readFileSync(w))); return makeFingerprint(r.map, r.bandPeaks); })()],
];
for (const [name, fp] of copies) {
  test(`same song: ${name}`, () => {
    const c = compare(original, fp);
    console.log(`  ${name}: sound ${(c.sound * 100).toFixed(0)}%, freq ${(c.frequency * 100).toFixed(1)}%, rhythm ${(c.rhythm * 100).toFixed(0)}%`);
    assert.equal(c.level, 'same', JSON.stringify(c));
  });
}
const others: [string, Fingerprint][] = [
  ['same notes, slower tempo', render('slow', song(90, [220, 277, 330, 247]))],
  ['same rhythm, other chords', render('chords', song(120, [196, 147, 262, 175]))],
  ['other kick and no hats', render('kick', song(120, [165, 208, 196, 139], 90, 0))],
  ['fast dance track', render('dance', song(174, [110, 147, 131, 98], 50, 0.3))],
  ['pure noise bursts', render('noise', "0.4*random(0)*gt(sin(2*PI*1.7*t)\\,0)")],
  ['rising siren', render('siren', "0.5*sin(2*PI*(200+150*sin(2*PI*0.3*t))*t)")],
];
for (const [name, fp] of others) {
  test(`different song is not called the same: ${name}`, () => {
    const c = compare(original, fp);
    console.log(`  ${name}: sound ${(c.sound * 100).toFixed(0)}%, freq ${(c.frequency * 100).toFixed(1)}%, rhythm ${(c.rhythm * 100).toFixed(0)}%, ${c.level}`);
    assert.notEqual(c.level, 'same', JSON.stringify(c));
  });
}
test('steady tones are told apart by pitch', () => {
  const a = render('t440', '0.5*sin(2*PI*440*t)', [], 20), a2 = render('t440b', '0.3*sin(2*PI*440*t)', [], 20), b = render('t3000', '0.5*sin(2*PI*3000*t)', [], 20);
  assert.equal(compare(a, a2).level, 'same');
  assert.notEqual(compare(a, b).level, 'same');
});
test('tempo is measured', () => {
  assert.ok(Math.abs(original.t - 120) < 4 || Math.abs(original.t - 60) < 2 || Math.abs(original.t - 240) < 8, `tempo ${original.t}`);
});
test('two different songs do not resemble each other', () => {
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) assert.notEqual(compare(others[i][1], others[j][1]).level, 'same', `${others[i][0]} vs ${others[j][0]}`);
});
