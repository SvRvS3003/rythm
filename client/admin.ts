import { analyzeFull, analyzeWav } from './rhythm.ts';
import { matchGenres, guessGenres, listen, matchNames, suggestTitles, type Sound } from './naming.ts';
import { compare, makeFingerprint, type Comparison, type Fingerprint } from './fingerprint.ts';
import { rank, verdict } from './identify.ts';
import { h, api, cover, fmt, money, toast, sheet, refresh, go, playList, S, type Row } from './app.ts';

const guard = <A extends unknown[]>(fn: (...a: A) => unknown) => async (...a: A): Promise<void> => { try { await fn(...a); } catch (e) { toast((e as Error).message); } };
const TABS = [['upload', '+ Musiqa qo\'shish'], ['find', 'Qo\'shiqni topish'], ['', 'Statistika'], ['tracks', 'Qo\'shiqlar'], ['artists', 'Ijrochilar'], ['users', 'Foydalanuvchilar'], ['plans', 'Tariflar'], ['payments', 'To\'lovlar'], ['ads', 'Reklama'], ['app', 'Ilova'], ['notices', 'Bildirishnoma'], ['api', 'API'], ['settings', 'Sozlamalar']];
const field = (label: string, input: Node) => h('label', { class: 'f' }, label, input);

function chips(input: HTMLInputElement, ideas: () => string[], typing: (text: string) => string[]): { row: HTMLElement; paint: () => void; edited: () => boolean } {
  const row = h('div', { class: 'name-chips' });
  let touched = false, typed = false;
  const paint = (): void => {
    const list = typed && input.value.trim() ? typing(input.value) : ideas();
    row.replaceChildren(...list.filter(o => o !== input.value).map(o => h('button', { type: 'button', class: 'pill', onclick: () => { input.value = o; touched = true; typed = false; paint(); } }, o)));
  };
  input.addEventListener('input', () => { touched = true; typed = true; paint(); });
  return { row, paint, edited: () => touched };
}
let ownGenres: string[] = [];
const genreTyping = (text: string): string[] => matchGenres(text, ownGenres);

const LISTEN_SECONDS = 10;
const ANDROID_MIC_APK = 7;

function micProblem(e: Error): string {
  const app = (window as unknown as { RythmNative?: { versionCode?: () => number } }).RythmNative;
  if (app?.versionCode && app.versionCode() < ANDROID_MIC_APK) return 'Mikrofon uchun ilovani yangilang: Android ilovasining yangi versiyasi kerak.';
  if (e.name === 'NotFoundError') return 'Bu qurilmada mikrofon topilmadi.';
  if (e.name !== 'NotAllowedError') return `Mikrofon ochilmadi: ${e.name}`;
  if (app) return 'Mikrofon taqiqlangan. Telefon Sozlamalari → Ilovalar → SvRvS Rythm → Ruxsatlar → Mikrofon ni yoqing.';
  if (/iPhone|iPad/.test(navigator.userAgent)) return 'Mikrofon taqiqlangan. iPhone Sozlamalari → Ilovalar → Safari → Mikrofon → "So\'rash" ni tanlang, ilovani yopib qayta oching.';
  return 'Mikrofon taqiqlangan. Brauzer manzil qatoridagi qulf belgisidan mikrofonga ruxsat bering.';
}
async function recordSong(tick: (left: number) => void): Promise<Uint8Array> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Bu qurilma mikrofonni ochib bera olmaydi');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).catch((e: Error) => { throw new Error(micProblem(e)); });
  const parts: Blob[] = [];
  try {
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = e => parts.push(e.data);
    const done = new Promise(ok => { rec.onstop = ok; });
    rec.start();
    for (let left = LISTEN_SECONDS; left > 0; left--) { tick(left); await new Promise(ok => setTimeout(ok, 1000)); }
    rec.stop();
    await done;
  } finally { for (const t of stream.getTracks()) t.stop(); }
  const decoded = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await new Blob(parts).arrayBuffer());
  const pcm = decoded.getChannelData(0), bytes = new Uint8Array(44 + pcm.length * 2), v = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF\0\0\0\0WAVEfmt '));
  v.setUint32(4, bytes.length - 8, true); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 48000, true); v.setUint32(28, 96000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode('data'), 36);
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  return bytes;
}const date = (t: number): string => (t ? new Date(t * 1000).toLocaleDateString('ru-RU') : '—');
const gb = (b: number): string => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const nodes = (l: unknown[]): Node[] => l.filter(Boolean) as Node[];
const kpi = (v: string | number, l: string) => h('div', { class: 'kpi' }, h('b', null, v), h('span', null, l));

export async function adminView(el: HTMLElement, parts: string[]): Promise<void> {
  const tab = parts[0] || '';
  let tapped = 0;
  const title = h('h1', { style: 'display:inline-block;user-select:none;-webkit-user-select:none;touch-action:manipulation', onclick: () => { const t = performance.now(); if (t - tapped < 400) { tapped = 0; flipTitle(title); } else tapped = t; } }, 'Admin panel');
  el.append(title, h('nav', { class: 'anav' }, [...TABS.map(([p, l]) => h('a', { class: `pill ${tab === p ? 'on' : ''}`, href: `/admin${p ? '/' + p : ''}` }, l)),

    h('a', { class: 'pill', href: 'https://dashboard.elysiummusic.org/', target: '_blank', rel: 'noopener' }, 'Elysium ↗')]));
  await (VIEWS[tab] || VIEWS[''])(el);
}

async function versionLines(): Promise<Node[]> {
  const apk = /SvRvSRythmApp\/(\S+)/.exec(navigator.userAgent)?.[1];
  const shell = ('caches' in window ? await caches.keys() : []).find(k => k.startsWith('rythm-shell-'))?.slice(12);
  const { release } = await api('/api/app/latest').catch(() => ({ release: null }));
  const line = (k: string, v: string) => h('span', { style: 'display:block;font-size:15px;line-height:1.35;font-weight:600' }, `${k}: ${v}`);
  return nodes([apk ? line('Android ilova', apk) : null, line((navigator as unknown as Row).standalone === true ? 'iPhone ilova' : 'Sayt', shell || '—'), line('Oxirgi APK', release ? `${release.versionName} (${release.versionCode})` : '—')]);
}

async function flipTitle(title: HTMLElement): Promise<void> {
  if (title.dataset.busy) return;
  title.dataset.busy = '1';
  try {
    const next = title.dataset.back ? ['Admin panel'] : await versionLines();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const turn = (from: number, to: number, ms: number, easing: string) => title.animate([{ transform: `perspective(600px) rotateX(${from}deg)` }, { transform: `perspective(600px) rotateX(${to}deg)` }], { duration: still ? 0 : ms, easing, fill: 'forwards' });
    const out = turn(0, 90, 240, 'ease-in');
    await out.finished;
    title.replaceChildren(...next);
    if (title.dataset.back) delete title.dataset.back; else title.dataset.back = '1';
    const back = turn(-90, 0, 380, 'cubic-bezier(.2,1.3,.4,1)');
    out.cancel();
    await back.finished;
    back.cancel();
  } finally { delete title.dataset.busy; }
}

