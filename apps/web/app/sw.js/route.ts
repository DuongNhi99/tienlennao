import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Rendered once at build time; the build ID makes each deployment's worker byte-different.
export const dynamic = 'force-static';

export async function GET(): Promise<Response> {
  const template = await readFile(path.join(process.cwd(), 'lib/pwa/sw-template.js'), 'utf8');
  const body = template.replaceAll('__BUILD_ID__', process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev');
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
