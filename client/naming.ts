import { BANDS, FPS } from './rhythm.ts';
import type { Fingerprint } from './fingerprint.ts';
import { WORLD_GENRES } from './genre-names.ts';

export type Mood = 'nightSlow' | 'warmSlow' | 'nightFast' | 'brightFast';
export interface Sound { bpm: number; strength: number; hits: number; treble: number; energy: number; mood: Mood }

const NAMES: Record<Mood, string[]> = {
  nightSlow: ['Lofoten', 'Tromso', 'Reykjavik', 'Tallinn', 'Riga', 'Bergen', 'Vilnius', 'Sapporo', 'Hokkaido', 'Akureyri', 'Svalbard', 'Kyoto', 'Nara', 'Prague', 'Krakow', 'Toska', 'Hiraeth', 'Yugen', 'Komorebi', 'Saudade', 'Sehnsucht', 'Mono no Aware', 'Fernweh', 'Dusha', 'Sumerki'],
  warmSlow: ['Samarkand', 'Bukhara', 'Khiva', 'Lisbon', 'Porto', 'Havana', 'Marrakesh', 'Fez', 'Granada', 'Sevilla', 'Alexandria', 'Istanbul', 'Isfahan', 'Shiraz', 'Tbilisi', 'Yerevan', 'Beirut', 'Valparaiso', 'Cartagena', 'Oaxaca', 'Duende', 'Sobremesa', 'Querencia', 'Meraki', 'Ya Habibi'],
  nightFast: ['Berlin', 'Kreuzberg', 'Detroit', 'Shibuya', 'Shinjuku', 'Seoul', 'Gangnam', 'Taipei', 'Kowloon', 'Bangkok', 'Moscow', 'Warsaw', 'Belgrade', 'Tbilisi Noir', 'Memphis', 'Chicago', 'Harlem', 'Kyiv', 'Sofia', 'Hanoi', 'Macau', 'Osaka', 'Manila', 'Lagos', 'Bogota'],
  brightFast: ['Ibiza', 'Mykonos', 'Rio', 'Copacabana', 'Ipanema', 'Bali', 'Zanzibar', 'Miami', 'Tulum', 'Goa', 'Phuket', 'Barcelona', 'Naples', 'Capri', 'Santorini', 'Dubrovnik', 'Kingston', 'Dakar', 'Cancun', 'Palawan', 'Maui', 'Fiesta', 'Carnaval', 'Alegria', 'Sabrosa'],
};
const ALL = [...new Set(Object.values(NAMES).flat())];

export function matchGenres(typed: string, own: string[], n = 6): string[] {
  const t = key(typed);
  if (!t) return [];
  const score = (g: string): number => (key(g).startsWith(t) ? 0 : 2) - (own.includes(g) ? 1 : 0);
  return [...new Set([...own, ...WORLD_GENRES])].filter(g => key(g).includes(t)).sort((a, b) => score(a) - score(b) || a.length - b.length).slice(0, n);
}

export function listen(map: Uint8Array, fp: Fingerprint): Sound {
  const frames = Math.floor(map.length / BANDS);
  let sum = 0, hits = 0, mean = 0;
  for (const v of map) sum += v;
  const flux = new Float64Array(frames);
  for (let f = 1; f < frames; f++) { for (let b = 0; b < 4; b++) flux[f] += Math.max(0, map[f * BANDS + b] - map[(f - 1) * BANDS + b]); mean += flux[f]; }
  mean /= frames || 1;
  for (let f = 1; f < frames - 1; f++) if (flux[f] > mean * 2 && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1]) hits++;
  const treble = fp.p.slice(11).reduce((a, c) => a + c, 0), energy = map.length ? sum / map.length / 255 : 0;
  const fast = fp.t >= 110 && fp.s >= 0.4;
  return { bpm: fp.t, strength: fp.s, hits: frames ? hits / (frames / FPS) : 0, treble, energy, mood: treble >= 0.6 ? (fast ? 'brightFast' : 'warmSlow') : fast ? 'nightFast' : 'nightSlow' };
}

