// The bounds of a described cause chain (design decision 5).
const MAX_CAUSE_LINKS = 4;
const MAX_CAUSE_MESSAGE = 160;
const MAX_CAUSE_LENGTH = 512;
const MAX_RAW_MESSAGE = 2_048;

const LINK_SEPARATOR = ' <- ';
const ELLIPSIS = '…';
const REDACTED = '[redacted]';

const NAME = /^[A-Za-z][A-Za-z0-9_$]{0,63}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

// Applied in order; a URL goes whole, user information and query included.
const MESSAGE_SECRETS: readonly (readonly [RegExp, string])[] = [
  [/[\u0000-\u001f\u007f]+/g, ' '],
  [/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[url]'],
  [/\bbearer\s+\S+/gi, `Bearer ${REDACTED}`],
  [/\b(password|passwd|pwd|secret|token|api[_-]?key|authorization)(\s*[=:]\s*)\S+/gi, `$1$2${REDACTED}`],
  [/[A-Za-z0-9_+=-]{32,}/g, REDACTED],
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
  const links = causeChain(thrown).map(describeLink);
  if (links.length === 0) return { cause: 'unknown' };
  const cause = truncate(links.map(renderLink).join(LINK_SEPARATOR), MAX_CAUSE_LENGTH);
  const causeCode = links.map(({ code }) => code).filter((code) => code !== undefined).at(-1);
  return causeCode === undefined ? { cause } : { cause, causeCode };
}

// Follows `cause`, or an aggregate's first error, without revisiting one.
function causeChain(thrown: unknown): object[] {
  const chain: object[] = [];
  for (let link = thrown; isObject(link) && !chain.includes(link) && chain.length < MAX_CAUSE_LINKS; link = nextCause(link)) {
    chain.push(link);
  }
  return chain;
}

function nextCause(link: object): unknown {
  const { cause, errors } = link as { cause?: unknown; errors?: unknown };
  if (cause !== undefined) return cause;
  return Array.isArray(errors) ? errors[0] : undefined;
}

function describeLink(link: object): CauseLink {
  const { name, code, message } = link as { name?: unknown; code?: unknown; message?: unknown };
  return {
    name: typeof name === 'string' && NAME.test(name) ? name : 'Error',
    code: typeof code === 'string' && CODE.test(code) ? code : undefined,
    message: typeof message === 'string' ? sanitizeMessage(message) : '',
  };
}

function renderLink({ name, code, message }: CauseLink): string {
  const coded = code === undefined ? name : `${name}[${code}]`;
  return message === '' ? coded : `${coded}: ${message}`;
}

// Cut only after the replacements, so no secret is split below a match.
function sanitizeMessage(message: string): string {
  const replaced = MESSAGE_SECRETS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    message.slice(0, MAX_RAW_MESSAGE),
  );
  return truncate(replaced.replace(/\s+/g, ' ').trim(), MAX_CAUSE_MESSAGE);
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
