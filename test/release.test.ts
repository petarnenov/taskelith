import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import config from '../release.config.js';

const analyzer = config.plugins[0][1];
for (const [message, expected] of [
  ['fix: correct CLI output', 'patch'],
  ['feat: add project creation', 'minor'],
  ['feat!: replace CLI invocation', 'major'],
  ['fix: change output\n\nBREAKING CHANGE: output format changed', 'major'],
  ['docs: clarify setup', null],
  ['chore: maintain dependencies', null],
]) {
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
