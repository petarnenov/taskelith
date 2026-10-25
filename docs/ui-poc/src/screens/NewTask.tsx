import { useState } from 'react';
import {
  Badge,
  Breadcrumbs,
  Button,
  Code,
  Grid,
  Group,
  Notification,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Timeline,
  Title,
} from '@mantine/core';
import { usePoc } from '../store';
import { PageHeader, RoleButton, ScreenLink } from '../ui';

interface Option {
  later?: string;
  id: string;
  label: string;
  hint: string;
}
interface Choice {
  id: ChoiceId;
  label: string;
  options: Option[];
}
type ChoiceId = 'type' | 'framework' | 'harness' | 'reviewer' | 'specApproval';

const CHOICES: Choice[] = [
  {
    id: 'type',
    label: 'Work type',
    options: [
      { id: 'feature', label: 'Feature', hint: 'New behavior' },
      { id: 'bug', label: 'Bug', hint: 'Broken behavior' },
      { id: 'improvement', label: 'Improvement', hint: 'Better existing behavior' },
      { id: 'documentation', label: 'Documentation', hint: 'Documentation only' },
      { id: 'maintenance', label: 'Maintenance', hint: 'Deps, tooling, cleanup' },
      { id: 'emergency', label: 'Emergency', hint: 'Same gates; an expedited policy is not decided yet' },
    ],
  },
  {
    id: 'framework',
    label: 'SDLC framework',
    options: [
      { id: 'openspec', label: 'OpenSpec', hint: 'Project default' },
      { id: 'speckit', label: 'SpecKit', hint: 'For this task only', later: 'G4' },
    ],
  },
  {
    id: 'harness',
    label: 'Implementer',
    options: [
      { id: 'auto', label: 'Project default', hint: 'Claude Code · least-loaded slot' },
      { id: 'claude', label: 'Claude Code', hint: '1 slot free' },
      { id: 'codex', label: 'Codex', hint: '1 slot free', later: 'G4' },
    ],
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    options: [
      { id: 'auto', label: 'Auto', hint: 'Next in rotation' },
      {
        id: 'fable',
        label: 'Claude Code · Fable 5.1',
        hint: 'A separate Claude Code session on another slot (D7)',
      },
      { id: 'codex', label: 'Codex', hint: 'Read-only', later: 'G4' },
    ],
  },
  {
    id: 'specApproval',
    label: 'Spec approval',
    options: [
      {
        id: 'reviewer',
        label: 'Independent reviewer',
        hint: 'Delegated by maintainer policy · no human needed (G3 item 22)',
      },
      { id: 'me', label: 'Maintainer', hint: 'Waits for a project-maintainer' },
    ],
  },
];

const DEFAULTS: Record<ChoiceId, string> = {
  type: 'feature',
  framework: 'openspec',
  harness: 'auto',
  reviewer: 'auto',
  specApproval: 'reviewer',
};

// Client-chosen IDs make a retried create idempotent: the same draft always
// sends the same runId and taskId.
function newRequestIds() {
  const id = () => Math.random().toString(16).slice(2, 10);
  return { runId: 'run-' + id(), taskId: 'task-' + id() };
}

const CREATE_DELAY = 800;

type SourceId = 'jira' | 'github' | 'confluence' | 'file' | 'url';

// G3 imports only GitHub issues (D9); the other sources wait for later gates.
const SOURCES: { id: SourceId; label: string; placeholder: string; later?: boolean }[] = [
  { id: 'github', label: 'GitHub issue', placeholder: 'owner/repo#57 or issue link' },
  { id: 'jira', label: 'Jira', placeholder: 'Issue key or link, e.g. PROJ-142', later: true },
  { id: 'confluence', label: 'Confluence', placeholder: 'Page link', later: true },
  { id: 'file', label: 'Text file', placeholder: 'Path to a .md or .txt file', later: true },
  { id: 'url', label: 'Other link', placeholder: 'Any web page or document link', later: true },
];

