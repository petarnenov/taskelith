import assert from 'node:assert/strict';
import {
  runSourceControlConformance,
  type RunCredential,
  type RunCredentialRequest,
  type SourceControlConformanceFixture,
  type SourceControlProvider,
} from '@taskelith/integrations';
import { InMemoryScm, type ScmDefects, type ScmSetup } from './in-memory-source-control.ts';

// Helpers that run the suite and render its findings as text lines.

const CASE_COUNT = 13;

export async function findings(fixture: SourceControlConformanceFixture): Promise<string[]> {
  const report = await runSourceControlConformance(fixture);
  assert.equal(report.cases, CASE_COUNT);
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.findings));
  return report.findings.map((entry) => `${entry.caseName} ${entry.check}: ${entry.message}`);
}

export function defective(defects: ScmDefects, setup: ScmSetup = {}): Promise<string[]> {
  return findings(new InMemoryScm(defects, setup).fixture());
}

// The fake's own provider with some operations replaced.
export function patched(override: (provider: SourceControlProvider) => Partial<SourceControlProvider>): Promise<string[]> {
  const scm = new InMemoryScm();
  const provider = scm.provider();
  return findings(scm.fixture({ ...provider, ...override(provider) }));
}

export async function issued(provider: SourceControlProvider, request: RunCredentialRequest): Promise<RunCredential> {
  const result = await provider.issueRunCredential(request);
  assert.ok(result.ok);
  return result.value;
}

export function headings(lines: readonly string[]): string[] {
  return lines.map((line) => line.slice(0, line.indexOf(':')));
}
