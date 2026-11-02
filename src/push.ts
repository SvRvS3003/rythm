// TypeScript, src/push.ts, Workers and node: signs Web Push requests (VAPID, RFC 8292). Pushes carry no data; the device asks for its message.
const b64u = (b: ArrayBuffer | Uint8Array): string => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export function vapidPublicKey(jwk: JsonWebKey): string {
  const x = fromB64u(jwk.x as string), y = fromB64u(jwk.y as string), raw = new Uint8Array(65);
  raw[0] = 4; raw.set(x, 1); raw.set(y, 33);
  return b64u(raw);
}
export async function vapidHeader(jwk: JsonWebKey, endpoint: string, contact: string, nowSec: number): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = (o: unknown): string => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: contact })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body));
  return `vapid t=${body}.${b64u(sig)}, k=${vapidPublicKey(jwk)}`;
}
