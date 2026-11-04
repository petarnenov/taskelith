import { Alert, Button, Stack } from '@mantine/core';
import type { ReadFailed } from './board';

interface LoadErrorProps {
  readonly title: string;
  readonly onRetry: () => void;
  readonly children: string;
}

// A read that failed shows why and a retry, and no data that may be wrong.
export function LoadError({ title, onRetry, children }: LoadErrorProps) {
  return (
    <Stack align="flex-start">
      <Alert color="red" variant="light" title={title}>
        {children}
      </Alert>
      <Button onClick={onRetry}>Retry</Button>
    </Stack>
  );
}

// Wire contracts section 2: a 403 names the role, so the SPA can show it.
export function withRequiredRole(text: string, failure: ReadFailed): string {
  if (failure.kind !== 'denied' || failure.requiredRole === undefined) return text;
  return `${text} Reading it needs the role ${failure.requiredRole}.`;
}
