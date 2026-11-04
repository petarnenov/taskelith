import { Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { SESSIONS } from '../screens';

// Decision Q2 of the coordinator: sessions are listed per card, so this
// page says where a session opens from and lists none.
export function SessionsIndexPage() {
  return (
    <Stack align="flex-start">
      <Title order={1}>{SESSIONS.title}</Title>
      <Text>
        An agent session opens from its task: open a card&apos;s task detail on the board, and follow the session
        link of the task in it.
      </Text>
      <Button component={Link} to="/">
        Go to the board
      </Button>
    </Stack>
  );
}
