import { Badge, Group, Stack, Text, Timeline } from '@mantine/core';
import type { Turn, TurnAuthor } from '../board/board';
import { Breakable } from '../board/Breakable';
import { turnStateLabel } from '../board/session-labels';

// The turns in position order, each with its author, state, generation,
// and text; a queued turn has no generation yet.
export function TurnTimeline({ turns }: { readonly turns: readonly Turn[] }) {
  if (turns.length === 0) return <Text size="sm">No turn yet.</Text>;
  return (
    <Timeline bulletSize={12} lineWidth={2} active={turns.length}>
      {turns.map((turn) => (
        <Timeline.Item key={turn.turnId} title={<TurnTitle turn={turn} />} data-turn={turn.turnId}>
          <TurnText text={turn.text} />
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

function TurnTitle({ turn }: { readonly turn: Turn }) {
  const { label, color } = turnStateLabel(turn);
  return (
    <Group gap={6} wrap="wrap">
      <Text size="sm" fw={600}>
        #{turn.position} <Breakable text={authorText(turn.author)} />
      </Text>
      <Badge variant="dot" color={color} tt="none">
        {label}
      </Badge>
      {turn.state === 'queued' ? null : (
        <Text size="xs" c="dimmed">
          generation {turn.generation}
        </Text>
      )}
    </Group>
  );
}

// A turn's lines, each its own paragraph, wrap at phone width (D17: no
// style override keeps the newlines).
export function TurnText({ text }: { readonly text: string }) {
  return (
    <Stack gap={2}>
      {text.split('\n').map((line, index) => (
        <Text key={index} size="sm">
          <Breakable text={line} />
        </Text>
      ))}
    </Stack>
  );
}

function authorText(author: TurnAuthor): string {
  if (author.kind === 'principal') return author.principalId;
  const { generation, nativeRequestId } = author.delegationRequest;
  return `host, for delegation request ${nativeRequestId} of generation ${generation}`;
}
