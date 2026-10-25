import { useState } from 'react';
import {
  Badge, Card, Grid, Group, List, Paper, SegmentedControl, SimpleGrid, Stack, Text, Title,
  type MantineColor,
} from '@mantine/core';
import { Facts, PageHeader } from '../ui';

type Port = 'sdlc' | 'harness' | 'scm';
type PluginStatus = 'registered' | 'candidate' | 'planned' | 'rejected';

interface Plugin {
  port: Port; name: string; id: string; version: string; status: PluginStatus; statusText?: string;
  api: string; upstream: string; runs: string; subscription?: string; capabilities: string[]; note: string;
}

const PLUGINS: Plugin[] = [
  { port: 'sdlc', name: 'OpenSpec', id: 'sdlc-openspec', version: '0.1.0', status: 'registered', api: '^1', upstream: 'OpenSpec 1.14.3 · Node CLI', runs: '10 runs bound', capabilities: ['Structural validation', 'Delta specs', 'Native archive'], note: 'Default framework for every project, Taskelith included. Passes the conformance suite on the feature, fix and docs fixtures.' },
  { port: 'sdlc', name: 'SpecKit', id: 'sdlc-speckit', version: '0.1.0', status: 'candidate', statusText: 'Candidate · adapter in G4', api: '^1', upstream: 'SpecKit 1.2.3 · Python 3.11 + uv', runs: '2 runs bound', capabilities: ['Agent steps', 'Clarification markers', 'Spec and plan gates'], note: 'Selectable per project or task once its adapter is complete (G4). Propose, verify, implementation review, accept and integrate, and close are platform-managed.' },
  { port: 'harness', name: 'Claude Code', id: 'harness-claude-code', version: '0.1.0', status: 'candidate', api: '^1', upstream: 'CLI 2.1.308 · SDK 0.3.308', runs: '8 slots', subscription: 'Claude subscription sign-in', capabilities: ['Account pool', 'Native approvals', 'Session resume'], note: 'Candidate: qualified on macOS x86_64; Linux in the worker image starts in G2. Also hosts the Fable 5.1 reviewer slots.' },
  { port: 'harness', name: 'Codex', id: 'harness-codex', version: '0.1.0', status: 'candidate', api: '^1', upstream: 'codex-cli 0.164.0 · app-server (experimental)', runs: '4 slots', subscription: 'ChatGPT subscription sign-in', capabilities: ['Account pool', 'Native approvals'], note: 'Candidate: qualified on macOS x86_64; arm64 and Linux in the worker image are open.' },
  { port: 'harness', name: 'Antigravity CLI', id: 'harness-antigravity', version: '—', status: 'planned', api: '^1', upstream: 'agy', runs: 'Not installed', subscription: 'Google sign-in', capabilities: ['External approvals to find'], note: 'Selected third harness (ADR 0003). Its plugin must first find an external-approval mechanism.' },
  { port: 'harness', name: 'OpenCode', id: 'harness-opencode', version: '—', status: 'planned', api: '^1', upstream: 'opencode', runs: 'Not installed', subscription: 'Provider sign-in', capabilities: ['Open source'], note: 'Selected fourth harness (ADR 0003), after Antigravity CLI.' },
  { port: 'scm', name: 'GitHub.com', id: 'scm-github', version: '0.1.0', status: 'candidate', api: '^1', upstream: 'REST API 2022-11-28 · GitHub App', runs: '1 project', capabilities: ['Per-run tokens', 'Merge blocking', 'Signed webhooks'], note: 'Candidate: admission in G3 after the terms review. Details in Integrations.' },
  { port: 'scm', name: 'Forgejo', id: 'scm-forgejo', version: '—', status: 'planned', api: '^1', upstream: 'Self-hosted', runs: 'Not installed', capabilities: ['Same SCM port'], note: 'Second SCM, after the GitHub integration is proven (ADR 0006).' },
  { port: 'sdlc', name: 'Custom flow', id: 'sdlc-custom-flow', version: '2.0.0', status: 'rejected', api: '^2', upstream: 'Vendor package', runs: 'Never bound', capabilities: ['SdlcFramework'], note: 'Rejected at startup: it needs plugin API ^2 and this kernel provides 1.4. No task was admitted with it.' },
];

const STATUS: Record<PluginStatus, { label: string; color: MantineColor }> = {
  registered: { label: 'Registered', color: 'teal' },
  candidate: { label: 'Candidate', color: 'orange' },
  planned: { label: 'Selected · planned', color: 'gray' },
  rejected: { label: 'Rejected · incompatible', color: 'red' },
};

