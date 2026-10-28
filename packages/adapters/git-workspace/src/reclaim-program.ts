import { randomBytes } from 'node:crypto';
import { constants, writeFileSync, type Stats } from 'node:fs';
import { chmod, lstat, open, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// The account the reclaim program switches to inside its containment.
export interface ExecutionAccount {
  readonly uid: number;
  readonly gid: number;
}

export interface ReclaimArguments {
  readonly checkout: string;
  // How long the program waits for `go` before it exits without a change.
  readonly goWithinMs: number;
  // The cgroup to enter as root before switching to `account`; Linux only.
  readonly containment?: { readonly cgroup: string; readonly account: ExecutionAccount };
}

// The word the worker writes once the hand-off record names the program's
// containment; without it the program changes nothing.
export const RECLAIM_GO = 'go\n';

// Written once the program is in its containment as its account; the
// worker records the containment only after it.
export const RECLAIM_READY = 'ready\n';

// Exit codes: 0 done, 1 failed, 2 usage, 3 abandoned before `go`.
export const RECLAIM_EXIT = Object.freeze({ done: 0, failed: 1, usage: 2, abandoned: 3 });

// The window for `go` (contract section 3); `--go-within-ms` sets another.
export const RECLAIM_GO_BOUND_MS = 60_000;

const DIRECTORY_MODE = 0o2770;
const COPY_PREFIX = '.taskelith-reclaim-';

export function parseReclaimArguments(argv: readonly string[]): Result<ReclaimArguments> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, text] = [argv[index]!, argv[index + 1]];
    if (!RECLAIM_FLAGS.includes(flag) || text === undefined || options.has(flag)) return usage();
    options.set(flag, text);
  }
  const checkout = options.get('--checkout');
  const goWithinMs = Number(options.get('--go-within-ms') ?? RECLAIM_GO_BOUND_MS);
  if (checkout === undefined || !checkout.startsWith('/') || !isPositiveInteger(goWithinMs)) return usage();
  const [cgroup, uid, gid] = ['--cgroup', '--uid', '--gid'].map((flag) => options.get(flag));
  if (cgroup === undefined && uid === undefined && gid === undefined) return ok({ checkout, goWithinMs });
  const account = { uid: Number(uid), gid: Number(gid) };
  const valid = cgroup?.startsWith('/') && [account.uid, account.gid].every(isPositiveInteger);
  return valid ? ok({ checkout, goWithinMs, containment: { cgroup: cgroup!, account } }) : usage();
}

const RECLAIM_FLAGS = ['--checkout', '--cgroup', '--uid', '--gid', '--go-within-ms'];

const isPositiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

function usage(): Result<never> {
  return err(failure('invalid', 'usage: reclaim --checkout PATH [--cgroup PATH --uid N --gid N] [--go-within-ms N]'));
}

// As root: joins the cgroup, then drops to the account for good, without
// a supplementary group (contract section 2).
export function enterReclaimContainment({ cgroup, account }: { cgroup: string; account: ExecutionAccount }): void {
  writeFileSync(join(cgroup, 'cgroup.procs'), String(process.pid));
  process.setgroups!([]);
  process.setgid!(account.gid);
  process.setuid!(account.uid);
}

// True once the input carries `go`; false at its end without it, which a
// dead worker causes, or once `withinMs` passes.
export function receivedGo(input: NodeJS.ReadableStream, withinMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let received = '';
    const settle = (go: boolean) => {
      clearTimeout(deadline);
      resolve(go);
    };
    const deadline = setTimeout(() => settle(false), withinMs);
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => {
      received += chunk;
      if (received.startsWith(RECLAIM_GO)) settle(true);
    });
    input.on('end', () => settle(received.startsWith(RECLAIM_GO)));
    input.on('error', () => settle(false));
  });
}

// Reads `go` from `input` and signals readiness on `output`.
export async function runReclaimProgram(argv: readonly string[], input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<number> {
  const parsed = parseReclaimArguments(argv);
  if (!parsed.ok) return RECLAIM_EXIT.usage;
  try {
    if (parsed.value.containment !== undefined) enterReclaimContainment(parsed.value.containment);
    output.write(RECLAIM_READY);
    if (!(await receivedGo(input, parsed.value.goWithinMs))) return RECLAIM_EXIT.abandoned;
    await normalizeCheckout(parsed.value.checkout, process.getuid!());
    return RECLAIM_EXIT.done;
  } catch {
    return RECLAIM_EXIT.failed;
  }
}

// Below the checkout, without following a link: copies each regular file
// with another hard link and sets exact shared modes on what `owner` owns.
export async function normalizeCheckout(checkout: string, owner: number): Promise<void> {
  for (const name of await readdir(checkout)) {
    const path = join(checkout, name);
    const status = await lstat(path);
    if (status.isSymbolicLink()) continue;
    if (status.isDirectory()) {
      if (status.uid === owner) await chmod(path, DIRECTORY_MODE);
      await normalizeCheckout(path, owner);
      continue;
    }
    const mode = sharedMode(status.mode);
    if (status.uid === owner) await chmod(path, mode);
    if (status.isFile() && status.nlink > 1) await replaceWithCopy(path, status, mode);
  }
}

// Read and write for the owner and the group, executable if the owner was.
export function sharedMode(mode: number): number {
  return (mode & 0o100) === 0 ? 0o660 : 0o770;
}

// The copy gets a fresh name, created exclusively, so no entry of the
// agent is written through; the source must still be the file seen.
async function replaceWithCopy(path: string, seen: Stats, mode: number): Promise<void> {
  const source = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let content: Buffer;
  try {
    const opened = await source.stat();
    if (!opened.isFile() || opened.ino !== seen.ino || opened.dev !== seen.dev) throw new Error(`${path} changed`);
    content = await source.readFile();
  } finally {
    await source.close();
  }
  const copyPath = join(path, '..', `${COPY_PREFIX}${randomBytes(8).toString('hex')}`);
  const copy = await open(copyPath, 'wx', mode);
  try {
    await copy.writeFile(content);
    await copy.chmod(mode);
  } catch (error) {
    await rm(copyPath, { force: true });
    throw error;
  } finally {
    await copy.close();
  }
  await rename(copyPath, path);
}
