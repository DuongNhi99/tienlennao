/**
 * One-line, log-safe description of an unknown error. Falls back to the error code because
 * some network failures (e.g. AggregateError from dual-stack connects) have an empty message.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const firstLine = error.message.split('\n')[0]?.trim();
  if (firstLine) return firstLine;
  const code = (error as NodeJS.ErrnoException).code;
  return code ? `${error.name} (${code})` : error.name;
}
