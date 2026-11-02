// TypeScript, src/mail.ts, Workers and node: the SMTP conversation, kept free of sockets so a test can play the server.
export interface Mail { user: string; pass: string; to: string; fromName: string; subject: string; text: string; html: string }

export function buildMessage(m: Mail, boundary: string): string {
  const clean = (s: string): string => s.replace(/[\r\n]+/g, ' ');
  const b64 = (s: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/(.{76})/g, '$1\r\n');
  const word = (s: string): string => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(clean(s))))}?=`;
  return [
    `From: ${word(m.fromName)} <${clean(m.user)}>`, `To: <${clean(m.to)}>`, `Subject: ${word(m.subject)}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.html),
    `--${boundary}--`, '',
  ].join('\r\n');
}

export async function smtpSend(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>, m: Mail): Promise<void> {
  const reader = readable.getReader(), writer = writable.getWriter();
  const enc = new TextEncoder(), dec = new TextDecoder();
  let buf = '';
  // A reply may span lines ("250-..."); only "250 ..." ends it.
  const reply = async (want: number): Promise<void> => {
    for (;;) {
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i][3] === ' ') {
          buf = lines.slice(i + 1).join('\r\n');
          if (Number(lines[i].slice(0, 3)) !== want) throw new Error(`SMTP ${lines[i].slice(0, 120)}`);
          return;
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP connection closed');
      buf += dec.decode(value, { stream: true });
    }
  };
  const say = async (line: string, want: number): Promise<void> => { await writer.write(enc.encode(`${line}\r\n`)); await reply(want); };
  await reply(220);
  await say('EHLO svrvs-rythm', 250);
  await say('AUTH LOGIN', 334);
  await say(btoa(m.user), 334);
  await say(btoa(m.pass), 235);
  await say(`MAIL FROM:<${m.user}>`, 250);
  await say(`RCPT TO:<${m.to}>`, 250);
  await say('DATA', 354);
  await say(`${buildMessage(m, `b${Date.now().toString(36)}`)}\r\n.`, 250);
  await writer.write(enc.encode('QUIT\r\n')).catch(() => {});
}
