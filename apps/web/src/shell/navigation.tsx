import { Button, Group, NavLink, Text, type MantineBreakpoint } from '@mantine/core';
import { Link, matchPath, useLocation } from 'react-router';
import { InboxIcon, PlusIcon } from '../icons';
import { MAIN_NAVIGATION, NEEDS_YOU, NEW_TASK, type PlannedScreen } from '../screens';

// The board owns only its exact path; any other screen also owns the paths
// below its own, which later items add.
function useIsActive(): (screen: PlannedScreen) => boolean {
  const { pathname } = useLocation();
  return (screen) => matchPath({ path: screen.path, end: screen.path === '/' }, pathname) !== null;
}

export function HeaderNavigation() {
  const isActive = useIsActive();
  return (
    <Group gap={2} visibleFrom="xl" wrap="nowrap" component="nav" aria-label="Main">
      {MAIN_NAVIGATION.map((screen) => (
        <Button
          key={screen.path}
          component={Link}
          to={screen.path}
          px="sm"
          variant={isActive(screen) ? 'light' : 'subtle'}
          color={isActive(screen) ? undefined : 'gray'}
          aria-current={isActive(screen) ? 'page' : undefined}
        >
          {screen.label}
        </Button>
      ))}
    </Group>
  );
}

export function NavbarNavigation({ onNavigate }: { readonly onNavigate: () => void }) {
  const isActive = useIsActive();
  return MAIN_NAVIGATION.map((screen) => (
    <NavLink
      key={screen.path}
      component={Link}
      to={screen.path}
      label={screen.label}
      active={isActive(screen)}
      aria-current={isActive(screen) ? 'page' : undefined}
      onClick={onNavigate}
    />
  ));
}

export function NewTaskButton({ visibleFrom }: { readonly visibleFrom: MantineBreakpoint }) {
  const active = useIsActive()(NEW_TASK);
  return (
    <Button
      component={Link}
      to={NEW_TASK.path}
      visibleFrom={visibleFrom}
      variant={active ? 'filled' : 'default'}
      leftSection={<PlusIcon />}
      aria-current={active ? 'page' : undefined}
    >
      {NEW_TASK.label}
    </Button>
  );
}

export function NewTaskNavLink({ onNavigate }: { readonly onNavigate: () => void }) {
  const active = useIsActive()(NEW_TASK);
  return (
    <NavLink
      component={Link}
      to={NEW_TASK.path}
      label={NEW_TASK.label}
      leftSection={<PlusIcon />}
      active={active}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    />
  );
}

export function NeedsYouButton() {
  const active = useIsActive()(NEEDS_YOU);
  return (
    <Button
      component={Link}
      to={NEEDS_YOU.path}
      variant={active ? 'filled' : 'light'}
      leftSection={<InboxIcon />}
      aria-label={NEEDS_YOU.label}
      aria-current={active ? 'page' : undefined}
    >
      <Text span visibleFrom="sm" inherit>
        {NEEDS_YOU.label}
      </Text>
    </Button>
  );
}
