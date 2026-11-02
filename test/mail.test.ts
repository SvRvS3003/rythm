import test from 'node:test';
import assert from 'node:assert/strict';
import { smtpSend, buildMessage, type Mail } from '../src/mail.ts';

const mail: Mail = { user: 'me@gmail.com', pass: 'app-pass', to: 'you@test.uz', fromName: 'SvRvS Rythm', subject: "kod 123456", text: 'Kodingiz: 123456', html: '<b>123456</b>' };

function server(replies: Record<string, string>) {
  const seen: string[] = [];
  const toClient = new TransformStream<Uint8Array, Uint8Array>();
  const w = toClient.writable.getWriter(), enc = new TextEncoder(), dec = new TextDecoder();
  w.write(enc.encode('220 ready\r\n'));
  let inData = false, pending = '';
  const writable = new WritableStream<Uint8Array>({ write(chunk) {
    pending += dec.decode(chunk);
    while (pending.includes('\r\n')) {
      if (inData) { if (!pending.endsWith('\r\n.\r\n')) return; seen.push(pending); pending = ''; inData = false; w.write(enc.encode('250 queued\r\n')); return; }
      const i = pending.indexOf('\r\n'), line = pending.slice(0, i); pending = pending.slice(i + 2); seen.push(line);
      const key = Object.keys(replies).find(k => line.startsWith(k));
      if (line === 'DATA') inData = true;
      if (key) w.write(enc.encode(replies[key]));
    }
  } });
  return { readable: toClient.readable, writable, seen };
}
const OK = { EHLO: '250-smtp.gmail.com\r\n250 AUTH LOGIN\r\n', 'AUTH LOGIN': '334 VXNlcm5hbWU6\r\n', [btoa('me@gmail.com')]: '334 UGFzc3dvcmQ6\r\n', [btoa('app-pass')]: '235 ok\r\n', 'MAIL FROM': '250 ok\r\n', 'RCPT TO': '250 ok\r\n', DATA: '354 go\r\n' };

test('full SMTP dialog, in order, ending the body with a lone dot', async () => {
  const s = server(OK);
  await smtpSend(s.readable, s.writable, mail);
  assert.deepEqual(s.seen.slice(0, 7), ['EHLO svrvs-rythm', 'AUTH LOGIN', btoa('me@gmail.com'), btoa('app-pass'), 'MAIL FROM:<me@gmail.com>', 'RCPT TO:<you@test.uz>', 'DATA']);
  assert.ok(s.seen[7].endsWith('\r\n.\r\n'));
});

test('a refused password stops before anything is sent', async () => {
  const s = server({ ...OK, [btoa('app-pass')]: '535 bad credentials\r\n' });
  await assert.rejects(smtpSend(s.readable, s.writable, mail), /535/);
  assert.ok(!s.seen.some(l => l.startsWith('MAIL FROM')));
});

test('a subject or name cannot inject mail headers', () => {
  const msg = buildMessage({ ...mail, fromName: 'x\r\nBcc: evil@test.uz', subject: 'y\r\nBcc: evil@test.uz' }, 'b');
  assert.ok(!/^Bcc:/m.test(msg));
  assert.match(msg, /Content-Transfer-Encoding: base64/);
  assert.ok(!msg.split('\r\n').some(l => l === '.'));
});
