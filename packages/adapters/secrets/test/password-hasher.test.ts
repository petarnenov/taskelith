import assert from 'node:assert/strict';
import test from 'node:test';
import { argon2, createHash } from 'node:crypto';
import type { PasswordHash } from '@taskelith/access';
import {
  ARGON2_MISSING,
  ARGON2ID_PARAMETERS,
  Argon2idPasswordHasher,
  argon2idTag,
  checkArgon2Available,
  formatPhc,
  HashSlots,
  NodeSecrets,
  parsePhc,
  type Argon2Function,
} from '@taskelith/secrets';
import { ok } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

const nodeArgon2 = argon2 as Argon2Function;

test('the argon2id computation reproduces the RFC 9106 section 5.3 vector', async () => {
  const tag = value(await argon2idTag(nodeArgon2, {
    message: Buffer.alloc(32, 0x01), nonce: Buffer.alloc(16, 0x02), secret: Buffer.alloc(8, 0x03), associatedData: Buffer.alloc(12, 0x04),
    parallelism: 4, tagLength: 32, memory: 32, passes: 3,
  }));
  assert.equal(tag.toString('hex'), '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
  const refused = { message: 'x', nonce: Buffer.alloc(4), parallelism: 1, tagLength: 32, memory: 8, passes: 1 };
  assert.equal(failed(await argon2idTag(nodeArgon2, refused)).code, 'internal');
  const failing: Argon2Function = (_algorithm, _parameters, callback) => callback(new Error('out of memory'), Buffer.alloc(0));
  assert.match(failed(await argon2idTag(failing, refused)).message, /out of memory/);
});

test('a PHC string round-trips and has the one exact form', () => {
  const hash = { parameters: ARGON2ID_PARAMETERS, salt: Buffer.alloc(16, 7), tag: Buffer.alloc(32, 9) };
  const text = formatPhc(hash);
  assert.equal(text, `$argon2id$v=19$m=19456,t=2,p=1$${Buffer.alloc(16, 7).toString('base64').replace(/=+$/, '')}$${Buffer.alloc(32, 9).toString('base64').replace(/=+$/, '')}`);
  assert.deepEqual(value(parsePhc(text)), hash);
});

test('hostile PHC strings are refused without naming their content', () => {
  const salt = Buffer.alloc(16, 7).toString('base64').replace(/=+$/, '');
  const tag = Buffer.alloc(32, 9).toString('base64').replace(/=+$/, '');
  const hostile = [
    '', 'argon2id', `$argon2i$v=19$m=19456,t=2,p=1$${salt}$${tag}`, `$argon2id$v=16$m=19456,t=2,p=1$${salt}$${tag}`,
    `$argon2id$v=19$m=19456,t=2$${salt}$${tag}`, `$argon2id$v=19$t=2,m=19456,p=1$${salt}$${tag}`,
    `$argon2id$v=19$m=19456,t=2,p=1,k=1$${salt}$${tag}`, `$argon2id$v=19$m=019456,t=2,p=1$${salt}$${tag}`,
    `$argon2id$v=19$m=999999999,t=2,p=1$${salt}$${tag}`, `$argon2id$v=19$m=19456,t=17,p=1$${salt}$${tag}`,
    `$argon2id$v=19$m=19456,t=2,p=17$${salt}$${tag}`, `$argon2id$v=19$m=8,t=2,p=2$${salt}$${tag}`,
    `$argon2id$v=19$m=19456,t=2,p=1$${salt}$${tag}$extra`, `$argon2id$v=19$m=19456,t=2,p=1$${salt}=$${tag}`,
    `$argon2id$v=19$m=19456,t=2,p=1$${salt}$${tag.slice(0, -1)}l`, `$argon2id$v=19$m=19456,t=2,p=1$AAAA$${tag}`,
    `$argon2id$v=19$m=19456,t=2,p=1$${salt}$AAAA`, `$argon2id$v=19$m=19456,t=2,p=1$${'A'.repeat(90)}$${tag}`,
    `$argon2id$v=19$m=19456,t=2,p=1$${salt}$${'A'.repeat(90)}`, `$argon2id$v=19$m=19456,t=2,p=1$sa-lt$${tag}`,
    `x$argon2id$v=19$m=19456,t=2,p=1$${salt}$${tag}`,
  ];
  for (const text of hostile) {
    const refused = failed(parsePhc(text));
    assert.deepEqual([refused.code, refused.details.field], ['invalid', 'passwordHash'], text);
    if (text.length > 16) assert.ok(!refused.message.includes(text), 'the message never repeats the stored value');
  }
});

// Weaker than the OWASP minimum, so tests stay fast; the code path is real.
const FAST = { memoryKib: 64, passes: 1, parallelism: 1 };

test('a password hash verifies its password only, in a fresh salt each time', async () => {
  const hasher = value(Argon2idPasswordHasher.create({ parameters: FAST }));
  const first = value(await hasher.hash('correct horse battery staple'));
  const second = value(await hasher.hash('correct horse battery staple'));
  assert.match(first, /^\$argon2id\$v=19\$m=64,t=1,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
  assert.notEqual(first, second);
  assert.deepEqual(value(await hasher.verify('correct horse battery staple', first)), { matches: true, rehashDue: false });
  assert.deepEqual(value(await hasher.verify('wrong horse battery staple', first)), { matches: false, rehashDue: false });
  assert.deepEqual(value(await hasher.verify('anything', undefined)), { matches: false, rehashDue: false }, 'the dummy never matches');
  assert.equal(failed(await hasher.verify('anything', 'not a hash' as PasswordHash)).code, 'internal');
});

test('a hash of weaker parameters, salt, or tag is due a rehash, only when it matches', async () => {
  const weak = value(Argon2idPasswordHasher.create({ parameters: FAST }));
  const strong = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 128, passes: 2, parallelism: 1 } }));
  const stored = value(await weak.hash('a long enough passphrase'));
  assert.deepEqual(value(await strong.verify('a long enough passphrase', stored)), { matches: true, rehashDue: true });
  assert.deepEqual(value(await strong.verify('another passphrase here', stored)), { matches: false, rehashDue: false });
  const parsed = value(parsePhc(stored));
  const tag = value(await argon2idTag(nodeArgon2, { message: 'pw-of-short-salt', nonce: Buffer.alloc(8, 1), parallelism: 1, tagLength: 16, memory: 64, passes: 1 }));
  const shortSalt = formatPhc({ parameters: parsed.parameters, salt: Buffer.alloc(8, 1), tag }) as PasswordHash;
  assert.deepEqual(value(await weak.verify('pw-of-short-salt', shortSalt)), { matches: true, rehashDue: true });
  const parallel = formatPhc({ ...parsed, parameters: { memoryKib: 64, passes: 1, parallelism: 2 } }) as PasswordHash;
  assert.equal(value(await value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 4 } })).verify('x', parallel)).matches, false);
});

