import { Container, MantineProvider, Stack, Text, Title } from '@mantine/core';

// The scaffold's only page; G3 item 28b replaces it with the shell.
export function App() {
  return (
    <MantineProvider defaultColorScheme="dark">
      <Container component="main" py="xl">
        <Stack>
          <Title order={1}>Taskelith</Title>
          <Text>
            This is the scaffold of the Taskelith web application. Sign-in, navigation, and the screens come with
            later G3 items.
          </Text>
        </Stack>
      </Container>
    </MantineProvider>
  );
}
