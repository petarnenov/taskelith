// A read or command as the screens call it: an unauthenticated answer ends
// the session in the shell; a gateway that throws reads as unreachable.

export const UNAVAILABLE = { kind: 'unavailable' } as const;

interface Settled {
  readonly kind: string;
}

export type ExpiringCall = <R extends Settled>(call: () => Promise<R>) => Promise<R | typeof UNAVAILABLE>;

export function expiringCall(expiryOfRequest: () => () => void): ExpiringCall {
  return async (call) => {
    const expire = expiryOfRequest();
    const result = await settle(call);
    if (result.kind === 'unauthenticated') expire();
    return result;
  };
}

async function settle<R>(call: () => Promise<R>): Promise<R | typeof UNAVAILABLE> {
  try {
    return await call();
  } catch {
    return UNAVAILABLE;
  }
}
