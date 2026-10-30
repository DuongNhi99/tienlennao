import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { MAIL_DIR } from './env';

function messagesTo(to: string, subject: RegExp): string[] {
  let files: string[];
  try {
    files = readdirSync(MAIL_DIR).sort();
  } catch {
    return [];
  }
  return files
    .map((file) => readFileSync(path.join(MAIL_DIR, file), 'utf8'))
    .filter((text) => text.includes(`To: ${to}\n`) && subject.test(text));
}

/**
 * Waits for the `count`-th email to `to` whose subject matches, and returns the link in it.
 * Emails are written by the API's development outbox (MAIL_OUTBOX_DIR).
 */
export async function linkFromEmail(to: string, subject: RegExp, count = 1): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      () => {
        const messages = messagesTo(to, subject);
        if (messages.length < count) return undefined;
        link = messages.at(-1)?.match(/https?:\/\/\S+\?token=[A-Za-z0-9_-]+/)?.[0];
        return link;
      },
      { message: `email ${String(subject)} to ${to}`, timeout: 10_000 },
    )
    .toBeTruthy();
  return link!;
}
