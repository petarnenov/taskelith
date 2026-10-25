import { createRoot } from 'react-dom/client';
import {
  ActionIcon, AppShell, Avatar, Burger, Button, Group, MantineProvider,
  NavLink, Text, Tooltip, createTheme, useComputedColorScheme, useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { PocProvider, usePoc, type Screen } from './store';
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
  defaultRadius: 'md',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, monospace",
  headings: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: '600' },
});

const NAV: { screen: Screen; label: string }[] = [
  { screen: 'board', label: 'Board' },
  { screen: 'session', label: 'Sessions' },
  { screen: 'reviews', label: 'Reviews' },
  { screen: 'workers', label: 'Workers' },
  { screen: 'knowledge', label: 'Knowledge' },
  { screen: 'integrations', label: 'Integrations' },
  { screen: 'plugins', label: 'Plugins' },
  { screen: 'states', label: 'Board states' },
];

const SCREENS: Record<Screen, () => React.ReactNode> = {
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
      <ActionIcon variant="default" size={44} aria-label={'Switch to ' + next + ' theme'}
        onClick={() => setColorScheme(next)}>
        {scheme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </ActionIcon>
    </Tooltip>
  );
}

function NeedsYouButton() {
  const { screen, go, needsYouCount } = usePoc();
  return (
    <Button variant={screen === 'inbox' ? 'filled' : 'light'} color={needsYouCount ? 'orange' : 'teal'}
      h={44} leftSection={<InboxIcon />} aria-current={screen === 'inbox' ? 'page' : undefined}
      aria-label={'Needs you: ' + needsYouCount + ' items'} onClick={() => go('inbox')}>
      <Text span visibleFrom="sm" inherit>Needs you ·&nbsp;</Text>{needsYouCount}
    </Button>
  );
}

function Shell() {
  const { screen, go } = usePoc();
  const [opened, { toggle, close }] = useDisclosure(false);
  const Current = SCREENS[screen];
  const navigate = (to: Screen) => { go(to); close(); };

  return (
    <AppShell header={{ height: 68 }} padding="lg"
      navbar={{ width: 260, breakpoint: 'xl', collapsed: { mobile: !opened, desktop: true } }}>
      <AppShell.Header px="md">
        <Group h="100%" gap="sm" wrap="nowrap">
          <Burger opened={opened} onClick={toggle} hiddenFrom="xl" size="sm" aria-label="Toggle navigation" />
          <Group gap={8} wrap="nowrap">
            <LogoIcon />
            <Text fw={700} size="lg" visibleFrom="xs">Taskelith</Text>
          </Group>
          <Button variant="default" h={44} rightSection={<ChevronIcon />} visibleFrom="sm">
            <Text span c="dimmed" size="sm" mr={6}>Project</Text>
            <Text span ff="monospace" size="sm">taskelith</Text>
          </Button>
          <Group gap={2} visibleFrom="xl" wrap="nowrap" component="nav" aria-label="Main">
            {NAV.map((item) => (
              <Button key={item.screen} h={44} px="sm"
                variant={activeNav(screen) === item.screen ? 'light' : 'subtle'}
                color={activeNav(screen) === item.screen ? undefined : 'gray'}
                aria-current={activeNav(screen) === item.screen ? 'page' : undefined}
                onClick={() => go(item.screen)}>{item.label}</Button>
            ))}
          </Group>
          <Group gap="sm" ml="auto" wrap="nowrap">
            <NeedsYouButton />
            <ColorSchemeToggle />
            <Avatar size={44} radius="xl" color="initials" name="P P" aria-label="Account">PP</Avatar>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm" component="nav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.screen} label={item.label} active={activeNav(screen) === item.screen}
            href={'#' + item.screen}
            onClick={(event) => { event.preventDefault(); navigate(item.screen); }} />
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
