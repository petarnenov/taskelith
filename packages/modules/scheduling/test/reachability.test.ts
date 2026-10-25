import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant, type Instant } from '@taskelith/kernel';
import { firstContact, recordContact, recordContactLost } from '@taskelith/scheduling';
import { value } from '@taskelith/testing';

function instant(text: string): Instant {
  return value(parseInstant(text));
}

const WORKER = value(parseIdentifier('WorkerId', 'worker-1'));
const T0 = instant('2026-10-25T09:00:00.000Z');
const T1 = instant('2026-10-25T09:00:10.000Z');
const T2 = instant('2026-10-25T09:01:00.000Z');

test('contact makes a worker reachable, and an older contact changes nothing', () => {
  const reachable = firstContact(WORKER, T1);
  assert.equal(reachable.state, 'reachable');
  assert.equal(recordContact(reachable, T0), reachable);
  assert.equal(recordContact(reachable, T1), reachable);
  const later = recordContact(reachable, T2);
  assert.equal(later.lastContactAt, T2);
  assert.equal(later.generation, 2);
});

test('contact is lost only if none arrived after the one the timeout was measured from', () => {
  const reachable = recordContact(firstContact(WORKER, T0), T1);
  const raced = recordContactLost(reachable, T0, T2);
  assert.ok(!raced.ok);
  assert.equal(raced.error.code, 'conflict');
  const lost = value(recordContactLost(reachable, T1, T2));
  assert.equal(lost.state, 'unknown');
  assert.equal(lost.lastContactAt, T1);
  assert.equal(value(recordContactLost(lost, T1, T2)), lost);
  assert.equal(recordContact(lost, T2).state, 'reachable');
});
