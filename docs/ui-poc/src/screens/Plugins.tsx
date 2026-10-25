import { useState } from 'react';
import {
  Badge,
  Card,
  Grid,
  Group,
  List,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  type MantineColor,
} from '@mantine/core';
import { Facts, LaterGate, PageHeader } from '../ui';

type Port = 'sdlc' | 'harness' | 'scm';
type RegisterStatus = 'candidate' | 'accepted' | 'rejected' | 'replacement-required' | 'not assessed';
type Registration =
  | { result: 'admitted' }
  | { result: 'rejected'; code: 'invalid' | 'not-found' | 'precondition-failed'; message: string }
  | { result: 'not-installed' };

interface Plugin {
  port: Port;
  name: string;
  id: string;
  version: string;
  register: RegisterStatus;
  registration: Registration;
  range?: string;
  declaredPort?: string;
  upstream: string;
  capabilities: string[];
  obligations?: string[];
  note: string;
  later?: string;
}

const PLUGINS: Plugin[] = [
  {
    port: 'sdlc',
    name: 'OpenSpec',
    id: 'sdlc-openspec',
    version: '0.0.0',
    register: 'candidate',
    registration: { result: 'admitted' },
    range: '^0.2.0',
    upstream: 'OpenSpec 1.14.3 · Node CLI',
    capabilities: ['validate-structure', 'finalize'],
    obligations: ['intake', 'specification', 'implementation', 'closure'],
    note: 'Default framework for every project, Taskelith included. Passes the conformance suite on the feature, fix and docs fixtures.',
  },
  {
    port: 'sdlc',
    name: 'SpecKit',
    id: 'sdlc-speckit',
    version: '—',
    register: 'candidate',
    registration: { result: 'not-installed' },
    upstream: 'SpecKit 1.2.3 · Python 3.11 (pip, hash-locked)',
    capabilities: [],
    obligations: ['intake', 'specification', 'implementation'],
    note: 'Fixture only: the mapping passes through a test normaliser. The adapter, its agent steps and clarification markers come in G4.',
    later: 'G4',
  },
  {
    port: 'harness',
    name: 'Claude Code',
    id: 'harness-claude-code',
    version: '—',
    register: 'candidate',
    registration: { result: 'not-installed' },
    upstream: 'CLI 2.1.308 · SDK 0.3.308',
    capabilities: [],
    note: 'Qualified on macOS x86_64. Its plugin comes with the AgentHarness port in G3.',
    later: 'AgentHarness port · G3 items 3, 19',
  },
  {
    port: 'harness',
    name: 'Codex',
    id: 'harness-codex',
    version: '—',
    register: 'candidate',
    registration: { result: 'not-installed' },
    upstream: 'codex-cli 0.164.0',
    capabilities: [],
    note: 'Qualified on macOS x86_64. Second harness, in G4.',
    later: 'G4',
  },
  {
    port: 'scm',
    name: 'GitHub.com',
    id: 'scm-github',
    version: '—',
    register: 'candidate',
    registration: { result: 'not-installed' },
    upstream: 'REST API 2022-11-28 · GitHub App',
    capabilities: [],
    note: 'Qualification recorded; admission after the terms review. Details in Integrations.',
    later: 'SourceControlProvider port · G3 items 7, 20',
  },
  {
    port: 'scm',
    name: 'Forgejo',
    id: 'scm-forgejo',
    version: '—',
    register: 'candidate',
    registration: { result: 'not-installed' },
    upstream: 'Self-hosted',
    capabilities: [],
    note: 'Second SCM, after the GitHub integration is proven (ADR 0006).',
  },
  {
    port: 'sdlc',
    name: 'Custom flow',
    id: 'sdlc-custom-flow',
    version: '2.0.0',
    register: 'not assessed',
    registration: {
      result: 'rejected',
      code: 'precondition-failed',
      message: 'pluginApiRange ^1.0.0 does not include plugin API 0.2.0',
    },
    range: '^1.0.0',
    upstream: 'Vendor package',
    capabilities: [],
    note: 'No run was bound to it.',
  },
  {
    port: 'sdlc',
    name: 'Ticket bridge',
    id: 'bridge-tickets',
    version: '0.3.0',
    register: 'not assessed',
    registration: { result: 'rejected', code: 'not-found', message: 'port TicketBridge is not a known port' },
    range: '^0.2.0',
    declaredPort: 'TicketBridge',
    upstream: 'Vendor package',
    capabilities: [],
    note: 'Declares a port the kernel does not have.',
  },
];

const REGISTER_COLOR: Record<RegisterStatus, MantineColor> = {
  candidate: 'orange',
  accepted: 'teal',
  rejected: 'red',
  'replacement-required': 'red',
  'not assessed': 'gray',
};

const PORT_LABEL: Record<Port, string> = {
  sdlc: 'SdlcFramework',
  harness: 'AgentHarness',
  scm: 'SourceControlProvider',
};

