import { Alert, Button, Center, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { CheckIcon, LogoIcon } from '../icons';
import type { LoginRejection } from '../session/session';
import { useSession, type SignedOutNotice } from '../session/SessionProvider';

// The OpenAPI document's LoginName and Password schemas.
const LOGIN_NAME_MAX_LENGTH = 64;
const PASSWORD_MAX_LENGTH = 1024;

const FAILURE_TEXT: Record<LoginRejection | 'unavailable', string> = {
  'wrong-credentials': 'The login name or the password is wrong.',
  'invalid-request':
    `Enter a login name of 1 to ${LOGIN_NAME_MAX_LENGTH} lowercase letters, digits, ".", "_", or "-" ` +
    `that starts with a letter or digit, and a password of 1 to ${PASSWORD_MAX_LENGTH} characters.`,
  'form-expired': 'The sign-in form expired. Sign in again.',
  unavailable: 'The control plane cannot be reached. Try again.',
};

interface SignInPageProps {
  readonly notice: SignedOutNotice;
  // A turn was being sent, or had no answer, when the session ended.
  readonly turnUnconfirmed?: boolean;
}

export function SignInPage({ notice, turnUnconfirmed = false }: SignInPageProps) {
  const { logIn } = useSession();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFailure(undefined);
    const outcome = await logIn({ loginName, password });
    setSubmitting(false);
    if (outcome.kind === 'logged-in') return;
    setPassword('');
    setFailure(FAILURE_TEXT[outcome.kind === 'rejected' ? outcome.reason : outcome.kind]);
  }

  return (
    <Center component="main" mih="100vh" p="md">
      <Paper withBorder p="xl" radius="md" w="100%" maw={400} component="form" aria-label="Sign in" onSubmit={submit}>
        <Stack gap="md">
          <Group gap={8}>
            <LogoIcon />
            <Title order={1} size="h3">
              Sign in to Taskelith
            </Title>
          </Group>
          <SignedOutMessage notice={notice} turnUnconfirmed={turnUnconfirmed} />
          {failure === undefined ? null : (
            <Alert color="red" variant="light" title="Not signed in">
              {failure}
            </Alert>
          )}
          <TextInput
            label="Login name"
            autoComplete="username"
            maxLength={LOGIN_NAME_MAX_LENGTH}
            required
            withAsterisk={false}
            value={loginName}
            onChange={(event) => setLoginName(event.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX_LENGTH}
            required
            withAsterisk={false}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          <Button type="submit" loading={submitting}>
            Sign in
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}

// The outcome of an unconfirmed turn is unknown, so the notice claims
// neither that it was sent nor that it was not.
const TURN_UNCONFIRMED = ' Your last turn may not have been sent; check the timeline after signing in.';

function SignedOutMessage({ notice, turnUnconfirmed }: { readonly notice: SignedOutNotice; readonly turnUnconfirmed: boolean }) {
  const turnNote = turnUnconfirmed ? TURN_UNCONFIRMED : '';
  if (notice === 'expired') {
    return (
      <Alert color="indigo" variant="light" title="Your session expired">
        Agents and merges keep running. Sign in again to continue.{turnNote}
      </Alert>
    );
  }
  if (notice === 'signed-out') {
    return (
      <Alert color="indigo" variant="light" title="You signed out" icon={<CheckIcon />}>
        Agents and merges keep running; only this browser session ended.{turnNote}
      </Alert>
    );
  }
  return (
    <Text size="sm" c="dimmed">
      Sign in with your login name and password.
    </Text>
  );
}
