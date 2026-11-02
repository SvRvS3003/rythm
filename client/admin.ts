// TypeScript, client/admin.ts, browser: the single admin panel. Loaded only for admins; the API enforces the role.
import { analyzeWav } from './rhythm.ts';
import { h, api, cover, fmt, money, toast, sheet, refresh, go, S, type Row } from './app.ts';

const guard = <A extends unknown[]>(fn: (...a: A) => unknown) => async (...a: A): Promise<void> => { try { await fn(...a); } catch (e) { toast((e as Error).message); } };
const TABS = [['upload', '+ Musiqa qo\'shish'], ['', 'Statistika'], ['tracks', 'Qo\'shiqlar'], ['artists', 'Ijrochilar'], ['users', 'Foydalanuvchilar'], ['plans', 'Tariflar'], ['payments', 'To\'lovlar'], ['ads', 'Reklama'], ['app', 'Ilova'], ['settings', 'Sozlamalar']];
const field = (label: string, input: Node) => h('label', { class: 'f' }, label, input);
const date = (t: number): string => (t ? new Date(t * 1000).toLocaleDateString('ru-RU') : '—');
const gb = (b: number): string => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const nodes = (l: unknown[]): Node[] => l.filter(Boolean) as Node[];
const kpi = (v: string | number, l: string) => h('div', { class: 'kpi' }, h('b', null, v), h('span', null, l));

export async function adminView(el: HTMLElement, parts: string[]): Promise<void> {
  const tab = parts[0] || '';
  el.append(h('h1', null, 'Admin panel'), h('nav', { class: 'anav' }, TABS.map(([p, l]) => h('a', { class: `pill ${tab === p ? 'on' : ''}`, href: `/admin${p ? '/' + p : ''}` }, l))));
  await (VIEWS[tab] || VIEWS[''])(el);
}

// Covers only need to look sharp on a phone; a 5 MB photo would slow every page. Music never passes through here.
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
const uploadRhythm = (id: string, wav: Uint8Array) => api(`/api/admin/tracks/${id}/rhythm`, { method: "PUT", raw: analyzeWav(wav) as BodyInit });

