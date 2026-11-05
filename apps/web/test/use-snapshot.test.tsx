import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReadResult } from '../src/api/read-result';
import { useSnapshot, type SnapshotState } from '../src/workers/useSnapshot';

describe('useSnapshot', () => {
  it('marks a refresh in the render of the change that asked for it, never later', async () => {
    const read = vi.fn(async (): Promise<ReadResult<string>> => ({ kind: 'read', value: 'first' }));
    const renders: Array<{ readonly answered: boolean; readonly state: SnapshotState<string> }> = [];
    const hook = renderHook(() => {
      const snapshot = useSnapshot(read);
      const [answered, setAnswered] = useState(false);
      renders.push({ answered, state: snapshot.state });
      return { snapshot, setAnswered };
    });
    await waitFor(() => expect(hook.result.current.snapshot.state).toEqual({ status: 'shown', view: 'first', refreshing: false }));
    read.mockReturnValueOnce(new Promise(() => {}));
    act(() => {
      hook.result.current.setAnswered(true);
      hook.result.current.snapshot.refresh();
    });
    const afterAnswer = renders.filter(({ answered }) => answered);
    expect(afterAnswer.length).toBeGreaterThan(0);
    for (const { state } of afterAnswer) expect(state).toEqual({ status: 'shown', view: 'first', refreshing: true });
  });
});
