// A task's changeable defaults that intake prefills (ADR 0008 decision 5).
export const WORK_TYPES = Object.freeze([
  'feature',
  'bug',
  'improvement',
  'documentation',
  'maintenance',
  'emergency',
] as const);

export type WorkType = (typeof WORK_TYPES)[number];

// Who approves a task's specification, by the project's spec approval policy.
export const SPEC_APPROVERS = Object.freeze(['delegated-reviewer', 'project-maintainer'] as const);

export type SpecApprover = (typeof SPEC_APPROVERS)[number];
