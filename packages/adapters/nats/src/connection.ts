import { jetstream, jetstreamManager, type JetStreamClient, type JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/nats-core';
import { connect, credsAuthenticator } from '@nats-io/transport-node';
import { ok, type Result } from '@taskelith/kernel';
import { brokerFailure } from './broker-failure.js';
import type { TransportAddress } from './transport-address.js';

// The CA the client trusts, in PEM; a client certificate is optional. The
// installation authority that issues them is G3 item 26 (decision O3 (c)).
export interface TransportTls {
  readonly ca: string;
  readonly cert?: string;
  readonly key?: string;
}

// `creds` is the text of a NATS `.creds` file (decision D9 (a)).
export interface TransportEndpoint {
  readonly server: URL;
  readonly address: TransportAddress;
  readonly creds: string;
  readonly tls?: TransportTls;
}

// A worker connection takes the worker's own inbox prefix.
export interface WorkerTransportEndpoint extends TransportEndpoint {
  readonly workerId: string;
}

export interface TransportConnection {
  readonly connection: NatsConnection;
  readonly js: JetStreamClient;
  close(): Promise<void>;
}

// The control plane also manages streams and consumers; a worker's user is
// not allowed the JetStream API beyond its own consumer.
export interface ControlPlaneConnection extends TransportConnection {
  readonly jsm: JetStreamManager;
}

export async function connectTransport(endpoint: TransportEndpoint): Promise<Result<ControlPlaneConnection>> {
  const opened = await open(endpoint, undefined);
  if (!opened.ok) return opened;
  try {
    return ok({ ...opened.value, jsm: await jetstreamManager(opened.value.connection) });
  } catch (error) {
    await opened.value.close();
    return brokerFailure(`reach the JetStream API of ${endpoint.server.href}`, error);
  }
}

export async function connectWorkerTransport(endpoint: WorkerTransportEndpoint): Promise<Result<TransportConnection>> {
  const inboxPrefix = endpoint.address.inboxPrefix(endpoint.workerId);
  return inboxPrefix.ok ? open(endpoint, inboxPrefix.value) : inboxPrefix;
}

// Reconnects without a limit, so a broker outage delays messages rather than
// ending the process; unconfirmed publications are retried by their callers.
async function open(endpoint: TransportEndpoint, inboxPrefix: string | undefined): Promise<Result<TransportConnection>> {
  try {
    const connection = await connect({
      servers: endpoint.server.href,
      authenticator: credsAuthenticator(new TextEncoder().encode(endpoint.creds)),
      inboxPrefix,
      maxReconnectAttempts: -1,
      // Without a CA it stays plain, even where the server offers TLS.
      tls: endpoint.tls === undefined ? null : { ...endpoint.tls },
    });
    return ok({ connection, js: jetstream(connection), close: () => connection.close() });
  } catch (error) {
    return brokerFailure(`connect to ${endpoint.server.href}`, error);
  }
}
