import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

// Refuses tracked private keys (installation contract section 8): tests
// generate keys and certificates at run time, so none is ever committed.

export const KEY_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['.pem', '.key', '.p12', '.pfx']);
// A begin marker, then a line break (raw, maybe indented, or escaped once or
// twice) and base64 or a header, or spaces and a long run of base64.
const PEM_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:(?:\r?\n[ \t]*|(?:\\{1,2}r)?\\{1,2}n)[A-Za-z0-9+/=:,-]|[ \t]+[A-Za-z0-9+/]{16})/;

export function keyFileProblem(file: string, readText: () => string): string | undefined {
  if (KEY_FILE_EXTENSIONS.has(posix.extname(file).toLowerCase())) return 'is a key or certificate file';
  return PEM_PRIVATE_KEY.test(readText()) ? 'holds a PEM private key' : undefined;
}

// The staged content of every tracked file, read from the index, so that a
// key staged and then removed from the working copy is still found.
function stagedFiles(root: string): Map<string, string> {
  const listed = execFileSync('git', ['ls-files', '-z', '--stage'], { cwd: root, encoding: 'utf8' }).split('\0').filter((line) => line !== '');
  const blobs = listed.flatMap((line) => {
    const match = /^(\d+) ([0-9a-f]+) \d\t(.*)$/s.exec(line);
    return match !== null && match[1] !== '160000' ? [{ object: match[2]!, file: match[3]! }] : [];
  });
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root, input: blobs.map((blob) => `${blob.object}\n`).join(''), maxBuffer: 1024 ** 3,
  });
  const contents = new Map<string, string>();
  let offset = 0;
  for (const blob of blobs) {
    const headerEnd = output.indexOf(0x0a, offset);
    const size = Number(output.subarray(offset, headerEnd).toString('latin1').split(' ')[2]);
    contents.set(blob.file, output.subarray(headerEnd + 1, headerEnd + 1 + size).toString('latin1'));
    offset = headerEnd + 1 + size + 1;
  }
  return contents;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = [...stagedFiles(process.cwd())].flatMap(([file, text]) => {
    const problem = keyFileProblem(file, () => text);
    return problem === undefined ? [] : [`${file} ${problem}`];
  });
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`Tracked private keys: ${problems.length}; generate test keys at run time instead.`);
    process.exit(1);
  }
  console.log('No tracked file is or holds a private key.');
}
