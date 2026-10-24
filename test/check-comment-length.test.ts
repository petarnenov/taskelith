import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commentSyntax,
  commentViolations,
  fileViolations,
  hashComments,
  slashComments,
} from '../scripts/check-comment-length.ts';

const LONG = 'x'.repeat(80);

test('selects the comment syntax by file name and shebang', () => {
  assert.equal(commentSyntax('src/cli.ts', () => ''), 'slash');
  assert.equal(commentSyntax('release.config.js', () => ''), 'slash');
  assert.equal(commentSyntax('test/fixed-archive-date.mjs', () => ''), 'slash');
  for (const file of ['a.mts', 'a.cts', 'a.cjs']) assert.equal(commentSyntax(file, () => ''), 'slash');
  assert.equal(commentSyntax('scripts/run-node-script.sh', () => ''), 'hash');
  assert.equal(commentSyntax('.github/workflows/release.yml', () => ''), 'hash');
  assert.equal(commentSyntax('Makefile', () => ''), 'hash');
  assert.equal(commentSyntax('tools/speckit/Dockerfile', () => ''), 'hash');
  assert.equal(commentSyntax('.githooks/pre-push', () => '#!/bin/sh'), 'hash');
  assert.equal(commentSyntax('LICENSE', () => 'MIT License'), undefined);
  assert.equal(commentSyntax('README.md', () => ''), undefined);
});

test('exempts captured third-party artifacts', () => {
  assert.equal(commentSyntax('docs/qualification/speckit-1.2.3/scaffold/run.sh', () => ''), undefined);
  const scaffold = 'packages/plugins/sdlc-speckit/fixtures/working-copy/.specify/scripts/bash/common.sh';
  assert.equal(commentSyntax(scaffold, () => ''), undefined);
});

test('reads the first line only for an extensionless file', () => {
  const unread = () => assert.fail('the first line was read');
  assert.equal(commentSyntax('scripts/setup.ts', unread), 'slash');
  assert.equal(commentSyntax('README.md', unread), undefined);
});

test('does not count a shebang as a comment', () => {
  assert.deepEqual(slashComments('#!/usr/bin/env node\n// a\n// b\n'), [{ firstLine: 2, lastLine: 3 }]);
});

test('joins adjacent own-line slash comments into one comment', () => {
  const source = ['// one', '// two', '// three', 'const a = 1;', '', '// four'].join('\n');
  assert.deepEqual(slashComments(source), [{ firstLine: 1, lastLine: 3 }, { firstLine: 6, lastLine: 6 }]);
});

test('keeps block and trailing comments apart from their neighbours', () => {
  const source = ['/**', ' * text', ' */', '// own', 'const a = 1; // trailing', '// next'].join('\n');
  assert.deepEqual(slashComments(source), [
    { firstLine: 1, lastLine: 3 },
    { firstLine: 4, lastLine: 4 },
    { firstLine: 5, lastLine: 5 },
    { firstLine: 6, lastLine: 6 },
  ]);
});

test('counts a block comment after code over every line it spans', () => {
  const source = ['const a = 1; /* one', '  two', '  three */', '// next'].join('\n');
  assert.deepEqual(slashComments(source), [{ firstLine: 1, lastLine: 3 }, { firstLine: 4, lastLine: 4 }]);
});

test('ignores comment markers inside strings, templates, and regular expressions', () => {
  const source = ["const a = '// no';", 'const b = `/* no */`;', 'const c = /\\/\\/no/;'].join('\n');
  assert.deepEqual(slashComments(source), []);
});

test('finds own-line and trailing hash comments but not the shebang', () => {
  const source = ['#!/bin/sh', '# one', '# two', 'echo hi # trailing', '', '  # indented'].join('\n');
  assert.deepEqual(hashComments(source), [
    { firstLine: 2, lastLine: 3 },
    { firstLine: 4, lastLine: 4 },
    { firstLine: 6, lastLine: 6 },
  ]);
});

test('finds a hash comment after a shell operator', () => {
  assert.deepEqual(hashComments('echo a;# one\n(# two'), [
    { firstLine: 1, lastLine: 1 },
    { firstLine: 2, lastLine: 2 },
  ]);
});

test('ignores hash marks that are quoted or part of a word or expansion', () => {
  const source = ['echo "#no" \'#no\' $# ${name#prefix} a\\ #no', 'url: https://x.test/#no', 'a: 1 # yes'];
  assert.deepEqual(hashComments(source.join('\n')), [{ firstLine: 3, lastLine: 3 }]);
});

test('reports a comment longer than two lines at its first line', () => {
  const source = '// one\n// two\n// three\n';
  assert.deepEqual(commentViolations('a.ts', source, slashComments(source)), [
    { file: 'a.ts', line: 1, reason: 'comment spans 3 lines (max 2)' },
  ]);
});

test('reports each comment line longer than 80 characters, counting code points', () => {
  const exact = `//${'x'.repeat(78)}`;
  const accented = `//${'é'.repeat(78)}`;
  const source = [exact, '', `const a = 1; //${LONG}`, '', accented].join('\r\n');
  assert.deepEqual(commentViolations('a.ts', source, slashComments(source)), [
    { file: 'a.ts', line: 3, reason: 'comment line is 95 characters (max 80)' },
  ]);
});

test('reports both the span and each long line of one comment', () => {
  const source = [`# ${LONG}`, '# two', '# three'].join('\r\n');
  assert.deepEqual(commentViolations('a.yml', source, hashComments(source)), [
    { file: 'a.yml', line: 1, reason: 'comment spans 3 lines (max 2)' },
    { file: 'a.yml', line: 1, reason: 'comment line is 82 characters (max 80)' },
  ]);
});

test('checks a whole file by its syntax and skips files out of scope', () => {
  assert.deepEqual(fileViolations('run.sh', () => `#!/bin/sh\n# ${LONG}\n`), [
    { file: 'run.sh', line: 2, reason: 'comment line is 82 characters (max 80)' },
  ]);
  assert.deepEqual(fileViolations('notes.md', () => `# ${LONG}\n`), []);
  assert.deepEqual(fileViolations('a.ts', () => '/** fits */\nexport {};'), []);
});
