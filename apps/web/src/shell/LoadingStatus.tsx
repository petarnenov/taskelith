import { Group, Loader, Text } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';

// A status line that names what loads. The theme's reduced motion does not
// stop the loader, so it is left out when the system asks for that.
export function LoadingStatus({ text }: { readonly text: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <Group gap="sm" role="status" aria-busy="true">
      {reducedMotion ? null : <Loader size="sm" aria-hidden="true" />}
      <Text c="dimmed">{text}</Text>
    </Group>
  );
}
