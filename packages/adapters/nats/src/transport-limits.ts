// Provisional G2 item 12 bounds in docs/operational-targets.md, which G6
// verifies; tests pass shorter ones.
const SECOND_MILLISECONDS = 1000;
const DAY_MILLISECONDS = 24 * 60 * 60 * SECOND_MILLISECONDS;

export const TRANSPORT_LIMITS = Object.freeze({
  streamMaxAgeMilliseconds: 7 * DAY_MILLISECONDS,
  streamMaxBytes: 10 * 1024 ** 3,
  messageMaxBytes: 1024 ** 2,
  duplicateWindowMilliseconds: 2 * 60 * SECOND_MILLISECONDS,
  commandBacklogPerWorker: 10_000,
  ackWaitMilliseconds: 30 * SECOND_MILLISECONDS,
  maxDeliver: 5,
  maxAckPendingPerWorker: 4,
  retryInitialMilliseconds: 5 * SECOND_MILLISECONDS,
  retryMaxMilliseconds: 60 * SECOND_MILLISECONDS,
  idlePollMilliseconds: SECOND_MILLISECONDS,
});

export type TransportLimits = { readonly [Name in keyof typeof TRANSPORT_LIMITS]: number };

// Doubles from the initial delay up to the maximum, with up to a quarter of
// jitter below it, so redeliveries of many messages spread out.
export function retryDelayMilliseconds(
  attempt: number,
  limits: TransportLimits = TRANSPORT_LIMITS,
  random: () => number = Math.random,
): number {
  const doubled = limits.retryInitialMilliseconds * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(doubled, limits.retryMaxMilliseconds);
  const jittered = Math.round(capped * (1 - random() / 4));
  return Math.max(limits.retryInitialMilliseconds, jittered);
}
