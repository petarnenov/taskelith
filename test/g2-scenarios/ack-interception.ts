import type { TransportConnection } from '@taskelith/nats';

// What runs in place of acknowledging a message of the armed type: it may
// acknowledge, or crash the process. Intake acknowledges after W1 commits.
export type AckInterceptor = (ack: () => void) => void;

// The worker's transport, wrapped so that the scenario intercepts the ack of
// each fetched command of one type; a test-side crash point, not a product one.
export function interceptAck(transport: TransportConnection, commandType: string, intercept: AckInterceptor): TransportConnection {
  const armed = (data: Uint8Array) => new TextDecoder().decode(data).includes(`"${commandType}"`);
  const consumers = override(transport.js.consumers, {
    get: (original) => async (...args: unknown[]) => override(await original(...args), {
      fetch: (fetch) => async (...options: unknown[]) => interceptedMessages(await fetch(...options), armed, intercept),
    }),
  });
  const js = override(transport.js, {}, { consumers });
  return { connection: transport.connection, js, close: () => transport.close() };
}

type Method = (...args: unknown[]) => Promise<unknown>;

interface Message {
  readonly data: Uint8Array;
  ack(): void;
}

// Fetched messages as the consumer iterates them, each armed one wrapped.
function interceptedMessages(messages: unknown, armed: (data: Uint8Array) => boolean, intercept: AckInterceptor): unknown {
  const source = messages as AsyncIterable<Message>;
  async function* wrapped(): AsyncGenerator<Message> {
    for await (const message of source) {
      if (!armed(message.data)) yield message;
      else yield override(message, { ack: (ack) => () => intercept(() => void ack()) });
    }
  }
  return override(messages, {}, { [Symbol.asyncIterator]: () => wrapped() });
}

// A view of `target` whose named methods are replaced; everything else is
// the target's own, bound to it, so its private fields keep working.
function override<T>(target: T, methods: Record<string, (original: Method) => unknown>, values: Record<PropertyKey, unknown> = {}): T {
  return new Proxy(target as object, {
    get(object, key) {
      if (key in values) return values[key];
      const own = Reflect.get(object, key, object) as unknown;
      const bound = typeof own === 'function' ? (own as Method).bind(object) : own;
      return typeof key === 'string' && key in methods ? methods[key]!(bound as Method) : bound;
    },
  }) as T;
}
