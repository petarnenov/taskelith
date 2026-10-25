import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Button,
  Center,
  Group,
  Loader,
  MantineProvider,
  Menu,
  NavLink,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
  createTheme,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { PERSONAS, PocProvider, usePoc, type Screen } from './store';
import { LaterGate } from './ui';
import { ChevronIcon, InboxIcon, LogoIcon, MoonIcon, SunIcon } from './icons';
import { BoardScreen } from './screens/Board';
import { SessionScreen } from './screens/Session';
import { ReviewsScreen } from './screens/Reviews';
import { WorkersScreen } from './screens/Workers';
import { NewTaskScreen } from './screens/NewTask';
import { KnowledgeScreen } from './screens/Knowledge';
import { InboxScreen } from './screens/Inbox';
import { IntegrationsScreen } from './screens/Integrations';
import { PluginsScreen } from './screens/Plugins';
import { StatesScreen } from './screens/States';

const theme = createTheme({
  primaryColor: 'indigo',
  respectReducedMotion: true,
  defaultRadius: 'md',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, monospace",
  headings: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: '600' },
});

const NAV: { screen: Screen; label: string; later?: string }[] = [
  { screen: 'board', label: 'Board' },
  { screen: 'session', label: 'Sessions' },
  { screen: 'reviews', label: 'Reviews' },
  { screen: 'workers', label: 'Workers' },
  { screen: 'knowledge', label: 'Knowledge', later: 'G5' },
  { screen: 'integrations', label: 'Integrations' },
  { screen: 'plugins', label: 'Plugins' },
  { screen: 'states', label: 'Board states' },
];

const SCREEN_VIEWS: Record<Screen, () => ReactNode> = {
  board: BoardScreen,
  session: SessionScreen,
  reviews: ReviewsScreen,
  workers: WorkersScreen,
  'new-task': NewTaskScreen,
  knowledge: KnowledgeScreen,
  inbox: InboxScreen,
  integrations: IntegrationsScreen,
  plugins: PluginsScreen,
  states: StatesScreen,
};

function activeNav(screen: Screen): Screen {
  return screen === 'new-task' ? 'board' : screen;
}

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip label={'Switch to ' + next + ' theme'}>
      <ActionIcon
        variant="default"
        size={44}
        aria-label={'Switch to ' + next + ' theme'}
        onClick={() => setColorScheme(next)}
      >
        {scheme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </ActionIcon>
    </Tooltip>
  );
}

function NeedsYouButton() {
  const { screen, go, needsYouCount } = usePoc();
  return (
    <Button
      variant={screen === 'inbox' ? 'filled' : 'light'}
      color={needsYouCount ? 'orange' : 'teal'}
      h={44}
      leftSection={<InboxIcon />}
      aria-current={screen === 'inbox' ? 'page' : undefined}
      aria-label={'Needs you: ' + needsYouCount + ' items'}
      onClick={() => go('inbox')}
    >
      <Text span visibleFrom="sm" inherit>
        Needs you ·&nbsp;
      </Text>
      {needsYouCount}
    </Button>
  );
}

