import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type CorrelationId, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import {
  addAccountSlot,
  readUpdatableSlot,
  reinstateAccountSlot,
  removeAccountSlot,
  revokeAccountSlot,
  rotateSlotCredential,
  SlotCredentialsUnavailable,
  updateAccountSlot,
  type AccountSlot,
  type AccountSlotCommandPorts,
  type ProjectId,
  type ProviderCredentialId,
  type RevocationCommandIdFor,
  type SlotCommandTarget,
  type SlotSecret,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';

// Slots a list reads at most per page (OAS `AccountSlotPage`).
export const ACCOUNT_SLOT_PAGE_SIZE = 100;

export interface SlotPage {
  readonly slots: readonly AccountSlot[];
  readonly next?: ProviderCredentialId;
}

// What an installation owner sends to add a slot, the secret already
// wrapped, so no text of it reaches a failure or a log record.
export interface SlotAddition {
  readonly harnessId: string;
  readonly mechanismId: string;
  readonly allowedProjects: readonly string[];
  readonly concurrencyLimit?: number;
  readonly secret: SlotSecret;
}

export interface SlotSettingsChange extends SlotCommandTarget {
  readonly allowedProjects?: readonly string[];
  readonly concurrencyLimit?: number;
}

export interface SlotRotation extends SlotCommandTarget {
  readonly secret: SlotSecret;
}

// The projects that a slot may name, read through the Access module.
export interface SlotProjects {
  readProject(projectId: string): Promise<Result<unknown>>;
}

export interface AccountSlotServicePorts extends Omit<AccountSlotCommandPorts, 'store'> {
  readonly store: ControlPlaneStore;
  readonly projects: SlotProjects;
  readonly newSlotId: () => string;
  readonly revocationCommandIdFor: RevocationCommandIdFor;
  readonly logger?: Logger;
}

// The account slot operations of wire contracts section 4 over the 12d A
// commands; the server checked each caller's role before the body.
export class AccountSlotService {
  readonly #ports: AccountSlotServicePorts;
  readonly #logger: Logger;

  constructor(ports: AccountSlotServicePorts) {
    this.#ports = ports;
    this.#logger = ports.logger ?? SILENT_LOGGER;
  }

  list(after: ProviderCredentialId | undefined): Promise<Result<SlotPage>> {
    return this.#page((tx, limit) => tx.accountSlots.list(after, limit));
  }

  // An unknown project is 404, as the other project reads answer.
  async listForProject(projectId: string, after: ProviderCredentialId | undefined): Promise<Result<SlotPage>> {
    const project = await this.#ports.projects.readProject(projectId);
    if (!project.ok) return project;
    return this.#page((tx, limit) => tx.accountSlots.listForProject(projectId as ProjectId, after, limit));
  }

  async add(addition: SlotAddition): Promise<Result<AccountSlot>> {
    const harnessId = parseIdentifier('HarnessPluginId', addition.harnessId);
    if (!harnessId.ok) return harnessId;
    const mechanismId = parseIdentifier('SubscriptionMechanismId', addition.mechanismId);
    if (!mechanismId.ok) return mechanismId;
    const allowedProjects = await this.#knownProjects(addition.allowedProjects);
    if (!allowedProjects.ok) return allowedProjects;
    const id = parseIdentifier('ProviderCredentialId', this.#ports.newSlotId());
    if (!id.ok) return err(failure('internal', 'the minted slot identifier is not an identifier'));
    return this.#storingCredential(() => addAccountSlot(this.#ports, {
      id: id.value as ProviderCredentialId, harnessId: harnessId.value as HarnessPluginId,
      mechanismId: mechanismId.value as SubscriptionMechanismId, allowedProjects: allowedProjects.value, secret: addition.secret,
      ...(addition.concurrencyLimit === undefined ? {} : { concurrencyLimit: addition.concurrencyLimit }),
    }));
  }

  async update(change: SlotSettingsChange): Promise<Result<AccountSlot>> {
    const { allowedProjects, ...rest } = change;
    if (allowedProjects === undefined) return updateAccountSlot(this.#ports.store, rest);
    const updatable = await readUpdatableSlot(this.#ports.store, rest);
    if (!updatable.ok) return updatable;
    const known = await this.#knownProjects(allowedProjects);
    return known.ok ? updateAccountSlot(this.#ports.store, { ...rest, allowedProjects: known.value }) : known;
  }

  revoke(target: SlotCommandTarget, correlationId: CorrelationId): Promise<Result<AccountSlot>> {
    const ports = { store: this.#ports.store, commandIdFor: this.#ports.revocationCommandIdFor };
    return revokeAccountSlot(ports, { ...target, correlationId });
  }

  reinstate(target: SlotCommandTarget): Promise<Result<AccountSlot>> {
    return reinstateAccountSlot(this.#ports.store, target);
  }

  remove(target: SlotCommandTarget): Promise<Result<AccountSlot>> {
    return removeAccountSlot(this.#ports, target);
  }

  rotate(rotation: SlotRotation): Promise<Result<AccountSlot>> {
    return this.#storingCredential(() => rotateSlotCredential(this.#ports, rotation));
  }

  // One more than a page is read, so `next` names a page that exists.
  async #page(read: (tx: ControlPlaneTransaction, limit: number) => Promise<readonly AccountSlot[]>): Promise<Result<SlotPage>> {
    const listed = await this.#ports.store.readCommitted(async (tx) => ok(await read(tx, ACCOUNT_SLOT_PAGE_SIZE + 1)));
    if (!listed.ok) return listed;
    const slots = listed.value.slice(0, ACCOUNT_SLOT_PAGE_SIZE);
    const last = slots.at(-1);
    return ok(listed.value.length > ACCOUNT_SLOT_PAGE_SIZE && last !== undefined ? { slots, next: last.id } : { slots });
  }

  // Decision Q5: every project is read before any credential is stored.
  async #knownProjects(projectIds: readonly string[]): Promise<Result<readonly ProjectId[]>> {
    for (const projectId of projectIds) {
      const project = await this.#ports.projects.readProject(projectId);
      if (project.ok) continue;
      if (project.error.code !== 'not-found') return project;
      return err(failure('invalid', 'allowedProjects names an unknown project', { field: 'allowedProjects' }));
    }
    return ok(projectIds as readonly ProjectId[]);
  }

  // A rejection can quote what the store was given, so it is logged by type
  // only; the request log already records the fixed 503.
  async #storingCredential(command: () => Promise<Result<AccountSlot>>): Promise<Result<AccountSlot>> {
    try {
      return await command();
    } catch (error) {
      if (error instanceof SlotCredentialsUnavailable) return err(failure('unavailable', 'the slot credential store is unavailable'));
      this.#logger.error('scheduling.slot-credentials.store-failed', { errorType: errorTypeOf(error) });
      return err(failure('internal', 'the slot credential could not be stored'));
    }
  }
}

function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'non-error';
}
