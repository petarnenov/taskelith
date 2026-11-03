import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { JsonRecord } from './github-data.js';

// Each port permission and the narrowest App permission that grants it
// (source control contract section 7).
const GITHUB_PERMISSIONS: Readonly<Record<string, readonly [name: string, level: 'read' | 'write']>> = Object.freeze({
  'read-code': ['contents', 'read'],
  'write-code': ['contents', 'write'],
  'write-change-requests': ['pull_requests', 'write'],
  'write-statuses': ['statuses', 'write'],
});

export function githubPermissions(permissions: readonly string[]): Result<Readonly<Record<string, string>>> {
  const requested: Record<string, string> = {};
  for (const permission of permissions) {
    const mapped = Object.hasOwn(GITHUB_PERMISSIONS, permission) ? GITHUB_PERMISSIONS[permission] : undefined;
    if (mapped === undefined) return err(failure('invalid', 'A run credential names an unknown permission'));
    const [name, level] = mapped;
    if (requested[name] !== 'write') requested[name] = level;
  }
  return ok(requested);
}

// GitHub adds `metadata: read` to every installation token.
const IMPLIED: Readonly<Record<string, string>> = Object.freeze({ metadata: 'read' });

// Every requested App permission at its level, and only implied extras.
export function isExactGrant(requested: Readonly<Record<string, string>>, granted: JsonRecord): boolean {
  return Object.entries(requested).every(([name, level]) => granted[name] === level)
    && Object.entries(granted).every(([name, level]) => levelOf(requested, name) === level || levelOf(IMPLIED, name) === level);
}

function levelOf(permissions: Readonly<Record<string, string>>, name: string): string | undefined {
  return Object.hasOwn(permissions, name) ? permissions[name] : undefined;
}

// What the token can actually do, in port terms.
export function effectivePermissions(granted: JsonRecord): readonly string[] {
  return Object.entries(GITHUB_PERMISSIONS)
    .filter(([, [name, level]]) => granted[name] === 'write' || (level === 'read' && granted[name] === 'read'))
    .map(([permission]) => permission);
}