async function shrinkCover(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = 800 / Math.max(img.width, img.height);
  if (scale >= 1 && file.size < 400_000) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * Math.min(1, scale)); c.height = Math.round(img.height * Math.min(1, scale));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => res(b && b.size < file.size ? b : file), 'image/jpeg', 0.86));
}
async function uploadImage(file?: File | null): Promise<string | null> {
  if (!file) return null;
  return (await api('/api/admin/images', { method: 'POST', raw: await shrinkCover(file) })).key;
}

interface Check { map?: Uint8Array; fp?: Fingerprint; sound?: Sound; error?: string; match?: { id?: string; title: string; artist: string; c: Comparison } }
async function checkFile(file: File, known: Row[]): Promise<Check> {
  if (!/\.wav$/i.test(file.name)) return { error: `${file.name}: faqat .wav fayl qabul qilinadi` };
  try {
    const { map, bandPeaks } = analyzeFull(new Uint8Array(await file.arrayBuffer()));
    const fp = makeFingerprint(map, bandPeaks);
    let match: Check['match'];
    const rank = { same: 2, similar: 1, different: 0 };
    for (const k of known) {
      const c = compare(fp, typeof k.fp === 'string' ? JSON.parse(k.fp) : k.fp);
      if (c.level !== 'different' && (!match || rank[c.level] > rank[match.c.level] || (rank[c.level] === rank[match.c.level] && c.sound > match.c.sound))) match = { id: k.id, title: k.title, artist: k.artist, c };
    }
    return { map, fp, sound: listen(map, fp), match };
  } catch (e) { return { error: `Faqat WAV qabul qilinadi: ${(e as Error).message}` }; }
}
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const details = (c: Comparison): string => `tovush ${pct(c.sound)}, chastota ${pct(c.frequency)}, ritm ${pct(c.rhythm)}`;
const askDuplicate = (file: File, m: NonNullable<Check['match']>): Promise<boolean> => new Promise(res => {
  sheet(close => [h('h2', null, 'Bu qo\'shiq allaqachon bor'), h('p', { class: 'muted', style: 'overflow-wrap:anywhere' }, `"${file.name}" tovushi "${m.title}" (${m.artist}) bilan bir xil: ${details(m.c)}.`),
    h('button', { class: 'btn pri', onclick: () => { close(); res(false); } }, 'Yuklamaslik'), h('button', { class: 'btn', onclick: () => { close(); res(true); } }, 'Baribir yuklash')]);
});
const uploadRhythm = (id: string, wav: Uint8Array) => api(`/api/admin/tracks/${id}/rhythm`, { method: "PUT", raw: analyzeWav(wav) as BodyInit });

