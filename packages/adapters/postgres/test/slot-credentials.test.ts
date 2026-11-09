import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { err, failure, type Failure } from '@taskelith/kernel';
import { PostgresSlotCredentials } from '@taskelith/postgres';
import { SlotCredentialsUnavailable, SlotSecret, parseSlotCredentialVersion, type ProviderCredentialId } from '@taskelith/scheduling';
import { id, value } from '@taskelith/testing';

const SLOT = id('ProviderCredentialId', 'slot-1') as ProviderCredentialId;
const unusedCipher = {
  seal: () => assert.fail('a refused transaction seals nothing'),
  open: () => assert.fail('a refused transaction opens nothing'),
};
type Cipher = ConstructorParameters<typeof PostgresSlotCredentials>[1];

// The real adapter over a transaction that refuses with the failure.
function refusedBy(refusal: Failure): PostgresSlotCredentials {
  return new PostgresSlotCredentials(async () => err(refusal), unusedCipher as unknown as Cipher);
}

test('a transaction that answers unavailable rejects every operation with the typed rejection and fixed text', async () => {
  const credential = `fixture-${randomBytes(12).toString('hex')}`;
  const credentials = refusedBy(failure('unavailable', `the connection was lost during ${credential}`));
  const version = value(parseSlotCredentialVersion(1));
  const operations = [
    () => credentials.store(SLOT, value(SlotSecret.of(credential))),
    () => credentials.reveal(SLOT, version),
    () => credentials.discard(SLOT, version),
    () => credentials.discardOlderThan(SLOT, version),
    () => credentials.destroy(SLOT),
  ];
  for (const operation of operations) {
    await assert.rejects(operation, (error: Error) => {
      assert.ok(error instanceof SlotCredentialsUnavailable, error.message);
      assert.equal(error.message.includes(credential), false, 'the rejection holds the credential');
      return true;
    });
  }
});

test('a transaction that answers another failure stays a defect, not the typed rejection', async () => {
  const credentials = refusedBy(failure('internal', 'a failed statement aborted the transaction'));
  await assert.rejects(credentials.destroy(SLOT), (error: Error) => {
    assert.equal(error instanceof SlotCredentialsUnavailable, false);
    return true;
  });
});
