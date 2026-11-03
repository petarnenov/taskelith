import { Alert, AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { LogoIcon } from '../icons';
import type { Operator } from '../session/session';
import { useSession } from '../session/SessionProvider';
import { AccountMenu } from './AccountMenu';
import { ColorSchemeNavLink, ColorSchemeToggle } from './ColorSchemeToggle';
import { HeaderNavigation, NavbarNavigation, NeedsYouButton, NewTaskButton, NewTaskNavLink } from './navigation';

// Below this breakpoint a 320 px header holds only the burger, the logo,
// "Needs you", and the account menu; the navbar takes the other two.
const MOBILE_EXTRAS_BREAKPOINT = 'sm';

export function AppLayout({ operator }: { readonly operator: Operator }) {
  const { logOut } = useSession();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const signOut = async () => setLogoutFailed((await logOut()).kind === 'failed');

  return (
    <AppShell
      header={{ height: 68 }}
      padding="lg"
      navbar={{ width: 260, breakpoint: 'xl', collapsed: { mobile: !opened, desktop: true } }}
    >
      <AppShell.Header px="md">
        <Group h="100%" gap="sm" wrap="nowrap">
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="xl"
            aria-label="Toggle navigation"
            aria-expanded={opened}
          />
          <Group gap={8} wrap="nowrap">
            <LogoIcon />
            <Text fw={700} size="lg" visibleFrom="xs">
              Taskelith
            </Text>
          </Group>
          <HeaderNavigation />
          <Group gap="sm" ml="auto" wrap="nowrap">
            <NewTaskButton visibleFrom={MOBILE_EXTRAS_BREAKPOINT} />
            <NeedsYouButton />
            <ColorSchemeToggle visibleFrom={MOBILE_EXTRAS_BREAKPOINT} />
            <AccountMenu operator={operator} onLogOut={() => void signOut()} />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        <AppShell.Section component="nav" aria-label="Main menu" grow>
          <NavbarNavigation onNavigate={close} />
        </AppShell.Section>
        <AppShell.Section hiddenFrom={MOBILE_EXTRAS_BREAKPOINT}>
          <NewTaskNavLink onNavigate={close} />
          <ColorSchemeNavLink />
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        {logoutFailed ? (
          <Alert color="red" variant="light" title="Not signed out" mb="lg">
            The control plane did not end the session. Try again.
          </Alert>
        ) : null}
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
