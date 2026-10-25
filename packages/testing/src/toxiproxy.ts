const STREAMS = ['upstream', 'downstream'] as const;

type ToxiproxyRequest = (method: string, path: string, body?: object) => Promise<unknown>;

// Toxiproxy's JSON API over fetch. The API has no authentication, so it must
// be reachable only from the test network (docs/g2-infrastructure.md).
export class Toxiproxy {
  readonly #api: URL;

  constructor(api: URL) {
    this.#api = api;
  }

  // A route the server configuration defines, such as `postgres` or `nats`
  // in infra/services/toxiproxy-routes.json.
  proxy(name: string): ToxiproxyProxy {
    return new ToxiproxyProxy((method, path, body) => this.#request(method, path, body), name);
  }

  // Enables every proxy and removes every toxic, for a clean next scenario.
  async reset(): Promise<void> {
    await this.#request('POST', '/reset');
  }

  async #request(method: string, path: string, body?: object): Promise<unknown> {
    const url = new URL(this.#api);
    url.pathname = `${url.pathname.replace(/\/$/, '')}${path}`;
    const response = await fetch(url, {
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
  readonly #request: ToxiproxyRequest;

  constructor(request: ToxiproxyRequest, name: string) {
    this.#request = request;
    this.name = name;
  }

  // Closes open connections and refuses new ones, like a host that is down.
  async disconnect(): Promise<void> {
    await this.#update({ enabled: false });
  }

  // Keeps connections open but drops data both ways, like a silent partition;
  // heal first to black-hole again, as the server rejects a duplicate toxic.
  async blackhole(): Promise<void> {
    for (const stream of STREAMS) {
      await this.#request('POST', `${this.#path}/toxics`, {
        name: `blackhole-${stream}`, type: 'timeout', stream, toxicity: 1, attributes: { timeout: 0 },
      });
    }
  }

  async heal(): Promise<void> {
    const toxics = await this.#request('GET', `${this.#path}/toxics`) as { name: string }[];
    for (const toxic of toxics) await this.#request('DELETE', `${this.#path}/toxics/${toxic.name}`);
    await this.#update({ enabled: true });
  }

  get #path(): string {
    return `/proxies/${encodeURIComponent(this.name)}`;
  }

  async #update(fields: object): Promise<void> {
    await this.#request('POST', this.#path, fields);
  }
}
