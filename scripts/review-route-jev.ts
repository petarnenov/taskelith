import { inspect } from 'node:util';
import { isRecord } from './findings-common.ts';
import { SECRET_PATTERNS } from './review-findings.ts';
import {
  passPlans,
  SHADOW_ROUTER,
  tierAt,
  type AnsweredShadow,
  type FailedShadow,
  type ReferenceRates,
  type ReviewRouter,
  type ShadowDecision,
  type ShadowFailure,
  type ShadowInput,
  type ShadowInputSource,
} from './review-route.ts';

// The shadow router: TypeSafe AI's Jev model over HTTP. It decides
// nothing, never retries, and reports failures by reason code only.

export const CREDENTIAL_VARIABLE = 'JEV_MAF_LAB';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-1.14.0';
export const JEV_TIMEOUT_MS = 2000;
export const REDACTED = '[redacted]';
// design.md "Threshold": 14 of 31 elevated, 2 of 19 standard had pass 3.
export const THIRD_PASS_THRESHOLD = 0.4;
export const WHY_LIMIT = 1200;
export const WHAT_CHANGES_LIMIT = 1500;

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const CLIPPED = '\u2026';

// Holds the API key; every string form of it is [redacted].
export class Credential {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  // Undefined for an unset or empty variable, so no request goes out.
  static fromEnvironment(environment: NodeJS.ProcessEnv): Credential | undefined {
    const value = environment[CREDENTIAL_VARIABLE];
    return value === undefined || value === '' ? undefined : new Credential(value);
  }

