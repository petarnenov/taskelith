import { Avatar, Menu, Text, UnstyledButton } from '@mantine/core';
import type { Operator } from '../session/session';
import { TARGET_SIZE } from '../theme';

interface AccountMenuProps {
  readonly operator: Operator;
  readonly onLogOut: () => void;
}

export function AccountMenu({ operator, onLogOut }: AccountMenuProps) {
  return (
    <Menu position="bottom-end" width={300} withArrow>
      <Menu.Target>
        <UnstyledButton aria-label="Account menu">
          <Avatar size={TARGET_SIZE} radius="xl" color="indigo">
            {initials(operator.loginName)}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Signed in as {operator.loginName}</Menu.Label>
        <Text size="xs" c="dimmed" px="sm" pb="xs">
          {rolesText(operator.installationRoles)}
        </Text>
        <Menu.Divider />
        <Menu.Item onClick={onLogOut}>Sign out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function initials(loginName: string): string {
  return loginName.slice(0, 2).toUpperCase();
}

function rolesText(roles: readonly string[]): string {
  return roles.length === 0 ? 'No installation-wide role' : `${roles.join(', ')} (installation-wide)`;
}