const PORT_LABEL: Record<Port, string> = { sdlc: 'SdlcFramework', harness: 'Harness', scm: 'Scm' };

function PluginCard({ plugin }: { plugin: Plugin }) {
  const st = STATUS[plugin.status];
  const rejected = plugin.status === 'rejected';
  const manifest = [{ label: 'Port', value: PORT_LABEL[plugin.port] }, { label: 'Plugin API range', value: plugin.api }];
  if (plugin.subscription) manifest.push({ label: 'Subscription', value: plugin.subscription });
  return (
    <Card withBorder radius="md" padding="md" bd={rejected ? '1px solid var(--mantine-color-red-light-color)' : undefined}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={0}>
            <Title order={2} size="h5">{plugin.name}</Title>
            <Text size="xs" ff="monospace" c="dimmed">{plugin.id} {plugin.version}</Text>
          </Stack>
          <Badge variant="light" color={st.color}>{plugin.statusText ?? st.label}</Badge>
        </Group>
        <Facts items={manifest} />
        <Group gap={6}>{plugin.capabilities.map((c) => <Badge key={c} variant="default" tt="none">{c}</Badge>)}</Group>
        <Text size="xs" c="dimmed">{plugin.upstream} · {plugin.runs}</Text>
        <Text size="sm" c={rejected ? 'red' : 'dimmed'}>{plugin.note}</Text>
      </Stack>
    </Card>
  );
}

export function PluginsScreen() {
  const [filter, setFilter] = useState<'all' | Port>('all');
  const visible = PLUGINS.filter((p) => filter === 'all' || p.port === filter);
  const count = (f: 'all' | Port) => (f === 'all' ? PLUGINS.length : PLUGINS.filter((p) => p.port === f).length);
  const registered = PLUGINS.filter((p) => p.status !== 'planned' && p.status !== 'rejected').length;
  const startup = PLUGINS.filter((p) => p.status !== 'planned');

  return (
    <Stack gap="md">
      <PageHeader title="Plugins"
        description="Harnesses, SCM providers and SDLC frameworks are plugins on the microkernel. Each package carries a manifest and is registered at startup; an incompatible plugin is rejected before any task is admitted with it." />
      <Group gap="sm">
        <Text size="sm" c="dimmed" id="kind-label">Port</Text>
        <SegmentedControl aria-labelledby="kind-label" value={filter} onChange={(v) => setFilter(v as 'all' | Port)}
          data={[{ value: 'all', label: 'All' }, { value: 'sdlc', label: 'SDLC frameworks' }, { value: 'harness', label: 'Harnesses' }, { value: 'scm', label: 'SCM' }]
            .map((o) => ({ ...o, label: o.label + ' · ' + count(o.value as 'all' | Port) }))} />
      </Group>
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} component="section" aria-label="Plugins">
            {visible.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} />)}
          </SimpleGrid>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="md" component="aside" aria-label="Kernel and registration">
            <Paper withBorder p="md" radius="md">
              <Title order={2} size="h5" mb="sm">Kernel</Title>
              <Facts items={[
                { label: 'Plugin API', value: '1.4 · accepts ^1' },
                { label: 'Manifest schema', value: 'v1 · validated on registration' },
                { label: 'Registered at startup', value: registered + ' plugins · 1 rejected' },
                { label: 'Kernel rule', value: 'No kernel code names a provider; modules never import plugins' },
              ]} />
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Title order={2} size="h5" mb="xs">Startup registration</Title>
              <Text size="sm" c="dimmed" mb="sm">The composition root registers its pinned plugin packages at startup and checks each manifest: schema, plugin API range, port and capabilities. There is no upload, hot reload or marketplace; adding a plugin changes its package and the pinned list.</Text>
              <List type="ordered" spacing={4} size="sm">
                {startup.map((p) => (
                  <List.Item key={p.id}>
                    <Text span ff="monospace" size="xs">{p.id} {p.version}</Text>{' '}
                    <Text span size="xs" c={p.status === 'rejected' ? 'red' : 'teal'}>{p.status === 'rejected' ? 'Rejected · plugin API ' + p.api + ' unsupported' : 'Registered'}</Text>
                  </List.Item>
                ))}
              </List>
              <Text size="xs" c="dimmed" mt="sm">Last startup 08:14 · running tasks keep the plugin version they were bound to. Each plugin's conformance suite runs in its own package tests, not at startup.</Text>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
