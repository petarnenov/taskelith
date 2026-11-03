import { Text } from '@mantine/core';
import type { PlacementObstacle } from './board';
import { formatInstant, reasonLabel } from './board-labels';

// Why the scheduler did not place a task, as the card and detail show it.
export function ObstacleText({ obstacle }: { readonly obstacle: PlacementObstacle }) {
  const verdict = obstacle.disposition === 'rejected' ? 'Rejected' : 'Not placed';
  const retry = 'retryNumber' in obstacle ? `, retry ${obstacle.retryNumber}` : '';
  return (
    <Text size="sm">
      {verdict}: {reasonLabel(obstacle.reason)}
      {retry} ({obstacle.source}, <time dateTime={obstacle.observedAt}>{formatInstant(obstacle.observedAt)}</time>)
    </Text>
  );
}
