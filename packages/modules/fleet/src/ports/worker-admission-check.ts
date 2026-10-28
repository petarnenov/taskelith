import type { SelfCheckScope } from '../domain/worker-admission.js';

// A check that ran: it passed, or it failed with at least one problem.
export type SelfCheckRun =
  | { readonly outcome: 'passed' }
  | { readonly outcome: 'failed'; readonly problems: readonly string[] };

// One worker admission check (ADR 0008 decision 6). Only the worker's
// runner decides that it does not apply, from its scope.
export interface WorkerAdmissionCheck {
  readonly checkId: string;
  readonly scope: SelfCheckScope;
  run(): Promise<SelfCheckRun>;
}