  authorizationHeader(): string {
    return `Bearer ${this.#value}`;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

export interface JevSettings {
  readonly credential: Credential | undefined;
  readonly endpoint?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
  readonly clock?: () => number;
}

// The allowlist of what leaves the machine: the context, counts,
// capability ids, the size, the history, and the redacted proposal.
export function shadowState({ features, reference, content }: ShadowInput): Record<string, unknown> {
  const { capabilityHistory } = features;
  return {
    context: requestContext(reference),
    linesChanged: features.linesChanged,
    filesChanged: features.filesChanged,
    capabilities: [...features.capabilities],
    externalFacts: features.externalFacts,
    size: features.size,
    capabilityHistory: {
      changes: capabilityHistory.changes,
      thirdPassShare: capabilityHistory.thirdPassShare,
      mediumOrWorsePerChange: capabilityHistory.mediumOrWorsePerChange,
    },
    content: {
      why: redactedExcerpt(content.why, WHY_LIMIT),
      whatChanges: redactedExcerpt(content.whatChanges, WHAT_CHANGES_LIMIT),
      taskCount: content.taskCount,
      specRequirementCount: content.specRequirementCount,
    },
  };
}

// The criteria restate governance "Conditional third pass", not the rule.
const THIRD_PASS_QUESTION = {
  type: 'noul',
  instructions: 'This software change will need a third review pass.',
  criteria: {
    true: 'Reviewer B in pass 2 will find a Critical or High issue, or pass 2 will include a Medium issue and its fixes, including fixes for accompanying Low issues, will change files other than records and documentation.',
    false: 'No third pass will be needed: the review ends after a Low-only pass, or pass 2 finds no Critical or High issue and its fixes, if any, touch only records and documentation.',
  },
} as const;

const FIELD_MEANINGS = {
  linesChanged: 'lines added plus removed in the change',
  filesChanged: 'number of files changed',
  capabilities: 'specification areas the change affects',
  externalFacts: 'true when the review must check facts outside the repository',
  size: 'planned size S, S-M, M, M-L or L; null when not planned',
  capabilityHistory: 'past reviewed changes in the same areas: count, share that needed a third pass, Medium-or-worse findings per change',
  content: 'the change proposal: why it is made, what it changes, its task count and specification requirement count',
} as const;

export function requestContext({ thirdPassShare, byLinesChanged }: ReferenceRates): Record<string, unknown> {
  const bands = byLinesChanged.map(({ band, thirdPassShare: share }) => `${band} ${percent(share)}`);
  return {
    meaning: 'Features of one software change in the Taskelith repository, measured before its independent code review.',
    review: 'Each change gets review passes: pass 1 by reviewer A, pass 2 by reviewer B. A third pass is required only when pass 2 found a Critical or High finding, or when the fixes after pass 2 changed more than records and documentation.',
    baseRate: `In this repository ${percent(thirdPassShare)} of reviewed changes needed a third pass.`,
    byLinesChanged: `Third-pass rate by lines changed: ${bands.join(', ')}.`,
    fields: FIELD_MEANINGS,
  };
}

function percent(share: number | null): string {
  return share === null ? 'unknown' : `${Math.round(share * 100)}%`;
}

// A whole PEM block, to its end line or, when that is missing, to the end
// of the text, since its body lines may be shorter than the run pattern.
const PEM_BLOCK = /-----BEGIN [A-Z ]*(?:PRIVATE KEY(?: BLOCK)?|NKEY SEED|USER JWT)-----[\s\S]*?(?:-----END [A-Z ]*-----|$)/;

const REDACTION_PATTERNS: readonly RegExp[] = [PEM_BLOCK, ...SECRET_PATTERNS, /[A-Za-z0-9+/_-]{40,}/].map(
  ({ source, flags }) => new RegExp(source, `${flags}g`),
);

// Redacted before clipping, so that a clipped secret cannot slip past.
export function redactedExcerpt(text: string, limit: number): string {
  const redacted = REDACTION_PATTERNS.reduce((result, pattern) => result.replace(pattern, REDACTED), text);
  return redacted.length > limit ? `${redacted.slice(0, limit)}${CLIPPED}` : redacted;
}

export function jevRequestBody(input: ShadowInput, model: string): string {
  return JSON.stringify({ model, state: shadowState(input), questions: { third: THIRD_PASS_QUESTION } });
}

export interface JevAnswer {
  readonly model: string;
  readonly thirdPassProbability: number;
}

// Undefined for any body outside the documented shape, so that no part
// of an unexpected body reaches the record.
export function parseJevAnswer(body: unknown): JevAnswer | undefined {
  if (!isRecord(body) || !isRecord(body.answers)) return undefined;
  const { third } = body.answers;
  if (typeof body.model !== 'string' || !MODEL_ID.test(body.model)) return undefined;
  if (!isRecord(third) || third.type !== 'noul' || !isProbability(third.noul)) return undefined;
  return { model: body.model, thirdPassProbability: third.noul };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isProbability(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

type Exchange =
  | { readonly answer: JevAnswer }
  | { readonly reason: ShadowFailure; readonly httpStatus?: number };

const STATUS_FAILURES: ReadonlyMap<number, ShadowFailure> = new Map([
  [429, 'rate-limited'],
  [529, 'overloaded'],
]);

export class JevRouter implements ReviewRouter<ShadowDecision, ShadowInputSource> {
  readonly #credential: Credential | undefined;
  readonly #endpoint: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #clock: () => number;

  constructor(settings: JevSettings) {
    this.#credential = settings.credential;
    this.#endpoint = settings.endpoint ?? JEV_ENDPOINT;
    this.#model = settings.model ?? JEV_MODEL;
    this.#timeoutMs = settings.timeoutMs ?? JEV_TIMEOUT_MS;
    this.#fetch = settings.fetch ?? fetch;
    this.#clock = settings.clock ?? (() => performance.now());
  }

  async route(source: ShadowInputSource): Promise<ShadowDecision> {
    if (this.#credential === undefined) return failed({ reason: 'missing-credential' }, 0);
    const input = builtInput(source);
    if (input === undefined) return failed({ reason: 'input-unavailable' }, 0);
    const started = this.#clock();
    const exchange = await this.#exchange(this.#credential, input).catch(() => ({ reason: 'invalid-response' as const }));
    const latencyMs = Math.max(0, Math.round(this.#clock() - started));
    if ('reason' in exchange) return failed(exchange, latencyMs);
    return answered(exchange.answer, input, latencyMs);
  }

  async #exchange(credential: Credential, input: ShadowInput): Promise<Exchange> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: credential.authorizationHeader() },
        body: jevRequestBody(input, this.#model),
        signal,
      });
    } catch (error) {
      return { reason: isTimeout(error) ? 'timeout' : 'network' };
    }
    if (!response.ok) return statusFailure(response);
    return answerOf(response);
  }
}

async function statusFailure(response: Response): Promise<Exchange> {
  await response.body?.cancel().catch(() => undefined);
  return { reason: STATUS_FAILURES.get(response.status) ?? 'http-error', httpStatus: response.status };
}

async function answerOf(response: Response): Promise<Exchange> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { reason: isTimeout(error) ? 'timeout' : 'invalid-response' };
  }
  const answer = parseJevAnswer(body);
  return answer === undefined ? { reason: 'invalid-response' } : { answer };
}

// Undefined when the archive or the proposal cannot be read, so that the
// rule routes alone instead of the command failing.
function builtInput(source: ShadowInputSource): ShadowInput | undefined {
  try {
    return source();
  } catch {
    return undefined;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function failed({ reason, httpStatus }: { reason: ShadowFailure; httpStatus?: number }, latencyMs: number): FailedShadow {
  const status = httpStatus === undefined ? {} : { httpStatus };
  return { router: SHADOW_ROUTER, status: 'failed', reason, ...status, latencyMs };
}

function answered(answer: JevAnswer, { features }: ShadowInput, latencyMs: number): AnsweredShadow {
  const tier = tierAt(answer.thirdPassProbability, THIRD_PASS_THRESHOLD);
  return {
    router: SHADOW_ROUTER,
    status: 'answered',
    model: answer.model,
    tier,
    thirdPassProbability: answer.thirdPassProbability,
    threshold: THIRD_PASS_THRESHOLD,
    passes: passPlans(tier, features),
    latencyMs,
  };
}