function AccountMenu() {
  const { signOut, persona, setPersona } = usePoc();
  return (
    <Menu position="bottom-end" width={300} withArrow>
      <Menu.Target>
        <UnstyledButton aria-label="Account menu">
          <Avatar size={44} radius="xl" color="orange">
            {persona.initials}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Signed in as {persona.name}</Menu.Label>
        <Text size="xs" c="dimmed" px="sm" pb="xs">
          {persona.roles.join(' · ')}
          {persona.roles.includes('installation-owner') ? ' (installation-wide) and ' : ' of '}taskelith
        </Text>
        <Menu.Divider />
        <Menu.Label>Proof of concept: view as</Menu.Label>
        {PERSONAS.map((p) => (
          <Menu.Item key={p.id} onClick={() => setPersona(p.id)} disabled={p.id === persona.id}>
            {p.name} · {p.roles.join(', ')}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item>Account settings</Menu.Item>
        <Menu.Item>Change password</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" onClick={signOut}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function SignInScreen() {
  const { signIn } = usePoc();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  return (
    <Center mih="100vh" p="md">
      <Paper
        withBorder
        p="xl"
        radius="md"
        w="100%"
        maw={400}
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (password === '') setError('Invalid username or password.');
          else signIn();
        }}
      >
        <Stack gap="md">
          <Group gap={8}>
            <LogoIcon />
            <Title order={1} size="h3">
              Sign in to Taskelith
            </Title>
          </Group>
          <Text size="sm" c="dimmed">
            You are signed out. Agents and merges keep running; only this browser session ended.
          </Text>
          <TextInput label="Username" placeholder="pp" autoComplete="username" />
          <PasswordInput
            label="Password"
            placeholder="Any password"
            autoComplete="current-password"
            value={password}
            error={error}
            onChange={(event) => {
              setPassword(event.currentTarget.value);
              setError(undefined);
            }}
          />
          <Button type="submit" h={44}>
            Sign in
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}

// The SPA asks the server for the current session before it shows anything;
// a missing or expired session shows the sign-in screen.
function useSessionCheck(): boolean {
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setChecking(false), SESSION_CHECK_DELAY);
    return () => clearTimeout(timer);
  }, []);
  return checking;
}

const SESSION_CHECK_DELAY = 600;

function Shell() {
  const { screen, go, signedIn } = usePoc();
  const checking = useSessionCheck();
  const [opened, { toggle, close }] = useDisclosure(false);
  const Current = SCREEN_VIEWS[screen];
  const navigate = (to: Screen) => {
    go(to);
    close();
  };
  if (checking) {
    return (
      <Center mih="100vh">
        <Group gap="sm">
          <Loader size="sm" />
          <Text c="dimmed">Checking your session…</Text>
        </Group>
      </Center>
    );
  }
  if (!signedIn) return <SignInScreen />;

  return (
    <AppShell
      header={{ height: 68 }}
      padding="lg"
      navbar={{ width: 260, breakpoint: 'xl', collapsed: { mobile: !opened, desktop: true } }}
    >
      <AppShell.Header px="md">
        <Group h="100%" gap="sm" wrap="nowrap">
          <Burger opened={opened} onClick={toggle} hiddenFrom="xl" size="sm" aria-label="Toggle navigation" />
          <Group gap={8} wrap="nowrap">
            <LogoIcon />
            <Text fw={700} size="lg" visibleFrom="xs">
              Taskelith
            </Text>
          </Group>
          <Button variant="default" h={44} rightSection={<ChevronIcon />} visibleFrom="sm">
            <Text span c="dimmed" size="sm" mr={6}>
              Project
            </Text>
            <Text span ff="monospace" size="sm">
              taskelith
            </Text>
          </Button>
          <Group gap={2} visibleFrom="xl" wrap="nowrap" component="nav" aria-label="Main">
            {NAV.map((item) => (
              <Button
                key={item.screen}
                h={44}
                px="sm"
                variant={activeNav(screen) === item.screen ? 'light' : 'subtle'}
                color={activeNav(screen) === item.screen ? undefined : 'gray'}
                aria-current={activeNav(screen) === item.screen ? 'page' : undefined}
                onClick={() => go(item.screen)}
                rightSection={item.later ? <LaterGate>{item.later}</LaterGate> : undefined}
              >
                {item.label}
              </Button>
            ))}
          </Group>
          <Group gap="sm" ml="auto" wrap="nowrap">
            <NeedsYouButton />
            <ColorSchemeToggle />
            <AccountMenu />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm" component="nav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.screen}
            label={item.label}
            rightSection={item.later ? <LaterGate>{item.later}</LaterGate> : undefined}
            active={activeNav(screen) === item.screen}
            href={'#' + item.screen}
            onClick={(event) => {
              event.preventDefault();
              navigate(item.screen);
            }}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Current />
      </AppShell.Main>
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <PocProvider>
      <Shell />
    </PocProvider>
  </MantineProvider>,
);
