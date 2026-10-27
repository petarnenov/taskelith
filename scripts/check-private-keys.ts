import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

// Refuses tracked private keys (installation contract section 8): tests
// generate keys and certificates at run time, so none is ever committed.

export const KEY_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['.pem', '.key', '.p12', '.pfx']);
// A begin marker, then a line break, raw and maybe indented as in YAML or
// escaped as in JSON, then base64 or a header; a bare marker in code stays.
const PEM_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:\r?\n[ \t]*|(?:\\r)?\\n)[A-Za-z0-9+/=:,-]/;

export function keyFileProblem(file: string, readText: () => string): string | undefined {
  if (KEY_FILE_EXTENSIONS.has(posix.extname(file).toLowerCase())) return 'is a key or certificate file';
  return PEM_PRIVATE_KEY.test(readText()) ? 'holds a PEM private key' : undefined;
}

function trackedFiles(root: string): string[] {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
  return files.filter((file) => file !== '' && statSync(posix.join(root, file), { throwIfNoEntry: false })?.isFile());
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const problems = trackedFiles(root).flatMap((file) => {
    const problem = keyFileProblem(file, () => readFileSync(posix.join(root, file), 'latin1'));
    return problem === undefined ? [] : [`${file} ${problem}`];
  });
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`Tracked private keys: ${problems.length}; generate test keys at run time instead.`);
    process.exit(1);
  }
  console.log('No tracked file is or holds a private key.');
}
