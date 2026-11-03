import { describe, expect, it } from 'vitest';
import type { ReadResult, TaskDetail } from '../src/board/board';
import { startTaskDetailFeed, type TaskDetailState } from '../src/board/task-detail-feed';
import { FakeBoardGateway, taskDetail } from './fakes';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// Lets every promise the settled read started run to its end.
async function drained(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

// A gateway whose detail reads answer only when the test settles them.
function heldReads() {
  const gateway = new FakeBoardGateway();
  const answers: ((result: ReadResult<TaskDetail>) => void)[] = [];
  gateway.readTaskDetail.mockImplementation(() => {
    const answer = deferred<ReadResult<TaskDetail>>();
    answers.push(answer.resolve);
    return answer.promise;
  });
  const states: TaskDetailState[] = [];
  const settled = async (at: number, result: ReadResult<TaskDetail>) => {
    answers[at]!(result);
    await drained();
  };
  return { gateway, answers, states, settled };
}

function start(gateway: FakeBoardGateway, states: TaskDetailState[]) {
  return startTaskDetailFeed({ projectId: 'project-1', runId: 'run-1', gateway, show: (state) => states.push(state) });
}

const read = (position: string): ReadResult<TaskDetail> => ({ kind: 'read', value: taskDetail({ position }) });

describe('the task detail feed', () => {
  it('reads the detail of the card and shows it', async () => {
    const { gateway, states, settled } = heldReads();
    start(gateway, states);
    expect(gateway.readTaskDetail).toHaveBeenCalledWith('project-1', 'run-1');
    await settled(0, read('40'));
    expect(states).toEqual([{ status: 'shown', detail: taskDetail({ position: '40' }) }]);
  });

  it('reads again when the card changed above the detail, and not for a change it holds', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    await settled(0, read('40'));
    feed.cardChanged('40');
    feed.cardChanged('7');
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
    feed.cardChanged('41');
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
    await settled(1, read('41'));
    expect(states.at(-1)).toEqual({ status: 'shown', detail: taskDetail({ position: '41' }) });
  });

  it('runs one read at a time and reads once after it for the latest change during it', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    feed.cardChanged('45');
    feed.cardChanged('50');
    feed.cardChanged('44');
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
    await settled(0, read('40'));
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
    await settled(1, read('50'));
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('does not read again when the read during a change already holds it', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    feed.cardChanged('45');
    await settled(0, read('45'));
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
  });

  it('compares positions beyond a safe number exactly', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    await settled(0, read('9007199254740993'));
    feed.cardChanged('9007199254740992');
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
    feed.cardChanged('9007199254740994');
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('shows a failed read without data and reads no more on later changes', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    await settled(0, read('40'));
    feed.cardChanged('41');
    await settled(1, { kind: 'not-found' });
    expect(states.at(-1)).toEqual({ status: 'failed', failure: { kind: 'not-found' } });
    feed.cardChanged('42');
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('reads again for a new board snapshot, even one below the detail after a restore', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    await settled(0, read('100'));
    feed.boardReread();
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
    await settled(1, read('20'));
    expect(states.at(-1)).toEqual({ status: 'shown', detail: taskDetail({ position: '20' }) });
    feed.cardChanged('21');
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(3);
  });

  it('reads once after a read for a new board snapshot during it, and drops the changes before it', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    feed.cardChanged('150');
    feed.boardReread();
    await settled(0, read('100'));
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
    await settled(1, read('20'));
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('reads nothing for a new board snapshot after a failed read', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    await settled(0, { kind: 'unavailable' });
    feed.boardReread();
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
  });

  it('shows nothing and reads no more once stopped', async () => {
    const { gateway, states, settled } = heldReads();
    const feed = start(gateway, states);
    feed.cardChanged('45');
    feed.stop();
    await settled(0, read('40'));
    feed.cardChanged('46');
    expect(states).toEqual([]);
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
  });
});
