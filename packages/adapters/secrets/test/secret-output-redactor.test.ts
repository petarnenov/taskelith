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
const SHAPES: readonly { name: string; text: string; secret: string; parts?: readonly string[] }[] = [
  { name: 'URL user information', text: 'clone https://bot:hunter2pass@example.com/repo now', secret: 'bot:hunter2pass' },
  { name: 'URL user name', text: 'clone https://user@example.com/repo now', secret: 'user' },
  { name: 'empty URL user information', text: 'clone https://@example.com/repo now', secret: '' },
  ...['PRIVATE KEY', 'EC PRIVATE KEY', 'ENCRYPTED PRIVATE KEY'].map((type) => ({
    name: `PEM ${type}`, text: `key:\n${pem(type)}\nend`, secret: pem(type), parts: pem(type).split('\n').slice(1, -1),
  })),
  ...(['operator', 'enrollment', 'worker'] as const).map((kind) => {
    const secret = secrets.issue(kind).secret;
    return { name: `issued ${kind} secret`, text: `token ${secret} ok`, secret };
  }),
  ...[createOperator(), createAccount(), createUser()].map((pair) => {
    const seed = seedOf(pair.getSeed());
    return { name: `NKey seed ${seed.slice(0, 2)}`, text: `seed ${seed} ok`, secret: seed };
  }),
  { name: '.creds block', text: `creds:\n${CREDS}\nend`, secret: CREDS, parts: [JWT, CREDS.split('\n')[5]!] },
  { name: 'JWT', text: `bearer x${JWT} ok`, secret: JWT },
];

function assertNoPart(stored: string, secret: string, label: string): void {
  for (let start = 0; start + 4 <= secret.length; start += 1) {
    assert.equal(stored.includes(secret.slice(start, start + 4)), false, `${label}: holds ${JSON.stringify(secret.slice(start, start + 4))}`);
  }
}

