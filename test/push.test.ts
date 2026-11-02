import test from 'node:test';
import assert from 'node:assert/strict';
import { vapidHeader, vapidPublicKey } from '../src/push.ts';

test('VAPID header is a valid ES256 token for the push service', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const h = await vapidHeader(jwk, 'https://web.push.apple.com/abc/def', 'https://example.test', 1000);
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
  assert.equal(k, vapidPublicKey(jwk));
  assert.equal(Buffer.from(k, 'base64url').length, 65);
  const [a, b, s] = token.split('.');
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  assert.equal(claims.aud, 'https://web.push.apple.com'); assert.equal(claims.sub, 'https://example.test'); assert.equal(claims.exp, 1000 + 43200);
  assert.equal(JSON.parse(Buffer.from(a, 'base64url').toString()).alg, 'ES256');
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${a}.${b}`)));
});