async function uploadWav(file: File, kind: 'audio' | 'adaudio', onProgress?: (p: number) => void): Promise<Row> {
  if (!/\.wav$/i.test(file.name)) throw new Error(`${file.name}: faqat .wav fayl qabul qilinadi`);
  const start = await api('/api/admin/uploads', { method: 'POST', body: { kind } });
  const parts: Row[] = [];
  const total = Math.ceil(file.size / start.partSize) || 1;
  const qs = (n: number) => `/api/admin/uploads/part?key=${encodeURIComponent(start.key)}&uploadId=${encodeURIComponent(start.uploadId)}&n=${n}`;
  for (let n = 1; n <= total; n++) {
    const chunk = file.slice((n - 1) * start.partSize, n * start.partSize);
    for (let attempt = 1; ; attempt++) {
      try { parts.push(await api(qs(n), { method: 'PUT', raw: chunk })); break; } catch (e) {
        if (attempt >= 3 || /WAV/.test((e as Error).message)) throw e;
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
    onProgress?.(n / total);
  }
  const done = await api('/api/admin/uploads/complete', { method: 'POST', body: { key: start.key, uploadId: start.uploadId, parts } });

  if (done.size !== file.size) throw new Error(`${file.name}: fayl to'liq yuklanmadi, qayta urinib ko'ring`);
  return done;
}

const VIEWS: Record<string, (el: HTMLElement) => Promise<void>> = {
  async ''(el) {
    const d = await api('/api/admin/stats');
    const max = Math.max(1, ...d.daily.map((x: Row) => x.c));
    const days = [...Array(30)].map((_: unknown, i: number) => { const k = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10); return { k, c: d.daily.find((x: Row) => x.d === k)?.c || 0 }; });
    const top = (title: string, list: Row[]) => h('section', { class: 'panel' }, h('h2', null, title), list.length ? list.map((t: Row, i: number) => h('div', { class: 'item' }, h('b', { style: 'width:22px;color:var(--a2)' }, i + 1), h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, t.title), h('div', { class: 'clip small muted' }, t.artist)), h('b', null, t.plays))) : h('p', { class: 'muted' }, 'Hali tinglashlar yo\'q'));
    el.append(...nodes([
      h('a', { class: 'btn pri full', href: '/admin/upload' }, '+ Musiqa qo\'shish'),
      h('div', { class: 'kpis' }, kpi(d.users, 'Foydalanuvchilar'), kpi(d.active1, 'Faol (24 soat)'), kpi(d.active30, 'Faol (30 kun)'), kpi(d.newUsers7, 'Yangi (7 kun)'), kpi(d.paid, 'Pullik obunachilar'), kpi(d.exempt, 'Plansiz ro\'yxat'), kpi(d.plays, 'Jami tinglashlar'), kpi(d.plays7, 'Tinglash (7 kun)'), kpi(money(d.revenue30), 'Daromad (30 kun)'), kpi(gb(d.storage.bytes), `R2: ${d.storage.tracks} ta WAV`)),
      d.pendingPayments ? h('a', { class: 'upsell', href: '/admin/payments' }, h('h3', null, `${d.pendingPayments} ta to'lov tasdiq kutmoqda`), h('span', { class: 'btn sm pri' }, 'Ko\'rish')) : null,
      h('section', { class: 'panel' }, h('h2', null, 'Tinglashlar, 30 kun'), h('div', { class: 'bars', role: 'img', 'aria-label': 'Kunlik tinglashlar grafigi' }, days.map((x: Row) => { const b = h('i', { title: `${x.k}: ${x.c}` }); b.style.height = `${(x.c / max) * 100}%`; return b; }))),
      h('div', { class: 'two' }, top('Top: shu hafta', d.top7), top('Top: umumiy', d.topAll))]));
  },

  async tracks(el) {
    const d = await api('/api/admin/tracks');
    el.append(h('div', { class: 'row between wrap' }, h('h2', null, `${d.tracks.length} ta qo'shiq`), h('a', { class: 'btn pri sm', href: '/admin/upload' }, 'Yangi qo\'shiq')));
    if (!d.tracks.length) return el.append(h('div', { class: 'panel muted' }, 'Hali qo\'shiq yo\'q.'));
    const act = (id: string, body: unknown, msg: string) => guard(async () => { await api(`/api/admin/tracks/${id}`, { method: 'PATCH', body }); toast(msg); refresh(); });
    el.append(h('section', { class: 'panel' }, d.tracks.map((t: Row) => h('div', { class: 'item' },
      cover(t.cover, t.title),
      h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, t.title), h('div', { class: 'clip small muted' }, `${t.artist} · ${fmt(t.duration)} · ${t.plays} marta`), h('div', { class: 'small dim' }, `WAV ${t.bitDepth}-bit ${t.sampleRate} Hz`)),
      h('div', { class: 'acts' },
        t.promoted ? h('span', { class: 'tag hot' }, 'Reklamada') : null,
        !t.published ? h('span', { class: 'tag bad' }, 'Yashirin') : null,
        h('button', { class: `btn sm ${t.promoted ? '' : 'pri'}`, onclick: () => promote(t, act) }, t.promoted ? 'Reklamani to\'xtatish' : 'Reklama qilish'),
        !t.rhythm ? h('button', { class: 'btn sm', onclick: guard(async () => {
          toast('Ritm tayyorlanmoqda…');
          const grant = await api('/api/play', { method: 'POST', body: { trackId: t.id } });
          await uploadRhythm(t.id, new Uint8Array(await (await fetch(grant.url)).arrayBuffer()));
          toast('Ritm tayyor'); refresh();
        }) }, 'Ritmni tayyorlash') : null,
        h('button', { class: 'btn sm', onclick: () => editTrack(t.id, d) }, 'Tahrirlash'),
        h('button', { class: 'btn sm', onclick: act(t.id, { published: !t.published }, 'Saqlandi') }, t.published ? 'Yashirish' : 'Chiqarish'),
        h('button', { class: 'btn sm danger', onclick: () => confirmDelete(t) }, 'O\'chirish'))))));
  },

  async find(el) {
    const state = h('p', { class: 'muted' }, `Qo'shiq chalinayotgan joyda tugmani bosing. Ilova ${LISTEN_SECONDS} soniya tinglaydi va platformadagi qo'shiqlardan qidiradi.`);
    const out = h('div', { class: 'stack' });
    const btn = h('button', { class: 'btn pri', 'data-find': '1' }, 'Tinglash');
    btn.onclick = async () => {
      btn.disabled = true; out.replaceChildren();
      try {
        const wav = await recordSong(left => { state.textContent = `Tinglanmoqda… ${left}`; });
        state.textContent = 'Qidirilmoqda…';
        const sample = analyzeFull(wav).map;
        const { tracks } = await api('/api/catalog');

        const songs = (await Promise.all((tracks as Row[]).filter(t => t.rhythm).map(async t => {
          const r = await fetch(t.rhythm).catch(() => null);
          return r?.ok ? { id: t.id as string, map: new Uint8Array(await r.arrayBuffer()) } : null;
        }))).filter(Boolean) as { id: string; map: Uint8Array }[];
        const hits = rank(sample, songs), result = verdict(hits);
        const t = (tracks as Row[]).find(x => x.id === hits[0]?.id);
        if (result === 'none' || !t) { state.textContent = 'Bu qo\'shiq platformada topilmadi. Telefonni manbaga yaqinroq tutib, qayta urinib ko\'ring.'; return; }
        state.textContent = result === 'found' ? 'Topildi' : 'Aniq emas, balki shu qo\'shiqdir. Yana bir marta tinglatib tekshiring.';
        out.append(h('div', { class: 'item', 'data-found': result }, cover(t.cover, t.title), h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, t.title), h('div', { class: 'clip small muted' }, `${t.artist} · ${fmt(hits[0].second)} atrofida`)), h('button', { class: 'btn sm', onclick: () => playList(tracks as never, (tracks as Row[]).indexOf(t)) }, 'Ochish')));
      } catch (e) { state.textContent = (e as Error).message; } finally { btn.disabled = false; btn.textContent = 'Qayta tinglash'; }
    };
    el.append(h('section', { class: 'panel stack' }, h('h2', null, 'Qo\'shiqni topish'), state, btn, out));
  },
  async upload(el) {
    const d = await api('/api/admin/tracks');
    ownGenres = [...new Set((d.tracks as Row[]).map(t => t.genre as string).filter(Boolean))];
    const list = h('div', { class: 'stack' });
    const cov = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    const artist = h('input', { list: 'dl-artists', value: 'SvRvS', required: true });
    const album = h('input', { list: 'dl-albums', value: 'SvRvS rythm' });
    const year = h('input', { type: 'number', min: 1900, max: 2100, placeholder: String(new Date().getFullYear()), inputmode: 'numeric' });
    const lyrics = h('textarea', { placeholder: 'Qo\'shiq matni (ixtiyoriy)' });
    const files = h('input', { type: 'file', accept: '.wav,audio/wav,audio/x-wav', multiple: true, required: true });
    const btn = h('button', { class: 'btn pri' }, 'Yuklash');
    const previews = h('div', { class: 'stack' });
    let urls: string[] = [];
    const checks = new Map<File, Promise<Check>>();
    const named = new Map<File, { title: HTMLInputElement; genre: HTMLInputElement }>();
    let refreshNames: (() => void)[] = [];
    lyrics.addEventListener('input', () => { for (const f of refreshNames) f(); });
    const known = api('/api/admin/fingerprints').then(r => r.tracks as Row[]).catch(() => [] as Row[]);

    previews.addEventListener('play', e => { for (const a of previews.querySelectorAll('audio')) if (a !== e.target) a.pause(); }, true);
    files.addEventListener('change', () => {
      urls.forEach(u => URL.revokeObjectURL(u));
      urls = [];
      checks.clear();
      named.clear();
      refreshNames = [];
      previews.replaceChildren(...[...files.files!].map(file => {
        const url = URL.createObjectURL(file);
        urls.push(url);
        const verdict = h('div', { class: 'verdict muted' }, 'Tovush tekshirilmoqda…');
        const lookalike = h('div', { class: 'stack match-preview', style: 'gap:6px' });
        const check = known.then(k => checkFile(file, k));
        checks.set(file, check);
        const base = file.name.replace(/\.wav$/i, '');
        const title = h('input', { placeholder: 'Eshitilmoqda…', 'aria-label': 'Qo\'shiq nomi' }), genre = h('input', { placeholder: 'Eshitilmoqda…', 'aria-label': 'Janr' });
        named.set(file, { title, genre });
        let sound: Sound | null = null, seed = 0, others: string[] = [], guesses: string[] = [];
        const taken = (): string[] => [...others, ...[...named.values()].filter(n => n.title !== title).map(n => n.title.value)];
        const titleChips = chips(title, () => [...suggestTitles(sound, seed, taken(), files.files!.length === 1 ? lyrics.value : ''), base], t => matchNames(t, sound, taken()));
        const genreChips = chips(genre, () => guesses, genreTyping);
        const fill = (): void => { if (sound && !titleChips.edited()) title.value = suggestTitles(sound, seed, taken(), files.files!.length === 1 ? lyrics.value : '')[0] ?? base; titleChips.paint(); };
        refreshNames.push(fill);
        check.then(async r => {
          if (r.map && r.fp && r.sound) {
            const library = await known;
            sound = r.sound; seed = r.map.length + r.map.reduce((a, v, i) => (i % 97 ? a : a + v), 0);
            others = library.map(k => String(k.title));
            guesses = guessGenres(r.sound, r.fp, library as { genre?: string; fp: Fingerprint | string }[]);
            fill();
            if (!genreChips.edited()) genre.value = guesses[0] ?? '';
            genreChips.paint();
          }
          title.placeholder = base; genre.placeholder = 'Ixtiyoriy';
          if (r.error) { verdict.textContent = r.error; verdict.className = 'verdict same'; return; }
          if (!r.match) { verdict.textContent = 'Yangi qo\'shiq: platformada o\'xshashi yo\'q'; verdict.className = 'verdict ok'; return; }
          const same = r.match.c.level === 'same';
          verdict.textContent = `${same ? 'Bu qo\'shiq allaqachon bor' : 'O\'xshash qo\'shiq bor'}: "${r.match.title}" (${r.match.artist}), ${details(r.match.c)}`;
          verdict.className = `verdict ${same ? 'same' : 'similar'}`;

          if (r.match.id) api('/api/play', { method: 'POST', body: { trackId: r.match.id, hidden: false } }).then(g => {
            if (g.url) lookalike.replaceChildren(h('div', { class: 'small clip', style: 'font-weight:700' }, `${r.match!.title} · ${r.match!.artist}`), h('audio', { controls: true, preload: 'metadata', src: g.url, 'aria-label': `${r.match!.title} ni tinglash` }));
          }).catch(() => { lookalike.textContent = 'Bu qo\'shiqni hozir eshitib bo\'lmaydi'; });
        });
        return h('div', { class: 'preview' }, h('div', { class: 'small clip', style: 'font-weight:700' }, file.name), h('audio', { controls: true, preload: 'metadata', src: url, 'aria-label': `${file.name} ni tinglash` }), verdict, lookalike, field('Qo\'shiq nomi', title), titleChips.row, field('Janr (tovushdan taxmin)', genre), genreChips.row);
      }));
    });
    el.append(
      h('form', { class: 'panel', onsubmit: async (e: Event) => {
        e.preventDefault();
        btn.disabled = true;
        for (const a of previews.querySelectorAll('audio')) a.pause();
        try {
          let skipped = 0;
          const coverKey = await uploadImage(cov.files?.[0]);
          for (const file of files.files!) {
            const bar = h('i'), status = h('div', { class: 'small muted clip' }, file.name);
            list.append(h('div', { class: 'stack', style: 'gap:6px' }, status, h('div', { class: 'progress' }, bar)));
            try {
              const check = await (checks.get(file) || known.then(k => checkFile(file, k)));
              if (check.error) throw new Error(check.error);
              if (check.match?.c.level === 'same' && !await askDuplicate(file, check.match)) {
                status.textContent = `${file.name}: yuklanmadi, "${check.match.title}" allaqachon bor`;
                skipped++;
                continue;
              }
              const up = await uploadWav(file, 'audio', p => { bar.style.width = `${p * 100}%`; });
              const title = named.get(file)?.title.value.trim() || file.name.replace(/\.wav$/i, ''), genre = named.get(file)?.genre.value.trim() ?? '';
              const made = await api('/api/admin/tracks', { method: 'POST', body: { key: up.key, title, artist: artist.value, album: album.value, genre, year: year.value || null, lyrics: lyrics.value, coverKey } });

              await api(`/api/admin/tracks/${made.id}/rhythm`, { method: 'PUT', raw: check.map as BodyInit }).catch(() => toast('Ritm xaritasi tayyorlanmadi'));
              await api(`/api/admin/tracks/${made.id}/fingerprint`, { method: 'PUT', body: { fp: check.fp } }).catch(() => {});
              (await known).push({ id: made.id, title, artist: artist.value, genre, fp: check.fp });
              status.textContent = `✓ ${title} · WAV ${up.bitDepth}-bit ${up.sampleRate} Hz · ${fmt(up.duration)}`;
            } catch (x) { status.textContent = `✕ ${file.name}: ${(x as Error).message}`; status.className = 'err'; }
          }
          toast('Yuklash tugadi');

          if (![...list.querySelectorAll('.err')].length && !skipped) { setTimeout(() => go('/'), 900); return; }
        } catch (x) { toast((x as Error).message); }
        btn.disabled = false;
      } },
        h('h2', null, 'Yangi musiqa'),
        h('p', { class: 'muted small' }, 'Faqat WAV (PCM) qabul qilinadi va R2 ga aynan shu holda saqlanadi. Sifat o\'zgarmaydi.'),
        field('WAV fayl(lar)', files),
        previews,
        h('div', { class: 'two' }, field('Ijrochi', artist), field('Albom', album), field('Yil', year), field('Muqova rasmi', cov)),
        field('Matn', lyrics),
        h('datalist', { id: 'dl-artists' }, d.artists.map((a: Row) => h('option', { value: a.name }))),
        h('datalist', { id: 'dl-albums' }, d.albums.map((a: Row) => h('option', { value: a.title }))),
        btn),
      list);
  },

  async artists(el) {
    const { artists } = await api('/api/admin/artists');
    el.append(h('section', { class: 'panel' }, h('h2', null, 'Ijrochilar'), artists.length ? artists.map((a: Row) => h('div', { class: 'item' }, cover(a.image, a.name), h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, a.name), h('div', { class: 'small muted' }, `${a.tracks} ta qo'shiq`)), h('button', { class: 'btn sm', onclick: () => editArtist(a) }, 'Tahrirlash'))) : h('p', { class: 'muted' }, 'Qo\'shiq yuklaganda ijrochi avtomatik yaratiladi.')));
  },

  async users(el) {
    const { plans } = await api('/api/admin/plans');
    const list = h('section', { class: 'panel' });
    const q = h('input', { type: 'search', placeholder: 'Ism yoki email', 'aria-label': 'Foydalanuvchini qidirish' });
    let filter = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pills = h('div', { class: 'pill-row' });
    const summary = h('h2', null, 'Foydalanuvchilar');
    const more = h('button', { class: 'btn full' }, 'Yana ko\'rsatish');
    let shown = 0, serial = 0;
    const row = (u: Row, nowT: number) => {
      const active = u.plan_expires > nowT;
      const patch = (id: string, body: unknown, msg: string) => guard(async () => { await api(`/api/admin/users/${id}`, { method: 'PATCH', body }); toast(msg); load(); });
      return h('div', { class: 'item' },
        h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, u.name), h('div', { class: 'clip small muted' }, u.email),
          h('div', { class: 'small dim' }, `Ro'yxatdan o'tgan: ${date(u.created_at)} · Oxirgi kirgan: ${date(u.last_seen)}`),
          h('div', { class: 'row wrap', style: 'gap:6px;margin-top:6px' },
            u.role === 'admin' ? h('span', { class: 'tag hot' }, 'Admin') : null,
            active ? h('span', { class: 'tag ok' }, `${u.plan_name || 'Tarif'} · ${date(u.plan_expires)} gacha`) : null,
            u.plan_exempt ? h('span', { class: 'tag ok' }, 'Plan shart emas') : null,
            u.banned ? h('span', { class: 'tag bad' }, 'Bloklangan') : null)),
        u.role === 'admin' ? null : h('div', { class: 'acts' },
          h('button', { class: `btn sm ${u.plan_exempt ? 'light' : ''}`, onclick: patch(u.id, { planExempt: !u.plan_exempt }, u.plan_exempt ? 'Ro\'yxatdan olindi' : 'Plansiz ro\'yxatga qo\'shildi') }, u.plan_exempt ? 'Plansizdan olish' : 'Plansiz qilish'),
          h('button', { class: 'btn sm', onclick: () => sheet(close => [h('h2', null, 'Tarif berish'), h('p', { class: 'muted small clip' }, u.email), plans.map((p: Row) => h('button', { class: 'btn full', onclick: async () => { await patch(u.id, { grantPlanId: p.id }, 'Tarif berildi')(); close(); } }, `${p.name} · ${p.days} kun`)), active ? h('button', { class: 'btn full danger', onclick: async () => { await patch(u.id, { revokePlan: true }, 'Tarif bekor qilindi')(); close(); } }, 'Tarifni bekor qilish') : null]) }, 'Tarif'),
          h('button', { class: 'btn sm danger', onclick: patch(u.id, { banned: !u.banned }, 'Saqlandi') }, u.banned ? 'Blokdan chiqarish' : 'Bloklash'),
          u.banned ? h('button', { class: 'btn sm danger', onclick: () => sheet(close => [h('h2', null, 'Akkaunt o\'chirilsinmi?'), h('p', { class: 'muted', style: 'overflow-wrap:anywhere' }, `${u.email} butunlay o'chiriladi: pleylistlari, yoqtirganlari, tinglash tarixi va to'lov yozuvlari ham. Buni qaytarib bo'lmaydi. Shu email bilan keyin qayta ro'yxatdan o'tish mumkin bo'ladi.`),
            h('button', { class: 'btn danger', onclick: guard(async () => { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); close(); toast('Akkaunt o\'chirildi'); load(); }) }, 'Ha, o\'chirish'), h('button', { class: 'btn', onclick: close }, 'Bekor qilish')]) }, 'O\'chirish') : null));
    };
    const page = async (first: boolean, run: number) => {
      const d = await api(`/api/admin/users?q=${encodeURIComponent(q.value)}&filter=${filter}&offset=${first ? 0 : shown}`);
      if (run !== serial) return;
      if (first) { shown = 0; list.replaceChildren(); }
      shown += d.users.length;
      summary.textContent = `Foydalanuvchilar: ${d.total} ta`;
      if (!d.total) list.append(h('p', { class: 'muted' }, 'Foydalanuvchi topilmadi'));
      list.append(...d.users.map((u: Row) => row(u, d.now)));
      more.style.display = shown < d.total ? '' : 'none';
    };
    more.addEventListener('click', guard(() => page(false, serial)));
    const load = guard(async () => {
      pills.replaceChildren(...[['', 'Hammasi'], ['exempt', 'Plansiz ro\'yxat'], ['paid', 'Pullik'], ['banned', 'Bloklangan']].map(([k, l]) => h('button', { class: `pill ${filter === k ? 'on' : ''}`, onclick: () => { filter = k; load(); } }, l)));
      await page(true, ++serial);
    });
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    el.append(await planSwitch(), h('div', { class: 'row between wrap' }, summary, h('a', { class: 'btn sm', href: '/api/admin/users.csv', download: 'foydalanuvchilar.csv' }, 'Excel uchun yuklab olish')), q, pills, list, more);
    load();
  },

  async plans(el) {
    const { plans } = await api('/api/admin/plans');
    el.append(await planSwitch(), h('div', { class: 'row between wrap' }, h('h2', null, 'Tariflar'), h('button', { class: 'btn sm pri', onclick: () => editPlan({ days: 30, seats: 1, features: [], active: true, price: 0, sort: plans.length + 1 }) }, 'Yangi tarif')),
      h('section', { class: 'panel' }, plans.map((p: Row) => h('div', { class: 'item' }, h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, p.name), h('div', { class: 'small muted' }, `${money(p.price)} · ${p.days} kun · ${p.seats} kishi`)), !p.active ? h('span', { class: 'tag bad' }, 'O\'chiq') : null, h('button', { class: 'btn sm', onclick: () => editPlan(p) }, 'Tahrirlash')))));
  },

  async payments(el) {
    const { payments } = await api('/api/admin/payments');
    const decide = (id: string, d: string) => guard(async () => { await api(`/api/admin/payments/${id}/${d}`, { method: 'POST' }); toast(d === 'approve' ? 'Tarif faollashdi' : 'Rad etildi'); refresh(); });
    const tag: Record<string, [string, string]> = { pending: ['tag hot', 'Kutilmoqda'], approved: ['tag ok', 'Tasdiqlangan'], rejected: ['tag bad', 'Rad etilgan'] };
    el.append(h('section', { class: 'panel' }, h('h2', null, 'To\'lov so\'rovlari'), payments.length ? payments.map((p: Row) => h('div', { class: 'item' },
      h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, `${p.user_name} · ${p.plan_name}`), h('div', { class: 'clip small muted' }, p.email), h('div', { class: 'small' }, `${money(p.amount)} · Chek: ${p.reference}`), h('div', { class: 'small dim' }, date(p.created_at))),
      h('span', { class: tag[p.status][0] }, tag[p.status][1]),
      p.status === 'pending' ? h('div', { class: 'acts' }, h('button', { class: 'btn sm pri', onclick: decide(p.id, 'approve') }, 'Tasdiqlash'), h('button', { class: 'btn sm danger', onclick: decide(p.id, 'reject') }, 'Rad etish')) : null)) : h('p', { class: 'muted' }, 'Hali so\'rov yo\'q.')));
  },

  async ads(el) {
    const [{ ads }, s, { tracks }] = await Promise.all([api('/api/admin/ads'), api('/api/admin/settings'), api('/api/admin/tracks')]);
    const every = h('input', { type: 'number', min: 0, max: 50, value: s.ad_every, inputmode: 'numeric' });
    const secs = h('input', { type: 'number', min: 3, max: 60, value: s.ad_seconds, inputmode: 'numeric' });
    el.append(
      h('form', { class: 'panel', onsubmit: guard(async (e: Event) => { e.preventDefault(); await api('/api/admin/settings', { method: 'PATCH', body: { ad_every: every.value, ad_seconds: secs.value } }); toast('Saqlandi'); }) },
        h('h2', null, 'Reklama chastotasi'), h('p', { class: 'muted small' }, 'Tarifi yo\'q foydalanuvchilarga har N ta qo\'shiqdan keyin reklama chiqadi. Reklama qo\'shilmagan bo\'lsa, tarif olishga chaqiruvchi standart ekran ko\'rsatiladi.'),
        h('div', { class: 'two' }, field('Har necha qo\'shiqda (0 = o\'chiq)', every), field('Standart reklama, soniya', secs)), h('button', { class: 'btn light' }, 'Saqlash')),
      adForm(tracks),
      h('section', { class: 'panel' }, h('h2', null, 'Reklamalar'), ads.length ? ads.map((a: Row) => h('div', { class: 'item' }, cover(a.image_key ? `/media/${a.image_key}` : null, a.title),
        h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, a.title), h('div', { class: 'small muted' }, `${a.duration}s · ${a.audio_key ? 'WAV audio' : 'audiosiz'} · ko'rildi ${a.impressions} · bosildi ${a.clicks}`)),
        h('div', { class: 'acts' }, h('button', { class: 'btn sm', onclick: guard(async () => { await api(`/api/admin/ads/${a.id}`, { method: 'PATCH', body: { active: !a.active } }); refresh(); }) }, a.active ? 'To\'xtatish' : 'Yoqish'), h('button', { class: 'btn sm danger', onclick: guard(async () => { await api(`/api/admin/ads/${a.id}`, { method: 'DELETE' }); refresh(); }) }, 'O\'chirish')))) : h('p', { class: 'muted' }, 'Hali reklama yo\'q.')));
  },

  async app(el) {
    const { releases } = await api('/api/admin/releases');
    const latest = releases[0];
    const apk = h('input', { type: 'file', accept: '.apk', required: true });
    const code = h('input', { type: 'number', min: 1, required: true, value: (latest?.versionCode || 0) + 1, inputmode: 'numeric' });
    const name = h('input', { required: true, placeholder: '1.0.1' });
    const notes = h('textarea', { placeholder: 'Nimalar yangilandi' });
    const force = h('input', { type: 'checkbox' });
    const btn = h('button', { class: 'btn pri' }, 'Yangilanishni yuborish');
    el.append(
      h('form', { class: 'panel', onsubmit: async (e: Event) => {
        e.preventDefault(); btn.disabled = true;
        try {
          await api(`/api/admin/releases?versionCode=${code.value}&versionName=${encodeURIComponent(name.value)}&notes=${encodeURIComponent(notes.value)}&force=${force.checked ? 1 : 0}`, { method: 'POST', raw: apk.files![0] });
          toast('Yangilanish yuborildi'); refresh();
        } catch (x) { toast((x as Error).message); btn.disabled = false; }
      } },
        h('h2', null, 'Android yangilanishi'), h('p', { class: 'muted small' }, 'APK shu yerga yuklanadi. Foydalanuvchilar ilovani keyingi ochganda yangilash oynasini ko\'radi. APK bir xil kalit bilan imzolangan va versiya kodi kattaroq bo\'lishi kerak.'),
        field('APK fayl', apk), h('div', { class: 'two' }, field('Versiya kodi', code), field('Versiya nomi', name)), field('Izoh', notes),
        h('label', { class: 'row' }, force, 'Majburiy yangilanish'), btn),
      h('section', { class: 'panel' }, h('h2', null, 'Versiyalar'), releases.length ? releases.map((r: Row) => h('div', { class: 'item' }, h('div', { class: 'body' }, h('div', { style: 'font-weight:700' }, `${r.versionName} (${r.versionCode})`), h('div', { class: 'small muted' }, `${gb(r.size)} · ${date(r.createdAt)}${r.force ? ' · majburiy' : ''}`)), h('button', { class: 'btn sm danger', onclick: guard(async () => { await api(`/api/admin/releases/${r.id}`, { method: 'DELETE' }); refresh(); }) }, 'O\'chirish'))) : h('p', { class: 'muted' }, 'Hali APK yuklanmagan.')),
      h('section', { class: 'panel' }, h('h2', null, 'O\'rnatish sahifasi'), h('p', { class: 'muted small', style: 'overflow-wrap:anywhere' }, `${location.origin}/install`), h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: () => navigator.clipboard?.writeText(`${location.origin}/install`).then(() => toast('Nusxalandi')) }, 'Havolani nusxalash'), h('a', { class: 'btn sm', href: '/install' }, 'Ochish'))));
  },

  async api(el) {
    const [{ keys }, docs] = await Promise.all([api('/api/admin/api-keys'), api('/api/admin/docs')]);
    const name = h('input', { required: true, placeholder: 'Masalan: Mening skriptim', 'aria-label': 'Kalit nomi' });
    const made = h('div', { class: 'stack' });
    el.append(
      h('form', { class: 'panel', onsubmit: guard(async (e: Event) => {
        e.preventDefault();
        const { key } = await api('/api/admin/api-keys', { method: 'POST', body: { name: name.value } });
        name.value = '';
        made.replaceChildren(h('div', { class: 'upsell' }, h('div', { class: 'grow' }, h('h3', null, 'Kalitni hozir saqlang'), h('p', { class: 'small muted' }, 'U boshqa ko\'rsatilmaydi.'), h('code', { style: 'overflow-wrap:anywhere;font-size:13px' }, key)), h('button', { type: 'button', class: 'btn sm pri', onclick: () => navigator.clipboard?.writeText(key).then(() => toast('Nusxalandi')) }, 'Nusxalash')));
        list.replaceChildren(...rows((await api('/api/admin/api-keys')).keys));
      }) }, h('h2', null, 'API kalitlar'), h('p', { class: 'muted small' }, 'Kalit admin huquqi bilan ishlaydi: qo\'shiq, foydalanuvchi, tarif, reklama va sozlamalarni boshqaradi. Uni hech kimga bermang.'), name, h('button', { class: 'btn pri' }, 'Yangi kalit yaratish')),
      made);
    const rows = (l: Row[]) => (l.length ? l.map((k: Row) => h('div', { class: 'item' }, h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, k.name), h('div', { class: 'small muted' }, `…${k.hint} · yaratilgan ${date(k.created_at)} · ishlatilgan ${date(k.last_used)}`)),
      h('button', { class: 'btn sm danger', onclick: guard(async () => { await api(`/api/admin/api-keys/${k.id}`, { method: 'DELETE' }); toast('Kalit bekor qilindi'); refresh(); }) }, 'Bekor qilish'))) : [h('p', { class: 'muted' }, 'Hali kalit yo\'q.')]);
    const list = h('section', { class: 'panel' }, rows(keys));
    el.append(list, h('section', { class: 'panel' }, h('h2', null, 'Endpointlar'),
      h('pre', { style: 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:0' }, `curl ${location.origin}/api/admin/stats -H "Authorization: Bearer rk_..."`),
      docs.endpoints.map((d: Row) => h('div', { class: 'small', style: 'overflow-wrap:anywhere;font-variant-numeric:tabular-nums' }, h('b', { style: 'display:inline-block;width:62px' }, d.method), d.path))));
  },

  async notices(el) {
    const d = await api('/api/admin/notices');
    const title = h('input', { required: true, maxlength: 80, placeholder: 'Masalan: Yangi albom chiqdi', 'aria-label': 'Sarlavha' }), text = h('input', { maxlength: 200, placeholder: 'Qisqa matn', 'aria-label': 'Matn' }), url = h('input', { placeholder: '/', 'aria-label': 'Ochiladigan sahifa' });
    el.append(h('form', { class: 'panel', onsubmit: guard(async (e: Event) => {
      e.preventDefault();
      await api('/api/admin/notices', { method: 'POST', body: { title: title.value, body: text.value, url: url.value } });
      toast('Yuborildi: qurilmalarga navbat bilan yetib boradi'); refresh();
    }) }, h('h2', null, 'Hammaga xabar yuborish'), h('p', { class: 'muted small' }, `Ulangan qurilmalar: ${d.devices} ta. Yangi qo'shiq yuklanganda xabar o'zi ketadi. Uzoq vaqt kirmaganlarga ham eslatma boradi.`), field('Sarlavha', title), field('Matn', text), field('Bosganda ochiladigan sahifa', url), h('button', { class: 'btn pri' }, 'Yuborish')),
      h('section', { class: 'panel' }, h('h2', null, 'Oxirgi xabarlar'), d.notices.length ? d.notices.map((n: Row) => h('div', { class: 'item' }, h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, n.title), h('div', { class: 'small muted', style: 'overflow-wrap:anywhere' }, n.body), h('div', { class: 'small dim' }, date(n.created_at))))) : h('p', { class: 'muted' }, 'Hali xabar yo\'q.')));
  },

  async settings(el) {
    const s = await api('/api/admin/settings');
    const f: Record<string, HTMLInputElement> = {};
    const inp = (k: string, ph?: string) => (f[k] = h('input', { value: s[k] || '', placeholder: ph || '' }));
    el.append(await planSwitch(), h('form', { class: 'panel', onsubmit: guard(async (e: Event) => {
      e.preventDefault();
      await api('/api/admin/settings', { method: 'PATCH', body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value])) });
      toast('Saqlandi');
      S.settings.siteName = f.site_name.value; S.settings.heroTitle = f.hero_title.value; S.settings.heroSub = f.hero_sub.value; S.settings.supportUrl = f.support_url.value;
    }) },
      h('h2', null, 'Sayt'), h('div', { class: 'two' }, field('Nom', inp('site_name')), field('Yordam havolasi', inp('support_url', 'https://t.me/...')), field('Bosh sarlavha', inp('hero_title')), field('Bosh matn', inp('hero_sub'))),
      h('h2', null, 'Click to\'lovi'), h('p', { class: 'muted small', style: 'overflow-wrap:anywhere' }, `Uchala maydon to'lsa, foydalanuvchilar Click orqali to'laydi va tarif avtomatik yoqiladi. Click kabinetida Prepare va Complete manziliga shuni yozing: ${location.origin}/api/click/callback`),
      h('div', { class: 'two' }, field('Service ID', inp('click_service_id')), field('Merchant ID', inp('click_merchant_id')), field(`Secret key${s.click_secret_set ? ' (kiritilgan, o\'zgartirish uchun yangisini yozing)' : ''}`, (f.click_secret = h('input', { type: 'password', autocomplete: 'off', placeholder: s.click_secret_set ? '••••••••' : '' })))),
      h('h2', null, 'Gmail orqali email kod'), h('p', { class: 'muted small' }, 'Domensiz, hozir ishlaydi: kunlik limit taxminan 500 xat. Oddiy parol emas, Google hisobida yaratilgan 16 belgili "App password" kiriting.'),
      h('div', { class: 'two' }, field('Gmail manzil', inp('smtp_user', 'nom@gmail.com')), field(`App password${s.smtp_pass_set ? ' (kiritilgan, o\'zgartirish uchun yangisini yozing)' : ''}`, (f.smtp_pass = h('input', { type: 'password', autocomplete: 'off', placeholder: s.smtp_pass_set ? '••••••••' : '' })))),
      h('h2', null, 'Cloudflare Email (keyinroq)'), h('p', { class: 'muted small' }, 'Domen va pullik tarif tayyor bo\'lganda: Gmail maydonlarini bo\'shating va yuboruvchini yozing.'),
      field('Yuboruvchi', inp('email_from', 'no-reply@svrvs.uz')),
      h('h2', null, 'To\'lov kartasi'), h('p', { class: 'muted small' }, 'Foydalanuvchilar tarif uchun shu kartaga to\'laydi.'), h('div', { class: 'two' }, field('Karta raqami', inp('card_number', '8600 0000 0000 0000')), field('Karta egasi', inp('card_holder'))),
      h('button', { class: 'btn pri' }, 'Saqlash')));
  },
};