// A clock that only the fake argon2id and the waits move: a computation
// costs its memory times its passes, in milliseconds.
function costedHasher(parameters: { memoryKib: number; passes: number; parallelism: number }) {
  const clock = { now: 0 };
  const argon2: Argon2Function = (_algorithm, input, callback) => {
    clock.now += input.memory * input.passes;
    const tag = createHash('sha256').update(String(input.message)).update(input.nonce as Buffer).update(String(input.memory)).digest();
    setImmediate(() => callback(null, tag.subarray(0, input.tagLength)));
  };
  const timing = { now: () => clock.now, wait: async (milliseconds: number) => { clock.now += milliseconds; } };
  return { hasher: value(Argon2idPasswordHasher.create({ argon2, parameters, timing })), clock };
}

test('an unknown name and a wrong password cost the same, for a current and a legacy hash', async () => {
  const legacy = costedHasher({ memoryKib: 32, passes: 1, parallelism: 1 }).hasher;
  const { hasher, clock } = costedHasher({ memoryKib: 64, passes: 2, parallelism: 1 });
  const current = value(await hasher.hash('a long enough passphrase'));
  const old = value(await legacy.hash('a long enough passphrase'));
  const cost = async (stored: PasswordHash | undefined, password = 'a wrong passphrase here') => {
    const started = clock.now;
    const verified = value(await hasher.verify(password, stored));
    return [verified.matches, clock.now - started];
  };
  const costs = [await cost(old), await cost(undefined), await cost(current)];
  assert.deepEqual(costs, [[false, 128], [false, 128], [false, 128]]);
  assert.deepEqual(await cost(old, 'a long enough passphrase'), [true, 32], 'a match is not padded');
  const fresh = costedHasher({ memoryKib: 64, passes: 2, parallelism: 1 });
  const before = fresh.clock.now;
  value(await fresh.hasher.verify('a wrong passphrase here', old));
  assert.equal(fresh.clock.now - before, 160, 'without a measured cost, a legacy failure also computes one');
});

test('the start check fails closed without crypto.argon2', () => {
  assert.deepEqual(failed(checkArgon2Available(undefined)), { code: 'precondition-failed', message: ARGON2_MISSING, details: {} });
  assert.equal(failed(Argon2idPasswordHasher.create({ argon2: undefined })).code, 'precondition-failed');
  assert.ok(Argon2idPasswordHasher.create().ok);
  assert.ok(checkArgon2Available(nodeArgon2).ok);
});

test('at most two hashes run and a bounded queue waits; beyond it a hash is unavailable', async () => {
  const slots = new HashSlots(2, 1);
  const releases: Array<() => void> = [];
  let running = 0;
  let peak = 0;
  const work = () => slots.run(async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise<void>((resolve) => releases.push(resolve));
    running -= 1;
    return ok('done');
  });
  const started = [work(), work(), work()];
  const refused = await work();
  assert.equal(failed(refused).code, 'unavailable');
  while (releases.length > 0) releases.shift()!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  while (releases.length > 0) releases.shift()!();
  assert.deepEqual((await Promise.all(started)).map((result) => value(result)), ['done', 'done', 'done']);
  assert.equal(peak, 2);
  const hasher = value(Argon2idPasswordHasher.create({ parameters: FAST, concurrent: 1, queued: 0 }));
  const [one, two] = await Promise.all([hasher.hash('first passphrase'), hasher.hash('second passphrase')]);
  assert.deepEqual([one.ok, failed(two).code], [true, 'unavailable']);
});

test('session tokens and principal identifiers have their contract shapes', () => {
  const secrets = new NodeSecrets();
  assert.match(secrets.sessionToken(), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(secrets.sessionToken(), secrets.sessionToken());
  assert.match(secrets.principalId(), /^u[0-9a-f]{32}$/);
});
