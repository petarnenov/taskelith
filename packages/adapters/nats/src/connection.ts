import { jetstream, jetstreamManager, type JetStreamClient, type JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/nats-core';
import { connect } from '@nats-io/transport-node';
import { ok, type Result } from '@taskelith/kernel';
import { brokerFailure } from './broker-failure.js';
import type { TransportAddress } from './transport-address.js';

// Credentials and TLS are item 13's; until then the server's default user
// applies. A worker connection takes the worker's own inbox prefix.
export interface TransportEndpoint {
  readonly server: URL;
  readonly address: TransportAddress;
  readonly workerId?: string;
}

export interface TransportConnection {
  readonly connection: NatsConnection;
  readonly js: JetStreamClient;
  readonly jsm: JetStreamManager;
  close(): Promise<void>;
}

// Reconnects without a limit, so a broker outage delays messages rather than
// ending the process; unconfirmed publications are retried by their callers.
export async function connectTransport(endpoint: TransportEndpoint): Promise<Result<TransportConnection>> {
  const inboxPrefix = endpoint.workerId === undefined ? undefined : endpoint.address.inboxPrefix(endpoint.workerId);
  if (inboxPrefix && !inboxPrefix.ok) return inboxPrefix;
  try {
    const connection = await connect({
      servers: endpoint.server.href,
      inboxPrefix: inboxPrefix?.value,
      maxReconnectAttempts: -1,
    });
    const jsm = await jetstreamManager(connection);
    return ok({ connection, js: jetstream(connection), jsm, close: () => connection.close() });
  } catch (error) {
    return brokerFailure(`connect to ${endpoint.server.href}`, error);
  }
}
