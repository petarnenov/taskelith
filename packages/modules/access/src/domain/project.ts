import { err, failure, ok, parseIdentifier, type Instant, type Result } from '@taskelith/kernel';
import type { ProjectId } from '@taskelith/sdlc';
import type { PrincipalId } from './principal.js';

// The values of execution's `SPEC_APPROVERS` (product ports section 6.1).
export const SPEC_APPROVERS = Object.freeze(['delegated-reviewer', 'project-maintainer'] as const);
export type SpecApprover = (typeof SPEC_APPROVERS)[number];

// What a new session does without an eligible slot (account pool 4.5).
export const NO_ELIGIBLE_SLOT_POLICIES = Object.freeze(['wait', 'reject'] as const);
export type NoEligibleSlotPolicy = (typeof NO_ELIGIBLE_SLOT_POLICIES)[number];

export const MAX_IMPLEMENTERS = 8;
export const MAX_PROJECT_NAME_LENGTH = 1024;
// A new project's settings start at this revision (wire section 4).
export const FIRST_REVISION = 1;
// The auto-merge setting starts on (product ports section 6.2).
export const AUTO_MERGE_STARTS_ON = true;

export interface Project {
  readonly projectId: ProjectId;
  readonly name: string;
  readonly createdAt: Instant;
  readonly revision: number;
}

// The defaults that tasks created afterwards take (wire section 4). The
// first implementer is the default one; the rest are tried after a limit.
export interface ProjectDefaults {
  readonly frameworkPluginId: string;
  readonly implementers: readonly string[];
  readonly reviewer: string;
  readonly specApprover: SpecApprover;
  readonly noEligibleSlot: NoEligibleSlotPolicy;
}

export interface SettingChange {
  readonly changedBy: PrincipalId;
  readonly changedAt: Instant;
}

// Absent `lastChange` until the first change after creation.
export interface StoredDefaults {
  readonly defaults: ProjectDefaults;
  readonly revision: number;
  readonly lastChange?: SettingChange;
}

export interface StoredAutoMergeSetting {
  readonly enabled: boolean;
  readonly revision: number;
  readonly lastChange?: SettingChange;
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const MINTED_PROJECT_ID = /^p[0-9a-f]{32}$/;

// `p` and 32 lowercase hexadecimal digits (wire contracts section 6).
export function parseMintedProjectId(text: string): Result<ProjectId> {
  if (MINTED_PROJECT_ID.test(text)) return ok(text as ProjectId);
  return err(failure('internal', 'a minted project identifier is p and 32 lowercase hexadecimal digits'));
}

// Counts code points, as JSON Schema `maxLength` and `char_length` do.
export function parseProjectName(text: string): Result<string> {
  const length = [...text].length;
  if (length >= 1 && length <= MAX_PROJECT_NAME_LENGTH && !CONTROL_CHARACTER.test(text)) return ok(text);
  return err(failure('invalid', `a project name is 1-${MAX_PROJECT_NAME_LENGTH} characters without control characters`, { field: 'name' }));
}

// The invariants of `ProjectDefaultsInput`, for callers other than HTTP.
export function parseProjectDefaults(input: ProjectDefaults): Result<ProjectDefaults> {
  const { implementers, specApprover, noEligibleSlot } = input;
  const identifiers = [input.frameworkPluginId, input.reviewer, ...implementers];
  if (identifiers.some((text) => !parseIdentifier('PluginId', text).ok)) return invalidDefaults('the plugin identifiers');
  if (implementers.length < 1 || implementers.length > MAX_IMPLEMENTERS || new Set(implementers).size !== implementers.length) {
    return invalidDefaults(`1-${MAX_IMPLEMENTERS} distinct implementers`);
  }
  if (!SPEC_APPROVERS.includes(specApprover)) return invalidDefaults('the spec approver');
  if (!NO_ELIGIBLE_SLOT_POLICIES.includes(noEligibleSlot)) return invalidDefaults('the no eligible slot policy');
  return ok(Object.freeze({ ...input, implementers: Object.freeze([...implementers]) }));
}

function invalidDefaults(what: string): Result<never> {
  return err(failure('invalid', `the project defaults need valid ${what}`, { field: 'defaults' }));
}

export function revisionConflict(what: string): Result<never> {
  return err(failure('conflict', `the expected revision of the ${what} is not the current one`));
}

export function unknownProject(): Result<never> {
  return err(failure('not-found', 'no project has this identifier'));
}
