import { Button, Menu, Text, type MantineBreakpoint } from '@mantine/core';
import { CheckIcon, ChevronIcon } from '../icons';
import { useProjects } from './ProjectsProvider';

interface ProjectPickerProps {
  readonly visibleFrom?: MantineBreakpoint;
  readonly hiddenFrom?: MantineBreakpoint;
  readonly fullWidth?: boolean;
}

// The header's project menu; it shows once the operator has a project.
export function ProjectPicker({ visibleFrom, hiddenFrom, fullWidth }: ProjectPickerProps) {
  const { view, select } = useProjects();
  if (view.status !== 'listed' || view.selected === undefined) return null;
  const { projects, selected } = view;
  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button
          variant="default"
          rightSection={<ChevronIcon />}
          visibleFrom={visibleFrom}
          hiddenFrom={hiddenFrom}
          fullWidth={fullWidth}
        >
          <Text span mr={6} inherit>
            Project:
          </Text>
          <Text span fw={700} maw={160} truncate="end" display="inline-block" inherit>
            {selected.name}
          </Text>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Projects</Menu.Label>
        {projects.map((project) => {
          const isSelected = project.projectId === selected.projectId;
          return (
            <Menu.Item
              key={project.projectId}
              leftSection={isSelected ? <CheckIcon /> : undefined}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => select(project.projectId)}
            >
              {project.name}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
