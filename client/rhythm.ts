// TypeScript, client/rhythm.ts, browser and node: turns a WAV's own PCM into a small beat map, read-only, the audio is never changed.
// Playback reads this map by currentTime. Audio never enters Web Audio, which would stop iOS background playback.
import { parseWav } from '../src/lib.ts';

export const BANDS = 16, FPS = 20;

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const c = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = c;
      }
    }
  }
}

export function analyzeWav(bytes: Uint8Array): Uint8Array {
  const w = parseWav(bytes), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = w.bitDepth / 8, step = width * w.channels, end = Math.min(bytes.length, w.dataOffset + w.dataSize);
  const sample = (p: number): number => {
    if (w.format === 3) return w.bitDepth === 32 ? v.getFloat32(p, true) : 0;
    if (w.bitDepth === 8) return (v.getUint8(p) - 128) / 128;
    if (w.bitDepth === 16) return v.getInt16(p, true) / 32768;
    if (w.bitDepth === 24) return ((v.getInt8(p + 2) << 16) | v.getUint16(p, true)) / 8388608;
    return v.getInt32(p, true) / 2147483648;
  };
  let size = 256;
  while (size < w.sampleRate / 46) size <<= 1; // about 21 ms whatever the sample rate
  const hann = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));
  const edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.max(1, Math.round(40 * Math.pow(16000 / 40, i / BANDS) * size / w.sampleRate)));
  const frames = Math.floor(w.duration * FPS), raw = new Float32Array(frames * BANDS);
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let f = 0; f < frames; f++) {
    const start = w.dataOffset + Math.floor((f / FPS) * w.sampleRate) * step;
    for (let i = 0; i < size; i++) {
      let s = 0;
      const p = start + i * step;
      if (p + step <= end) for (let c = 0; c < w.channels; c++) s += sample(p + c * width);
      re[i] = (s / w.channels) * hann[i]; im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let sum = 0;
      const hi = Math.min(size / 2, Math.max(edges[b] + 1, edges[b + 1]));
      for (let k = edges[b]; k < hi; k++) sum += Math.hypot(re[k], im[k]);
      raw[f * BANDS + b] = Math.sqrt(sum / (hi - edges[b]));
    }
  }
  // Each band is scaled to its own loudest moment, so quiet highs still move the picture.
  const out = new Uint8Array(raw.length);
  for (let b = 0; b < BANDS; b++) {
    let peak = 1e-6;
    for (let f = 0; f < frames; f++) peak = Math.max(peak, raw[f * BANDS + b]);
    for (let f = 0; f < frames; f++) out[f * BANDS + b] = Math.min(255, Math.round(255 * raw[f * BANDS + b] / peak));
  }
  return out;
}
