import { Badge, Tooltip } from '@mantine/core';
import { usePoc } from '../store';

export function LiveStatus() {
  const { cursor } = usePoc();
  return (
    <Tooltip label="Server-sent events with a durable cursor; after a reconnect the board catches up from it (G3 item 14)">
      <Badge size="lg" variant="light" color="teal" tt="none">
        Live · cursor {cursor}
      </Badge>
    </Tooltip>
  );
}
