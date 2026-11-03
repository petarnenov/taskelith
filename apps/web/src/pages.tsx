import { Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { PlannedScreen } from './screens';

export function PlannedPage({ screen }: { readonly screen: PlannedScreen }) {
  return (
    <Stack>
      <Title order={1}>{screen.title}</Title>
      <Text>
        This page is empty. G3 item {screen.item},{' '}
        <Text span ff="monospace" inherit>
          {screen.change}
        </Text>
        , builds this screen; until then it shows no data.
      </Text>
    </Stack>
  );
}

export function NotFoundPage() {
  return (
    <Stack align="flex-start">
      <Title order={1}>Page not found</Title>
      <Text>No screen of Taskelith lives at this address.</Text>
      <Button component={Link} to="/">
        Go to the board
      </Button>
    </Stack>
  );
}
