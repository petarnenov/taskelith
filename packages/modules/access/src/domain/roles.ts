import { err, failure, ok, type Result } from '@taskelith/kernel';

// The roles of trust model section 3.
export const INSTALLATION_OWNER = 'installation-owner';
export type InstallationRole = typeof INSTALLATION_OWNER;

// In rank order: each role includes the ones before it.
export const PROJECT_ROLES = Object.freeze(['project-viewer', 'project-operator', 'project-maintainer'] as const);
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type Role = InstallationRole | ProjectRole;

export function parseProjectRole(text: string): Result<ProjectRole> {
  const role = PROJECT_ROLES.find((candidate) => candidate === text);
  if (role !== undefined) return ok(role);
  return err(failure('invalid', `a project role is one of ${PROJECT_ROLES.join(', ')}`, { field: 'role' }));
}

export function includesRole(held: ProjectRole, required: ProjectRole): boolean {
  return PROJECT_ROLES.indexOf(held) >= PROJECT_ROLES.indexOf(required);
}
