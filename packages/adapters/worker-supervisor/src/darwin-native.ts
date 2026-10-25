import { createRequire } from 'node:module';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { DarwinNative, SysctlOutcome, Timebase } from './darwin.js';

const LIBSYSTEM = '/usr/lib/libSystem.B.dylib';

// The only module that loads koffi. It loads on first use, so a host that
// cannot load it fails closed instead of failing at import.
export function loadDarwinNative(library = LIBSYSTEM): Result<DarwinNative> {
  try {
    const koffi = createRequire(import.meta.url)('koffi') as typeof import('koffi');
    return ok(bind(koffi, koffi.load(library)));
  } catch (error) {
    return err(failure('unavailable', `cannot load the macOS native calls: ${(error as Error).message}`));
  }
}

function bind(koffi: typeof import('koffi'), lib: ReturnType<typeof import('koffi').load>): DarwinNative {
  const sysctl = lib.func('int sysctl(int *name, unsigned int namelen, void *oldp, _Inout_ size_t *oldlenp, void *newp, size_t newlen)');
  // Anonymous: a named type is global to koffi and could not load twice.
  const timebaseInfo = koffi.struct({ numer: 'uint32_t', denom: 'uint32_t' });
  const timebase = lib.func('mach_timebase_info', 'int', [koffi.out(koffi.pointer(timebaseInfo))]);
  const continuousTime = lib.func('uint64_t mach_continuous_time(void)');
  return {
    sysctl(name: readonly number[], buffer: Buffer | undefined): SysctlOutcome {
      const length = [buffer?.length ?? 0];
      const status = sysctl(Int32Array.from(name), name.length, buffer ?? null, length, null, 0) as number;
      return { errno: status === 0 ? 0 : koffi.errno(), length: length[0]! };
    },
    continuousTime: () => BigInt(continuousTime() as number | bigint),
    timebase(): Result<Timebase> {
      const info = { numer: 0, denom: 0 };
      const status = timebase(info) as number;
      if (status !== 0 || info.denom === 0) return err(failure('unavailable', `mach_timebase_info failed with ${status}`));
      return ok(info);
    },
  };
}