function RegistrationBadge({ registration }: { registration: Registration }) {
  if (registration.result === 'admitted')
    return (
      <Badge variant="light" color="teal">
        Registration: admitted
      </Badge>
    );
  if (registration.result === 'not-installed')
    return (
      <Badge variant="light" color="gray">
        Not installed
      </Badge>
    );
  return (
    <Badge variant="light" color="red" tt="none">
      Registration: {registration.code}
    </Badge>
  );
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  const rejected = plugin.registration.result === 'rejected';
  const manifest = [
    { label: 'Port', value: plugin.declaredPort ?? PORT_LABEL[plugin.port] },
    { label: 'Plugin API range', value: plugin.range ?? '—' },
    { label: 'Dependency register', value: plugin.register },
  ];
  if (plugin.obligations)
    manifest.push({ label: 'Native obligations', value: plugin.obligations.join(', ') });
  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      bd={rejected ? '1px solid var(--mantine-color-red-light-color)' : undefined}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={0}>
            <Title order={2} size="h5">
              {plugin.name}
            </Title>
            <Text size="xs" ff="monospace" c="dimmed">
              {plugin.id} {plugin.version}
            </Text>
          </Stack>
          <Stack gap={4} align="flex-end">
            <RegistrationBadge registration={plugin.registration} />
            <Badge variant="outline" color={REGISTER_COLOR[plugin.register]}>
              {plugin.register}
            </Badge>
          </Stack>
        </Group>
        <Facts items={manifest} />
        {plugin.capabilities.length ? (
          <Group gap={6}>
            {plugin.capabilities.map((c) => (
              <Badge key={c} variant="default" tt="none" ff="monospace">
                {c}
              </Badge>
            ))}
          </Group>
        ) : null}
        <Text size="xs" c="dimmed">
          {plugin.upstream}
        </Text>
        {plugin.registration.result === 'rejected' ? (
          <Text size="sm" c="red">
            {plugin.registration.message}
          </Text>
        ) : null}
        <Text size="sm" c="dimmed">
          {plugin.note}
        </Text>
        {plugin.later ? <LaterGate>{plugin.later}</LaterGate> : null}
      </Stack>
    </Card>
  );
}

export function PluginsScreen() {
  const [filter, setFilter] = useState<'all' | Port>('all');
  const visible = PLUGINS.filter((p) => filter === 'all' || p.port === filter);
  const count = (f: 'all' | Port) =>
    f === 'all' ? PLUGINS.length : PLUGINS.filter((p) => p.port === f).length;

  return (
    <Stack gap="md">
      <PageHeader
        title="Plugins"
        description="SDLC frameworks, harnesses and SCM providers are plugins on the microkernel. Registration checks each manifest against the schema, the known ports, and the plugin API range, in that order; the dependency register status is a separate record."
      />
      <Group gap="sm">
        <Text size="sm" c="dimmed" id="kind-label">
          Port
        </Text>
        <SegmentedControl
          aria-labelledby="kind-label"
          value={filter}
          onChange={(v) => setFilter(v as 'all' | Port)}
          data={[
            { value: 'all', label: 'All' },
            { value: 'sdlc', label: 'SDLC frameworks' },
            { value: 'harness', label: 'Harnesses' },
            { value: 'scm', label: 'SCM' },
          ].map((o) => ({ ...o, label: o.label + ' · ' + count(o.value as 'all' | Port) }))}
        />
      </Group>
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} component="section" aria-label="Plugins">
            {visible.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </SimpleGrid>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="md" component="aside" aria-label="Plugin SDK and registration">
            <Paper withBorder p="md" radius="md">
              <Title order={2} size="h5" mb="sm">
                Plugin SDK
              </Title>
              <Facts
                items={[
                  {
                    label: 'Plugin API',
                    value: '0.2.0 (plugin SDK); 1.0.0 comes with versioned manifests in G4',
                  },
                  { label: 'Manifest schema', value: 'G1 subset, unversioned' },
                  {
                    label: 'Kernel rule',
                    value: 'No kernel code names a provider; modules never import plugins',
                  },
                ]}
              />
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Group gap="xs" mb="xs">
                <Title order={2} size="h5">
                  Registration at startup
                </Title>
                <LaterGate>composition root · G3 item 37</LaterGate>
              </Group>
              <Text size="sm" c="dimmed" mb="sm">
                Registration is a library function today; no composition root registers plugins yet and no
                registry keeps the result. The target: the composition root registers its pinned packages at
                startup and the screen reads the outcome.
              </Text>
              <List spacing={4} size="sm">
                <List.Item>
                  <Text span size="xs" c="teal">
                    admitted
                  </Text>{' '}
                  <Text span size="xs">
                    manifest valid, port known, range includes the API
                  </Text>
                </List.Item>
                <List.Item>
                  <Text span size="xs" c="red">
                    invalid
                  </Text>{' '}
                  <Text span size="xs">
                    schema errors, each with its location
                  </Text>
                </List.Item>
                <List.Item>
                  <Text span size="xs" c="red">
                    not-found
                  </Text>{' '}
                  <Text span size="xs">
                    unknown port
                  </Text>
                </List.Item>
                <List.Item>
                  <Text span size="xs" c="red">
                    precondition-failed
                  </Text>{' '}
                  <Text span size="xs">
                    the range excludes the plugin API
                  </Text>
                </List.Item>
              </List>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
