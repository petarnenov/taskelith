import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccount, createOperator, createUser } from '@nats-io/nkeys';
import { NodeSecrets, REDACTED, SecretOutputRedactor, redactSecrets } from '@taskelith/secrets';

const BOUND = 65_536;
const redactor = new SecretOutputRedactor();
const NOTHING = { text: '', continuation: 'none' } as const;

// The stored output of one turn written in these chunks: every release,
// then the held tail's release at the turn's end.
function turnOutput(chunks: readonly string[], bound = BOUND): string {
  let held: { text: string; continuation: 'none' | 'word' | 'block' } = { ...NOTHING };
  let stored = '';
  for (const chunk of chunks) {
    const split = redactor.split(held, chunk, bound);
    stored += split.released;
    held = { ...split.held };
  }
  return stored + redactor.release(held);
}

const seedOf = (seed: Uint8Array) => new TextDecoder().decode(seed);
// Markers assembled so that no tracked file holds a private key.
const pem = (type: string) => [`-----BEGIN ${type}-----`, 'MHcCAQEEIBexampleKeyBody0123', 'AwEHoUQDQgAEexampleLine2', `-----END ${type}-----`].join('\n');
const JWT = ['eyJ0eXAiOiJKV1QifQ', 'eyJzdWIiOiJVIn0', 'c2lnbmF0dXJl'].join('.');
const secrets = new NodeSecrets();
const CREDS = [
  '-----BEGIN NATS USER JWT-----', JWT, '------END NATS USER JWT------', '', '-----BEGIN USER NKEY SEED-----', seedOf(createUser().getSeed()),
  '------END USER NKEY SEED------',
].join('\n');

// Each shape of trust model 5 and a URL's user information, with the part
// that must never be stored; an empty user information has none.
const SHAPES: readonly { name: string; text: string; secret: string }[] = [
  { name: 'URL user information', text: 'clone https://bot:hunter2pass@example.com/repo now', secret: 'bot:hunter2pass' },
  { name: 'empty URL user information', text: 'clone https://@example.com/repo now', secret: '' },
  ...['PRIVATE KEY', 'EC PRIVATE KEY', 'ENCRYPTED PRIVATE KEY'].map((type) => ({ name: `PEM ${type}`, text: `key:\n${pem(type)}\nend`, secret: pem(type) })),
  ...(['operator', 'enrollment', 'worker'] as const).map((kind) => {
    const secret = secrets.issue(kind).secret;
    return { name: `issued ${kind} secret`, text: `token ${secret} done`, secret };
  }),
  ...[createOperator(), createAccount(), createUser()].map((pair) => {
    const seed = seedOf(pair.getSeed());
    return { name: `NKey seed ${seed.slice(0, 2)}`, text: `seed ${seed} done`, secret: seed };
  }),
  { name: '.creds block', text: `creds:\n${CREDS}\nend`, secret: CREDS },
  { name: 'JWT', text: `bearer x${JWT} done`, secret: JWT },
];

function assertNoPart(stored: string, secret: string, label: string): void {
  for (let start = 0; start + 4 <= secret.length; start += 1) {
    assert.equal(stored.includes(secret.slice(start, start + 4)), false, `${label}: holds ${JSON.stringify(secret.slice(start, start + 4))}`);
  }
}

for (const shape of SHAPES) {
  const whole = redactSecrets(shape.text);

  test(`a ${shape.name} split at every offset across two chunks is stored as the redaction of the whole text`, () => {
    for (let cut = 0; cut <= shape.text.length; cut += 1) {
      const stored = turnOutput([shape.text.slice(0, cut), shape.text.slice(cut)]);
      assert.equal(stored, whole, `cut ${cut}`);
      assertNoPart(stored, shape.secret, `cut ${cut}`);
    }
  });

  test(`a ${shape.name} split at every pair of offsets across three chunks is stored as the redaction of the whole text`, () => {
    for (let first = 0; first <= shape.text.length; first += 1) {
      for (let second = first; second <= shape.text.length; second += 1) {
        const chunks = [shape.text.slice(0, first), shape.text.slice(first, second), shape.text.slice(second)];
        assert.equal(turnOutput(chunks), whole, `cuts ${first} and ${second}`);
      }
    }
  });
}

test('a run of non-whitespace characters held at exactly the bound releases nothing of it', () => {
  const split = redactor.split(NOTHING, `ok ${'x'.repeat(BOUND)}`, BOUND);
  assert.deepEqual([split.released, split.held], ['ok ', { text: 'x'.repeat(BOUND), continuation: 'none' }]);
});

test('a run one unit past the bound is recorded as one marker, and its continuation up to the next whitespace is dropped', () => {
  const split = redactor.split({ text: 'x'.repeat(BOUND), continuation: 'none' }, 'y', BOUND);
  assert.deepEqual([split.released, split.held.continuation], [REDACTED, 'word']);
  assert.equal(turnOutput([`a ${'x'.repeat(BOUND)}`, 'yy', 'zz more\n']), `a ${REDACTED} more\n`);
});

test('a JWT across the forced cut of a run longer than the bound leaves no part of it in any release', () => {
  const run = `${'x'.repeat(BOUND - 10)}${JWT}`;
  const stored = turnOutput([`before ${run.slice(0, BOUND + 10)}`, `${run.slice(BOUND + 10)} after`]);
  assert.equal(stored, `before ${REDACTED} after`);
  assertNoPart(stored, JWT, 'forced cut');
});

test('a PEM key longer than the bound is one marker up to its end marker, and the text after it is released', () => {
  const body = 'A'.repeat(64).concat('\n').repeat(1_500);
  const [begin, end] = ['-----BEGIN RSA PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----'];
  const key = `${begin}\n${body}${end}`;
  const chunks = [`before ${key.slice(0, 40_000)}`, key.slice(40_000, 75_000), key.slice(75_000, key.length - 10), `${key.slice(-10)}\nafter\n`];
  const stored = turnOutput(chunks);
  assert.equal(stored, `before ${REDACTED}\nafter\n`);
});

test('a run past the bound that ends in a begin marker\'s first word drops the block that follows up to its end', () => {
  const end = '-----END EC PRIVATE KEY-----';
  const stored = turnOutput([`${'x'.repeat(BOUND)}-----BEGIN`, ` EC PRIVATE KEY-----\nMHcCAQEEIBsecretBody\n${end.slice(0, 12)}`, `${end.slice(12)}\nafter\n`]);
  assert.equal(stored, `${REDACTED}\nafter\n`);
});

test('a block whose end marker never comes stays dropped up to the turn\'s end', () => {
  const stored = turnOutput([`${'-----BEGIN PRIVATE KEY-----'}\n${'B'.repeat(BOUND)}`, ' more text', ' -----END']);
  assert.equal(stored, REDACTED);
});
