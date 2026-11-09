import type { HttpSchemas } from '@taskelith/contracts';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { SlotSecret, type AccountSlot, type ProviderCredentialId } from '@taskelith/scheduling';
import type { AccountSlotService, SlotPage } from '../application/account-slot-service.js';
import type { ApiRequest } from './api-server.js';
import { afterOf } from './project-api.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

export type AccountSlotOperations = Pick<
  AccountSlotService, 'list' | 'listForProject' | 'add' | 'update' | 'revoke' | 'reinstate' | 'remove' | 'rotate'
>;

// The account slot handlers of wire contracts section 4. Every body is
// mapped field by field, so no credential or its version ever leaves.
export class AccountSlotApi {
  readonly #slots: AccountSlotOperations;

  constructor(slots: AccountSlotOperations) {
    this.#slots = slots;
  }

  async listAccountSlots(request: ApiRequest): Promise<Result<Wire<'AccountSlotPage'>>> {
    const after = afterOf(request);
    if (!after.ok) return after;
    const page = await this.#slots.list(after.value as ProviderCredentialId | undefined);
    return page.ok ? ok(pageBody(page.value, slotBody)) : page;
  }

  async listProjectAccountSlots(request: ApiRequest): Promise<Result<Wire<'ProjectAccountSlotPage'>>> {
    const after = afterOf(request);
    if (!after.ok) return after;
    const [projectId = ''] = request.parameters;
    const page = await this.#slots.listForProject(projectId, after.value as ProviderCredentialId | undefined);
    return page.ok ? ok(pageBody(page.value, (slot) => projectSlotBody(slot, projectId))) : page;
  }

  async addAccountSlot({ body }: ApiRequest): Promise<Result<Wire<'AccountSlot'>>> {
    const { credential, ...addition } = body as Wire<'AccountSlotAddition'>;
    const secret = SlotSecret.of(credential);
    if (!secret.ok) return secret;
    const added = await this.#slots.add({ ...addition, secret: secret.value });
    if (added.ok) return ok(slotBody(added.value));
    return added.error.code === 'conflict' ? err(SLOT_NOT_STORED) : added;
  }

  async updateAccountSlot({ parameters, body }: ApiRequest): Promise<Result<Wire<'AccountSlot'>>> {
    const id = slotIdOf(parameters);
    if (!id.ok) return id;
    return answer(await this.#slots.update({ ...(body as Wire<'AccountSlotUpdate'>), id: id.value }));
  }

  async revokeAccountSlot({ parameters, body, correlationId }: ApiRequest): Promise<Result<Wire<'AccountSlot'>>> {
    const target = targetOf(parameters, body);
    return target.ok ? answer(await this.#slots.revoke(target.value, correlationId)) : target;
  }

  async reinstateAccountSlot({ parameters, body }: ApiRequest): Promise<Result<Wire<'AccountSlot'>>> {
    const target = targetOf(parameters, body);
    return target.ok ? answer(await this.#slots.reinstate(target.value)) : target;
  }

  async removeAccountSlot({ parameters, body }: ApiRequest): Promise<Result<Wire<'AccountSlot'>>> {
    const target = targetOf(parameters, body);
    return target.ok ? answer(await this.#slots.remove(target.value)) : target;
  }

  async rotateSlotCredential({ parameters, body }: ApiRequest): Promise<Result<Wire<'AccountSlot'>>> {
    const id = slotIdOf(parameters);
    if (!id.ok) return id;
    const { expectedRevision, credential } = body as Wire<'SlotCredentialRotation'>;
    const secret = SlotSecret.of(credential);
    if (!secret.ok) return secret;
    return answer(await this.#slots.rotate({ id: id.value, expectedRevision, secret: secret.value }));
  }
}

// A minted identifier that is stored already is the server's fault, not a
// client conflict (decision Q10); the 500 names nothing of the request.
const SLOT_NOT_STORED = failure('internal', 'the account slot could not be stored');

function answer(result: Result<AccountSlot>): Result<Wire<'AccountSlot'>> {
  return result.ok ? ok(slotBody(result.value)) : result;
}

function targetOf(parameters: readonly string[], body: unknown): Result<{ id: ProviderCredentialId; expectedRevision: number }> {
  const id = slotIdOf(parameters);
  return id.ok ? ok({ id: id.value, expectedRevision: (body as Wire<'SlotTransition'>).expectedRevision }) : id;
}

function slotIdOf(parameters: readonly string[]): Result<ProviderCredentialId> {
  const parsed = parseIdentifier('ProviderCredentialId', parameters[0] ?? '');
  return parsed.ok ? ok(parsed.value as ProviderCredentialId) : err(failure('invalid', 'slotId must be an identifier', { field: 'slotId' }));
}

function pageBody<Body>(page: SlotPage, body: (slot: AccountSlot) => Body): { slots: Body[]; next?: string } {
  return { slots: page.slots.map(body), ...(page.next === undefined ? {} : { next: page.next }) };
}

function slotBody(slot: AccountSlot): Wire<'AccountSlot'> {
  const { id, harnessId, mechanismId, allowedProjects, concurrencyLimit, state, health, lastReservedAt, revision } = slot;
  return {
    slotId: id, harnessId, mechanismId, allowedProjects: [...allowedProjects], concurrencyLimit, state, health, revision,
    ...signalParts(slot), ...(lastReservedAt === undefined ? {} : { lastReservedAt }),
  };
}

// A member sees whether the slot serves other projects, never which.
function projectSlotBody(slot: AccountSlot, projectId: string): Wire<'ProjectAccountSlot'> {
  const { id, harnessId, mechanismId, allowedProjects, concurrencyLimit, health } = slot;
  const sharedWithOtherProjects = allowedProjects.some((allowed) => allowed !== projectId);
  return { slotId: id, harnessId, mechanismId, sharedWithOtherProjects, concurrencyLimit, health, ...signalParts(slot) };
}

function signalParts({ cooldown, usage }: AccountSlot): Pick<Wire<'AccountSlot'>, 'cooldown' | 'usage'> {
  return {
    ...(cooldown === undefined ? {} : { cooldown: { endsAt: cooldown.until, source: cooldown.source } }),
    ...(usage === undefined ? {} : { usage: { fraction: usage.fraction, windowEndsAt: usage.windowEndsAt } }),
  };
}
