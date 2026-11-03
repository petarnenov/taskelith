import { readFile } from 'node:fs/promises';

// What the live GitHub conformance run reads from its environment: paths
// and IDs only. Messages name a variable, never its value.

export const CONFORMANCE_REPOSITORIES = Object.freeze({
  project: 'petarnenov/taskelith-conformance-project',
  foreign: 'petarnenov/taskelith-conformance-foreign',
  hidden: 'petarnenov/taskelith-conformance-hidden',
});
export const CONFORMANCE_BASE_BRANCH = 'main';

const KEY_FILE = 'TASKELITH_GITHUB_APP_KEY_FILE';
const WEBHOOK_SECRET_FILE = 'TASKELITH_GITHUB_WEBHOOK_SECRET_FILE';
const APP_ID = 'TASKELITH_GITHUB_APP_ID';
const INSTALLATION_ID = 'TASKELITH_GITHUB_INSTALLATION_ID';
export const SETTING_VARIABLES = Object.freeze([KEY_FILE, WEBHOOK_SECRET_FILE, APP_ID, INSTALLATION_ID]);
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;

export interface ConformanceSettings {
  readonly appId: string;
  readonly installationId: string;
  readonly keyFile: string;
  readonly webhookSecretFile: string;
}

export interface ConformanceSecrets {
  readonly privateKey: string;
  readonly webhookSecret: string;
}

export type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

type Environment = Readonly<Record<string, string | undefined>>;

export function readSettings(environment: Environment): Checked<ConformanceSettings> {
  const missing = SETTING_VARIABLES.filter((name) => (environment[name] ?? '').length === 0);
  if (missing.length > 0) return refused(`set ${missing.join(', ')}`);
  const invalid = [APP_ID, INSTALLATION_ID].filter((name) => !NUMERIC_ID.test(environment[name] ?? ''));
  if (invalid.length > 0) return refused(`${invalid.join(', ')} must be a numeric GitHub ID`);
  return {
    ok: true,
    value: {
      appId: environment[APP_ID]!,
      installationId: environment[INSTALLATION_ID]!,
      keyFile: environment[KEY_FILE]!,
      webhookSecretFile: environment[WEBHOOK_SECRET_FILE]!,
    },
  };
}

export type FileReader = (path: string) => Promise<string>;

const readText: FileReader = (path) => readFile(path, 'utf8');

export async function loadSecrets(settings: ConformanceSettings, read: FileReader = readText): Promise<Checked<ConformanceSecrets>> {
  const privateKey = await secretFile(read, settings.keyFile, KEY_FILE);
  if (!privateKey.ok) return privateKey;
  if (!privateKey.value.includes('PRIVATE KEY-----')) return refused(`${KEY_FILE} names no PEM private key`);
  const webhookSecret = await secretFile(read, settings.webhookSecretFile, WEBHOOK_SECRET_FILE);
  if (!webhookSecret.ok) return webhookSecret;
  return { ok: true, value: { privateKey: privateKey.value, webhookSecret: webhookSecret.value } };
}

// A trailing newline, as an editor or `echo` leaves it, is not secret.
async function secretFile(read: FileReader, path: string, variable: string): Promise<Checked<string>> {
  let text: string;
  try {
    text = (await read(path)).replace(/\r?\n$/, '');
  } catch {
    return refused(`${variable} names a file that cannot be read`);
  }
  return text.length === 0 ? refused(`${variable} names an empty file`) : { ok: true, value: text };
}

function refused(error: string): { readonly ok: false; readonly error: string } {
  return { ok: false, error };
}