// Client check is only for fast feedback; the Worker re-validates on first part and on completion.
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
  // Stored size must equal the source, or the song is not the file that was chosen.
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

  async upload(el) {
    const d = await api('/api/admin/tracks');
    const list = h('div', { class: 'stack' });
    const cov = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    const artist = h('input', { list: 'dl-artists', placeholder: 'Masalan: Sevara', required: true });
    const album = h('input', { list: 'dl-albums', placeholder: 'Ixtiyoriy' });
    const genre = h('input', { placeholder: 'Masalan: Pop' });
    const year = h('input', { type: 'number', min: 1900, max: 2100, placeholder: String(new Date().getFullYear()), inputmode: 'numeric' });
    const lyrics = h('textarea', { placeholder: 'Qo\'shiq matni (ixtiyoriy)' });
    const files = h('input', { type: 'file', accept: '.wav,audio/wav,audio/x-wav', multiple: true, required: true });
    const titleInput = h('input', { placeholder: 'Bo\'sh qolsa, fayl nomi olinadi' });
    const btn = h('button', { class: 'btn pri' }, 'Yuklash');
    el.append(
      h('form', { class: 'panel', onsubmit: async (e: Event) => {
        e.preventDefault();
        btn.disabled = true;
        try {
          const coverKey = await uploadImage(cov.files?.[0]);
          for (const file of files.files!) {
            const bar = h('i'), status = h('div', { class: 'small muted clip' }, file.name);
            list.append(h('div', { class: 'stack', style: 'gap:6px' }, status, h('div', { class: 'progress' }, bar)));
            try {
              const up = await uploadWav(file, 'audio', p => { bar.style.width = `${p * 100}%`; });
              const title = (files.files!.length === 1 && titleInput.value) || file.name.replace(/\.wav$/i, '');
              const made = await api('/api/admin/tracks', { method: 'POST', body: { key: up.key, title, artist: artist.value, album: album.value, genre: genre.value, year: year.value || null, lyrics: lyrics.value, coverKey } });
              // The song is already safe in R2; a failed map only means the visual falls back until it is rebuilt from Qo'shiqlar.
              await uploadRhythm(made.id, new Uint8Array(await file.arrayBuffer())).catch(() => toast('Ritm xaritasi tayyorlanmadi'));
              status.textContent = `✓ ${title} · WAV ${up.bitDepth}-bit ${up.sampleRate} Hz · ${fmt(up.duration)}`;
            } catch (x) { status.textContent = `✕ ${file.name}: ${(x as Error).message}`; status.className = 'err'; }
          }
          toast('Yuklash tugadi');
          // Only when every file made it; a failed one stays on screen with its reason.
          if (![...list.querySelectorAll('.err')].length) { setTimeout(() => go('/'), 900); return; }
        } catch (x) { toast((x as Error).message); }
        btn.disabled = false;
      } },
        h('h2', null, 'Yangi musiqa'),
        h('p', { class: 'muted small' }, 'Faqat WAV (PCM) qabul qilinadi va R2 ga aynan shu holda saqlanadi. Sifat o\'zgarmaydi.'),
        field('WAV fayl(lar)', files),
        h('div', { class: 'two' }, field('Qo\'shiq nomi', titleInput), field('Ijrochi', artist), field('Albom', album), field('Janr', genre), field('Yil', year), field('Muqova rasmi', cov)),
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
    const load = guard(async () => {
      const d = await api(`/api/admin/users?q=${encodeURIComponent(q.value)}&filter=${filter}`);
      pills.replaceChildren(...[['', 'Hammasi'], ['exempt', 'Plansiz ro\'yxat'], ['paid', 'Pullik'], ['banned', 'Bloklangan']].map(([k, l]) => h('button', { class: `pill ${filter === k ? 'on' : ''}`, onclick: () => { filter = k; load(); } }, l)));
      const patch = (id: string, body: unknown, msg: string) => guard(async () => { await api(`/api/admin/users/${id}`, { method: 'PATCH', body }); toast(msg); load(); });
      list.replaceChildren(...(d.users.length ? d.users.map((u: Row) => {
        const active = u.plan_expires > d.now;
        return h('div', { class: 'item' },
          h('div', { class: 'body' }, h('div', { class: 'clip', style: 'font-weight:700' }, u.name), h('div', { class: 'clip small muted' }, u.email),
            h('div', { class: 'row wrap', style: 'gap:6px;margin-top:6px' },
              u.role === 'admin' ? h('span', { class: 'tag hot' }, 'Admin') : null,
              active ? h('span', { class: 'tag ok' }, `${u.plan_name || 'Tarif'} · ${date(u.plan_expires)} gacha`) : null,
              u.plan_exempt ? h('span', { class: 'tag ok' }, 'Plan shart emas') : null,
              u.banned ? h('span', { class: 'tag bad' }, 'Bloklangan') : null)),
          u.role === 'admin' ? null : h('div', { class: 'acts' },
            h('button', { class: `btn sm ${u.plan_exempt ? 'light' : ''}`, onclick: patch(u.id, { planExempt: !u.plan_exempt }, u.plan_exempt ? 'Ro\'yxatdan olindi' : 'Plansiz ro\'yxatga qo\'shildi') }, u.plan_exempt ? 'Plansizdan olish' : 'Plansiz qilish'),
            h('button', { class: 'btn sm', onclick: () => sheet(close => [h('h2', null, 'Tarif berish'), h('p', { class: 'muted small clip' }, u.email), plans.map((p: Row) => h('button', { class: 'btn full', onclick: async () => { await patch(u.id, { grantPlanId: p.id }, 'Tarif berildi')(); close(); } }, `${p.name} · ${p.days} kun`)), active ? h('button', { class: 'btn full danger', onclick: async () => { await patch(u.id, { revokePlan: true }, 'Tarif bekor qilindi')(); close(); } }, 'Tarifni bekor qilish') : null]) }, 'Tarif'),
            h('button', { class: 'btn sm danger', onclick: patch(u.id, { banned: !u.banned }, 'Saqlandi') }, u.banned ? 'Blokdan chiqarish' : 'Bloklash')));
      }) : [h('p', { class: 'muted' }, 'Foydalanuvchi topilmadi')]));
    });
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    el.append(await planSwitch(), q, pills, list);
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
      h('h2', null, 'Email kod'), h('p', { class: 'muted small' }, 'Yuboruvchi manzil kiritilsa, yangi foydalanuvchiga tasdiqlash kodi boradi. Bo\'sh qolsa, kodsiz ro\'yxatdan o\'tiladi. Domen Cloudflare Email Service\'ga ulangan bo\'lishi kerak.'),
      field('Yuboruvchi', inp('email_from', 'no-reply@svrvs.uz')),
      h('h2', null, 'To\'lov kartasi'), h('p', { class: 'muted small' }, 'Foydalanuvchilar tarif uchun shu kartaga to\'laydi.'), h('div', { class: 'two' }, field('Karta raqami', inp('card_number', '8600 0000 0000 0000')), field('Karta egasi', inp('card_holder'))),
      h('button', { class: 'btn pri' }, 'Saqlash')));
  },
};

// The one-button plan system switch.
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
    return [h('h2', null, 'Tahrirlash'), field('Nomi', title), field('Ijrochi', artist), h('datalist', { id: 'edit-artists' }, d.artists.map((a: Row) => h('option', { value: a.name }))), field('Albom', album), field('Janr', genre), field('Muqova', cov), field('Reklama matni', promo), field('Matn', lyrics),
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
    const name = h('input', { value: p.name || '' }), tagline = h('input', { value: p.tagline || '' }), price = h('input', { type: 'number', min: 0, value: p.price, inputmode: 'numeric' }), days = h('input', { type: 'number', min: 1, value: p.days, inputmode: 'numeric' }), seats = h('input', { type: 'number', min: 1, max: 20, value: p.seats, inputmode: 'numeric' }), features = h('textarea', null), active = h('input', { type: 'checkbox', checked: p.active });
    features.value = (p.features || []).join('\n');
    return [h('h2', null, p.id ? 'Tarifni tahrirlash' : 'Yangi tarif'), field('Nomi', name), field('Qisqa izoh', tagline), field('Narx, so\'m', price), h('div', { class: 'two' }, field('Muddat, kun', days), field('Odamlar soni', seats)), field('Imkoniyatlar (har qatorda bittadan)', features), h('label', { class: 'row' }, active, 'Faol'),
      h('button', { class: 'btn pri', onclick: guard(async () => { await api('/api/admin/plans', { method: 'POST', body: { id: p.id, name: name.value, tagline: tagline.value, price: Number(price.value), days: Number(days.value), seats: Number(seats.value), features: features.value, active: active.checked, sort: p.sort ?? 0 } }); close(); toast('Saqlandi'); refresh(); }) }, 'Saqlash')];
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
