import { SECRET_PREFIXES } from '@taskelith/access';
import { REDACTED } from '@taskelith/kernel';

export { REDACTED };

// Rewrites the secrets of one kind in a text. Every rule takes linear time.
export type TextRule = (text: string) => string;

export function textRule(pattern: RegExp, replacement: string): TextRule {
  return (text) => text.replace(pattern, replacement);
}

export function redactWith(text: string, rules: readonly TextRule[]): string {
  return rules.reduce((redacted, rule) => rule(redacted), text);
}

// Name segments of a field that may hold a secret (architecture section 11).
// The key vocabularies below stay apart: merging them changes behaviour.
export const SECRET_SEGMENTS: ReadonlySet<string> = new Set([
  'pass', 'password', 'passwd', 'passphrase', 'pwd', 'secret', 'token', 'credential', 'credentials',
  'authorization', 'cookie', 'privatekey', 'apikey',
]);
const KEY_VALUE_KEYS = 'password|passwd|pwd|secret|token|api[_-]?key';
const KEY_COLON_KEYS = 'password|passwd|passphrase|pass|pwd|secret|token|credentials?|cookie|private[_-]?key|api[_-]?key';

// A URL's user information, up to the last `@` of its authority. Tried once
// per run of scheme characters, keeping the run before the scheme.
export const redactUrlUserinfo = textRule(
  /(?<![a-z0-9+.-])((?:[a-z0-9]|[+.-](?![a-z]))*[+.-])??\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]+@/gi,
  `$1$2${REDACTED}@`,
);
// The same, also replacing empty user information.
export const redactUrlUserinfoEvenEmpty = textRule(
  /(?<![a-z0-9+.-])((?:[a-z0-9]|[+.-](?![a-z]))*[+.-])??\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi,
  `$1$2${REDACTED}@`,
);
export const redactBearerTokens = textRule(/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`);
// A libpq-style pair; a value may hold escaped characters, and a quoted one
// also spaces.
export const redactKeyValuePairs = textRule(
  new RegExp(String.raw`\b(${KEY_VALUE_KEYS})\s*=\s*('(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?|(?:\\.|\S)+)`, 'gi'),
  `$1=${REDACTED}`,
);
// Scheme-less user information, tried once per run of its characters.
export const redactSchemelessUserinfo = textRule(/(?<![^\s/?#@'"])(:*)[^\s/?#@:'"]+:[^\s/?#@'"]+@/g, `$1${REDACTED}@`);
export const redactAuthorizationValues = textRule(
  /\b((?:proxy-)?authorization)(["']?\s*[=:]\s*["']?)[^;,"']*/gi,
  `$1$2${REDACTED}`,
);
// A `key: value` pair, also of JSON, whose value may be quoted.
export const redactKeyColonValues = textRule(
  new RegExp(String.raw`\b(${KEY_COLON_KEYS})(["']?\s*:\s*)("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\S+)`, 'gi'),
  `$1$2${REDACTED}`,
);

// Shapes without word boundaries, so text glued in front hides nothing.
export const redactIssuedSecrets = textRule(
  new RegExp(`(?:${Object.values(SECRET_PREFIXES).join('|')})_[A-Za-z0-9_-]{20,}`, 'g'),
  REDACTED,
);
export const redactNkeySeeds = textRule(/S[OAU][A-Z2-7]{56}/g, REDACTED);
// Tried once per run of JWT characters, keeping the run before `eyJ`.
export const redactJwts = textRule(
  /(?<![A-Za-z0-9_-])((?:(?!eyJ)[A-Za-z0-9_-])*)eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  `$1${REDACTED}`,
);
// The same, also with empty parts, as a cut JWT may have.
export const redactJwtsWithEmptyParts = textRule(
  /(?<![A-Za-z0-9_-])((?:(?!eyJ)[A-Za-z0-9_-])*)eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
  `$1${REDACTED}`,
);

const CREDS_END = '------END USER NKEY SEED------';
const CREDS_BLOCK = /-----BEGIN NATS USER JWT-----[\s\S]*?------END USER NKEY SEED------/g;

// Only up to the last end marker, so no begin marker is scanned to the end
// of the text in vain.
export function redactCredsBlocks(text: string): string {
  const lastEnd = text.lastIndexOf(CREDS_END);
  if (lastEnd === -1) return text;
  const cut = lastEnd + CREDS_END.length;
  return `${text.slice(0, cut).replace(CREDS_BLOCK, REDACTED)}${text.slice(cut)}`;
}

// A PEM private key of any type, such as `PRIVATE KEY`, `EC PRIVATE KEY`,
// or `ENCRYPTED PRIVATE KEY`; certificates and public keys stay.
const PEM_KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;
const PEM_KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

// Each begin marker hides the text up to the next end marker, and without
// one to the end of the text, since a cut key is still secret. One scan.
export function redactPemPrivateKeys(text: string): string {
  let redacted = '';
  let from = 0;
  PEM_KEY_BEGIN.lastIndex = 0;
  for (let begin = PEM_KEY_BEGIN.exec(text); begin !== null; begin = PEM_KEY_BEGIN.exec(text)) {
    PEM_KEY_END.lastIndex = PEM_KEY_BEGIN.lastIndex;
    const end = PEM_KEY_END.exec(text);
    redacted += `${text.slice(from, begin.index)}${REDACTED}`;
    from = end === null ? text.length : PEM_KEY_END.lastIndex;
    if (end === null) break;
    PEM_KEY_BEGIN.lastIndex = from;
  }
  return `${redacted}${text.slice(from)}`;
}

// Secrets marked by their syntax: URL user information, a bearer token, and
// a `key=value` pair.
export const MARKED_SECRET_RULES: readonly TextRule[] = [redactUrlUserinfo, redactBearerTokens, redactKeyValuePairs];
// Bearer secrets, NKey seeds, `.creds` blocks, JWTs (trust model 5), and PEM
// private keys, first, so no other rule cuts a key's markers apart.
export const SECRET_SHAPE_RULES: readonly TextRule[] = [
  redactPemPrivateKeys, redactIssuedSecrets, redactCredsBlocks, redactNkeySeeds, redactJwts,
];
