import { OWNER_ONLY, projectRequirement, unauthenticated, type AccessRequirement, type PrincipalId } from '@taskelith/access';
import type { HttpSchemas } from '@taskelith/contracts';
import type { IdempotencyKey, NeedsYouAnswer, NeedsYouItem, NeedsYouItemId, NeedsYouScope } from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { parseEvidenceReference, type ProjectId } from '@taskelith/sdlc';
import type { InboxAnswerSubmission } from '../application/inbox-answers.js';
import type { ApiRequest, Caller } from './api-server.js';
import { inboxItemBody } from './event-stream-wire.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

export const INBOX_ANSWER_OPERATIONS: ReadonlySet<string> = new Set(['answerInboxItem', 'answerInstallationInboxItem']);

// What the answers of wire contracts section 8 reach.
export interface InboxAnswerOperations {
  readonly answers: {
    item(scope: NeedsYouScope, itemId: NeedsYouItemId): Promise<Result<NeedsYouItem>>;
    answer(scope: NeedsYouScope, submission: InboxAnswerSubmission): Promise<Result<NeedsYouItem>>;
  };
  readonly authorization: { authorize(principalId: PrincipalId, requirement: AccessRequirement): Promise<Result<void>> };
}

// `answerInboxItem` and `answerInstallationInboxItem`. The server checked
// the operation's role; the item's own role is checked before the body.
export class InboxAnswerApi {
  readonly #operations: InboxAnswerOperations;

  constructor(operations: InboxAnswerOperations) {
    this.#operations = operations;
  }

  // An unknown item answers 404; a principal below the item's
  // `answerableBy` role 403 `role-required`.
  async authorizeItem(operationId: string, caller: Caller, parameters: readonly string[]): Promise<Result<void>> {
    if (caller.principalId === undefined) return err(unauthenticated());
    const target = targetOf(operationId, parameters);
    if (!target.ok) return target;
    const item = await this.#operations.answers.item(target.value.scope, target.value.itemId);
    if (!item.ok) return item;
    return this.#operations.authorization.authorize(caller.principalId, requirementOf(item.value));
  }

  async answer(operationId: string, request: ApiRequest): Promise<Result<Wire<'InboxItem'>>> {
    if (request.principalId === undefined) return err(failure('internal', 'an inbox answer reached its handler without a principal'));
    const responder = parseIdentifier('PrincipalId', request.principalId);
    if (!responder.ok) return responder;
    const target = targetOf(operationId, request.parameters);
    if (!target.ok) return target;
    const body = request.body as Wire<'InboxAnswerSubmission'>;
    const key = parseIdentifier('IdempotencyKey', body.idempotencyKey);
    if (!key.ok) return key;
    const answer = answerOf(body.answer);
    if (!answer.ok) return answer;
    const submission = { itemId: target.value.itemId, responder: responder.value, answer: answer.value, idempotencyKey: key.value as IdempotencyKey };
    const answered = await this.#operations.answers.answer(target.value.scope, submission);
    return answered.ok ? ok(inboxItemBody(answered.value)) : answered;
  }
}

interface AnswerTarget {
  readonly scope: NeedsYouScope;
  readonly itemId: NeedsYouItemId;
}

// A malformed identifier names no item, so it answers as an unknown one.
function targetOf(operationId: string, parameters: readonly string[]): Result<AnswerTarget> {
  const installation = operationId === 'answerInstallationInboxItem';
  const [projectText = '', itemText = ''] = installation ? ['', parameters[0]] : parameters;
  const itemId = parseIdentifier('NeedsYouItemId', itemText);
  if (!itemId.ok) return err(failure('not-found', 'no such inbox item'));
  const scope: NeedsYouScope = installation ? { kind: 'installation' } : { kind: 'project', projectId: projectText as ProjectId };
  return ok({ scope, itemId: itemId.value });
}

function requirementOf({ answerableBy, subject }: NeedsYouItem): AccessRequirement {
  if (answerableBy === 'installation-owner' || subject.scope === 'installation') return OWNER_ONLY;
  return projectRequirement(subject.projectId, answerableBy);
}

// The wire's answer as the port's; only a reconciliation answer's evidence
// has a narrower type than the schema checks.
function answerOf(answer: Wire<'InboxAnswer'>): Result<NeedsYouAnswer> {
  switch (answer.kind) {
    case 'permission-request':
      return ok({ kind: answer.kind, decision: answer.decision });
    case 'input-request':
      return ok({ kind: answer.kind, text: answer.text });
    case 'spec-approval':
      return ok({ kind: answer.kind, decision: answer.decision, reason: answer.reason });
    case 'escalation':
      return ok({ kind: answer.kind, decision: answer.decision });
    case 'reconciliation': {
      const evidence = parseEvidenceReference(answer.evidence);
      return evidence.ok ? ok({ kind: answer.kind, decision: answer.decision, evidence: evidence.value, reason: answer.reason }) : evidence;
    }
    case 'delivery-acknowledgement':
      return ok({ kind: answer.kind, decision: answer.decision });
  }
}
