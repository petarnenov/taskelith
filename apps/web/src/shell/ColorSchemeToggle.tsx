import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { MoonIcon, SunIcon } from '../icons';

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <ActionIcon variant="default" aria-label={`Switch to the ${next} theme`} onClick={() => setColorScheme(next)}>
      {scheme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </ActionIcon>
  );
}
