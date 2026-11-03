import { Alert, Button, Center, Group, Loader, Stack, Text } from '@mantine/core';
import { useSession } from '../session/SessionProvider';
import { AppLayout } from './AppLayout';
import { SignInPage } from './SignInPage';

// Nothing of the product shows before the control plane names a session.
export function Shell() {
  const { view, retry } = useSession();
  if (view.status === 'checking') return <SessionCheck />;
  if (view.status === 'unavailable') return <ControlPlaneUnavailable onRetry={retry} />;
  if (view.status === 'signed-out') return <SignInPage notice={view.notice} />;
  return <AppLayout operator={view.operator} />;
}

function SessionCheck() {
  return (
    <Center component="main" mih="100vh">
      <Group gap="sm">
        <Loader size="sm" />
        <Text c="dimmed">Checking your session…</Text>
      </Group>
    </Center>
  );
}

function ControlPlaneUnavailable({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Center component="main" mih="100vh" p="md">
      <Stack maw={400}>
        <Alert color="red" variant="light" title="The control plane cannot be reached">
          Taskelith shows nothing until it can read your session.
        </Alert>
        <Button onClick={onRetry}>Retry</Button>
      </Stack>
    </Center>
  );
}