const SAMPLES: Record<
  SourceId,
  { ref: string; kind: string; type: string; title: string; goal: string; mapping: [string, string][] }
> = {
  jira: {
    ref: 'PROJ-142',
    kind: 'Bug',
    type: 'bug',
    title: 'Board drops live updates after reconnect',
    goal: 'After the browser reconnects, the board catches up from the last SSE cursor and shows every missed card move.\n\nAcceptance criteria:\n- No card move is lost after a 30 s disconnect\n- No duplicate moves are applied',
    mapping: [
      ['Issue type: Bug', 'Type: Bug'],
      ['Description', 'Goal'],
      ['Acceptance criteria (2)', 'Spec scenarios'],
      ['Attachments (1 log)', 'Evidence for triage'],
    ],
  },
  github: {
    ref: 'taskelith#57',
    kind: 'Issue',
    type: 'feature',
    title: 'Support Forgejo as an SCM plugin',
    goal: 'Projects hosted on Forgejo get the same flow as GitHub: branches, pull requests, checks and merges through the SCM plugin port.',
    mapping: [
      ['Label: enhancement', 'Type: Feature'],
      ['Body', 'Goal'],
      ['Task list (4 items)', 'Proposal tasks'],
      ['Linked PRs: none', '—'],
    ],
  },
  confluence: {
    ref: 'Worker disk pressure policy',
    kind: 'Page',
    type: 'improvement',
    title: 'Worker disk pressure policy',
    goal: 'Workers above 80% disk keep running sessions, truncate only non-essential output, and stop admitting new work at 90%.',
    mapping: [
      ['Page body', 'Goal'],
      ['Decision table', 'Spec requirements'],
      ['Page labels: improvement', 'Type: Improvement'],
    ],
  },
  file: {
    ref: 'notes/lint-tooling.md',
    kind: 'File',
    type: 'maintenance',
    title: 'Add lint tooling to make verify',
    goal: 'make verify runs a pinned linter on all TypeScript sources and fails on new warnings.',
    mapping: [
      ['First heading', 'Title'],
      ['Body', 'Goal'],
      ['Word “tooling”', 'Type: Maintenance'],
    ],
  },
  url: {
    ref: 'Linked page',
    kind: 'Page',
    type: 'feature',
    title: 'Imported page title',
    goal: 'Summary of the linked page. Edit it before creating the task.',
    mapping: [
      ['Page title', 'Title'],
      ['Main content', 'Goal'],
    ],
  },
};

function optionOf(id: ChoiceId, value: string): Option {
  const option = CHOICES.find((c) => c.id === id)?.options.find((o) => o.id === value);
  if (!option) throw new Error('Unknown option ' + id + '=' + value);
  return option;
}

function sourceOf(id: SourceId) {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error('Unknown source ' + id);
  return source;
}

function slugOf(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return words ? words.split(' ').slice(0, 6).join('-') : '[task-name]';
}

function planSteps(values: Record<ChoiceId, string>) {
  const implementer =
    values.harness === 'auto' ? 'Claude Code (project default)' : optionOf('harness', values.harness).label;
  const reviewer =
    values.reviewer === 'auto'
      ? 'The next reviewer in rotation'
      : optionOf('reviewer', values.reviewer).label;
  const docs = values.framework === 'openspec' ? 'proposal, specs, design and tasks' : 'spec, plan and tasks';
  const approver =
    values.specApproval === 'me'
      ? 'A project-maintainer approves the spec.'
      : 'An independent reviewer approves the spec under maintainer policy.';
  return [
    {
      stage: 'Propose',
      text: 'Automatic inspection checks scope and duplicates, then admits the task as a planning task: no spec is needed yet.',
    },
    { stage: 'Specify', text: implementer + ' writes the ' + docs + '. ' + approver },
    { stage: 'Implement', text: implementer + ' works in its own worktree on a task branch.' },
    { stage: 'Verify', text: 'make verify and CI run on the task head.' },
    { stage: 'Review', text: reviewer + ' reviews the verified change read-only. At most 3 passes.' },
    {
      stage: 'Archived',
      text: 'Accept and integrate: auto-merge merges into dev, then the change is closed and archived and the session stops. Release follows the release policy (automatic from main); deployment needs separate owner authorization. Auto-merge never releases or deploys.',
    },
  ];
}

