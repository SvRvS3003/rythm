// Pure helpers, no Worker bindings, so `node --test` can exercise them directly.
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

// Only uncompressed PCM/float WAV passes: format tags like 0x55 (MP3 inside RIFF) must not.
export function parseWav(bytes, totalSize) {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') throw new Error('Fayl WAV emas');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12, fmt = null;
  while (pos + 8 <= bytes.length) {
    const id = ascii(bytes, pos, 4), size = v.getUint32(pos + 4, true), body = pos + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + size > bytes.length) throw new Error('WAV fmt bloki buzilgan');
      let format = v.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = v.getUint16(body + 24, true);
      fmt = { format, channels: v.getUint16(body + 2, true), sampleRate: v.getUint32(body + 4, true), byteRate: v.getUint32(body + 8, true), bitDepth: v.getUint16(body + 14, true) };
      if (format !== 1 && format !== 3) throw new Error('Siqilgan WAV qabul qilinmaydi');
      if (fmt.channels < 1 || fmt.channels > 8 || fmt.sampleRate < 8000 || fmt.sampleRate > 384000 || ![8, 16, 24, 32].includes(fmt.bitDepth) || !fmt.byteRate) throw new Error('WAV parametrlari noto\'g\'ri');
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV fmt bloki topilmadi');
      if (!size) throw new Error('WAV ichida audio yo\'q');
      if (totalSize !== undefined && body + size > totalSize) throw new Error('WAV fayl to\'liq emas');
      return { channels: fmt.channels, sampleRate: fmt.sampleRate, bitDepth: fmt.bitDepth, duration: size / fmt.byteRate, dataSize: size };
    }
    pos = body + size + (size % 2);
  }
  throw new Error('WAV audio bloki topilmadi');
}

export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return 'invalid';
  if (!m[1]) {
    const n = Math.min(Number(m[2]), size);
    return n > 0 ? { offset: size - n, length: n } : 'invalid';
  }
  const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start > end || start >= size ? 'invalid' : { offset: start, length: end - start + 1 };
}

export function imageType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return null;
}

export const isApk = b => b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

export const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async data => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));

export async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}

// Workers caps PBKDF2 at 100k iterations.
export async function hashPassword(password, saltHex) {
  const salt = saltHex || hex(crypto.getRandomValues(new Uint8Array(16)));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, k, 256);
  return { hash: hex(bits), salt };
}

export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const xmlEscape = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
