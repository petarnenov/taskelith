import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewerKey } from '../scripts/review-findings.ts';
import {
  canonicalReviewer,
  CANONICAL_HARNESSES,
  LEGACY_REVIEWER_ALIASES,
  reviewerKeyProblems,
  withCanonicalReviewer,
} from '../scripts/reviewer-keys.ts';

const LEGACY_SPELLINGS = [
  { harness: 'claude-code', model: 'claude-opus-5-5', variant: 'high' },
  { harness: 'opencode', model: 'kimi-k2.7-code', variant: 'default' },
  { harness: 'opencode', model: 'opencode-go/kimi-k2.7-code' },
];

test('every alias maps a non-canonical spelling to a canonical reviewer', () => {
  assert.deepEqual([...LEGACY_REVIEWER_ALIASES.keys()], LEGACY_SPELLINGS.map(reviewerKey));
  for (const legacy of LEGACY_SPELLINGS) {
    assert.notDeepEqual(reviewerKeyProblems(legacy), [], reviewerKey(legacy));
    assert.deepEqual(reviewerKeyProblems(canonicalReviewer(legacy)), [], reviewerKey(legacy));
  }
});

test('a canonical or unknown reviewer is read unchanged', () => {
  const canonical = { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' };
  const unknown = { harness: 'someone', model: 'model' };
  assert.equal(canonicalReviewer(canonical), canonical);
  assert.equal(canonicalReviewer(unknown), unknown);
});

test('a record is copied with its canonical reviewer and otherwise kept', () => {
  const record = { session: 's-1', reviewer: { harness: 'claude-code', model: 'claude-opus-5-5', variant: 'high' } };
  assert.deepEqual(withCanonicalReviewer(record), {
    session: 's-1',
    reviewer: { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' },
  });
  assert.equal(record.reviewer.harness, 'claude-code');
});

test('each canonical harness is accepted with its kind of model id', () => {
  const models: Readonly<Record<string, string>> = {
    claude: 'claude-opus-5-5',
    codex: 'gpt-6.1-sol',
    opencode: 'opencode-go/qwen3.8-max',
    agy: 'gemini-4-argon-medium',
  };
  for (const harness of CANONICAL_HARNESSES) {
    assert.deepEqual(reviewerKeyProblems({ harness, model: models[harness], variant: 'default' }), [], harness);
  }
});

test('every broken rule of a reviewer is reported', () => {
  assert.deepEqual(reviewerKeyProblems({ harness: 'antigravity', model: 'google/gemini' }), [
    'reviewer "antigravity google/gemini" is not canonical: harness "antigravity" is none of claude, codex, opencode, agy',
    'reviewer "antigravity google/gemini" is not canonical: only an OpenCode model has a provider prefix; '
      + 'name the model as the antigravity CLI takes it',
    'reviewer "antigravity google/gemini" is not canonical: variant is missing; '
      + 'record the effort, "default" when the harness default ran',
  ]);
});