function artifactPaths(framework: string, slug: string): string[] {
  return framework === 'openspec'
    ? ['proposal.md', 'specs/', 'design.md', 'tasks.md'].map((f) => 'openspec/changes/' + slug + '/' + f)
    : ['spec.md', 'plan.md', 'tasks.md'].map((f) => 'specs/[NNN]-' + slug + '/' + f);
}

export function NewTaskScreen() {
  const { go } = usePoc();
  const [values, setValues] = useState(DEFAULTS);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState(false);
  const [sending, setSending] = useState(false);
  const [ids, setIds] = useState(newRequestIds);
  const [source, setSource] = useState<SourceId>('github');
  const [sourceInput, setSourceInput] = useState('');
  const [imported, setImported] = useState<{
    sourceName: string;
    ref: string;
    kind: string;
    mapping: [string, string][];
  } | null>(null);
  const hasTitle = title.trim() !== '';
  const slug = slugOf(title);

  const importSource = () => {
    const sample = SAMPLES[source];
    setTitle(sample.title);
    setGoal(sample.goal);
    setValues({ ...values, type: sample.type });
    setTouched(true);
    setImported({
      sourceName: sourceOf(source).label,
      ref: sourceInput.trim() || sample.ref,
      kind: sample.kind,
      mapping: sample.mapping,
    });
  };
  const reset = () => {
    setValues(DEFAULTS);
    setTitle('');
    setGoal('');
    setTouched(false);
    setCreated(false);
    setIds(newRequestIds());
    setSource('github');
    setSourceInput('');
    setImported(null);
  };
  const create = () => {
    if (!hasTitle) {
      setTouched(true);
      return;
    }
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      setCreated(true);
    }, CREATE_DELAY);
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="New task"
        crumbs={
          <Breadcrumbs>
            <ScreenLink to="board">Board</ScreenLink>
            <Text size="sm">New task</Text>
          </Breadcrumbs>
        }
        description="Describe the outcome or import it. Everything else has a default; change only what you need."
        aside={
          <Group gap="sm">
            <Badge variant="light" color="teal" size="lg">
              Auto-merge On · from project
            </Badge>
            <Button variant="default" onClick={() => go('board')}>
              Cancel
            </Button>
            <RoleButton
              capability="submit-task"
              onClick={create}
              disabled={!hasTitle || created}
              loading={sending}
            >
              Create task
            </RoleButton>
          </Group>
        }
      />
      {created ? (
        <Notification color="teal" withCloseButton={false} role="status" withBorder>
          <Group justify="space-between" gap="sm">
            <Text size="sm">
              Created “{title.trim()}” ({optionOf('framework', values.framework).label})
              {imported ? ' from ' + imported.ref : ''} as {ids.runId} with planning task {ids.taskId}. A
              retry sends the same IDs, so it cannot create a second run.
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="light" onClick={() => go('board')}>
                Go to board
              </Button>
              <Button size="xs" variant="default" onClick={reset}>
                Create another
              </Button>
            </Group>
          </Group>
        </Notification>
      ) : null}
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Paper withBorder p="md" radius="md" component="section" aria-labelledby="describe-heading">
            <Stack gap="md">
              <Title order={2} size="h5" id="describe-heading">
                1 · Describe or import
              </Title>
              <SegmentedControl
                aria-label="Source"
                value={source}
                fullWidth
                onChange={(v) => {
                  setSource(v as SourceId);
                  setSourceInput('');
                }}
                data={SOURCES.map((s) => ({ value: s.id, label: s.label, disabled: s.later }))}
              />
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  flex={1}
                  label="Source reference"
                  value={sourceInput}
                  placeholder={sourceOf(source).placeholder}
                  onChange={(event) => setSourceInput(event.currentTarget.value)}
                />
                <Button variant="light" onClick={importSource}>
                  Import
                </Button>
              </Group>
              {imported ? (
                <Paper withBorder p="sm" radius="md">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Text size="sm" fw={600}>
                        {imported.kind} from {imported.sourceName}
                      </Text>
                      <Code>{imported.ref}</Code>
                    </Group>
                    <Group gap={6}>
                      {imported.mapping.map(([from, to]) => (
                        <Badge key={from} variant="default" tt="none">
                          {from} → {to}
                        </Badge>
                      ))}
                    </Group>
                    <Text size="xs" c="dimmed">
                      Stays linked: progress and the PR are posted back, the source is resolved on merge, and
                      feedback there becomes a lesson.
                    </Text>
                  </Stack>
                </Paper>
              ) : null}
              <TextInput
                label="Title"
                placeholder="e.g. Forgejo SCM plugin"
                value={title}
                withAsterisk
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                  setTouched(true);
                }}
                error={touched && !hasTitle ? 'Add a title to create the task.' : undefined}
                description={touched && !hasTitle ? undefined : 'Change name: ' + slug}
              />
              <Textarea
                label="What should be true when it is done?"
                autosize
                minRows={6}
                value={goal}
                placeholder="Outcome, constraints, links. The harness turns this into a proposal and spec."
                onChange={(event) => setGoal(event.currentTarget.value)}
              />
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Paper withBorder p="md" radius="md" component="section" aria-labelledby="defaults-heading">
            <Stack gap="md">
              <Title order={2} size="h5" id="defaults-heading">
                2 · Defaults
              </Title>
              {CHOICES.map((choice) => (
                <Stack key={choice.id} gap={4}>
                  <Text size="sm" fw={500} id={'choice-' + choice.id}>
                    {choice.label}
                  </Text>
                  <SegmentedControl
                    aria-labelledby={'choice-' + choice.id}
                    orientation="vertical"
                    fullWidth
                    size="xs"
                    value={values[choice.id]}
                    onChange={(v) => setValues({ ...values, [choice.id]: v })}
                    data={choice.options.map((o) => ({
                      value: o.id,
                      label: o.later ? o.label + ' · ' + o.later : o.label,
                      disabled: !!o.later,
                    }))}
                  />
                  <Text size="xs" c="dimmed">
                    {optionOf(choice.id, values[choice.id]).hint}
                  </Text>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <Paper withBorder p="md" radius="md" component="section" aria-labelledby="next-heading">
            <Stack gap="md">
              <Title order={2} size="h5" id="next-heading">
                3 · What happens next
              </Title>
              <Timeline active={-1} bulletSize={22} lineWidth={2}>
                {planSteps(values).map((step, i) => (
                  <Timeline.Item
                    key={step.stage}
                    bullet={
                      <Text size="xs" fw={600}>
                        {i + 1}
                      </Text>
                    }
                    title={
                      <Text size="sm" fw={600}>
                        {step.stage}
                      </Text>
                    }
                  >
                    <Text size="xs" c="dimmed">
                      {step.text}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
              <Stack gap={6}>
                <Title order={3} size="h6">
                  Native artifacts
                </Title>
                {artifactPaths(values.framework, slug).map((path) => (
                  <Code key={path}>{path}</Code>
                ))}
                <Text size="xs" c="dimmed">
                  The framework is bound to the run. Changing it later is an explicit migration: work is
                  checkpointed, the original artifacts are kept, affected approvals are invalidated and a new
                  binding is recorded.
                </Text>
              </Stack>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
