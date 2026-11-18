import { BANDS, FPS } from './rhythm.ts';

export interface Hit { id: string; score: number; second: number }

const FIRST = 2, LAST = 14;

export function bestPosition(sample: Uint8Array, song: Uint8Array): { score: number; frame: number } {
  const n = Math.floor(sample.length / BANDS), m = Math.floor(song.length / BANDS);
  if (n < FPS * 3 || m < n) return { score: 0, frame: 0 };
  const total = new Float64Array(m - n + 1), bands = LAST - FIRST;
  for (let b = FIRST; b < LAST; b++) {
    const x = new Float64Array(n);
    let mean = 0, spread = 0;
    for (let i = 0; i < n; i++) { x[i] = sample[i * BANDS + b]; mean += x[i]; }
    mean /= n;
    for (let i = 0; i < n; i++) { x[i] -= mean; spread += x[i] * x[i]; }
    if (spread < 1) continue;
    const y = new Float64Array(m), sum = new Float64Array(m + 1), sq = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) { y[i] = song[i * BANDS + b]; sum[i + 1] = sum[i] + y[i]; sq[i + 1] = sq[i] + y[i] * y[i]; }
    for (let at = 0; at <= m - n; at++) {
      const s = sum[at + n] - sum[at], v = sq[at + n] - sq[at] - s * s / n;
      if (v < 1) continue;
      let dot = 0;
      for (let i = 0; i < n; i++) dot += x[i] * y[at + i];
      total[at] += dot / Math.sqrt(spread * v);
    }
  }
  let score = -1, frame = 0;
  for (let at = 0; at < total.length; at++) if (total[at] > score) { score = total[at]; frame = at; }
  return { score: score / bands, frame };
}
export function rank(sample: Uint8Array, songs: { id: string; map: Uint8Array }[]): Hit[] {
  return songs.map(s => { const { score, frame } = bestPosition(sample, s.map); return { id: s.id, score, second: frame / FPS }; }).sort((a, b) => b.score - a.score);
}

export const SURE = 0.45, MARGIN = 0.08, MAYBE = 0.3;
export const verdict = (hits: Hit[]): 'found' | 'maybe' | 'none' => {
  const [a, b] = hits;
  if (!a || a.score < MAYBE) return 'none';
  return a.score >= SURE && a.score - (b?.score ?? 0) >= MARGIN ? 'found' : 'maybe';
};
