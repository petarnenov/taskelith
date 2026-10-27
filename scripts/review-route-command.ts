import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CHECKLIST_SCHEMA_PATH } from './checklist-record.ts';
import { ajvSchemaCheck, SCHEMA_PATH, type RunResult } from './findings.ts';
import type { SchemaCheck } from './review-findings.ts';
import { ROUTE_FILE, ROUTE_SCHEMA_PATH, SKIPPED_SHADOW, type ReviewRouter, type RuleDecision, type ShadowDecision } from './review-route.ts';
import { GIT_ROUTE_ENVIRONMENT } from './review-route-environment.ts';
import { changeDirectory, RouteRefusal, routeSubject, type RouteEnvironment } from './review-route-features.ts';
import { CREDENTIAL_VARIABLE, Credential, JevRouter } from './review-route-jev.ts';
import { formatRouteRecord, formatRouteSummary, routeRecordProblems, type RouteRecord } from './review-route-record.ts';
import { RuleRouter } from './review-route-rules.ts';

// The route command: derives the features of an active change, routes
// them by the rule and the shadow router, and writes route.json.

export const ROUTE_USAGE = 'Usage: route --change <change> [--json] [--no-shadow]';

const CHANGE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface RouteDependencies {
  readonly environment: RouteEnvironment;
  readonly rule: ReviewRouter<RuleDecision>;
  readonly shadow: ReviewRouter<ShadowDecision>;
  readonly checkSchema: SchemaCheck;
  readonly now: () => Date;
}

interface RouteOptions {
  readonly change: string;
  readonly json: boolean;
  readonly consultShadow: boolean;
}

class RouteUsageError extends Error {}

export async function runRoute(args: readonly string[], root: string, dependencies: RouteDependencies): Promise<RunResult> {
  let options: RouteOptions;
  try {
    options = parseRouteOptions(args);
  } catch (error) {
    if (!(error instanceof RouteUsageError || isParseArgsError(error))) throw error;
    return { exitCode: 2, stdout: '', stderr: `${(error as Error).message}\n${ROUTE_USAGE}\n` };
  }
  try {
    return await route(options, root, dependencies);
  } catch (error) {
    if (!(error instanceof RouteRefusal)) throw error;
    return { exitCode: 1, stdout: '', stderr: `route: ${error.message}; nothing written\n` };
  }
}

function parseRouteOptions(args: readonly string[]): RouteOptions {
  const { values } = parseArgs({
    args: [...args],
    options: {
      change: { type: 'string' },
      json: { type: 'boolean', default: false },
      'no-shadow': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const change = values.change;
  if (change === undefined) throw new RouteUsageError('--change is required');
  if (!CHANGE_NAME.test(change) || change === 'archive') throw new RouteUsageError('--change must name an active change');
  return { change, json: values.json, consultShadow: !values['no-shadow'] };
}

function isParseArgsError(error: unknown): boolean {
  return error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS_');
}

async function route(options: RouteOptions, root: string, dependencies: RouteDependencies): Promise<RunResult> {
  refuseExistingRoute(root, options.change);
  const subject = routeSubject(root, options.change, dependencies.environment);
  const rule = await dependencies.rule.route(subject.features);
  const shadow = options.consultShadow ? await dependencies.shadow.route(subject.features) : SKIPPED_SHADOW;
  const record: RouteRecord = { change: options.change, generatedAt: dependencies.now().toISOString(), ...subject, rule, shadow };
  const problems = routeRecordProblems(record, options.change, dependencies.checkSchema);
  if (problems.length > 0) throw new RouteRefusal(`the route record is invalid: ${problems.join('; ')}`);
  writeRoute(root, options.change, record);
  return {
    exitCode: 0,
    stdout: options.json ? formatRouteRecord(record) : `${formatRouteSummary(record)}\n`,
    stderr: shadowNotice(shadow),
  };
}

function routePath(change: string): string {
  return `${changeDirectory(change)}/${ROUTE_FILE}`;
}

function existingRouteRefusal(change: string): RouteRefusal {
  return new RouteRefusal(`${routePath(change)} exists; delete it to route again`);
}

// Checked before any router runs, so a refused route costs no request.
function refuseExistingRoute(root: string, change: string): void {
  if (existsSync(join(root, routePath(change)))) throw existingRouteRefusal(change);
}

// The wx flag refuses a file that appeared since the first check.
function writeRoute(root: string, change: string, record: RouteRecord): void {
  try {
    writeFileSync(join(root, routePath(change)), formatRouteRecord(record), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw existingRouteRefusal(change);
    throw error;
  }
}

function shadowNotice(shadow: ShadowDecision): string {
  if (shadow.status !== 'failed') return '';
  const hint = shadow.reason === 'missing-credential' ? `; set ${CREDENTIAL_VARIABLE} to consult the shadow router` : '';
  return `shadow router failed (${shadow.reason}); the rule decided alone${hint}\n`;
}

// The composition root: the only place that reads the credential.
export function routeDependencies(root: string, environment: NodeJS.ProcessEnv): RouteDependencies {
  return {
    environment: GIT_ROUTE_ENVIRONMENT,
    rule: new RuleRouter(),
    shadow: new JevRouter({ credential: Credential.fromEnvironment(environment) }),
    checkSchema: routeSchemaCheck(root),
    now: () => new Date(),
  };
}

export function routeSchemaCheck(root: string): SchemaCheck {
  const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as object;
  return ajvSchemaCheck(read(ROUTE_SCHEMA_PATH), [read(SCHEMA_PATH), read(CHECKLIST_SCHEMA_PATH)]);
}
