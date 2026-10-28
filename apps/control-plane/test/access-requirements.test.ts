import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { OWNER_ONLY, projectRead, projectRequirement } from '@taskelith/access';
import { ACCESS_REQUIREMENTS, ROUTES, requirementBeforeBody, ruleOf } from '@taskelith/control-plane';

type Operation = { operationId: string; security?: Array<Record<string, string[]>> };
function operationsOf(name: string): Operation[] {
  const document = JSON.parse(readFileSync(new URL(`../../../packages/contracts/documents/${name}`, import.meta.url), 'utf8'));
  return Object.values(document.paths as Record<string, Record<string, Operation>>)
    .flatMap((item) => Object.values(item).filter((operation) => typeof operation.operationId === 'string'));
}
const operations = operationsOf('control-plane.openapi.json');
const executionOperations = operationsOf('execution.openapi.json');

function schemesOf(operation: Operation): string[] {
  return (operation.security ?? [])
    .map((alternative) => Object.keys(alternative).filter((scheme) => scheme !== 'csrfToken')[0] ?? 'none').sort();
}

// The rows of wire contracts section 3, by operation.
const SECTION_3: Record<string, string> = {
  readSession: 'none', logIn: 'none', logOut: 'none', receiveScmWebhook: 'none',
  listProjects: 'authenticated', listScmIntegrations: 'authenticated', readScmIntegration: 'authenticated',
  readProject: 'viewer-or-owner', listProjectMembers: 'viewer-or-owner', readProjectDefaults: 'viewer-or-owner',
  readAutoMergeSetting: 'viewer-or-owner', readRepositoryBinding: 'viewer-or-owner', listProjectAccountSlots: 'viewer-or-owner',
  updateProject: 'maintainer', updateProjectDefaults: 'maintainer', updateAutoMergeSetting: 'maintainer', bindRepository: 'maintainer',
  readBoard: 'viewer-or-owner', readTaskDetail: 'viewer-or-owner', readInbox: 'viewer-or-owner', readInboxCounts: 'viewer-or-owner',
  listAgentSessions: 'viewer-or-owner', readAgentSession: 'viewer-or-owner', listAgentSessionTurns: 'viewer-or-owner',
  listAgentSessionRequests: 'viewer-or-owner', readAgentSessionOutput: 'viewer-or-owner', streamProjectEvents: 'viewer-or-owner',
  submitTurn: 'operator', respondToNativeRequest: 'operator', answerInboxItem: 'operator',
};

function rowOf(operationId: string): string {
  const rule = ruleOf(operationId);
  if (rule.kind === 'none') return 'none';
  if (rule.kind === 'fixed') return rule.requirement.kind === 'authenticated' ? 'authenticated' : 'owner';
  if (rule.kind === 'path-project') return rule.ownerReads ? 'viewer-or-owner' : rule.role.replace('project-', '');
  if (rule.kind === 'evidence-project') return 'evidence:viewer-or-owner';
  return `resource:${rule.role}`;
}

test('every operation of the control-plane document has its own rule, as section 3 lists it', () => {
  assert.ok(operations.length > 30);
  for (const { operationId } of operations) {
    assert.ok(Object.hasOwn(ACCESS_REQUIREMENTS, operationId), `${operationId} has no rule`);
    assert.equal(rowOf(operationId), SECTION_3[operationId] ?? 'owner', operationId);
  }
});

test('every G2 operator operation is checked on the project of its resource', () => {
  const operator = ['createRun', 'submitTask'];
  const viewer = ['readAdmission', 'readTaskResult'];
  for (const operationId of operator) assert.equal(rowOf(operationId), 'resource:project-operator', operationId);
  for (const operationId of viewer) assert.equal(rowOf(operationId), 'resource:project-viewer', operationId);
  const evidence = ['readEvidence', 'downloadEvidence'];
  assert.deepEqual(evidence.map(rowOf), evidence.map(() => 'evidence:viewer-or-owner'), 'execution section 8.1');
  assert.deepEqual(['listQuarantine', 'redriveQuarantined'].map(rowOf), ['owner', 'owner']);
});

test('a served operation of the control-plane document accepts the schemes the document declares', () => {
  const served = ROUTES.filter((route) => operations.some((operation) => operation.operationId === route.operationId));
  assert.deepEqual(served.map((route) => route.operationId).sort(), ['logIn', 'logOut', 'readSession']);
  for (const route of served) {
    const operation = operations.find((candidate) => candidate.operationId === route.operationId)!;
    assert.deepEqual([...route.security].sort(), schemesOf(operation), route.operationId);
    assert.equal(route.browserOnly, true, route.operationId);
  }
});

test('the evidence reads accept the schemes the execution document declares, on both listeners', () => {
  for (const operationId of ['readEvidence', 'downloadEvidence']) {
    const route = ROUTES.find((candidate) => candidate.operationId === operationId)!;
    const operation = executionOperations.find((candidate) => candidate.operationId === operationId)!;
    assert.deepEqual([...route.security].sort(), schemesOf(operation), operationId);
    assert.equal(route.browserOnly, undefined, operationId);
  }
});

test('an operation that no rule names fails closed to the installation-owner', () => {
  assert.equal(Object.hasOwn(ACCESS_REQUIREMENTS, 'operationOfNoRule'), false);
  assert.deepEqual(requirementBeforeBody('operationOfNoRule', []), OWNER_ONLY);
});

test('a path-project requirement names the path project, and a resource-project one waits for its resource', () => {
  assert.deepEqual(requirementBeforeBody('readProject', ['alpha']), projectRead('alpha'));
  assert.deepEqual(requirementBeforeBody('bindRepository', ['alpha']), projectRequirement('alpha', 'project-maintainer'));
  assert.deepEqual(requirementBeforeBody('submitTurn', ['alpha', 's-1']), projectRequirement('alpha', 'project-operator'));
  assert.equal(requirementBeforeBody('readEvidence', ['e-1']), undefined);
  assert.equal(requirementBeforeBody('logIn', []), undefined);
});