function ruleGenres(s: Sound): string[] {
  const steady = s.strength >= 0.45, out: string[] = [];
  if (s.hits >= 3 && s.treble < 0.45) out.push('Phonk');
  if (steady && s.bpm >= 160) out.push('Drum & Bass');
  if (steady && s.bpm >= 136 && s.bpm < 160) out.push('Techno');
  if (steady && s.bpm >= 118 && s.bpm < 136) out.push('House');
  if (s.hits < 1 && s.energy < 0.3) out.push('Ambient');
  if (s.bpm < 95 && s.hits >= 1.5) out.push('Hip-Hop');
  if (s.bpm < 90 && s.energy < 0.3) out.push('Lo-Fi');
  return [...out, 'Elektron', 'Pop'];
}
const halves = (a: number, b: number): number => {
  if (!a || !b) return 1;
  let r = Math.abs(Math.log2(a / b)) % 1;
  if (r > 0.5) r = 1 - r;
  return r * 2;
};

export function guessGenres(s: Sound, fp: Fingerprint, library: { genre?: string; fp: Fingerprint | string }[]): string[] {
  const votes = new Map<string, number>();
  for (const k of library) {
    const o: Fingerprint = typeof k.fp === 'string' ? JSON.parse(k.fp) : k.fp;
    if (!k.genre || !o?.p) continue;
    const shape = Math.sqrt(fp.p.reduce((a, v, i) => a + (v - (o.p[i] ?? 0)) ** 2, 0) / fp.p.length);
    const near = 1 - (shape * 2 + halves(fp.t, o.t) * 0.3);
    if (near > 0.45) votes.set(k.genre, (votes.get(k.genre) ?? 0) + near * near);
  }
  const known = [...votes].sort((a, b) => b[1] - a[1]).map(([g]) => g), rules = ruleGenres(s);

  const lead = rules[0] === 'Phonk' ? ['Phonk'] : [];
  return [...new Set([...lead, ...known, ...rules])].slice(0, 4);
}

const seeded = <T>(list: T[], seed: number): T[] => {
  const out = [...list];
  let x = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) >>> 0; const j = x % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
const key = (s: string): string => s.toLocaleLowerCase('en').replace(/['‘’`ʻʼ]/g, '').trim();

export function phraseFrom(lyrics: string): string | null {
  const lines = lyrics.split(/\n+/).map(l => l.replace(/[.,!?;:"«»()[\]]/g, '').trim()).filter(Boolean);
  const seen = new Map<string, { text: string; times: number; whole: boolean }>();
  for (const l of lines) {
    const w = l.split(/\s+/);
    for (let size = 2; size <= 4; size++) for (let i = 0; i + size <= w.length; i++) {
      const text = w.slice(i, i + size).join(' '), k = key(text), has = seen.get(k);
      if (text.length < 6) continue;
      seen.set(k, { text: has?.text ?? text, times: (has?.times ?? 0) + 1, whole: !!has?.whole || size === w.length });
    }
  }
  const rank = (e: { text: string; times: number; whole: boolean }): number => e.times * 2 + (e.whole ? 2 : 0) + e.text.split(' ').length;
  const best = [...seen.values()].filter(e => e.times >= 2).sort((x, y) => rank(y) - rank(x))[0];
  return best ? best.text.replace(/^\p{L}/u, c => c.toLocaleUpperCase('en')) : null;
}
export function suggestTitles(s: Sound | null, seed: number, taken: Iterable<string>, lyrics = '', n = 5): string[] {
  const used = new Set([...taken].map(key)), phrase = phraseFrom(lyrics);
  const mine = s ? seeded(NAMES[s.mood], seed) : [], rest = seeded(ALL, seed);
  return [...new Set([...(phrase ? [phrase] : []), ...mine, ...rest])].filter(t => !used.has(key(t))).slice(0, n);
}

export function matchNames(typed: string, s: Sound | null, taken: Iterable<string>, n = 6): string[] {
  const used = new Set([...taken].map(key)), words = typed.replace(/\s+$/, m => (m ? ' ' : '')).split(' '), last = key(words.pop() ?? '');
  if (!last) return [];
  const head = words.length ? `${words.join(' ')} ` : '', mood = new Set(s ? NAMES[s.mood] : []);
  const score = (t: string): number => { const k = key(t); return (k.startsWith(last) ? 0 : k.includes(last) ? 2 : 4) - (mood.has(t) ? 1 : 0); };
  return ALL.filter(t => key(t).includes(last)).sort((a, b) => score(a) - score(b) || a.localeCompare(b)).map(t => head + t).filter(t => !used.has(key(t)) && key(t) !== key(typed)).slice(0, n);
}
