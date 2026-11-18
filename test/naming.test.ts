import test from 'node:test';
import assert from 'node:assert/strict';
import { guessGenres, listen, matchGenres, matchNames, phraseFrom, suggestTitles, type Sound } from '../client/naming.ts';
import { bestPosition, rank, verdict } from '../client/identify.ts';
import type { Fingerprint } from '../client/fingerprint.ts';
const BANDS = 16;

const pulse = (every: number, seconds = 30, high = 40): Uint8Array => { const m = new Uint8Array(seconds * 20 * BANDS); for (let f = 0; f < seconds * 20; f++) for (let b = 0; b < BANDS; b++) m[f * BANDS + b] = f % every === 0 && b < 4 ? 255 : high; return m; };
const fp = (t: number, s: number, p: number[] = [1, 1, .9, .6, .5, .5, .4, .4, .3, .2, .2, .1, .1, .1, .1, 0]): Fingerprint => ({ h: '', p, t, s, d: 30 });
test('hits and speed are heard from the map', () => {
  const s = listen(pulse(5), fp(120, .7));
  assert.ok(s.hits > 3 && s.hits < 5, `4 kicks a second, heard ${s.hits}`);
  assert.equal(s.mood, 'nightFast');
  assert.equal(listen(pulse(10), fp(80, .3)).mood, 'nightSlow');
  assert.equal(listen(pulse(5), fp(128, .7, [1, 1, .5, .5, .5, .5, .5, .5, .5, .5, .5, .4, .4, .4, .4, .3])).mood, 'brightFast');
});
test('the library decides before the rules', () => {
  const me = fp(100, .6), s = listen(pulse(12), me);
  const lib = [{ genre: 'Angelcore', fp: fp(120, .7) }, { genre: 'Angelcore', fp: JSON.stringify(fp(80, .3)) }, { genre: 'Rok', fp: fp(100, .6, Array(16).fill(0.05)) }];
  assert.equal(guessGenres(s, me, lib)[0], 'Angelcore');
  assert.ok(!guessGenres(s, me, lib).slice(0, 1).includes('Rok'), 'a song that sounds nothing alike has no say');
});
test('rules serve an empty library, and clear Phonk beats it', () => {
  const sound = (o: Partial<Sound>): Sound => ({ bpm: 120, strength: .7, hits: 2, treble: .6, energy: .4, mood: 'nightFast', ...o });
  assert.equal(guessGenres(sound({ bpm: 170 }), fp(170, .7), [])[0], 'Drum & Bass');
  assert.equal(guessGenres(sound({ bpm: 128 }), fp(128, .7), [])[0], 'House');
  assert.equal(guessGenres(sound({ hits: 3.3, treble: .3, bpm: 109 }), fp(109, .67), [{ genre: 'Angelcore', fp: fp(109, .67) }])[0], 'Phonk');
});
test('one song keeps its names, none taken, none invented', () => {
  const s: Sound = { bpm: 80, strength: .3, hits: 2, treble: .4, energy: .3, mood: 'nightSlow' };
  const a = suggestTitles(s, 42, []), b = suggestTitles(s, 42, []);
  assert.deepEqual(a, b); assert.equal(a.length, 5); assert.notDeepEqual(a, suggestTitles(s, 43, []));
  assert.ok(!suggestTitles(s, 42, [a[0].toUpperCase()]).includes(a[0]), 'a title already used is left out');
  for (const t of [...a, ...suggestTitles(null, 7, [], '', 40)]) assert.doesNotMatch(t, /neon|echo|dream|whisper|shadow|horizon|eternal|journey|serenade|symphony|ethereal|odyssey/i);
});
test('the refrain becomes the first name', () => {
  const lyrics = 'Kecha yomg\'ir yog\'di\nQora ko\'zlaring meni\nQora ko\'zlaring meni\nUzoqda qolding\nQora ko\'zlaring meni';
  assert.equal(phraseFrom(lyrics), 'Qora ko\'zlaring meni');
  assert.equal(suggestTitles(null, 1, [], lyrics)[0], 'Qora ko\'zlaring meni');
  assert.equal(phraseFrom('Bir qator\n'), null);
  assert.equal(phraseFrom(''), null);
});
test('letters narrow the names and finish the last word', () => {
  assert.equal(matchNames('', null, []).length, 0);
  const sam = matchNames('sam', null, []);
  assert.equal(sam[0], 'Samarkand');
  assert.ok(matchNames('Black W', null, []).includes('Black Warsaw'));
  assert.ok(!matchNames('sam', null, ['samarkand']).includes('Samarkand'));
  assert.ok(matchNames('b', null, []).length <= 6);
});
test('genre names come from the open list, the owner\'s own first', () => {
  assert.ok(matchGenres('phon', []).includes('Phonk'));
  assert.equal(matchGenres('ang', ['Angelcore'])[0], 'Angelcore');
  assert.equal(matchGenres('', []).length, 0);
});

const noiseMap = (frames: number, seed: number): Uint8Array => { const m = new Uint8Array(frames * BANDS); let x = seed; for (let i = 0; i < m.length; i++) { x = (x * 1664525 + 1013904223) >>> 0; m[i] = x >>> 24; } return m; };
test('a clip is found in its song at its second, through volume and noise', () => {
  const a = noiseMap(2000, 1), b = noiseMap(2000, 2), clip = a.slice(600 * BANDS, 800 * BANDS).map((v, i) => Math.min(255, v * 0.4 + (i * 7919) % 40));
  assert.equal(bestPosition(clip, a).frame, 600);
  const hits = rank(clip, [{ id: 'b', map: b }, { id: 'a', map: a }]);
  assert.equal(hits[0].id, 'a'); assert.equal(hits[0].second, 30); assert.equal(verdict(hits), 'found');
});
test('nothing is claimed for a song the catalogue does not hold', () => {
  const hits = rank(noiseMap(200, 9), [{ id: 'a', map: noiseMap(2000, 1) }, { id: 'b', map: noiseMap(2000, 2) }]);
  assert.equal(verdict(hits), 'none');
  assert.equal(verdict([]), 'none');
  assert.equal(bestPosition(new Uint8Array(BANDS), noiseMap(100, 1)).score, 0, 'too short to judge');
});
test('a close second makes the answer uncertain', () => {
  assert.equal(verdict([{ id: 'a', score: 0.6, second: 0 }, { id: 'b', score: 0.55, second: 0 }]), 'maybe');
  assert.equal(verdict([{ id: 'a', score: 0.35, second: 0 }]), 'maybe');
});
