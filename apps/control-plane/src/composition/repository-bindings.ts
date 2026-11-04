import type { ProjectSetupService } from '@taskelith/access';
import {
  RepositoryBindingService,
  type BindableProjects,
  type RepositoryBindingServicePorts,
  type ScmPluginDefects,
} from '@taskelith/integrations';
import type { Logger } from '@taskelith/observability';
import { projectDirectory } from './project-directory.js';

export type RepositoryBindingPorts = Omit<RepositoryBindingServicePorts, 'defects'>;

// The service whose plugin defects become one sanitized error record each.
export function repositoryBindingService(ports: RepositoryBindingPorts, logger: Logger): RepositoryBindingService {
  return new RepositoryBindingService({ ...ports, defects: pluginDefectLog(logger) });
}

// One sanitized error record per plugin defect, of any SCM plugin call; a
// defect of the webhook decoy names no integration.
export function pluginDefectLog(logger: Logger): ScmPluginDefects {
  return {
    defect: ({ integrationId, pluginId, operation, kind }) => logger.error('scm.plugin.defect', {
      ...(integrationId === undefined ? {} : { integrationId }), pluginId, operation, kind,
    }),
  };
}

// The Access module's projects as the integrations module asks for them.
export function bindableProjects(projects: Pick<ProjectSetupService, 'readProject'>): BindableProjects {
  return projectDirectory(projects);
}
