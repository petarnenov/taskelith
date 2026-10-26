import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Derives the worker container's seccomp profile from Docker's default one:
// only the CAP_SYS_ADMIN carve-out of the namespace calls is removed.

export const UPSTREAM_URL = 'https://raw.githubusercontent.com/moby/moby/'
  + '8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json';
export const UPSTREAM_SHA256 = '536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74';
export const UPSTREAM_PATH = 'infra/installation/seccomp/docker-default.json';
export const WORKER_PATH = 'infra/installation/seccomp/worker.json';
export const NAMESPACE_CALLS: readonly string[] = ['clone', 'clone3', 'setns', 'unshare'];
const SYS_ADMIN = 'CAP_SYS_ADMIN';

export const USAGE = 'usage: worker-seccomp-profile.ts check | write';

interface CapabilityFilter {
  caps?: string[];
  [key: string]: unknown;
}

export interface SeccompRule {
  names: string[];
  action: string;
  errnoRet?: number;
  includes?: CapabilityFilter;
  excludes?: CapabilityFilter;
  [key: string]: unknown;
}

export interface SeccompProfile {
  syscalls: SeccompRule[];
  [key: string]: unknown;
}

export class ProfileShapeError extends Error {}

// The namespace calls get the rules of a container without CAP_SYS_ADMIN:
// clone without namespace flags, clone3 ENOSYS, unshare and setns refused.
export function workerProfile(upstream: SeccompProfile): SeccompProfile {
  const profile = structuredClone(upstream);
  removeFromSysAdminAllowance(profile.syscalls);
  const fallbacks = profile.syscalls.filter(isNamespaceFallback);
  if (!fallbacks.some((rule) => rule.names.includes('clone3') && rule.errnoRet === 38)) {
    throw new ProfileShapeError('the upstream profile has no clone3 rule answering ENOSYS without CAP_SYS_ADMIN');
  }
  fallbacks.forEach(dropSysAdminExclusion);
  return profile;
}

function removeFromSysAdminAllowance(rules: SeccompRule[]): void {
  const allowance = rules.filter((rule) => rule.action === 'SCMP_ACT_ALLOW' && onlySysAdmin(rule.includes));
  if (allowance.length !== 1 || !NAMESPACE_CALLS.every((call) => allowance[0]!.names.includes(call))) {
    throw new ProfileShapeError('the upstream profile has no single CAP_SYS_ADMIN allowance of every namespace call');
  }
  allowance[0]!.names = allowance[0]!.names.filter((name) => !NAMESPACE_CALLS.includes(name));
}

function onlySysAdmin(filter: CapabilityFilter | undefined): boolean {
  return filter?.caps?.length === 1 && filter.caps[0] === SYS_ADMIN;
}

function isNamespaceFallback(rule: SeccompRule): boolean {
  return rule.names.every((name) => NAMESPACE_CALLS.includes(name)) && (rule.excludes?.caps ?? []).includes(SYS_ADMIN);
}

function dropSysAdminExclusion(rule: SeccompRule): void {
  const excludes = rule.excludes!;
  const caps = excludes.caps!.filter((cap) => cap !== SYS_ADMIN);
  if (caps.length > 0) excludes.caps = caps;
  else delete excludes.caps;
  if (Object.keys(excludes).length === 0) delete rule.excludes;
}

// Upstream's own layout, so that a diff of the two files shows only the
// removed carve-out.
export function serializeProfile(profile: SeccompProfile): string {
  return JSON.stringify(profile, null, '\t');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// The tracked worker profile as derived from the pinned upstream copy.
export function derivedWorkerProfile(upstreamText: string): string {
  if (sha256(upstreamText) !== UPSTREAM_SHA256) {
    throw new ProfileShapeError(`${UPSTREAM_PATH} is not the pinned upstream profile ${UPSTREAM_URL}`);
  }
  return serializeProfile(workerProfile(JSON.parse(upstreamText) as SeccompProfile));
}

export function checkProfiles(repository: string): void {
  const derived = derivedWorkerProfile(readFileSync(resolve(repository, UPSTREAM_PATH), 'utf8'));
  if (readFileSync(resolve(repository, WORKER_PATH), 'utf8') !== derived) {
    throw new ProfileShapeError(`${WORKER_PATH} differs from its derivation; run make worker-seccomp-profile`);
  }
}

export function writeProfile(repository: string): void {
  const derived = derivedWorkerProfile(readFileSync(resolve(repository, UPSTREAM_PATH), 'utf8'));
  writeFileSync(resolve(repository, WORKER_PATH), derived);
}

if (import.meta.main) {
  try {
    const [command, ...rest] = process.argv.slice(2);
    if (rest.length > 0 || (command !== 'check' && command !== 'write')) throw new ProfileShapeError(USAGE);
    if (command === 'check') checkProfiles(process.cwd());
    else writeProfile(process.cwd());
  } catch (error) {
    process.stderr.write(`worker-seccomp-profile: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
