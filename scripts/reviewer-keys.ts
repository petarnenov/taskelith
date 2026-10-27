import { reviewerKey, type Reviewer } from './review-findings.ts';

// The canonical reviewer key of the review records and the aliases that map
// the legacy spellings of archived records to it.

export const CANONICAL_HARNESSES: readonly string[] = ['claude', 'codex', 'opencode', 'agy'];
export const DEFAULT_VARIANT = 'default';
const PROVIDER_PREFIXED_HARNESS = 'opencode';

const OPENCODE_KIMI_K2_7_CODE: Reviewer = { harness: 'opencode', model: 'opencode-go/kimi-k2.7-code', variant: DEFAULT_VARIANT };

// Archived records are never rewritten, so the reports read each legacy
// spelling, keyed as reviewerKey prints it, as its canonical reviewer.
export const LEGACY_REVIEWER_ALIASES: ReadonlyMap<string, Reviewer> = new Map([
  ['claude-code claude-opus-5-5#high', { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' }],
  ['opencode kimi-k2.7-code#default', OPENCODE_KIMI_K2_7_CODE],
  ['opencode opencode-go/kimi-k2.7-code', OPENCODE_KIMI_K2_7_CODE],
]);

export function canonicalReviewer(reviewer: Reviewer): Reviewer {
  return LEGACY_REVIEWER_ALIASES.get(reviewerKey(reviewer)) ?? reviewer;
}

export function withCanonicalReviewer<Reviewed extends { readonly reviewer: Reviewer }>(record: Reviewed): Reviewed {
  return { ...record, reviewer: canonicalReviewer(record.reviewer) };
}

// Why the reviewer is not canonical, one message per rule; none if it is.
export function reviewerKeyProblems(reviewer: Reviewer): string[] {
  const reasons = [harnessProblem(reviewer), modelProblem(reviewer), variantProblem(reviewer)]
    .filter((reason) => reason !== undefined);
  return reasons.map((reason) => `reviewer "${reviewerKey(reviewer)}" is not canonical: ${reason}`);
}

function harnessProblem({ harness }: Reviewer): string | undefined {
  if (CANONICAL_HARNESSES.includes(harness)) return undefined;
  return `harness "${harness}" is none of ${CANONICAL_HARNESSES.join(', ')}`;
}

function modelProblem({ harness, model }: Reviewer): string | undefined {
  const prefixed = model.includes('/');
  if (harness === PROVIDER_PREFIXED_HARNESS && !prefixed) {
    return `an OpenCode model names its provider as its CLI takes it, for example opencode-go/${model}`;
  }
  if (harness !== PROVIDER_PREFIXED_HARNESS && prefixed) {
    return `only an OpenCode model has a provider prefix; name the model as the ${harness} CLI takes it`;
  }
  return undefined;
}

function variantProblem({ variant }: Reviewer): string | undefined {
  if (variant !== undefined) return undefined;
  return `variant is missing; record the effort, "${DEFAULT_VARIANT}" when the harness default ran`;
}
