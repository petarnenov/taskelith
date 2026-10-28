import { Agent, type Dispatcher } from 'undici';
import type { HttpFetch, ServerTrust } from './control-plane-http.js';

// Node's fetch with an undici Agent per trust; the only undici module, so
// a node:https HttpFetch can replace it.
export const undiciFetch: HttpFetch = (url, init) => {
  const { trust, ...request } = init;
  // Node's fetch takes a dispatcher, which its types do not declare.
  return fetch(url, { ...request, dispatcher: agentFor(trust) } as RequestInit);
};

const agents = new WeakMap<ServerTrust, Dispatcher>();

function agentFor(trust: ServerTrust): Dispatcher {
  const known = agents.get(trust);
  if (known !== undefined) return known;
  const connect = trust.kind === 'pinned' ? { ca: trust.ca } : { rejectUnauthorized: false };
  const agent = new Agent({ connect });
  agents.set(trust, agent);
  return agent;
}
