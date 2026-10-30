import type { Request } from 'express';

/** Client metadata recorded with a session. Values are truncated to their column sizes. */
export function clientInfo(req: Request): { ipAddress: string | null; userAgent: string | null } {
  // `req.ip` honours Express's `trust proxy` setting, so it is only derived from
  // X-Forwarded-For when the deployment explicitly trusts its proxy.
  const ipAddress = req.ip ? req.ip.slice(0, 45) : null;
  const userAgent = req.get('user-agent')?.slice(0, 512) ?? null;
  return { ipAddress, userAgent };
}
