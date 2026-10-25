// Git hooks export GIT_DIR and related variables; fixtures drop them so that
// their git commands act on their own repository, never on this one.
export const fixtureEnv: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
);
