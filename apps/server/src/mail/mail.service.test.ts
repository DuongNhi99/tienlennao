import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { MailService } from './mail.service';
import { verificationEmail } from './templates';

function config(values: Partial<Env>): ConfigService<Env, true> {
  const all: Partial<Env> = { MAIL_FROM: 'Test <test@example.com>', ...values };
  return { get: (key: keyof Env) => all[key] } as unknown as ConfigService<Env, true>;
}

describe('MailService', () => {
  it('writes to the outbox outside production when SMTP is not configured', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mail-'));
    const mail = new MailService(config({ NODE_ENV: 'development', MAIL_OUTBOX_DIR: dir }));
    expect(mail.mode).toBe('outbox');
    const url = 'http://localhost:3000/verify-email?token=abc';
    await expect(mail.send(verificationEmail('a@example.com', 'An', url))).resolves.toBe(true);
    const [file] = readdirSync(dir);
    const content = readFileSync(path.join(dir, file!), 'utf8');
    expect(content).toContain('To: a@example.com');
    expect(content).toContain(url);
  });

  it('sends nothing in production without SMTP', async () => {
    const mail = new MailService(config({ NODE_ENV: 'production', MAIL_OUTBOX_DIR: '/nope' }));
    expect(mail.mode).toBe('disabled');
    await expect(mail.send(verificationEmail('a@example.com', 'An', 'x'))).resolves.toBe(false);
  });

  it('escapes user-controlled text in the HTML body', () => {
    const message = verificationEmail('a@example.com', '<b>An</b>', 'http://x/?a=1&b=2');
    expect(message.html).not.toContain('<b>An</b>');
    expect(message.html).toContain('&lt;b&gt;An&lt;/b&gt;');
    expect(message.html).toContain('a=1&amp;b=2');
  });
});
