import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redactWith, SECRET_SHAPE_RULES } from '@taskelith/observability';
import type { Checked } from './github-conformance-settings.ts';

// Evidence leaves the run only redacted by the shared secret shapes, and
// only when a looser scan then finds no secret trace left in it.

// Looser than the redaction rules, so a shape the rules miss still fails.
const TRACES: readonly (readonly [kind: string, pattern: RegExp])[] = Object.freeze([
  ['github-token', /\bgh[opsur]_[A-Za-z0-9_]{16,}/],
  ['pem-private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jwt', /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/],
  ['basic-credential', /\bBasic\s+(?=[A-Za-z]*[0-9+/])[A-Za-z0-9+/]{12,}={0,2}/i],
]);
// Shorter revealed values would match ordinary text by chance.
const MIN_REVEALED_LENGTH = 8;

export function redactEvidence(text: string): string {
  return redactWith(text, SECRET_SHAPE_RULES);
}

// The kinds of secret trace in the text: a token shape, or a value the run
// knows to be secret, such as a minted token or the webhook secret.
export function findSecretTraces(text: string, revealed: readonly string[]): string[] {
  const kinds = TRACES.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
  const isRevealed = revealed.some((value) => value.length >= MIN_REVEALED_LENGTH && text.includes(value));
  return isRevealed ? [...kinds, 'revealed-value'] : kinds;
}

// The lines of a PEM key's body, each of which is secret on its own.
export function revealedKeyLines(privateKey: string): string[] {
  return privateKey.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('-----'));
}

export function checkedEvidence(text: string, revealed: readonly string[]): Checked<string> {
  const redacted = redactEvidence(text);
  const traces = findSecretTraces(redacted, revealed);
  if (traces.length === 0) return { ok: true, value: redacted };
  return { ok: false, error: `the evidence still holds secret traces (${traces.join(', ')}); nothing was saved` };
}

export async function saveEvidence(directory: string, name: string, text: string, revealed: readonly string[]): Promise<Checked<string>> {
  const checked = checkedEvidence(text, revealed);
  if (!checked.ok) return checked;
  const path = join(directory, name);
  await writeFile(path, checked.value, { mode: 0o600 });
  return { ok: true, value: path };
}
