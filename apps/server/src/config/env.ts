import { z } from 'zod';

const commaSeparatedUrls = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1));

/**
 * Server environment contract. Validated once at startup; the process refuses to boot
 * with an invalid configuration. Error output lists variable names, never their values.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Comma-separated list of browser origins allowed by CORS (the Next.js app). */
  WEB_ORIGIN: commaSeparatedUrls.default(['http://localhost:3000']),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, 'must be a redis:// or rediss:// URL')
    .default('redis://localhost:6379'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Number of reverse proxies in front of the API whose X-Forwarded-For is trusted. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Public web app URL used in email links. Defaults to the first WEB_ORIGIN. */
  WEB_APP_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/+$/, ''))
    .optional(),
  /** Sessions expire after this many days without activity (sliding), capped at 3× overall. */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /**
   * Cookie Domain attribute. Leave unset when web and API share a host; set it to the parent
   * domain (e.g. `tienlen.example`) when they run on sibling subdomains.
   */
  COOKIE_DOMAIN: z.string().min(1).optional(),
  /** Coins granted once when an account is created (ledger type INITIAL_BONUS). */
  INITIAL_COIN_BONUS: z.coerce.number().int().min(0).max(1_000_000).default(10_000),

  /** smtp:// or smtps:// URL. Without it, development writes emails to MAIL_OUTBOX_DIR. */
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\//, 'must be an smtp:// or smtps:// URL')
    .optional(),
  MAIL_FROM: z.string().min(3).default('Tiến Lên Online <no-reply@tienlen.local>'),
  /** Development-only outbox for emails when SMTP_URL is not set. Never used in production. */
  MAIL_OUTBOX_DIR: z.string().min(1).default('.local/mail'),

  /** Public API base URL (with /api/v1) used in avatar links. Defaults to localhost:PORT. */
  API_PUBLIC_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/+$/, ''))
    .optional(),
  /** Where re-encoded avatar images are stored. Must be shared storage when scaled out. */
  UPLOAD_DIR: z.string().min(1).default('.local/uploads'),

  /** A room that has not started expires after this many minutes without activity. */
  ROOM_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(30),
  /**
   * A player whose last connection dropped while in a waiting room loses the seat after this
   * many seconds. During a match, disconnected players keep their seat and time out normally.
   */
  RECONNECT_GRACE_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
