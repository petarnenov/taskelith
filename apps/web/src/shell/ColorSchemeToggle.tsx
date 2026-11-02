import { ActionIcon, NavLink, useComputedColorScheme, useMantineColorScheme, type MantineBreakpoint } from '@mantine/core';
import { MoonIcon, SunIcon } from '../icons';

function useColorSchemeSwitch() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');
  const next = scheme === 'dark' ? 'light' : 'dark';
  return {
    label: `Switch to the ${next} theme`,
    icon: scheme === 'dark' ? <SunIcon /> : <MoonIcon />,
    switchScheme: () => setColorScheme(next),
  };
}

export function ColorSchemeToggle({ visibleFrom }: { readonly visibleFrom: MantineBreakpoint }) {
  const { label, icon, switchScheme } = useColorSchemeSwitch();
  return (
    <ActionIcon variant="default" visibleFrom={visibleFrom} aria-label={label} onClick={switchScheme}>
      {icon}
    </ActionIcon>
  );
}

export function ColorSchemeNavLink() {
  const { label, icon, switchScheme } = useColorSchemeSwitch();
  return <NavLink component="button" label={label} leftSection={icon} onClick={switchScheme} />;
}
