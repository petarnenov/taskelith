import { ColorSwatch, Group, Loader, Text } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import type { SessionActivity } from './board';
import { ACTIVITY_LABELS, formatInstant, type IndicatorTone } from './board-labels';

const STILL_COLORS: Readonly<Record<Exclude<IndicatorTone, 'spins'>, string>> = {
  still: 'var(--mantine-color-indigo-filled)',
  muted: 'var(--mantine-color-gray-filled)',
  danger: 'var(--mantine-color-red-filled)',
};

const INDICATOR_SIZE = 12;

// A round indicator beside a label that names the state: it spins while
// the harness works, unless the system asks for reduced motion.
export function SessionIndicator({ activity }: { readonly activity: SessionActivity }) {
  const reducedMotion = useReducedMotion();
  const { label, tone } = ACTIVITY_LABELS[activity.state];
  const spins = tone === 'spins' && !reducedMotion;
  return (
    <Group gap={8} wrap="nowrap" data-indicator={spins ? 'spins' : 'still'} data-tone={tone}>
      {spins ? (
        <Loader size={INDICATOR_SIZE} aria-hidden="true" />
      ) : (
        <ColorSwatch
          component="span"
          size={INDICATOR_SIZE}
          withShadow={false}
          color={tone === 'spins' ? STILL_COLORS.still : STILL_COLORS[tone]}
          aria-hidden="true"
        />
      )}
      <Text size="sm">
        {label}
        {activity.state === 'worker-unreachable' ? (
          <>
            , last contact <time dateTime={activity.lastContactAt}>{formatInstant(activity.lastContactAt)}</time>
          </>
        ) : null}
      </Text>
    </Group>
  );
}
