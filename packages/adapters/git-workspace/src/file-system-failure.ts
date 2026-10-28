import { err, failure, type Result } from '@taskelith/kernel';

interface SystemError extends Error {
  readonly code: string;
  readonly syscall: string;
}

// A Node system error, such as `EIO` from `write`; a simulated crash or a
// programming error is none.
function isSystemError(error: unknown): error is SystemError {
  const { code, syscall } = (error ?? {}) as Partial<SystemError>;
  return error instanceof Error && typeof code === 'string' && typeof syscall === 'string';
}

// The operation's result, or `unavailable` when a file system call fails;
// anything else still rejects, so a crash stays a crash.
export async function failingFileSystemAsUnavailable<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await operation();
  } catch (error) {
    if (!isSystemError(error)) throw error;
    return err(failure('unavailable', `the file system call ${error.syscall} failed with ${error.code}`));
  }
}
