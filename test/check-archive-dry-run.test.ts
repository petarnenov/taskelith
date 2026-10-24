import assert from 'node:assert/strict';
import test from 'node:test';
import { activeChanges, archiveProblem, directoryNames, validationProblems } from '../scripts/check-archive-dry-run.ts';

function entry(name: string, directory = true) {
  return { name, isDirectory: () => directory };
}

test('directory names are sorted and exclude files', () => {
  assert.deepEqual(directoryNames([entry('b'), entry('README.md', false), entry('a')]), ['a', 'b']);
});

test('active changes exclude the archive directory', () => {
  assert.deepEqual(activeChanges([entry('archive'), entry('fix-b'), entry('add-a')]), ['add-a', 'fix-b']);
  assert.deepEqual(activeChanges([entry('archive')]), []);
});

test('invalid items are named after the change itself or the changes whose deltas touch them', () => {
  const report = {
    items: [
      { id: 'integration-flow', type: 'spec', valid: true, issues: [] },
      { id: 'demo', type: 'spec', valid: false, issues: [{ level: 'WARNING', path: 'overview', message: 'Purpose is a placeholder' }] },
      { id: 'orphan', type: 'spec', valid: false, issues: [{ level: 'ERROR', path: 'requirements[0]', message: 'too long' }] },
      { id: 'stuck', type: 'change', valid: false, issues: [{ level: 'ERROR', path: 'deltas', message: 'not found' }] },
    ],
  };
  const capabilitiesByChange = new Map([['add-demo', ['demo']], ['tune-demo', ['demo', 'integration-flow']]]);

  assert.deepEqual(validationProblems(report, capabilitiesByChange), [
    'add-demo, tune-demo: spec demo: [WARNING] overview: Purpose is a placeholder',
    'no active change: spec orphan: [ERROR] requirements[0]: too long',
    'stuck: change stuck: [ERROR] deltas: not found',
  ]);
});

test('a valid report has no problems', () => {
  assert.deepEqual(validationProblems({ items: [{ id: 'a', type: 'spec', valid: true, issues: [] }] }, new Map()), []);
});

test('an archive failure names the change and the trimmed output', () => {
  assert.equal(archiveProblem('add-demo', '  MODIFIED requirement not found\n'), 'add-demo: openspec archive failed: MODIFIED requirement not found');
});
