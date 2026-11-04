import type { Result } from '@taskelith/kernel';

// The projects a run may belong to; the Access module keeps them.
export interface ProjectDirectory {
  exists(projectId: string): Promise<Result<boolean>>;
}
