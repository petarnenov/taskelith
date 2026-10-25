export const CRASH_POINT_VARIABLE = 'TASKELITH_CRASH_POINT';

// A contract's point name, optionally on one side of a commit: `CP8`,
// `W1.before`, `W5s.after`.
const CRASH_POINT_NAME = /^[A-Z][A-Za-z0-9]*(?:\.(?:before|after))?$/;
const ARMED_VARIABLE = /^(?<point>[^@]+)(?:@(?<occurrence>[1-9]\d*))?$/;

export type CrashAction = 'throw' | 'kill';

export interface ArmedCrash {
  readonly point: string;
  readonly occurrence: number;
  readonly action: CrashAction;
}

export class SimulatedCrash extends Error {
  constructor(readonly point: string) {
    super(`Simulated crash at ${point}`);
    this.name = 'SimulatedCrash';
  }
}

// Records the named points a run reaches, in order, and crashes on the armed
// occurrence: by throwing in process, or by SIGKILL of the whole process.
export class CrashPoints {
  readonly #armed: ArmedCrash | undefined;
  readonly #reached: string[] = [];

  constructor(armed?: ArmedCrash) {
    if (armed) assertArmed(armed);
    this.#armed = armed;
  }

  get reached(): readonly string[] {
    return [...this.#reached];
  }

  reach(point: string): void {
    assertPointName(point);
    this.#reached.push(point);
    const armed = this.#armedCrashAt(point);
    if (armed) crash(armed);
  }

  #armedCrashAt(point: string): ArmedCrash | undefined {
    if (this.#armed?.point !== point) return undefined;
    const occurrence = this.#reached.filter((reached) => reached === point).length;
    return occurrence === this.#armed.occurrence ? this.#armed : undefined;
  }
}

// The environment that arms a child process: `W1.after@2` kills it the
// second time it reaches W1.after.
export function crashEnvironment(point: string, occurrence = 1): Record<string, string> {
  assertArmed({ point, occurrence, action: 'kill' });
  return { [CRASH_POINT_VARIABLE]: occurrence === 1 ? point : `${point}@${occurrence}` };
}

export function crashPointsFromEnvironment(env: NodeJS.ProcessEnv = process.env): CrashPoints {
  const text = env[CRASH_POINT_VARIABLE];
  if (text === undefined || text === '') return new CrashPoints();
  const match = ARMED_VARIABLE.exec(text);
  if (!match) throw new RangeError(`${CRASH_POINT_VARIABLE} must be <point> or <point>@<occurrence>, got "${text}"`);
  const { point, occurrence } = match.groups!;
  return new CrashPoints({ point: point!, occurrence: Number(occurrence ?? 1), action: 'kill' });
}

function crash({ point, action }: ArmedCrash): void {
  switch (action) {
    case 'throw':
      throw new SimulatedCrash(point);
    case 'kill':
      process.kill(process.pid, 'SIGKILL');
  }
}

function assertArmed({ point, occurrence }: ArmedCrash): void {
  assertPointName(point);
  if (!Number.isSafeInteger(occurrence) || occurrence < 1) {
    throw new RangeError(`Crash occurrence must be a positive integer, got ${occurrence}`);
  }
}

function assertPointName(point: string): void {
  if (!CRASH_POINT_NAME.test(point)) {
    throw new RangeError(`Crash point "${point}" must match ${CRASH_POINT_NAME.source}`);
  }
}
