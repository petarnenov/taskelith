import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import { AUDIT_TEXT_MAX_LENGTH, type AuditEventKind } from '../domain/operator-credential.js';
import type { OperatorCredentials } from '../ports/operator-credentials.js';
import type { Secrets } from '../ports/secrets.js';

// Who runs an administrative command and why; the reset requires both.
export interface AdministrativeInvocation {
  readonly actor: string;
  readonly reason: string;
}

export interface OperatorCredentialServiceDependencies {
  readonly credentials: OperatorCredentials;
  readonly secrets: Secrets;
  readonly clock: Clock;
}

// Issues the one-time bootstrap credential and resets it by direct
// administrative invocation; each returns the new secret exactly once.
export class OperatorCredentialService {
  readonly #deps: OperatorCredentialServiceDependencies;

  constructor(dependencies: OperatorCredentialServiceDependencies) {
    this.#deps = dependencies;
  }

  async bootstrap(invocation: AdministrativeInvocation): Promise<Result<string>> {
    const checked = checkInvocation(invocation);
    if (!checked.ok) return checked;
    const current = await this.#deps.credentials.current();
    if (!current.ok) return current;
    if (current.value !== undefined) return err(failure('conflict', 'the operator bootstrap credential was already issued'));
    return this.#install(1, 'operator-credential.bootstrapped', invocation);
  }

  // Replaces the credential; it changes nothing else, so it never lifts a
  // recovery-epoch quarantine (trust model section 2).
  async reset(invocation: AdministrativeInvocation): Promise<Result<string>> {
    const checked = checkInvocation(invocation);
    if (!checked.ok) return checked;
    const current = await this.#deps.credentials.current();
    if (!current.ok) return current;
    if (current.value === undefined) {
      return err(failure('precondition-failed', 'the installation has no operator credential to reset'));
    }
    return this.#install(current.value.generation + 1, 'operator-credential.reset', invocation);
  }

  // Answers ok only for the current credential's secret.
  async authenticate(secret: string): Promise<Result<void>> {
    const current = await this.#deps.credentials.current();
    if (!current.ok) return current;
    if (current.value !== undefined && this.#deps.secrets.matches(secret, current.value.hash)) return ok(undefined);
    return err(failure('forbidden', 'the operator credential is not valid'));
  }

  async #install(generation: number, kind: AuditEventKind, invocation: AdministrativeInvocation): Promise<Result<string>> {
    const issued = this.#deps.secrets.issue('operator');
    const occurredAt = this.#deps.clock.now();
    const installed = await this.#deps.credentials.install(
      { generation, hash: issued.hash, issuedAt: occurredAt },
      { kind, generation, actor: invocation.actor, reason: invocation.reason, occurredAt },
    );
    return installed.ok ? ok(issued.secret) : installed;
  }
}

function checkInvocation({ actor, reason }: AdministrativeInvocation): Result<void> {
  for (const [name, text] of [['actor', actor], ['reason', reason]] as const) {
    if (text.trim() === '' || text.length > AUDIT_TEXT_MAX_LENGTH) {
      return err(failure('invalid', `the ${name} must be 1-${AUDIT_TEXT_MAX_LENGTH} characters`, { field: name }));
    }
  }
  return ok(undefined);
}
