import { err, failure, ok, REDACTED, type Identifier, type Result } from '@taskelith/kernel';
import type { NormalizedOrigin } from './normalized-origin.js';

export type ScmIntegrationId = Identifier<'ScmIntegrationId'>;

// Settings and secrets are named in kebab-case (`SettingName`).
const SETTING_NAME = /^[a-z][a-z0-9-]{0,63}$/;
// The most secrets one integration holds, as `ScmIntegration` shows them.
export const MAX_SCM_SECRETS = 32;

// An installation-wide integration as stored and shown: its secrets only by
// name, never by value (wire contracts section 7).
export interface ScmIntegration {
  readonly integrationId: ScmIntegrationId;
  readonly pluginId: string;
  readonly label: string;
  readonly allowedOrigin: NormalizedOrigin;
  readonly settings: Readonly<Record<string, string>>;
  // In code-unit order.
  readonly secretNames: readonly string[];
  readonly revision: number;
}

// Secret values by name. Nothing but `reveal` shows a value, so a log, a
// failure, or a serialized object never carries one.
export class ScmSecrets {
  readonly #values: ReadonlyMap<string, string>;

  private constructor(values: ReadonlyMap<string, string>) {
    this.#values = values;
  }

  // Fails with `invalid` for a name that is no `SettingName`.
  static of(values: Readonly<Record<string, string>>): Result<ScmSecrets> {
    const names = Object.keys(values);
    const unnamed = names.find((name) => !SETTING_NAME.test(name));
    if (unnamed !== undefined) return err(failure('invalid', 'a secret name must be kebab-case', { setting: unnamed }));
    return ok(new ScmSecrets(new Map(names.map((name) => [name, values[name]!]))));
  }

  names(): readonly string[] {
    return Object.freeze([...this.#values.keys()].sort(codeUnitOrder));
  }

  // The values with `replacements` replacing those of the same name.
  replacedBy(replacements: ScmSecrets): ScmSecrets {
    return new ScmSecrets(new Map([...this.#values, ...replacements.#values]));
  }

  reveal(): Readonly<Record<string, string>> {
    return Object.freeze(Object.fromEntries(this.#values));
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  // Keeps console.log and util.inspect from showing a value.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

export function codeUnitOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
