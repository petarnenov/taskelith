// A failed HTTP request named by its target, method, URL, and duration;
// fetch reports a network failure as `fetch failed`, its cause names it.
export function requestFailure(target: string, method: string, url: URL, sentAt: number, error: unknown): Error {
  return new Error(`${target} ${method} ${url.href} failed after ${Date.now() - sentAt} ms: ${reasonOf(error)}`, { cause: error });
}

function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (!(error.cause instanceof Error)) return error.message;
  const code = (error.cause as { code?: unknown }).code;
  return `${error.message} (${typeof code === 'string' ? code : error.cause.message})`;
}
