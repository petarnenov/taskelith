// Writes the test broker trust for the integration services: an operator,
// a system account, one account, and the test users' `.creds` files.
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAccount, createOperator, createUser, type KeyPair } from '@nats-io/nkeys';
import { accountJwt, credsFile, operatorJwt, userJwt, type UserPermissions } from '../packages/adapters/nats/src/broker-jwt.ts';

const directory = process.argv[2];
if (!directory) throw new Error('usage: integration-broker.ts DIRECTORY');
const now = Math.floor(Date.now() / 1000);
const seed = (pair: KeyPair) => new TextDecoder().decode(pair.getSeed());
const operator = createOperator();
const system = createAccount();
const account = createAccount();

function write(name: string, content: string): void {
  writeFileSync(join(directory!, name), content, { mode: 0o600 });
  chmodSync(join(directory!, name), 0o600);
}

function user(issuer: KeyPair, name: string, permissions?: UserPermissions): void {
  const pair = createUser();
  write(`${name}.creds`, credsFile(userJwt(issuer, pair.getPublicKey(), name, now, permissions), pair.getSeed()));
}

// The keys in the shape of BrokerAuthorityKeys, so that tests can issue and
// revoke users as the control plane does.
write('authority.json', JSON.stringify({ operatorSeed: seed(operator), systemAccountSeed: seed(system), accountSeed: seed(account) }));
write('authority.conf', [
  `operator: "${operatorJwt(operator, 'taskelith-test', system.getPublicKey(), now)}"`,
  `system_account: ${system.getPublicKey()}`,
  'resolver: { type: full, dir: "/data/jwt", allow_delete: false, interval: "2m", timeout: "5s" }',
  'resolver_preload: {',
  `  ${system.getPublicKey()}: "${accountJwt(operator, system.getPublicKey(), 'SYS', now, { jetstream: false })}"`,
  `  ${account.getPublicKey()}: "${accountJwt(operator, account.getPublicKey(), 'TASKELITH', now, { jetstream: true })}"`,
  '}',
  '',
].join('\n'));
user(account, 'integration');
user(system, 'system', { publish: ['$SYS.REQ.CLAIMS.UPDATE', '$SYS.REQ.ACCOUNT.*.CLAIMS.LOOKUP'], subscribe: ['_INBOX.>'] });
// The JetStream spike's static users (item 2), now with the same permissions
// in user JWTs.
for (const worker of ['worker-a', 'worker-b']) {
  user(account, worker, {
    publish: [
      `$JS.API.CONSUMER.INFO.SPIKE_CMD.${worker}`,
      `$JS.API.CONSUMER.MSG.NEXT.SPIKE_CMD.${worker}`,
      `$JS.ACK.SPIKE_CMD.${worker}.>`,
      `spike.obs.${worker}`,
    ],
    subscribe: [`_INBOX.${worker}.>`],
  });
}
