import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE_NAME } from '@tienlen/shared';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { MailService, type MailMessage } from '../../src/mail/mail.service';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD = 'matkhau123';

/** Captures outgoing email so tests can follow verification and reset links. */
export class MailCapture {
  readonly sent: MailMessage[] = [];
  readonly mode = 'outbox';

  send(message: MailMessage): Promise<boolean> {
    this.sent.push(message);
    return Promise.resolve(true);
  }

  /**
   * Waits until at least `count` messages to `to` match `subject` (emails are sent in the
   * background), and returns the token from the latest one's link.
   */
  async tokenFor(to: string, subject: RegExp, count = 1): Promise<string> {
    for (let i = 0; i < 100; i += 1) {
      const matching = this.sent.filter((m) => m.to === to && subject.test(m.subject));
      const token = matching.at(-1)?.text.match(/[?&]token=([A-Za-z0-9_-]+)/)?.[1];
      if (matching.length >= count && token) return token;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No email matching ${String(subject)} was sent to ${to}`);
  }
}

export interface TestContext {
  app: INestApplication;
  server: Server;
  prisma: PrismaService;
  mail: MailCapture;
}

export async function createTestApp(): Promise<TestContext> {
  const mail = new MailCapture();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return {
    app,
    server: app.getHttpServer() as Server,
    prisma: app.get(PrismaService),
    mail,
  };
}

/** A unique email and client IP per test, so rate limits never leak between tests. */
export function uniqueIdentity() {
  const id = randomUUID().slice(0, 8);
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  return { email: `player-${id}@example.com`, ip, displayName: `Người chơi ${id.slice(0, 4)}` };
}

/** A cookie-keeping client that always presents the same client IP. */
export function client(server: Server, ip: string) {
  const agent = request.agent(server);
  const withIp = <T extends { set(field: string, value: string): T }>(req: T) =>
    req.set('X-Forwarded-For', ip);
  return {
    get: (url: string) => withIp(agent.get(url)),
    post: (url: string) => withIp(agent.post(url)),
    patch: (url: string) => withIp(agent.patch(url)),
    put: (url: string) => withIp(agent.put(url)),
    delete: (url: string) => withIp(agent.delete(url)),
  };
}

export async function registerUser(
  server: Server,
  identity = uniqueIdentity(),
): Promise<{ http: ReturnType<typeof client>; userId: string; cookie: string } & typeof identity> {
  const http = client(server, identity.ip);
  const res = await http
    .post('/api/v1/auth/register')
    .send({
      displayName: identity.displayName,
      email: identity.email,
      password: PASSWORD,
      acceptTerms: true,
    })
    .expect(201);
  return {
    http,
    userId: (res.body as { user: { id: string } }).user.id,
    // "name=value" only, ready for a Cookie header.
    cookie: sessionCookie(res)?.split(';')[0] ?? '',
    ...identity,
  };
}

/** Parses the session cookie from a response's Set-Cookie header. */
export function sessionCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
}
