import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AuditEvent, OperatorCredential } from '../domain/operator-credential.js';
import type { OperatorCredentials } from '../ports/operator-credentials.js';

export class InMemoryOperatorCredentials implements OperatorCredentials {
  #current: OperatorCredential | undefined;
  readonly #trail: AuditEvent[] = [];

  async current(): Promise<Result<OperatorCredential | undefined>> {
    return ok(this.#current);
  }

  // Checks and writes without awaiting, so concurrent installs cannot both win.
  install(next: OperatorCredential, event: AuditEvent): Promise<Result<void>> {
    const expected = (this.#current?.generation ?? 0) + 1;
    if (next.generation !== expected || event.generation !== expected) {
      return Promise.resolve(err(failure('conflict', `the next operator credential generation is ${expected}`)));
    }
    this.#current = Object.freeze({ ...next });
    this.#trail.push(Object.freeze({ ...event }));
    return Promise.resolve(ok(undefined));
  }

  async auditTrail(): Promise<Result<readonly AuditEvent[]>> {
    return ok([...this.#trail]);
  }
}
