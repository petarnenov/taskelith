import { Badge, Card, Stack, Text } from '@mantine/core';
import type { BoardCard, PlacementObstacle, TaskEndKind } from './board';
import {
  END_LABELS,
  formatInstant,
  GATE_LABELS,
  MERGE_GATE_LABELS,
  reasonLabel,
  STAGE_STATE_LABELS,
  WAIT_LABELS,
  WORK_TYPE_LABELS,
} from './board-labels';
import { SessionIndicator } from './SessionIndicator';

// One root workflow run (product ports section 3.3); it shows only what
// readBoard or its card-changed event answered.
export function BoardCardView({ card }: { readonly card: BoardCard }) {
  const titleId = `card-${card.runId}`;
  return (
    <Card withBorder padding="sm" radius="md" component="article" aria-labelledby={titleId}>
      <Stack gap={8}>
        <Text id={titleId} fw={600} size="sm">
          {card.title}
        </Text>
        <Text size="xs" c="dimmed">
          {WORK_TYPE_LABELS[card.workType]} · {card.framework.pluginId} {card.framework.pluginVersion}
        </Text>
        <Text size="sm">
          Step: {stepOf(card)} · {STAGE_STATE_LABELS[card.stage.state]}
        </Text>
        {card.gate === undefined ? null : (
          <Badge variant="dot" color={GATE_LABELS[card.gate].color} tt="none">
            Gate {GATE_LABELS[card.gate].label}
          </Badge>
        )}
        {card.waitingFor === undefined ? null : <Text size="sm">Waits for {WAIT_LABELS[card.waitingFor]}</Text>}
        {card.obstacle === undefined ? null : <ObstacleText obstacle={card.obstacle} />}
        {card.end === undefined ? null : <EndText kind={card.end.kind} />}
        <SessionIndicator activity={card.session} />
        {card.integration === 'not-ready' ? null : (
          <Text size="sm">Merge gate: {MERGE_GATE_LABELS[card.integration]}</Text>
        )}
        {card.needsYou === 0 ? null : <Text size="sm">{openItems(card.needsYou)} in “Needs you”</Text>}
      </Stack>
    </Card>
  );
}

// Product ports section 3.2: the native step, or a gap in the mapping.
function stepOf({ stage }: BoardCard): string {
  return stage.origin === 'native' ? stage.stageId : 'platform-managed';
}

function ObstacleText({ obstacle }: { readonly obstacle: PlacementObstacle }) {
  const verdict = obstacle.disposition === 'rejected' ? 'Rejected' : 'Not placed';
  const retry = 'retryNumber' in obstacle ? `, retry ${obstacle.retryNumber}` : '';
  return (
    <Text size="sm">
      {verdict}: {reasonLabel(obstacle.reason)}
      {retry} ({obstacle.source}, <time dateTime={obstacle.observedAt}>{formatInstant(obstacle.observedAt)}</time>)
    </Text>
  );
}

function EndText({ kind }: { readonly kind: TaskEndKind }) {
  return <Text size="sm">Ended without a merge: {END_LABELS[kind]}</Text>;
}

function openItems(count: number): string {
  return count === 1 ? '1 open item' : `${count} open items`;
}