async function planSwitch() {
  const s = await api('/api/admin/settings');
  let on = s.plans_enabled === '1';
  const t = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-label': 'Plan tizimi' });
  const sub = h('p', { class: 'small muted' });
  const paint = () => {
    t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on));
    sub.textContent = on ? 'Yoqiq: tarifi yo\'qlarga reklama chiqadi. "Plansiz ro\'yxat"dagilar bundan mustasno.' : 'O\'chiq: hamma bepul va reklamasiz tinglaydi.';
  };
  t.addEventListener('click', guard(async () => {
    on = !on; paint();
    try { await api('/api/admin/settings', { method: 'PATCH', body: { plans_enabled: on } }); S.settings.plansEnabled = on; toast(on ? 'Plan tizimi yoqildi' : 'Plan tizimi o\'chirildi'); } catch (e) { on = !on; paint(); throw e; }
  }));
  paint();
  return h('div', { class: 'bigswitch switch' }, h('div', { class: 'grow' }, h('h2', null, 'Plan tizimi'), sub), t);
}

function promote(t: Row, act: (id: string, body: unknown, msg: string) => () => Promise<void>): unknown {
  if (t.promoted) return act(t.id, { promoted: false }, 'Reklama to\'xtatildi')();
  sheet(close => {
    const text = h('input', { placeholder: 'Reklama matni (ixtiyoriy)', value: t.promoText || '' });
    return [h('h2', null, 'Qo\'shiqni reklama qilish'), h('p', { class: 'muted small' }, 'Qo\'shiq barcha foydalanuvchilarning bosh sahifasida "Reklama" belgisi bilan chiqadi.'), text,
      h('button', { class: 'btn pri', onclick: async () => { await act(t.id, { promoted: true, promoText: text.value }, 'Reklama boshlandi')(); close(); } }, 'Boshlash')];
  });
}
const confirmDelete = (t: Row) => sheet(close => [h('h2', null, 'O\'chirilsinmi?'), h('p', { class: 'muted' }, `"${t.title}" R2 dan butunlay o'chiriladi. Buni qaytarib bo'lmaydi.`),
  h('button', { class: 'btn danger', onclick: guard(async () => { await api(`/api/admin/tracks/${t.id}`, { method: 'DELETE' }); close(); toast('O\'chirildi'); refresh(); }) }, 'Ha, o\'chirish'), h('button', { class: 'btn', onclick: close }, 'Bekor qilish')]);

