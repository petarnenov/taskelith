import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { EXPIRY_MARGIN_MILLISECONDS, SessionProvider, useSession } from '../src/session/SessionProvider';
import type { SessionGateway } from '../src/session/session';
import { useTokenCommands } from '../src/workers/useTokenCommands';
import type { IssueResult, RevokeResult } from '../src/workers/workers';
import { WorkersServicesProvider } from '../src/workers/WorkersServices';
import { AUTHENTICATED, fakeGateway, FakeWorkersGateway, HOUR, issuedToken, ManualClock, OPERATOR, TOKEN_SECRET } from './fakes';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// The hook under the providers the workers page gives it, once signed in.
async function commandsHook(gateway: FakeWorkersGateway, onListChanged: () => void, session: SessionGateway = fakeGateway(AUTHENTICATED), clock = new ManualClock()) {
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <SessionProvider gateway={session} clock={clock}>
      <WorkersServicesProvider gateway={gateway}>{children}</WorkersServicesProvider>
    </SessionProvider>
  );
  const hook = renderHook(() => ({ session: useSession(), commands: useTokenCommands(onListChanged) }), { wrapper });
  await waitFor(() => expect(hook.result.current.session.view.status).toBe('signed-in'));
  return hook;
}

describe('useTokenCommands', () => {
  it('runs one command at a time: a second run in the same tick is ignored', async () => {
    const gateway = new FakeWorkersGateway();
    const held = deferred<RevokeResult>();
    gateway.revokeEnrollmentToken.mockReturnValueOnce(held.promise);
    const changes: string[] = [];
    const hook = await commandsHook(gateway, () => changes.push('refresh'));
    act(() => {
      hook.result.current.commands.run({ name: 'revoke', tokenId: 'token-1' });
      hook.result.current.commands.run({ name: 'revoke', tokenId: 'token-2' });
    });
    expect(hook.result.current.commands.running).toEqual({ name: 'revoke', tokenId: 'token-1' });
    expect(gateway.revokeEnrollmentToken.mock.calls).toEqual([['token-1']]);
    await act(async () => held.resolve({ kind: 'revoked' }));
    expect(hook.result.current.commands.running).toBeUndefined();
    expect(hook.result.current.commands.status).toEqual({ kind: 'revoked', command: { name: 'revoke', tokenId: 'token-1' } });
    expect(changes).toEqual(['refresh']);
    act(() => hook.result.current.commands.run({ name: 'revoke', tokenId: 'token-2' }));
    await waitFor(() => expect(gateway.revokeEnrollmentToken.mock.calls).toEqual([['token-1'], ['token-2']]));
  });

  it('writes nothing after it unmounted, so a late secret has no state to land in', async () => {
    const gateway = new FakeWorkersGateway();
    const held = deferred<RevokeResult>();
    gateway.revokeEnrollmentToken.mockReturnValueOnce(held.promise);
    const changes: string[] = [];
    const hook = await commandsHook(gateway, () => changes.push('refresh'));
    act(() => hook.result.current.commands.run({ name: 'revoke', tokenId: 'token-1' }));
    hook.unmount();
    await act(async () => held.resolve({ kind: 'revoked' }));
    expect(changes).toEqual([]);
  });

  it.each([
    ['an issue', { name: 'issue', constraints: {} }],
    ['a rotation', { name: 'rotate', tokenId: 'token-1' }],
  ] as const)('holds the secret of %s in the reveal alone, and nowhere once it closed', async (_, command) => {
    const hook = await commandsHook(new FakeWorkersGateway(), () => {});
    act(() => hook.result.current.commands.run(command));
    await waitFor(() => expect(hook.result.current.commands.reveal?.issued.secret).toBe(TOKEN_SECRET));
    expect(JSON.stringify(hook.result.current.commands.status)).not.toContain(TOKEN_SECRET);
    act(() => hook.result.current.commands.closeReveal());
    expect(hook.result.current.commands.reveal).toBeUndefined();
    expect(hook.result.current.commands.status?.kind).toBe('issued');
    expect(JSON.stringify(hook.result.current.commands)).not.toContain(TOKEN_SECRET);
  });

  it('drops an answer that settles under another sign-in than the one it was sent under', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const other = { ...OPERATOR, loginName: 'other-owner' };
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'authenticated', operator: other });
    const clock = new ManualClock();
    const gateway = new FakeWorkersGateway();
    const later = deferred<IssueResult>();
    gateway.issueEnrollmentToken.mockReturnValueOnce(later.promise);
    const changes: string[] = [];
    const hook = await commandsHook(gateway, () => changes.push('refresh'), session, clock);
    act(() => hook.result.current.commands.run({ name: 'issue', constraints: {} }));
    act(() => clock.advance(HOUR + EXPIRY_MARGIN_MILLISECONDS));
    await waitFor(() => expect(hook.result.current.session.view).toMatchObject({ operator: { loginName: 'other-owner' } }));
    await act(async () => later.resolve({ kind: 'issued', value: issuedToken() }));
    expect(hook.result.current.commands.running).toBeUndefined();
    expect(hook.result.current.commands.reveal).toBeUndefined();
    expect(hook.result.current.commands.status).toBeUndefined();
    expect(changes).toEqual([]);
  });
});
