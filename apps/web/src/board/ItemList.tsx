import { Stack, type MantineSpacing } from '@mantine/core';
import type { ReactNode } from 'react';

interface ItemListProps {
  readonly component: 'ol' | 'ul';
  readonly gap: MantineSpacing;
  readonly children: ReactNode;
}

// Mantine's List wraps each item in a span, which may hold no block, so
// these lists stack li elements such as Paper or Text ones instead.
export function ItemList({ component, gap, children }: ItemListProps) {
  return (
    <Stack component={component} gap={gap} m={0} pl="md">
      {children}
    </Stack>
  );
}
