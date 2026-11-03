import { Badge, Group, List, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core';
import { Fragment } from 'react';
import type { Board, BoardColumn } from './board';
import { COLUMN_LABELS, COLUMNS, MERGE_GATE_LABELS } from './board-labels';
import { cardsAtMergeGate, cardsIn } from './board-model';
import { BoardCardView } from './BoardCardView';

const COLUMN_WIDTH = 264;
const GATE_WIDTH = 200;

// Mantine's viewport takes no focus, so a keyboard could not scroll it.
const VIEWPORT_PROPS = { tabIndex: 0, role: 'region', 'aria-label': 'Board columns' } as const;

// The six columns scroll sideways at phone width, which the design rules
// allow for board columns only; the merge gate sits after Review.
export function BoardColumns({ board }: { readonly board: Board }) {
  return (
    <ScrollArea type="auto" offsetScrollbars viewportProps={VIEWPORT_PROPS}>
      <Group gap={12} wrap="nowrap" align="flex-start">
        {COLUMNS.map((column) => (
          <Fragment key={column}>
            <Column board={board} column={column} />
            {column === 'review' ? <MergeGate board={board} /> : null}
          </Fragment>
        ))}
      </Group>
    </ScrollArea>
  );
}

function Column({ board, column }: { readonly board: Board; readonly column: BoardColumn }) {
  const cards = cardsIn(board, column);
  const { label, stage } = COLUMN_LABELS[column];
  const headingId = `column-${column}`;
  return (
    <Stack component="section" aria-labelledby={headingId} w={COLUMN_WIDTH} miw={COLUMN_WIDTH} gap="xs">
      <Group gap={8}>
        <Title order={2} size="h5" id={headingId}>
          {label}
        </Title>
        <Badge variant="default" aria-label={cardCount(cards.length)}>
          {cards.length}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed">
        {stage}
      </Text>
      <Paper withBorder p={6} radius="md" mih={120}>
        <Stack gap={8}>
          {cards.map((card) => (
            <BoardCardView key={card.runId} card={card} />
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

// Accept and integrate is the merge gate between Review and Archived, not
// a column (product ports section 3.1); it names the cards at the gate.
function MergeGate({ board }: { readonly board: Board }) {
  const cards = cardsAtMergeGate(board);
  return (
    <Stack component="section" aria-labelledby="merge-gate" w={GATE_WIDTH} miw={GATE_WIDTH} gap="xs">
      <Title order={2} size="h5" id="merge-gate">
        Accept and integrate
      </Title>
      <Text size="xs" c="dimmed">
        Merge gate between Review and Archived
      </Text>
      <Paper withBorder p="sm" radius="md">
        {cards.length === 0 ? (
          <Text size="sm">No card at the gate.</Text>
        ) : (
          <List size="sm" spacing={8}>
            {cards.map((card) => (
              <List.Item key={card.runId}>
                {card.title}: {MERGE_GATE_LABELS[card.integration]}
              </List.Item>
            ))}
          </List>
        )}
      </Paper>
    </Stack>
  );
}

function cardCount(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`;
}
