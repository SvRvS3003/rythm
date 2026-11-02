// TypeScript, client/fingerprint.ts, browser and node: decides whether two recordings are the same song by how they sound. Names play no part.
import { BANDS, FPS } from './rhythm.ts';

export interface Fingerprint { h: string; p: number[]; t: number; s: number; d: number } // hash, band loudness, tempo, tempo strength, seconds
const STEP = 4; // 20 map frames a second become 5 hash frames a second
export const HASH_FPS = FPS / STEP;

const b64 = (u: Uint16Array): string => btoa(String.fromCharCode(...new Uint8Array(u.buffer)));
const unb64 = (s: string): Uint16Array => { const b = Uint8Array.from(atob(s), c => c.charCodeAt(0)); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };

// Tempo from how often energy jumps: survives a change of volume or format.
function tempo(map: Uint8Array): { bpm: number; strength: number } {
  const frames = Math.floor(map.length / BANDS), flux = new Float64Array(frames);
  for (let f = 1; f < frames; f++) { let v = 0; for (let b = 0; b < BANDS; b++) v += Math.max(0, map[f * BANDS + b] - map[(f - 1) * BANDS + b]); flux[f] = v; }
  const mean = flux.reduce((a, c) => a + c, 0) / (frames || 1);
  let zero = 0, best = 0, bestLag = 0;
  for (let f = 0; f < frames; f++) zero += (flux[f] - mean) ** 2;
  const lo = Math.round(FPS * 60 / 200), hi = Math.round(FPS * 60 / 60);
  for (let lag = lo; lag <= hi; lag++) {
    let v = 0;
    for (let f = lag; f < frames; f++) v += (flux[f] - mean) * (flux[f - lag] - mean);
    if (v > best) { best = v; bestLag = lag; }
  }
  return { bpm: bestLag ? (FPS * 60) / bestLag : 0, strength: zero ? best / zero : 0 };
}

export function makeFingerprint(map: Uint8Array, bandPeaks: number[]): Fingerprint {
  const frames = Math.floor(map.length / BANDS), n = Math.floor(frames / STEP), e = new Float64Array(n * BANDS);
  for (let t = 0; t < n; t++) for (let b = 0; b < BANDS; b++) { let v = 0; for (let k = 0; k < STEP; k++) v += map[(t * STEP + k) * BANDS + b]; e[t * BANDS + b] = v / STEP; }
  const hash = new Uint16Array(Math.max(0, n - 1));
  for (let t = 1; t < n; t++) {
    let bits = 0;
    for (let b = 0; b < BANDS - 1; b++) {
      const d = (e[t * BANDS + b] - e[t * BANDS + b + 1]) - (e[(t - 1) * BANDS + b] - e[(t - 1) * BANDS + b + 1]);
      if (d > 2) bits |= 1 << b; // below this is rounding noise, not music
    }
    hash[t - 1] = bits;
  }
  const top = Math.max(...bandPeaks, 1e-9), tp = tempo(map);
  return { h: b64(hash), p: bandPeaks.map(v => Math.round((v / top) * 1000) / 1000), t: Math.round(tp.bpm * 10) / 10, s: Math.round(tp.strength * 100) / 100, d: Math.round(frames / FPS) };
}

const BITS = new Uint8Array(65536);
for (let i = 1; i < 65536; i++) BITS[i] = BITS[i >> 1] + (i & 1);
// Share of frames whose picture changes at all: a steady tone has none, and its hash says nothing.
function activity(h: Uint16Array): number {
  let on = 0;
  for (let i = 0; i < h.length; i++) if (h[i]) on++;
  return h.length ? on / h.length : 0;
}
function bestAlignment(a: Uint16Array, b: Uint16Array): { score: number; overlap: number } {
  const need = Math.min(a.length, b.length, Math.max(HASH_FPS * 15, Math.floor(Math.min(a.length, b.length) * 0.5)));
  let score = 0, overlap = 0;
  const scan = (from: number, to: number, stride: number, step: number) => {
    for (let off = from; off <= to; off += step) {
      const start = Math.max(0, -off), end = Math.min(a.length, b.length - off), len = end - start;
      if (len < need) continue;
      let diff = 0, n = 0;
      for (let i = start; i < end; i += stride) { diff += BITS[a[i] ^ b[i + off]]; n++; }
      const s = 1 - diff / (n * (BANDS - 1));
      if (s > score) { score = s; overlap = len; bestOff = off; }
    }
  };
  let bestOff = 0;
  // Coarse look across every position, then exact around the best one, keeps a large catalogue quick.
  scan(-a.length, b.length, 4, 1);
  scan(bestOff - 2, bestOff + 2, 1, 1);
  return { score, overlap };
}
const cosine = (x: number[], y: number[]): number => {
  let d = 0, a = 0, b = 0;
  for (let i = 0; i < x.length; i++) { d += x[i] * y[i]; a += x[i] ** 2; b += y[i] ** 2; }
  return a && b ? d / Math.sqrt(a * b) : 0;
};
function rhythmMatch(a: Fingerprint, b: Fingerprint): number {
  if (!a.t || !b.t || a.s < 0.08 || b.s < 0.08) return 0;
  // Half and double tempo are the same pulse counted differently.
  const r = Math.min(...[1, 2, 0.5].map(k => Math.abs(a.t * k - b.t) / b.t));
  return Math.max(0, 1 - r / 0.06);
}
export interface Comparison { level: 'same' | 'similar' | 'different'; sound: number; frequency: number; rhythm: number; overlapSeconds: number }
export function compare(x: Fingerprint, y: Fingerprint): Comparison {
  const a = unb64(x.h), b = unb64(y.h), frequency = cosine(x.p, y.p), rhythm = rhythmMatch(x, y);
  const lively = Math.min(activity(a), activity(b)) > 0.1;
  const { score, overlap } = lively ? bestAlignment(a, b) : { score: 0, overlap: 0 };
  const overlapSeconds = overlap / HASH_FPS;
  let level: Comparison['level'] = 'different';
  // A shared beat alone can score high, so the song must also have the same balance of frequencies.
  if (lively ? score >= 0.72 && frequency >= 0.97 : frequency > 0.9995 && Math.abs(x.d - y.d) <= 2) level = 'same'; // steady tones have only their pitch to compare
  else if ((lively && score >= 0.68) || (frequency > 0.985 && rhythm > 0.8)) level = 'similar';
  return { level, sound: score, frequency, rhythm, overlapSeconds };
}
