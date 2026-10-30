import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { describeError } from '../common/errors/describe-error';
import type { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type MailMode = 'smtp' | 'outbox' | 'disabled';

/**
 * Sends transactional email.
 * - SMTP_URL set: delivered through SMTP.
 * - Otherwise, outside production: written to MAIL_OUTBOX_DIR so developers can open the links.
 *   Messages are never logged, because they contain single-use tokens.
 * - Otherwise (production without SMTP): nothing is sent and a warning is logged at startup.
 *   Callers must not tell users an email was delivered; they already use neutral wording.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private readonly outboxDir: string;
  private readonly transporter: Transporter | null;
  readonly mode: MailMode;

  constructor(config: ConfigService<Env, true>) {
    const smtpUrl = config.get('SMTP_URL', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.outboxDir = path.resolve(config.get('MAIL_OUTBOX_DIR', { infer: true }));
    if (smtpUrl) {
      this.mode = 'smtp';
      this.transporter = createTransport(smtpUrl);
    } else {
      this.transporter = null;
      this.mode = config.get('NODE_ENV', { infer: true }) === 'production' ? 'disabled' : 'outbox';
      if (this.mode === 'disabled') {
        this.logger.warn('SMTP_URL is not set: verification and password-reset emails are off.');
      }
    }
  }

  /** Never throws: email failures must not fail the request that triggered them. */
  async send(message: MailMessage): Promise<boolean> {
    try {
      if (this.mode === 'smtp' && this.transporter) {
        await this.transporter.sendMail({ from: this.from, ...message });
        return true;
      }
      if (this.mode === 'outbox') {
        await this.writeToOutbox(message);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Email delivery failed: ${describeError(error)}`);
      return false;
    }
  }

  private async writeToOutbox(message: MailMessage): Promise<void> {
    await mkdir(this.outboxDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recipient = message.to.replace(/[^a-z0-9@._-]/gi, '_');
    const file = path.join(this.outboxDir, `${stamp}-${recipient}.txt`);
    const body = [
      `From: ${this.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      '',
      message.text,
    ].join('\n');
    await writeFile(file, body, 'utf8');
  }
}
