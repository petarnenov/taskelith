import { createAccount, createOperator, createUser, fromSeed, type KeyPair } from '@nats-io/nkeys';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { accountJwt, credsFile, operatorJwt, userJwt, type ClaimTime, type UserPermissions } from './broker-jwt.js';

// The seeds of an installation's broker trust; they stay in the control
// plane's data namespace and never reach a worker.
export interface BrokerAuthorityKeys {
  readonly operatorSeed: string;
  readonly systemAccountSeed: string;
  readonly accountSeed: string;
}

export interface IssuedUser {
  readonly creds: string;
  readonly userKey: string;
}

const RESOLVER_DIRECTORY = '/data/jwt';

// One operator, a system account for claims updates, and one account that
// holds the installation's streams and users (decisions D9 (a), O2 (a)).
export class BrokerAuthority {
  readonly #operator: KeyPair;
  readonly #systemAccount: KeyPair;
  readonly #account: KeyPair;

  private constructor(operator: KeyPair, systemAccount: KeyPair, account: KeyPair) {
    this.#operator = operator;
    this.#systemAccount = systemAccount;
    this.#account = account;
  }

  static generate(): BrokerAuthority {
    return new BrokerAuthority(createOperator(), createAccount(), createAccount());
  }

  static fromKeys(keys: BrokerAuthorityKeys): Result<BrokerAuthority> {
    try {
      const pair = (seed: string) => fromSeed(new TextEncoder().encode(seed));
      return ok(new BrokerAuthority(pair(keys.operatorSeed), pair(keys.systemAccountSeed), pair(keys.accountSeed)));
    } catch (error) {
      return err(failure('invalid', 'the broker authority keys are not NKey seeds', { cause: (error as Error).message }));
    }
  }

  get keys(): BrokerAuthorityKeys {
    const text = (pair: KeyPair) => new TextDecoder().decode(pair.getSeed());
    return { operatorSeed: text(this.#operator), systemAccountSeed: text(this.#systemAccount), accountSeed: text(this.#account) };
  }

  get accountKey(): string {
    return this.#account.getPublicKey();
  }

  // The trust part of a nats-server configuration: the operator, the system
  // account, and the full resolver preloaded with both accounts.
  serverConfig(now: ClaimTime): string {
    const system = this.#systemAccount.getPublicKey();
    return [
      `operator: "${operatorJwt(this.#operator, 'taskelith', system, now)}"`,
      `system_account: ${system}`,
      `resolver: { type: full, dir: "${RESOLVER_DIRECTORY}", allow_delete: false, interval: "2m", timeout: "5s" }`,
      'resolver_preload: {',
      `  ${system}: "${accountJwt(this.#operator, system, 'SYS', now, { jetstream: false })}"`,
      `  ${this.accountKey}: "${this.accountJwt(now, {})}"`,
      '}',
      '',
    ].join('\n');
  }

  accountJwt(now: ClaimTime, revocations: Readonly<Record<string, ClaimTime>>): string {
    return accountJwt(this.#operator, this.accountKey, 'TASKELITH', now, { jetstream: true, revocations });
  }

  // A user of the installation account; without permissions it may use
  // every subject, as the control plane does.
  user(name: string, now: ClaimTime, permissions?: UserPermissions): IssuedUser {
    const user = createUser();
    return { creds: credsFile(userJwt(this.#account, user.getPublicKey(), name, now, permissions), user.getSeed()), userKey: user.getPublicKey() };
  }

  // A user of the system account, for claims updates and lookups only.
  systemUser(now: ClaimTime): IssuedUser {
    const user = createUser();
    const permissions = { publish: ['$SYS.REQ.CLAIMS.UPDATE', '$SYS.REQ.ACCOUNT.*.CLAIMS.LOOKUP'], subscribe: ['_INBOX.>'] };
    return { creds: credsFile(userJwt(this.#systemAccount, user.getPublicKey(), 'claims', now, permissions), user.getSeed()), userKey: user.getPublicKey() };
  }
}
