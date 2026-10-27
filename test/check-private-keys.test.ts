import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { keyFileProblem } from '../scripts/check-private-keys.ts';
import { fixtureEnv } from './git-fixture-env.ts';

// Markers built in parts, so this file holds no PEM key block itself.
const marker = (edge: string, type: string) => `-----${edge} ${type}-----`;
const KEY = `${marker('BEGIN', 'EC PRIVATE KEY')}\nMHcCAQEEIBody\n${marker('END', 'EC PRIVATE KEY')}\n`;
const CERTIFICATE = `${marker('BEGIN', 'CERTIFICATE')}\nMIIBkTCC\n${marker('END', 'CERTIFICATE')}\n`;
const SCRIPT = new URL('../scripts/check-private-keys.ts', import.meta.url).pathname;

test('key files and PEM private-key blocks are refused; certificates and markers in code stay', () => {
  for (const file of ['infra/server.pem', 'a/b.KEY', 'c.p12', 'd.pfx']) assert.equal(keyFileProblem(file, () => ''), 'is a key or certificate file', file);
  assert.equal(keyFileProblem('notes.md', () => `text\n${KEY}`), 'holds a PEM private key');
  const encrypted = `${marker('BEGIN', 'RSA PRIVATE KEY')}\nProc-Type: 4,ENCRYPTED\n`;
  assert.equal(keyFileProblem('legacy.txt', () => encrypted), 'holds a PEM private key');
  assert.equal(keyFileProblem('ca.txt', () => CERTIFICATE), undefined);
  assert.equal(keyFileProblem('rules.ts', () => `const begin = /${marker('BEGIN', '[A-Z ]*PRIVATE KEY')}/;\n`), undefined);
  assert.equal(keyFileProblem('quoted.ts', () => `'${marker('BEGIN', 'PRIVATE KEY')}', 'x'\n`), undefined);
});

test('an indented or JSON-escaped PEM private key is refused too', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const yaml = `tls:\n  key: |\n${privateKey.replace(/^/gm, '    ')}`;
  assert.equal(keyFileProblem('values.yaml', () => yaml), 'holds a PEM private key');
  assert.equal(keyFileProblem('installation-authority', () => JSON.stringify({ format: 1, privateKey })), 'holds a PEM private key');
  assert.equal(keyFileProblem('crlf.json', () => JSON.stringify({ privateKey: privateKey.replaceAll('\n', '\r\n') })), 'holds a PEM private key');
  assert.equal(keyFileProblem('template.ts', () => `\`${marker('BEGIN', 'PRIVATE KEY')}\\n\${body}\``), undefined);
});

test('the check fails on a tracked key and passes without one', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-private-keys-'));
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env: fixtureEnv, encoding: 'utf8' });
    git('init', '--quiet');
    writeFileSync(join(root, 'ca.txt'), CERTIFICATE);
    git('add', 'ca.txt');
    const run = () => execFileSync(process.execPath, ['--experimental-strip-types', SCRIPT], { cwd: root, env: fixtureEnv, encoding: 'utf8', stdio: 'pipe' });
    assert.match(run(), /No tracked file/);
    writeFileSync(join(root, 'leaked.txt'), KEY);
    git('add', 'leaked.txt');
    assert.throws(run, (error: { stderr: string }) => /leaked\.txt holds a PEM private key/.test(error.stderr) && !error.stderr.includes('MHcC'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
