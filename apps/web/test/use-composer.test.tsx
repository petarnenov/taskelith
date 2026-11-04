import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTurnRecordStore } from '../src/agent-session/turn-records';
import { TurnRecordsProvider } from '../src/agent-session/TurnRecordsProvider';
import { useComposer } from '../src/agent-session/useComposer';
import type { SubmitResult } from '../src/board/board';
import { BoardServicesProvider } from '../src/board/BoardServices';
import { SessionProvider, useSession } from '../src/session/SessionProvider';
import type { SessionGateway } from '../src/session/session';
import { AUTHENTICATED, FakeBoardGateway, fakeGateway, ManualClock, PROJECT } from './fakes';

const SENT_AT = '2026-11-04T10:00:00.000Z';

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// The hook under the providers the session page gives it, once signed in.
async function composerHook(gateway: FakeBoardGateway, session: SessionGateway = fakeGateway(AUTHENTICATED)) {
  const clock = new ManualClock();
  const store = createTurnRecordStore();
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <SessionProvider gateway={session} clock={clock}>
      <BoardServicesProvider gateway={gateway} clock={clock}>
        <TurnRecordsProvider store={store}>{children}</TurnRecordsProvider>
      </BoardServicesProvider>
    </SessionProvider>
  );
  const hook = renderHook(
    () => ({ session: useSession(), composer: useComposer({ projectId: PROJECT.projectId, sessionId: 'session-1', showTurn: () => {} }) }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.session.view.status).toBe('signed-in'));
  return hook;
}

describe('useComposer', () => {
  it('sends one record at a time: a second send or retry in the same tick waits for the first', async () => {
    sessionStorage.setItem(
      'taskelith-turn:project-1/session-1',
      JSON.stringify([
        { key: 'key-1', text: 'One', sentAt: SENT_AT },
        { key: 'key-2', text: 'Two', sentAt: SENT_AT },
      ]),
    );
    const gateway = new FakeBoardGateway();
    const held = deferred<SubmitResult>();
    gateway.submitTurn.mockReturnValueOnce(held.promise);
    const hook = await composerHook(gateway);
    act(() => {
      hook.result.current.composer.retry('key-1');
      hook.result.current.composer.retry('key-2');
      hook.result.current.composer.send('Three');
    });
    expect(gateway.submitTurn).toHaveBeenCalledTimes(1);
    expect(gateway.submitTurn.mock.calls[0]![2].idempotencyKey).toBe('key-1');
    expect(hook.result.current.composer.submissions.map((entry) => [entry.key, entry.state.status])).toEqual([
      ['key-1', 'pending'],
      ['key-2', 'unconfirmed'],
    ]);
    await act(async () => held.resolve({ kind: 'unavailable' }));
    act(() => hook.result.current.composer.retry('key-2'));
    await waitFor(() => expect(gateway.submitTurn).toHaveBeenCalledTimes(2));
    expect(gateway.submitTurn.mock.calls[1]![2].idempotencyKey).toBe('key-2');
  });

  it('settles a send as session-changed when the session read after a CSRF refusal finds no session', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValue({ kind: 'anonymous' });
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'csrf-rejected' });
    const hook = await composerHook(gateway, session);
    act(() => hook.result.current.composer.send('One'));
    await waitFor(() => expect(hook.result.current.session.view.status).toBe('signed-out'));
    await waitFor(() => expect(hook.result.current.composer.submissions[0]?.state).toEqual({ status: 'failed', failure: 'session-changed' }));
    expect(hook.result.current.composer.sending).toBe(false);
    expect(gateway.submitTurn).toHaveBeenCalledTimes(1);
  });
});
