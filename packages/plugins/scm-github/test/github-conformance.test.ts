import assert from 'node:assert/strict';
import test from 'node:test';
import { runSourceControlConformance } from '@taskelith/integrations';
import { conformanceFixture, githubTestbed } from './github-fixture.ts';

// The shared SCM suite against the plugin over the emulated GitHub; live
// conformance against GitHub.com is item 20's later sub-change.

test('the plugin passes the SCM conformance suite against the emulated GitHub', async () => {
  const report = await runSourceControlConformance(conformanceFixture(githubTestbed()));
  assert.deepEqual(report.findings, []);
  assert.equal(report.cases, 17);
});
