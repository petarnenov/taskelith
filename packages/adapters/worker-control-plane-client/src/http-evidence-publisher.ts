import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import {
  parseEvidencePublication,
  type EvidencePublication,
  type EvidencePublisher,
  type EvidenceRecord,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, parseInstant, type Result } from '@taskelith/kernel';
import { postForm, statusFailure } from './control-plane-http.js';
import { sanitizeFailureText } from './failure-cause.js';
import type { ControlPlaneClientSettings } from './http-launch-authority-client.js';

// `publishEvidence` over HTTP: the record and its content as the two parts
// of the multipart body. A 502, 503, or 504, or no answer, is `unavailable`.
export class HttpEvidencePublisher implements EvidencePublisher {
  readonly #settings: ControlPlaneClientSettings;

  constructor(settings: ControlPlaneClientSettings) {
    this.#settings = settings;
  }

  async publish(publication: EvidencePublication, content: Uint8Array): Promise<Result<EvidenceRecord>> {
    const form = new FormData();
    form.append('record', new Blob([JSON.stringify(publication)], { type: 'application/json' }));
    form.append('content', new Blob([Uint8Array.from(content)], { type: 'application/octet-stream' }));
    const answered = await postForm(this.#settings, 'evidence', this.#settings.credential, form);
    if (!answered.ok) return answered;
    const { status, body } = answered.value;
    if (status !== 200 && status !== 201) return err(statusFailure('publishEvidence', answered.value));
    const checked = checkHttpSchema('EvidenceRecord', body);
    if (!checked.ok) return err(failure('internal', 'the evidence record violates its schema', { violation: sanitizeFailureText(checked.error[0] ?? '') }));
    const record = parseRecord(body as HttpSchemas['EvidenceRecord']);
    if (!record.ok) return err(failure('internal', `the evidence record is not valid: ${record.error.message}`));
    if (record.value.evidenceId !== publication.evidenceId) {
      return err(failure('internal', 'the control plane answered for another evidence record'));
    }
    return record;
  }
}

function parseRecord(body: HttpSchemas['EvidenceRecord']): Result<EvidenceRecord> {
  const { producer, ownershipCurrent, publishedAt, ...published } = body;
  const publication = parseEvidencePublication(published);
  if (!publication.ok) return publication;
  const workerId = parseIdentifier('WorkerId', producer.workerId);
  if (!workerId.ok) return workerId;
  const at = parseInstant(publishedAt);
  if (!at.ok) return at;
  return ok(Object.freeze({
    ...publication.value,
    producer: Object.freeze({ kind: producer.kind, workerId: workerId.value }),
    ownershipCurrent,
    publishedAt: at.value,
  }));
}