// What a match of each shape may begin with, so a run that ends in one of
// them may be a cut secret; and URL user information after its scheme.
const SHAPE_BEGINNINGS = [
  /^e(?:y(?:J[\w-]*(?:\.[\w-]*){0,2})?)?$/, /^t(?:k(?:o(?:p(?:_[\w-]*)?)?|e(?:n(?:_[\w-]*)?)?|w(?:k(?:_[\w-]*)?)?)?)?$/,
  /^S(?:[OAU][A-Z2-7]{0,55})?$/,
];
const USERINFO_SO_FAR = /[\w+.-]:\/\/([^\s/?#@]+)$/;
const BLOCKS = [
  { begin: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, end: /-----END [A-Z0-9 ]*PRIVATE KEY-----/ },
  { begin: /-----BEGIN NATS USER JWT-----/, end: /------END USER NKEY SEED------/ },
];

function openBlockStart(text: string): number | undefined {
  const starts = BLOCKS.map(({ begin, end }) => ({ at: text.search(begin), end })).filter(({ at, end }) => at !== -1 && !end.test(text.slice(at)));
  return starts.length === 0 ? undefined : Math.min(...starts.map(({ at }) => at));
}

// The stored output of a turn that ends after `text`: an open block is one
// marker, and so is the run from its earliest start of a possible secret.
function expectedTurnEnd(text: string): string {
  const blockStart = openBlockStart(text);
  if (blockStart !== undefined) return redactSecrets(text.slice(0, blockStart)) + REDACTED;
  const whole = redactSecrets(text);
  const runFrom = whole.search(/\S*$/);
  const starts = Array.from({ length: whole.length - runFrom }, (_, offset) => runFrom + offset)
    .filter((start) => SHAPE_BEGINNINGS.some((beginning) => beginning.test(whole.slice(start))));
  const userinfo = USERINFO_SO_FAR.exec(whole.slice(runFrom));
  if (userinfo !== null) starts.push(whole.length - userinfo[1]!.length);
  return starts.length === 0 ? whole : whole.slice(0, Math.min(...starts)) + REDACTED;
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

  test(`a turn that ends at any offset of a ${shape.name}, in one or two chunks, stores the run that may be a secret as one marker`, () => {
    for (let cut = 0; cut <= shape.text.length; cut += 1) {
      const expected = expectedTurnEnd(shape.text.slice(0, cut));
      for (let first = 0; first <= cut; first += 1) {
        const stored = turnOutput([shape.text.slice(0, first), shape.text.slice(first, cut)]);
        assert.equal(stored, expected, `cuts ${first} and ${cut}`);
        for (const part of shape.parts ?? [shape.secret]) assertNoPart(stored, part, `cuts ${first} and ${cut}`);
      }
    }
  });
}

test('a turn that ends in a cut JWT, issued secret, seed, or URL user information stores it as one marker', () => {
  const seed = seedOf(createUser().getSeed());
  const ends = [
    ['token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiO', 'token '], ['a x.y.eyJa.b', 'a x.y.'], ['token tkop', 'token '], ['id tkwk_abc', 'id '],
    [`seed ${seed.slice(0, 20)}`, 'seed '], ['clone https://bot:hunter', 'clone https://'], ['clone https://bot:', 'clone https://'],
    ['clone https://bot', 'clone https://'],
  ];
  for (const [text, kept] of ends) assert.equal(turnOutput([text!]), `${kept}${REDACTED}`, text);
});

test('a turn that ends in a cut URL user name, split at every offset, stores it as one marker', () => {
  const text = 'clone https://bot';
  for (let cut = 0; cut <= text.length; cut += 1) {
    assert.equal(turnOutput([text.slice(0, cut), text.slice(cut)]), `clone https://${REDACTED}`, `cut ${cut}`);
  }
});

// A host at a turn's end may be a user name cut before its `@`, so it is
// redacted too: over-redaction accepted (13d design, decision 1).
test('a turn that ends in a host redacts it as a possible user name', () => {
  assert.equal(turnOutput(['see https://example.com']), `see https://${REDACTED}`);
});

test('a turn that ends in a word no shape begins with, a URL with a path, or a closed JWT keeps or redacts it as the whole text does', () => {
  for (const text of ['ok', 'tok', 'eyJ0.eyJ1.c2ln', 'see https://example.com/']) {
    assert.equal(turnOutput([text]), redactSecrets(text), text);
  }
});

// `SO` or `done` may be a seed or a JWT cut after its first characters, so
// they are redacted too: over-redaction accepted (13d design, decision 1).
test('a turn that ends in a non-empty prefix of a shape\'s head stores the prefix as one marker', () => {
  const heads = ['e', 'ey', 'eyJ', 't', 'tk', 'tko', 'tkop', 'tke', 'tken', 'tkw', 'tkwk', 'S', 'SO', 'SA', 'SU'];
  for (const head of heads) assert.equal(turnOutput([`a ${head}`]), `a ${REDACTED}`, head);
  assert.deepEqual(['done', 'SO', 'eyJx'].map((text) => turnOutput([text])), [`don${REDACTED}`, REDACTED, REDACTED]);
});

test('a run one character past the head of every shape is kept at a turn\'s end, while one character of a head is a marker', () => {
  for (const kept of ['ez', 'eyz', 'tz', 'tkz', 'tkoz', 'tkopz', 'tkenz', 'tkwkz', 'Sz', 'SOz', 'SAz', 'SUz']) {
    assert.equal(turnOutput([`a ${kept}`]), `a ${kept}`, kept);
  }
  for (const marker of ['e', 't', 'S']) assert.equal(turnOutput([`a z${marker}`]), `a z${REDACTED}`, marker);
});

// A `.creds` block's or PEM key's end marker, assembled for the tests.
const CREDS_END = '------END USER NKEY SEED------';
const PEM_END = ['-----END', 'RSA PRIVATE KEY-----'].join(' ');
const PEM_BEGIN = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');

test('a .creds block cut past the bound ends at its own end marker, not at a PEM key\'s', () => {
  const chunks = [`creds:\n${CREDS.split('\n')[0]}\n${'A'.repeat(BOUND)}`, `\n${PEM_END}\nplainSecretBody\n${CREDS_END}\nafter\n`];
  assert.equal(turnOutput(chunks), `creds:\n${REDACTED}\nafter\n`);
});

test('a PEM key cut past the bound ends at its own end marker, not at a .creds block\'s', () => {
  const chunks = [`key:\n${PEM_BEGIN}\n${'A'.repeat(BOUND)}`, `\n${CREDS_END}\nplainSecretBody\n${PEM_END}\nafter\n`];
  assert.equal(turnOutput(chunks), `key:\n${REDACTED}\nafter\n`);
});

test('a PEM key opened inside a .creds block cut past the bound keeps the block open past the key\'s end', () => {
  const chunks = [`${CREDS.split('\n')[0]}\n${'A'.repeat(BOUND)}\n${PEM_BEGIN.slice(0, 14)}`, `${PEM_BEGIN.slice(14)}\nkey\n${CREDS_END}\n`];
  const rest = [`${PEM_END}\nplainSecretBody\n${CREDS_END}\nafter\n`];
  assert.equal(turnOutput([...chunks, ...rest]), `${REDACTED}\nafter\n`);
});

test('a begin marker cut after a space past the bound opens the block of the kind it completes to', () => {
  const run = `${'x'.repeat(BOUND)}${CREDS.split('\n')[0]}`;
  const chunks = [`a ${run.slice(0, BOUND + 15)}`, `${run.slice(BOUND + 15)}\n${PEM_END}\nplainSecretBody\n${CREDS_END}\nafter\n`];
  assert.equal(turnOutput(chunks), `a ${REDACTED}\nafter\n`);
});

test('a begin marker cut after a space past the bound that completes to no block drops only its run', () => {
  const chunks = [`a ${'x'.repeat(BOUND)}-----BEGIN CERT`, 'IFICATE-----\nbody\n'];
  assert.equal(turnOutput(chunks), `a ${REDACTED}\nbody\n`);
});

test('a block continuation restored from its stored JSON still ends only at its own end marker', () => {
  const first = redactor.split(NOTHING, `${PEM_BEGIN}\n${'A'.repeat(BOUND)}`, BOUND);
  const restored = JSON.parse(JSON.stringify(first.held)) as typeof first.held;
  const second = redactor.split(restored, `\n${CREDS_END}\nplainSecretBody\n${PEM_END}\nafter\n`, BOUND);
  assert.deepEqual([first.released, second.released, second.held], [REDACTED, '\nafter\n', NOTHING]);
});

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

const CREDS_BEGIN = CREDS.split('\n')[0]!;
const pemBegin = (type: string) => ['-----BEGIN', `${type}PRIVATE KEY-----`].join(' ');
const pemEnd = (type: string) => ['-----END', `${type}PRIVATE KEY-----`].join(' ');

test('a key begun inside a .creds block whose context passes the bound still ends only at the key\'s end marker', () => {
  const chunks = [
    `${CREDS_BEGIN}\n${'x'.repeat(65_500)}`, 'x'.repeat(100), `-----BEGIN ${'A'.repeat(65_500)}`,
    ` PRIVATE KEY-----\n${CREDS_END}\nLEAK_BODY\n${pemEnd('')}\n`,
  ];
  assert.equal(turnOutput(chunks), REDACTED);
  assert.equal(turnOutput([...chunks, `${CREDS_END}\nafter\n`]), `${REDACTED}\nafter\n`);
});

test('a .creds begin marker cut inside a key whose end marker passes the bound counts for nothing', () => {
  const chunks = [
    `${pemBegin('')}\n${'x'.repeat(65_500)}\n`, `-----END ${'A'.repeat(65_500)}`, ` PRIVATE KEY-----\n${CREDS_BEGIN.slice(0, 15)}`,
    `${CREDS_BEGIN.slice(15)}\nLEAK_BODY\n${CREDS_END}\n${pemEnd('')}\nafter\n`,
  ];
  assert.equal(turnOutput(chunks), `${REDACTED}\nafter\n`);
});

// Nested blocks whose bodies hold only q, z, j, w, and the heads of shapes;
// a long type passes the small bound while its marker is cut.
const SMALL_BOUND = 64;
const LONG_TYPE = `${'A'.repeat(40)} `;
const NESTED = [
  { name: 'a key inside a .creds block', text: `a\n${CREDS_BEGIN}\nqzjw\n${pemBegin('EC ')}\nqzjw eyJqzjw\n${CREDS_END}\ntkop_qzjw\n${pemEnd('EC ')}\nqzjw\n${CREDS_END}\nok\n` },
  { name: 'a long-typed key inside a .creds block', text: `a\n${CREDS_BEGIN}\nqzjw\n${pemBegin(LONG_TYPE)}\nqzjw\n${CREDS_END}\neyJqzjw\n${pemEnd('')}\nqzjw\n${CREDS_END}\nok\n` },
  { name: 'a .creds block inside a key', text: `a\n${pemBegin('')}\nqzjw\n${CREDS_BEGIN}\nqzjw\n${CREDS_END}\ntkop_qzjw\n${pemEnd('')}\nok\n` },
  { name: 'a .creds block inside a long-typed key', text: `a\n${pemBegin(LONG_TYPE)}\nqzjw\n${CREDS_BEGIN}\neyJqzjw\n${CREDS_END}\nqzjw\n${pemEnd(LONG_TYPE)}\nok\n` },
  { name: 'a .creds block after a key with a long end type', text: `a\n${pemBegin('')}\nqzjw\n${pemEnd(LONG_TYPE)}\n${CREDS_BEGIN}\ntkop_qzjw\n${CREDS_END}\nok\n` },
];

function assertNoBody(stored: string, label: string): void {
  assert.equal(/[qzjw]|eyJ|tkop/.test(stored), false, `${label}: ${JSON.stringify(stored)}`);
}

for (const nested of NESTED) {
  test(`${nested.name}, split at every offset into two and three chunks, releases no body byte past a small bound`, () => {
    const { text } = nested;
    for (let first = 0; first <= text.length; first += 1) {
      assertNoBody(turnOutput([text.slice(0, first), text.slice(first)], SMALL_BOUND), `cut ${first}`);
      for (let second = first; second <= text.length; second += 1) {
        const chunks = [text.slice(0, first), text.slice(first, second), text.slice(second)];
        assertNoBody(turnOutput(chunks, SMALL_BOUND), `cuts ${first} and ${second}`);
      }
    }
  });
}
