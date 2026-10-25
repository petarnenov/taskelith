export const SERVICES_REMEDY = 'run make test or make verify, or export the URLs that make services-up prints';

// A service URL that scripts/services.sh exports for integration tests;
// without it the test fails at once and names the remedy.
export function integrationEndpoint(variable: string, env: NodeJS.ProcessEnv = process.env): URL {
  const value = env[variable];
  if (!value || !URL.canParse(value)) throw new Error(`${variable} is not set to a URL; ${SERVICES_REMEDY}`);
  return new URL(value);
}
