// A start failure with a system error's code, such as `EIO`, and never
// its message, which may name a checkout path.
export function faultMessage(subject: string, error: unknown): string {
  const { code } = (typeof error === 'object' && error !== null ? error : {}) as { code?: unknown };
  return typeof code === 'string' && /^E[A-Z0-9]+$/.test(code) ? `${subject} (${code})` : subject;
}
