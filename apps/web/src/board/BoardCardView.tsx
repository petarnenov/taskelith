import { Anchor, Badge, Card, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import { taskDetailPath } from '../screens';
import type { BoardCard, TaskEndKind } from './board';
import { BOARD_ENTRY_STATE } from './board-entry';
import {
  END_LABELS,
  GATE_LABELS,
  MERGE_GATE_LABELS,
  STAGE_STATE_LABELS,
  stepOf,
  WAIT_LABELS,
  WORK_TYPE_LABELS,
} from './board-labels';
import { ObstacleText } from './ObstacleText';
import { SessionIndicator } from './SessionIndicator';

interface BoardCardViewProps {
  readonly projectId: string;
  readonly card: BoardCard;
}

// One root workflow run (product ports section 3.3); it shows only what
// readBoard or its card-changed event answered, and links to its detail.
export function BoardCardView({ projectId, card }: BoardCardViewProps) {
  const titleId = `card-${card.runId}`;
  return (
    <Card withBorder padding="sm" radius="md" component="article" aria-labelledby={titleId}>
      <Stack gap={8}>
        <Anchor
          id={titleId}
          component={Link}
          to={taskDetailPath(projectId, card.runId)}
          state={BOARD_ENTRY_STATE}
          fw={600}
          size="sm"
        >
          {card.title}
        </Anchor>
        <Text size="xs" c="dimmed">
          {WORK_TYPE_LABELS[card.workType]} · {card.framework.pluginId} {card.framework.pluginVersion}
        </Text>
        <Text size="sm">
          Step: {stepOf(card.stage)} · {STAGE_STATE_LABELS[card.stage.state]}
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

function EndText({ kind }: { readonly kind: TaskEndKind }) {
  return <Text size="sm">Ended without a merge: {END_LABELS[kind]}</Text>;
}

function openItems(count: number): string {
  return count === 1 ? '1 open item' : `${count} open items`;
}
