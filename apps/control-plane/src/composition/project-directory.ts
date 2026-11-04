import type { ProjectSetupService } from '@taskelith/access';
import { ok } from '@taskelith/kernel';
import type { ProjectDirectory } from '../application/project-directory.js';

// The Access module's projects as an existence lookup.
export function projectDirectory(projects: Pick<ProjectSetupService, 'readProject'>): ProjectDirectory {
  return {
    exists: async (projectId) => {
      const read = await projects.readProject(projectId);
      if (read.ok) return ok(true);
      return read.error.code === 'not-found' ? ok(false) : read;
    },
  };
}
