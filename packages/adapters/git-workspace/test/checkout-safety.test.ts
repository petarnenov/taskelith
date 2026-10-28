import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { failed, value } from '@taskelith/testing';
import { checkCheckoutSafety, repositoryConfigText, writeRepositoryConfig } from '@taskelith/git-workspace';
import { nativeGit } from './git-fixture.ts';

let scratch: string;
let checkout: string;
const owner = process.getuid!();

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'taskelith-checkout-'));
  checkout = join(scratch, 'checkout');
  await mkdir(checkout);
  await nativeGit(checkout, ['init', '--quiet', '--initial-branch=main']);
  await mkdir(join(checkout, 'src', 'deep'), { recursive: true });
  await writeFile(join(checkout, 'src', 'deep', 'file'), 'file\n');
  await writeFile(join(scratch, 'record'), 'control record\n');
});

afterEach(() => rm(scratch, { recursive: true, force: true }));

async function expectUnsafe(label: string, checked = checkout, as = owner): Promise<void> {
  const failure = failed(await checkCheckoutSafety(checked, as));
  assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', 'unsafe-checkout'], label);
}

test('a fresh clone with links in its working tree is safe', async () => {
  await symlink(join(scratch, 'record'), join(checkout, 'src', 'link'));
  value(await checkCheckoutSafety(checkout, owner));
});

const UNSAFE: readonly [string, () => Promise<unknown>][] = [
  ['a link in .git', () => symlink(join(scratch, 'record'), join(checkout, '.git', 'refs', 'linked'))],
  ['a missing .git', () => rm(join(checkout, '.git'), { recursive: true })],
  ['a gitfile at the top', async () => {
    await rm(join(checkout, '.git'), { recursive: true });
    await writeFile(join(checkout, '.git'), `gitdir: ${scratch}\n`);
  }],
  ['a linked .git', async () => {
    await rm(join(checkout, '.git'), { recursive: true });
    await symlink(scratch, join(checkout, '.git'));
  }],
  ['a commondir', () => writeFile(join(checkout, '.git', 'commondir'), '../other\n')],
  ['alternates', () => writeFile(join(checkout, '.git', 'objects', 'info', 'alternates'), '/elsewhere/objects\n')],
  ['a nested gitfile', () => writeFile(join(checkout, 'src', 'deep', '.git'), `gitdir: ${scratch}\n`)],
  ['a nested Git directory', () => mkdir(join(checkout, 'src', '.git'))],
];

for (const [label, plant] of UNSAFE) {
  test(`a checkout with ${label} is unsafe`, async () => {
    await plant();
    await expectUnsafe(label);
  });
}

const NOT_UTF8 = { skip: process.platform === 'darwin' ? 'APFS refuses names that are not UTF-8' : false };
const named = (...parts: (string | number[])[]) => Buffer.concat(parts.map((part) => Buffer.from(part)));

test('directories whose names are not UTF-8 are walked by their bytes', NOT_UTF8, async () => {
  const directory = named(checkout, '/', [0x6e, 0xff]);
  await mkdir(directory);
  await writeFile(named(directory, '/file'), 'file\n');
  value(await checkCheckoutSafety(checkout, owner));
  await writeFile(named(directory, '/.git'), `gitdir: ${scratch}\n`);
  await expectUnsafe('a gitfile below a name that is not UTF-8');
  await rm(named(directory, '/.git'));
  const refs = named(checkout, '/.git/refs/', [0xfe]);
  await mkdir(refs);
  await symlink(join(scratch, 'record'), named(refs, '/linked'));
  await expectUnsafe('a link in .git below a name that is not UTF-8');
});

test('a checkout of another owner, or one that is a link, is unsafe', async () => {
  await expectUnsafe('another owner', checkout, owner + 1);
  await symlink(checkout, join(scratch, 'linked-checkout'));
  await expectUnsafe('a linked checkout', join(scratch, 'linked-checkout'));
  await expectUnsafe('an absent checkout', join(scratch, 'absent'));
});

test('the repository configuration holds the format only and is valid for git config', async () => {
  assert.equal(repositoryConfigText('sha1'), '[core]\n\trepositoryformatversion = 0\n');
  assert.equal(repositoryConfigText('sha256'), '[core]\n\trepositoryformatversion = 1\n[extensions]\n\tobjectformat = sha256\n');
  for (const format of ['sha1', 'sha256'] as const) {
    await writeFile(join(scratch, format), repositoryConfigText(format));
    const listed = (await nativeGit(scratch, ['config', '--file', join(scratch, format), '--list'])).toString('utf8');
    assert.match(listed, /^core\.repositoryformatversion=[01]\n/);
  }
});

test('the rewrite replaces planted settings and never writes through a link', async () => {
  const config = join(checkout, '.git', 'config');
  await nativeGit(checkout, ['config', '--file', config, '--add', 'core.hooksPath', '/planted']);
  await writeRepositoryConfig(checkout, 'sha1');
  assert.equal(await readFile(config, 'utf8'), repositoryConfigText('sha1'));
  await rm(config);
  await symlink(join(scratch, 'record'), config);
  await writeRepositoryConfig(checkout, 'sha1');
  await rm(config);
  await link(join(scratch, 'record'), config);
  await writeRepositoryConfig(checkout, 'sha1');
  assert.equal(await readFile(join(scratch, 'record'), 'utf8'), 'control record\n');
  assert.equal(await readFile(config, 'utf8'), repositoryConfigText('sha1'));
  assert.deepEqual((await readdir(join(checkout, '.git'))).filter((entry) => entry.startsWith('config')), ['config']);
});
