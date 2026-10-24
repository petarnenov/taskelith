import { connect } from 'node:net';
import { readServiceEndpoints, type ServiceEndpoints } from '@taskelith/control-plane';

export const SERVICES_REMEDY = 'run make test or make verify, or export the URLs that make services-up prints';

export function integrationEndpoints(): ServiceEndpoints {
  const result = readServiceEndpoints(process.env);
  if (!result.ok) throw new Error(`${result.error.message}; ${SERVICES_REMEDY}`);
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
