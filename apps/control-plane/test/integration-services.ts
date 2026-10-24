import { connect } from 'node:net';
import { readServiceEndpoints, type ServiceEndpoints } from '@taskelith/control-plane';

// The endpoints of infra/services/compose.yaml, unless the environment sets
// other ones.
const COMPOSE_POSTGRES_URL = 'postgres://taskelith:taskelith@127.0.0.1:55432/taskelith';
const COMPOSE_NATS_URL = 'nats://127.0.0.1:54222';

export const SERVICES_REMEDY = 'start the services with make services-up, or run make test or make verify';

export function integrationEndpoints(): ServiceEndpoints {
  const result = readServiceEndpoints({
    TASKELITH_POSTGRES_URL: process.env.TASKELITH_POSTGRES_URL || COMPOSE_POSTGRES_URL,
    TASKELITH_NATS_URL: process.env.TASKELITH_NATS_URL || COMPOSE_NATS_URL,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export interface NatsServerInfo {
  readonly version: string;
  readonly jetstream?: boolean;
}

// A NATS server sends one INFO line on connect, before any client command.
export function readNatsServerInfo(url: URL): Promise<NatsServerInfo> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 4222) });
    socket.setTimeout(5000, () => socket.destroy(new Error('timed out waiting for INFO')));
    let received = '';
    socket.on('data', (chunk) => {
      received += chunk.toString('utf8');
      const end = received.indexOf('\r\n');
      if (end === -1) return;
      socket.end();
      const line = received.slice(0, end);
      if (!line.startsWith('INFO ')) reject(new Error(`unexpected greeting: ${line.slice(0, 40)}`));
      else resolve(JSON.parse(line.slice('INFO '.length)));
    });
    socket.on('error', (error) => reject(new Error(`NATS at ${url.host} is not reachable (${error.message}); ${SERVICES_REMEDY}`)));
  });
}
