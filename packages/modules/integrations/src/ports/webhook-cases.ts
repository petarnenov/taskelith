import { failsWith, fixtureStep, succeeds, type ConformanceCase } from './conformance-case.js';
import { openChangeRequest } from './conformance-steps.js';
import type { SignedChangeRequestEvent, SourceControlConformanceFixture } from './source-control-fixture.js';
import { readWebhookEvent } from './source-control-readers.js';
import type { WebhookDelivery, WebhookEvent } from './source-control.js';

// Two deliveries of the same event must keep apart, a redelivery must keep
// its id, and a changed body or a missing or foreign signature is refused.
export async function checkWebhookDelivery(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const opened = await openChangeRequest(run, fixture);
  const event = { kind: 'change-request', repository: fixture.projectRepository, changeRequest: opened.id } as const;
  const first = await signedDelivery(run, fixture, event);
  const second = await signedDelivery(run, fixture, event);
  const firstId = await verifiedDeliveryId(run, fixture, first, event);
  const secondId = await verifiedDeliveryId(run, fixture, second, event);
  run.expect(firstId !== secondId, `two deliveries must have distinct deliveryIds, not both ${firstId}`);
  await expectRefused(run, fixture, 'a tampered body', withBody(first, flippedByte(first.rawBody)));
  const reformatted = reserializedJson(first.rawBody);
  if (reformatted) await expectRefused(run, fixture, 'a re-serialized body', withBody(first, reformatted));
  await expectRefused(run, fixture, 'no signature headers', { headers: {}, rawBody: first.rawBody });
  await expectRefused(run, fixture, 'the signature header removed', withoutSignature(run, fixture, first));
  const foreign = await fixtureStep(run, 'signWithForeignSecret', () => fixture.signWithForeignSecret(event));
  await expectRefused(run, fixture, 'a signature made with another secret', foreign);
}

// The same delivery without its signature, every other header kept.
function withoutSignature(run: ConformanceCase, fixture: SourceControlConformanceFixture, delivery: WebhookDelivery): WebhookDelivery {
  const { [fixture.signatureHeader]: signature, ...headers } = delivery.headers;
  if (signature === undefined) run.abort('fixture', `signDelivery returned no ${fixture.signatureHeader} header`);
  return { headers, rawBody: new Uint8Array(delivery.rawBody) };
}

async function signedDelivery(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  event: SignedChangeRequestEvent,
): Promise<WebhookDelivery> {
  const delivery = await fixtureStep(run, 'signDelivery', () => fixture.signDelivery(event));
  if (delivery.rawBody.length === 0) run.abort('fixture', 'signDelivery returned an empty body');
  return delivery;
}

// Verifies the delivery twice, as a redelivery, which keeps its id.
async function verifiedDeliveryId(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  delivery: WebhookDelivery,
  signed: SignedChangeRequestEvent,
): Promise<string> {
  const verified = await verify(run, fixture, delivery);
  run.expect(
    verified.kind === signed.kind && verified.repository === signed.repository && verified.changeRequest === signed.changeRequest,
    `verifyWebhookDelivery returned ${verified.kind} ${verified.repository} ${String(verified.changeRequest)}`,
  );
  const repeated = await verify(run, fixture, delivery);
  run.expect(repeated.deliveryId === verified.deliveryId, 'a repeated delivery must keep its deliveryId');
  return verified.deliveryId;
}

// The plugin gets its own copy of each delivery, which it may change.
function verify(run: ConformanceCase, fixture: SourceControlConformanceFixture, delivery: WebhookDelivery): Promise<WebhookEvent> {
  return succeeds(
    run,
    'verifyWebhookDelivery',
    () => fixture.provider.verifyWebhookDelivery(withBody(delivery, delivery.rawBody)),
    readWebhookEvent,
  );
}

function expectRefused(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  variant: string,
  delivery: WebhookDelivery,
): Promise<void> {
  return failsWith(run, `verifyWebhookDelivery with ${variant}`, () => fixture.provider.verifyWebhookDelivery(delivery), 'forbidden');
}

function withBody(delivery: WebhookDelivery, rawBody: Uint8Array): WebhookDelivery {
  return { headers: { ...delivery.headers }, rawBody: new Uint8Array(rawBody) };
}

function flippedByte(body: Uint8Array): Uint8Array {
  const copy = new Uint8Array(body);
  const middle = Math.floor(copy.length / 2);
  copy[middle] = copy[middle]! ^ 0x01;
  return copy;
}

// The same JSON with other whitespace, or undefined for a body that is not
// JSON; a verifier must refuse it, as the signature covers the raw bytes.
function reserializedJson(body: Uint8Array): Uint8Array | undefined {
  const parsed = parseJson(body);
  if (parsed === undefined) return undefined;
  return [JSON.stringify(parsed.value), JSON.stringify(parsed.value, null, 2)]
    .map((json) => new TextEncoder().encode(json))
    .find((candidate) => !isSameBytes(candidate, body));
}

function parseJson(body: Uint8Array): { readonly value: unknown } | undefined {
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) };
  } catch {
    return undefined;
  }
}

function isSameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
