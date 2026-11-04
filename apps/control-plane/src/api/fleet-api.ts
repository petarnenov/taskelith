import type { HttpSchemas } from '@taskelith/contracts';
import type {
  EnrollmentTokenRecord,
  EnrollmentTokenService,
  HostConstraints,
  IssuedEnrollmentToken,
  WorkerAdmissionEntry,
  WorkerAdmissionSnapshot,
  WorkerAdmissionView,
} from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { redactSecrets } from '@taskelith/secrets';
import { printableWorkerAdmission } from '../application/worker-admission-view.js';
import type { ApiRequest } from './api-server.js';
import { afterOf } from './project-api.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

// What the workers view and the token operations reach (wire section 4).
export interface FleetOperations {
  readonly workers: WorkerAdmissionView;
  readonly tokens: Pick<EnrollmentTokenService, 'issue' | 'list' | 'revoke' | 'rotate'>;
}

// The handlers of `listWorkers` and the enrollment token operations; the
// server checked the installation-owner role before the body.
export class FleetApi {
  readonly #operations: FleetOperations;

  constructor(operations: FleetOperations) {
    this.#operations = operations;
  }

  // Every detail is redacted again, as the CLI prints it (OAS `listWorkers`).
  async listWorkers(): Promise<Result<Wire<'WorkersView'>>> {
    const snapshot = await this.#operations.workers.workers();
    return snapshot.ok ? ok(workersBody(printableWorkerAdmission(snapshot.value))) : snapshot;
  }

  async listEnrollmentTokens(request: ApiRequest): Promise<Result<Wire<'EnrollmentTokenPage'>>> {
    const after = afterOf(request);
    if (!after.ok) return after;
    const page = await this.#operations.tokens.list(after.value);
    if (!page.ok) return page;
    return ok({ tokens: page.value.tokens.map(tokenBody), ...(page.value.next === undefined ? {} : { next: page.value.next }) });
  }

  // The one answer that carries the secret (wire contracts section 7).
  async issueEnrollmentToken({ body }: ApiRequest): Promise<Result<Wire<'IssuedEnrollmentToken'>>> {
    const issued = await this.#operations.tokens.issue(body as Wire<'HostConstraints'>);
    return issued.ok ? ok(issuedBody(issued.value)) : issued;
  }

  async revokeEnrollmentToken({ parameters }: ApiRequest): Promise<Result<void>> {
    const tokenId = tokenIdOf(parameters);
    return tokenId.ok ? this.#operations.tokens.revoke(tokenId.value) : tokenId;
  }

  async rotateEnrollmentToken({ parameters }: ApiRequest): Promise<Result<Wire<'IssuedEnrollmentToken'>>> {
    const tokenId = tokenIdOf(parameters);
    if (!tokenId.ok) return tokenId;
    const rotated = await this.#operations.tokens.rotate(tokenId.value);
    return rotated.ok ? ok(issuedBody(rotated.value)) : rotated;
  }
}

function workersBody(snapshot: WorkerAdmissionSnapshot): Wire<'WorkersView'> {
  return { asOf: snapshot.asOf, workers: snapshot.workers.map(workerBody) };
}

// A host name is text a worker or the owner wrote, so a secret shape in it
// leaves redacted; the stored constraint still matches the host.
function workerBody(entry: WorkerAdmissionEntry): Wire<'WorkerAdmissionEntry'> {
  const { workerId, host, enrolledAt, admission, reportedAt, results } = entry;
  return {
    workerId, host: { ...host, hostname: redactSecrets(host.hostname) }, enrolledAt, admission, ...(reportedAt === undefined ? {} : { reportedAt }),
    // The domain result is not a discriminated union; `successResponse`
    // checks the body against `SelfCheckResult` before it leaves.
    results: results.map((result) => ({ ...result, details: [...result.details] })) as Wire<'WorkerAdmissionEntry'>['results'],
  };
}

function tokenIdOf(parameters: readonly string[]): Result<string> {
  const parsed = parseIdentifier('Identifier', parameters[0] ?? '');
  return parsed.ok ? parsed : err(failure('invalid', 'tokenId must be an identifier', { field: 'tokenId' }));
}

function tokenBody({ tokenId, issuedAt, expiresAt, constraints }: EnrollmentTokenRecord): Wire<'EnrollmentToken'> {
  return { tokenId, issuedAt, expiresAt, constraints: printableConstraints(constraints) };
}

function printableConstraints(constraints: HostConstraints): Wire<'HostConstraints'> {
  const { hostname } = constraints;
  return { ...constraints, ...(hostname === undefined ? {} : { hostname: redactSecrets(hostname) }) };
}

function issuedBody({ token, secret }: IssuedEnrollmentToken): Wire<'IssuedEnrollmentToken'> {
  return { token: tokenBody(token), secret };
}
