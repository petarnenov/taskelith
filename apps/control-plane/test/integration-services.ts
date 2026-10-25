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

// A NATS server sends one INFO line on connect, before any client command;
// only that first line is read.
export function readNatsServerInfo(url: URL): Promise<NatsServerInfo> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 4222) });
    let received = '';
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      outcome();
    };
    socket.setTimeout(5000, () => settle(() => reject(new Error('timed out waiting for INFO'))));
    socket.on('data', (chunk) => {
      received += chunk.toString('utf8');
      const end = received.indexOf('\r\n');
      if (end !== -1) settle(() => parseInfoLine(received.slice(0, end), resolve, reject));
    });
    socket.on('close', () => settle(() => reject(new Error('connection closed before INFO'))));
    socket.on('error', (error) => settle(() => reject(new Error(`NATS at ${url.host} is not reachable (${error.message}); ${SERVICES_REMEDY}`))));
  });
}

function parseInfoLine(line: string, resolve: (info: NatsServerInfo) => void, reject: (error: Error) => void): void {
  if (!line.startsWith('INFO ')) return reject(new Error(`unexpected greeting: ${line.slice(0, 40)}`));
  try {
    resolve(JSON.parse(line.slice('INFO '.length)));
  } catch (error) {
    reject(new Error(`malformed INFO line: ${(error as Error).message}`));
  }
}
