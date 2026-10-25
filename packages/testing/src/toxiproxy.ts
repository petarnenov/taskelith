export interface ProxyRoute {
  readonly name: string;
  readonly listen: string;
  readonly upstream: string;
}

const STREAMS = ['upstream', 'downstream'] as const;

// Toxiproxy's JSON API over fetch. The API has no authentication, so it must
// be reachable only from the test network (docs/g2-infrastructure.md).
export class Toxiproxy {
  readonly #api: URL;

  constructor(api: URL) {
    this.#api = api;
  }

  async createProxy(route: ProxyRoute): Promise<ToxiproxyProxy> {
    await this.request('POST', '/proxies', { ...route, enabled: true });
    return new ToxiproxyProxy(this, route.name);
  }

  // Enables every proxy and removes every toxic, for a clean next scenario.
  async reset(): Promise<void> {
    await this.request('POST', '/reset');
  }

  async request(method: string, path: string, body?: object): Promise<unknown> {
    const response = await fetch(new URL(path, this.#api), {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Toxiproxy ${method} ${path} failed with ${response.status}: ${text}`);
    return text === '' ? undefined : JSON.parse(text);
  }
}

export class ToxiproxyProxy {
  readonly name: string;
  readonly #toxiproxy: Toxiproxy;

  constructor(toxiproxy: Toxiproxy, name: string) {
    this.#toxiproxy = toxiproxy;
    this.name = name;
  }

  // Closes open connections and refuses new ones, like a host that is down.
  async disconnect(): Promise<void> {
    await this.#update({ enabled: false });
  }

  // Keeps connections open but drops data both ways, like a silent partition.
  async blackhole(): Promise<void> {
    for (const stream of STREAMS) {
      await this.#toxiproxy.request('POST', `${this.#path}/toxics`, {
        name: `blackhole-${stream}`, type: 'timeout', stream, toxicity: 1, attributes: { timeout: 0 },
      });
    }
  }

  async heal(): Promise<void> {
    const toxics = await this.#toxiproxy.request('GET', `${this.#path}/toxics`) as { name: string }[];
    for (const toxic of toxics) await this.#toxiproxy.request('DELETE', `${this.#path}/toxics/${toxic.name}`);
    await this.#update({ enabled: true });
  }

  async remove(): Promise<void> {
    await this.#toxiproxy.request('DELETE', this.#path);
  }

  get #path(): string {
    return `/proxies/${encodeURIComponent(this.name)}`;
  }

  async #update(fields: object): Promise<void> {
    await this.#toxiproxy.request('POST', this.#path, fields);
  }
}
