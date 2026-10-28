import { inspect } from 'node:util';
import {
  passPlans,
  SHADOW_ROUTER,
  TIERS,
  type AnsweredShadow,
  type FailedShadow,
  type ReviewRouter,
  type RouteFeatures,
  type ShadowDecision,
  type ShadowFailure,
  type Tier,
} from './review-route.ts';

// The shadow router: TypeSafe AI's Jev model over HTTP. It decides
// nothing, never retries, and reports failures by reason code only.

export const CREDENTIAL_VARIABLE = 'JEV_MAF_LAB';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-1.14.0';
export const JEV_TIMEOUT_MS = 2000;
export const REDACTED = '[redacted]';

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const MAX_SCORE = 2;

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

// The allowlist of what leaves the machine: counts, capability ids,
// flags, the size, and the history figures; never paths or commits.
export function shadowState(features: RouteFeatures): Record<string, unknown> {
  const { touches, capabilityHistory } = features;
  return {
    linesChanged: features.linesChanged,
    filesChanged: features.filesChanged,
    capabilities: [...features.capabilities],
    touches: {
      code: touches.code,
      tests: touches.tests,
      contracts: touches.contracts,
      specs: touches.specs,
      docker: touches.docker,
      security: touches.security,
      docsOnly: touches.docsOnly,
    },
    externalFacts: features.externalFacts,
    size: features.size,
    capabilityHistory: {
      changes: capabilityHistory.changes,
      thirdPassShare: capabilityHistory.thirdPassShare,
      mediumOrWorsePerChange: capabilityHistory.mediumOrWorsePerChange,
    },
  };
}

const TIER_QUESTION = {
  type: 'choice',
  instructions: 'Which review effort does this software change need so that two review passes suffice?',
  criteria: {
    standard: 'The configured review effort is enough; the change is small or low risk.',
    elevated: 'Higher review effort is needed; the change is large, broad, or touches security, contracts, or containers.',
  },
} as const;

const PASSES_QUESTION = {
  type: 'score',
  instructions: 'How many review passes will this software change need?',
  criteria: ['1 pass', '2 passes', '3 passes'],
} as const;

export function jevRequestBody(features: RouteFeatures, model: string): string {
  return JSON.stringify({
    model,
    state: shadowState(features),
    questions: { tier: TIER_QUESTION, passes: PASSES_QUESTION },
  });
}

export interface JevAnswer {
  readonly model: string;
  readonly tier: Tier;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<Tier, number>>;
  readonly expectedPasses: number;
}

// Undefined for any body outside the documented shapes, so that no part
// of an unexpected body reaches the record.
export function parseJevAnswer(body: unknown): JevAnswer | undefined {
  if (!isObject(body) || !isObject(body.answers)) return undefined;
  const { tier, passes } = body.answers;
  if (typeof body.model !== 'string' || !MODEL_ID.test(body.model)) return undefined;
  if (!isTierAnswer(tier) || !isPassesAnswer(passes)) return undefined;
  return {
    model: body.model,
    tier: tier.choice,
    confidence: tier.confidence,
    probabilities: { standard: tier.probabilities.standard, elevated: tier.probabilities.elevated },
    expectedPasses: passes.score + 1,
  };
}

interface TierAnswer {
  readonly choice: Tier;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<Tier, number>>;
}

function isTierAnswer(answer: unknown): answer is TierAnswer {
  if (!isObject(answer) || answer.type !== 'choice') return false;
  if (!isTier(answer.choice) || !isProbability(answer.confidence)) return false;
  return isTierProbabilities(answer.probabilities);
}

function isTierProbabilities(probabilities: unknown): boolean {
  if (!isObject(probabilities)) return false;
  const keys = Object.keys(probabilities);
  if (keys.length !== TIERS.length || !keys.every(isTier)) return false;
  return TIERS.every((tier) => isProbability(probabilities[tier]));
}

function isPassesAnswer(answer: unknown): answer is { readonly score: number } {
  if (!isObject(answer) || answer.type !== 'score') return false;
  const { score } = answer;
  return isFiniteNumber(score) && score >= 0 && score <= MAX_SCORE && isProbability(answer.confidence);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTier(value: unknown): value is Tier {
  return TIERS.includes(value as Tier);
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

export class JevRouter implements ReviewRouter<ShadowDecision> {
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

  async route(features: RouteFeatures): Promise<ShadowDecision> {
    if (this.#credential === undefined) return failed({ reason: 'missing-credential' }, 0);
    const started = this.#clock();
    const exchange = await this.#exchange(this.#credential, features).catch(() => ({ reason: 'invalid-response' as const }));
    const latencyMs = Math.max(0, Math.round(this.#clock() - started));
    if ('reason' in exchange) return failed(exchange, latencyMs);
    return answered(exchange.answer, features, latencyMs);
  }

  async #exchange(credential: Credential, features: RouteFeatures): Promise<Exchange> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: credential.authorizationHeader() },
        body: jevRequestBody(features, this.#model),
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

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function failed({ reason, httpStatus }: { reason: ShadowFailure; httpStatus?: number }, latencyMs: number): FailedShadow {
  const status = httpStatus === undefined ? {} : { httpStatus };
  return { router: SHADOW_ROUTER, status: 'failed', reason, ...status, latencyMs };
}

function answered(answer: JevAnswer, features: RouteFeatures, latencyMs: number): AnsweredShadow {
  return {
    router: SHADOW_ROUTER,
    status: 'answered',
    model: answer.model,
    tier: answer.tier,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    expectedPasses: answer.expectedPasses,
    passes: passPlans(answer.tier, features),
    latencyMs,
  };
}
