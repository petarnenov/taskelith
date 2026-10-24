import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import config from '../release.config.js';

const analyzer = config.plugins[0][1];
test('release notes render with the installed preset and writer', async () => {
  const notes = await generateNotes(config.plugins[1][1], {
    cwd: process.cwd(),
    commits: [{ hash: 'abc1234', message: 'fix: correct CLI output' }],
    lastRelease: { gitTag: 'v0.1.0' },
    nextRelease: { version: '0.1.1', gitTag: 'v0.1.1' },
    options: { repositoryUrl: 'https://github.com/petarnenov/taskelith.git' },
  });
  assert.match(notes, /0\.1\.1/);
  assert.match(notes, /correct CLI output/);
  assert.match(notes, /compare\/v0\.1\.0\.\.\.v0\.1\.1/);
});

const cases: ReadonlyArray<readonly [string, string | null]> = [
  ['fix: correct CLI output', 'patch'],
  ['feat: add project creation', 'minor'],
  ['feat!: replace CLI invocation', 'major'],
  ['fix: change output\n\nBREAKING CHANGE: output format changed', 'major'],
  ['docs: clarify setup', null],
  ['chore: maintain dependencies', null],
];
for (const [message, expected] of cases) {
  test(`release classification: ${message.split('\n')[0]}`, async () => {
    const result = await analyzeCommits(analyzer, {
      cwd: process.cwd(), commits: [{ message }], logger: { log() {} },
    });
    assert.equal(result, expected);
  });
}

test('breaking changes take precedence over fixes and features', async () => {
  const result = await analyzeCommits(analyzer, {
    cwd: process.cwd(),
    commits: ['fix: bug', 'feat: feature', 'feat!: incompatible change'].map(message => ({ message })),
    logger: { log() {} },
  });
  assert.equal(result, 'major');
});
