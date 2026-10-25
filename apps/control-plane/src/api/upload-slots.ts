// At most `limit` uploads are buffered and handled at once; the others wait
// with their bodies held back by the socket, so memory stays bounded.
export class UploadSlots {
  readonly #waiting: (() => void)[] = [];
  #free: number;

  constructor(limit: number) {
    this.#free = limit;
  }

  async run<Value>(work: () => Promise<Value>): Promise<Value> {
    if (this.#free > 0) this.#free -= 1;
    else await new Promise<void>((resolve) => this.#waiting.push(resolve));
    try {
      return await work();
    } finally {
      const next = this.#waiting.shift();
      if (next === undefined) this.#free += 1;
      else next();
    }
  }
}
