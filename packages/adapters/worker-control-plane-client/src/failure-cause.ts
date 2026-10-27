import { REDACTED, redactText } from '@taskelith/observability';

// The bounds of a described cause chain (design decision 5).
const MAX_CAUSE_LINKS = 4;
const MAX_CODE_DEPTH = 16;
const MAX_CAUSE_LENGTH = 512;
const MAX_FAILURE_TEXT = 160;

const LINK_SEPARATOR = ' <- ';
const ELLIPSIS = '…';

// Both below the 32 characters of a token run, so no seed passes as one.
const NAME = /^[A-Za-z][A-Za-z0-9_$]{0,30}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,30}$/;

// Line breaks, then rules the logger's `redactText` lacks (decision 4).
const BEFORE_REDACT_TEXT: readonly (readonly [RegExp, string])[] = [
  [/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' '],
  // Tried once per run of scheme characters, keeping the run's part before
  // its first scheme start, so linear in time.
  [/(?<![a-z0-9+.-])((?:[a-z0-9]|[+.-](?![a-z]))*[+.-])??\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '$1[url]'],
  // Tried once per run of user-information characters, so linear in time.
  [/(?<![^\s/?#@'"])(:*)[^\s/?#@:'"]+:[^\s/?#@'"]+@/g, `$1${REDACTED}@`],
  [/\b((?:proxy-)?authorization)(["']?\s*[=:]\s*["']?)[^;,"']*/gi, `$1$2${REDACTED}`],
  [/\b(password|passwd|passphrase|pass|pwd|secret|token|credentials?|cookie|private[_-]?key|api[_-]?key)(["']?\s*:\s*)("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\S+)/gi, `$1$2${REDACTED}`],
];
const AFTER_REDACT_TEXT: readonly (readonly [RegExp, string])[] = [
  // Tried once per run of JWT characters, keeping the run before `eyJ`.
  [/(?<![A-Za-z0-9_-])((?:(?!eyJ)[A-Za-z0-9_-])*)eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, `$1${REDACTED}`],
  [/[A-Za-z0-9_+=/-]{32,}/g, REDACTED],
];

// A type, not an interface, so it is a failure's details record.
export type FailureCause = {
  readonly cause: string;
  readonly causeCode?: string;
};

interface CauseLink {
  readonly name: string;
  readonly code: string | undefined;
  readonly message: string;
}

// Describes a thrown value and its causes, bounded and without secrets,
// for a failure's details (design decisions 1 to 4).
export function describeFailureCause(thrown: unknown): FailureCause {
  try {
    return describeChain(causeChain(thrown));
  } catch {
    return { cause: 'unknown' };
  }
}

// A getter or proxy of the thrown value may throw; the caller catches it.
function describeChain(chain: readonly object[]): FailureCause {
  if (chain.length === 0) return { cause: 'unknown' };
  const rendered = chain.slice(0, MAX_CAUSE_LINKS).map(describeLink).map(renderLink);
  const cause = truncate(rendered.join(LINK_SEPARATOR), MAX_CAUSE_LENGTH);
  const causeCode = chain.map(codeOf).filter((code) => code !== undefined).at(-1);
  return causeCode === undefined ? { cause } : { cause, causeCode };
}

// One line of text without secrets, cut only after the whole text is
// redacted, and unable to fake a link of a cause chain.
export function sanitizeFailureText(text: string): string {
  return truncate(toChainSafeLine(redactAll(text)), MAX_FAILURE_TEXT);
}

function redactAll(text: string): string {
  const prepared = BEFORE_REDACT_TEXT.reduce(replace, text);
  return AFTER_REDACT_TEXT.reduce(replace, redactText(prepared));
}

function toChainSafeLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replaceAll('<-', '< -');
}

// Follows `cause`, or an aggregate's first error, without revisiting one;
// deeper than it renders, so the root's code survives a long chain.
function causeChain(thrown: unknown): object[] {
  const chain: object[] = [];
  let link = thrown;
  while (isObject(link) && !chain.includes(link)) {
    chain.push(link);
    if (chain.length === MAX_CODE_DEPTH) return chain;
    link = nextCause(link);
  }
  if (chain.length > 0 && isText(link)) chain.push({ message: link });
  return chain;
}

function nextCause(link: object): unknown {
  const { cause, errors } = link as { cause?: unknown; errors?: unknown };
  if (cause !== undefined) return cause;
  return Array.isArray(errors) ? errors[0] : undefined;
}

function codeOf(link: object): string | undefined {
  const { code } = link as { code?: unknown };
  return typeof code === 'string' && CODE.test(code) ? code : undefined;
}

function describeLink(link: object): CauseLink {
  const { name, message } = link as { name?: unknown; message?: unknown };
  return {
    name: typeof name === 'string' && NAME.test(name) ? name : 'Error',
    code: codeOf(link),
    message: typeof message === 'string' ? sanitizeFailureText(message) : '',
  };
}

function renderLink({ name, code, message }: CauseLink): string {
  const coded = code === undefined ? name : `${name}[${code}]`;
  return message === '' ? coded : `${coded}: ${message}`;
}

function replace(text: string, [pattern, replacement]: readonly [RegExp, string]): string {
  return text.replace(pattern, replacement);
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`;
}

// A string cause, such as `new TypeError('x', { cause: 'y' })`, ends the
// chain as a link of its own.
function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
