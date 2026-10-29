import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Checks the built web SPA: no secret shape, no environment value, and no
// external origin, so the bundle never requests a font or other resource.

export const WEB_DIST = 'apps/web/dist';

// The issued-secret prefixes of @taskelith/access SECRET_PREFIXES; a test
// keeps both lists equal.
export const ISSUED_SECRET_PREFIXES = ['tkop', 'tken', 'tkwk'] as const;

export const SECRET_SHAPES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'PEM block', pattern: /-----BEGIN [A-Z0-9 ]+-----/ },
  { name: 'issued Taskelith secret', pattern: new RegExp(`(?:${ISSUED_SECRET_PREFIXES.join('|')})_[A-Za-z0-9_-]{20,}`) },
  { name: 'NKey seed', pattern: /S[OAU][A-Z2-7]{56}/ },
  { name: 'JSON Web Token', pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: 'bearer credential', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/ },
  { name: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/ },
  { name: 'provider API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

// What Vite leaves when code reads the environment: a dynamic access, a
// VITE_ variable, or the whole environment object with its BASE_URL.
export const ENVIRONMENT_SHAPES: readonly RegExp[] = [/import\.meta\.env/, /\bVITE_[A-Z0-9_]+/, /\bBASE_URL\b/];

// The only URLs a script may hold, each matched exactly and with its reason:
// text that React DOM and Mantine never request. Any other URL fails.
export const ALLOWED_URLS: ReadonlyMap<string, string> = new Map([
  ['http://www.w3.org/1998/Math/MathML', 'React DOM names the MathML namespace of elements it creates.'],
  ['http://www.w3.org/1999/xlink', 'React DOM names the XLink namespace of xlink: attributes.'],
  ['http://www.w3.org/2000/svg', 'React DOM names the SVG namespace of elements it creates.'],
  ['http://www.w3.org/XML/1998/namespace', 'React DOM names the XML namespace of xml: attributes.'],
  ['https://react.dev/errors/', 'React prefixes the link of a minified error message with it.'],
  ['https://mantine.dev/theming/colors/#primary-color', 'Mantine links its invalid primary color error message to it.'],
]);

// Any host after `//`: a name, IPv4, or [IPv6], with optional userinfo and
// port; a name label may hold percent escapes and non-ASCII characters.
const URL_PATTERN = /(?:\b[a-z][a-z0-9+.-]*:)?\/\/(?:[^\s/?#@"'`<>()\\]+@)?(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9%\u0080-\uFFFF-]+(?:\.[A-Za-z0-9%\u0080-\uFFFF-]+)*)(?::\d+)?[^\s"'`<>()\\]*/g;
const NAMED_REFERENCES: ReadonlyMap<string, string> = new Map([['colon', ':'], ['sol', '/'], ['period', '.'], ['percnt', '%']]);

type Decoder = (text: string) => string;

// Each file is also read as its own syntax decodes it, so an escaped URL is
// checked in the form the browser requests; markup may inline the others.
const DECODERS_BY_EXTENSION: ReadonlyMap<string, readonly Decoder[]> = new Map([
  ['.html', [decodeMarkup, decodeScript, decodeStyle]],
  ['.svg', [decodeMarkup, decodeScript, decodeStyle]],
  ['.js', [decodeScript]],
  ['.map', [decodeScript]],
  ['.json', [decodeScript]],
  ['.css', [decodeStyle]],
  ['.txt', []],
]);

export function webBundleProblems(dist: string): string[] {
  if (!existsSync(dist)) return [`${dist} does not exist; build the web SPA first`];
  return files(dist).flatMap((file) => {
    const name = relative(dist, file);
    if (!DECODERS_BY_EXTENSION.has(extname(file))) return [`${name}: unexpected file type`];
    return textProblems(name, readFileSync(file, 'utf8'));
  });
}

export function textProblems(name: string, text: string): string[] {
  const urlsAllowed = extname(name) === '.js';
  return [
    ...SECRET_SHAPES.filter(({ pattern }) => pattern.test(text)).map(({ name: shape }) => `${name}: holds a ${shape}`),
    ...ENVIRONMENT_SHAPES.filter((pattern) => pattern.test(text)).map((pattern) => `${name}: holds an environment value (${pattern.source})`),
    ...referencedUrls(name, text)
      .filter((url) => !(urlsAllowed && ALLOWED_URLS.has(url)))
      .map((url) => `${name}: references the external origin of ${url}`),
  ];
}

function referencedUrls(name: string, text: string): string[] {
  const decoders = DECODERS_BY_EXTENSION.get(extname(name)) ?? [];
  const views = [text, ...decoders.map((decode) => decode(text))];
  return [...new Set(views.flatMap((view) => view.match(URL_PATTERN) ?? []))];
}

function decodeMarkup(text: string): string {
  return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (reference, hex?: string, decimal?: string, name?: string) =>
    name === undefined ? codePoint(reference, hex ? parseInt(hex, 16) : Number(decimal)) : (NAMED_REFERENCES.get(name) ?? reference));
}

// A letter escape stays, because in a regular expression it names a class
// such as \s; the minifier writes string literals without one.
function decodeScript(text: string): string {
  return text.replace(/\\(?:u\{([0-9A-Fa-f]+)\}|u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2})|([^\n0-9A-Za-z]))/g, (escape, braced?: string, unicode?: string, hex?: string, other?: string) =>
    other ?? codePoint(escape, parseInt((braced ?? unicode ?? hex)!, 16)));
}

function decodeStyle(text: string): string {
  return text.replace(/\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|([^\n0-9a-f]))/gi, (escape, hex?: string, other?: string) =>
    other ?? codePoint(escape, parseInt(hex!, 16)));
}

function codePoint(original: string, value: number): string {
  return value <= 0x10ffff ? String.fromCodePoint(value) : original;
}

function files(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = webBundleProblems(process.argv[2] ?? WEB_DIST);
  for (const problem of problems) console.error(`Web bundle: ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log('The web bundle holds no secret shape, environment value, or external origin.');
}