async function editTrack(id: string, d: Row): Promise<void> {
  const t = await api<Row>(`/api/admin/tracks/${id}`).catch((e: Error) => { toast(e.message); return null; });
  if (!t) return;
  sheet(close => {
    const title = h('input', { value: t.title }), artist = h('input', { value: t.artist, list: 'edit-artists' }), album = h('input', { value: t.album || '' }), genre = h('input', { value: t.genre }), lyrics = h('textarea', null), cov = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }), promo = h('input', { value: t.promoText });
    lyrics.value = t.lyrics;
    const nameHints = chips(title, () => [], text => matchNames(text, null, [])), genreHints = chips(genre, () => [], genreTyping);
    return [h('h2', null, 'Tahrirlash'), field('Nomi', title), nameHints.row, field('Ijrochi', artist), h('datalist', { id: 'edit-artists' }, d.artists.map((a: Row) => h('option', { value: a.name }))), field('Albom', album), field('Janr', genre), genreHints.row, field('Muqova', cov), field('Reklama matni', promo), field('Matn', lyrics),
      h('button', { class: 'btn pri', onclick: guard(async () => {
        const coverKey = cov.files?.[0] ? await uploadImage(cov.files[0]) : undefined;
        await api(`/api/admin/tracks/${id}`, { method: 'PATCH', body: { title: title.value, artist: artist.value, album: album.value, genre: genre.value, lyrics: lyrics.value, promoText: promo.value, coverKey } });
        close(); toast('Saqlandi'); refresh();
      }) }, 'Saqlash'), h('button', { class: 'btn', onclick: close }, 'Bekor qilish')];
  });
}
function editArtist(a: Row): void {
  sheet(close => {
    const name = h('input', { value: a.name }), bio = h('textarea', null), img = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    bio.value = a.bio;
    return [h('h2', null, 'Ijrochi'), field('Ism', name), field('Rasm', img), field('Ma\'lumot', bio), h('button', { class: 'btn pri', onclick: guard(async () => {
      const imageKey = img.files?.[0] ? await uploadImage(img.files[0]) : undefined;
      await api(`/api/admin/artists/${a.id}`, { method: 'PATCH', body: { name: name.value, bio: bio.value, imageKey } });
      close(); toast('Saqlandi'); refresh();
    }) }, 'Saqlash')];
  });
}
function editPlan(p: Row): void {
  sheet(close => {
    const name = h('input', { value: p.name || '' }), tagline = h('input', { value: p.tagline || '' }), price = h('input', { type: 'number', min: 0, value: p.price, inputmode: 'numeric' }), days = h('input', { type: 'number', min: 1, value: p.days, inputmode: 'numeric' }), seats = h('input', { type: 'number', min: 1, max: 20, value: p.seats, inputmode: 'numeric' }), features = h('textarea', null), active = h('input', { type: 'checkbox', checked: p.active }), offlineLimit = h('input', { type: 'number', min: -1, value: p.offlineLimit ?? 0, inputmode: 'numeric' }), offlineRecent = h('input', { type: 'number', min: 0, max: 1000, value: p.offlineRecent ?? 0, inputmode: 'numeric' });
    features.value = (p.features || []).join('\n');
    return [h('h2', null, p.id ? 'Tarifni tahrirlash' : 'Yangi tarif'), field('Nomi', name), field('Qisqa izoh', tagline), field('Narx, so\'m', price), h('div', { class: 'two' }, field('Muddat, kun', days), field('Odamlar soni', seats)), field('Imkoniyatlar (har qatorda bittadan)', features), field('Oflayn qo\'shiqlar: 0 yopiq, -1 cheksiz', offlineLimit), field('Oxirgi eshitilganlar oflayn: 0 yopiq', offlineRecent), h('label', { class: 'row' }, active, 'Faol'),
      h('button', { class: 'btn pri', onclick: guard(async () => { await api('/api/admin/plans', { method: 'POST', body: { id: p.id, name: name.value, tagline: tagline.value, price: Number(price.value), days: Number(days.value), seats: Number(seats.value), features: features.value, active: active.checked, sort: p.sort ?? 0, offlineLimit: Number(offlineLimit.value), offlineRecent: Number(offlineRecent.value) } }); close(); toast('Saqlandi'); refresh(); }) }, 'Saqlash')];
  });
}
function adForm(tracks: Row[]) {
  const title = h('input', { required: true }), body = h('textarea', { placeholder: 'Reklama matni' }), img = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }), wav = h('input', { type: 'file', accept: '.wav,audio/wav,audio/x-wav' }), duration = h('input', { type: 'number', min: 3, max: 60, value: 15, inputmode: 'numeric' }), label = h('input', { placeholder: 'Batafsil' }), url = h('input', { placeholder: 'https://...' }), track = h('select', null, h('option', { value: '' }, 'Yo\'q'), tracks.map((t: Row) => h('option', { value: t.id }, `${t.title} — ${t.artist}`)));
  const btn = h('button', { class: 'btn pri' }, 'Reklama qo\'shish');
  return h('form', { class: 'panel', onsubmit: async (e: Event) => {
    e.preventDefault(); btn.disabled = true;
    try {
      const imageKey = await uploadImage(img.files?.[0]);
      const audioKey = wav.files?.[0] ? (await uploadWav(wav.files[0], 'adaudio')).key : null;
      await api('/api/admin/ads', { method: 'POST', body: { title: title.value, body: body.value, imageKey, audioKey, duration: Number(duration.value), ctaLabel: label.value, ctaUrl: url.value, trackId: track.value } });
      toast('Reklama qo\'shildi'); refresh();
    } catch (x) { toast((x as Error).message); btn.disabled = false; }
  } }, h('h2', null, 'Yangi reklama'), h('p', { class: 'muted small' }, 'Audio bo\'lsa uning uzunligi reklama vaqti bo\'ladi. Telefon qulflangan paytda ham reklama ishlashi uchun audio yuklang.'),
    h('div', { class: 'two' }, field('Sarlavha', title), field('Davomiylik, soniya', duration), field('Rasm', img), field('Audio (faqat WAV)', wav), field('Tugma matni', label), field('Tugma havolasi', url), field('Bog\'liq qo\'shiq', track)), field('Matn', body), btn);
}
