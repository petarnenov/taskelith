#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const usage = `Taskelith — a self-hosted software factory for parallel projects.

Usage: taskelith [command]

Commands:
  plan          Print the bundled architecture and delivery plan
  --version, -v Print the installed package version
  --help, -h    Show this help

Bootstrap release: orchestration, workers, and the web UI are not implemented yet.
Project: https://github.com/petarnenov/taskelith
`;

if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]!))) {
  process.stdout.write(usage);
} else if (args.length === 1 && ['--version', '-v'].includes(args[0]!)) {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  process.stdout.write(`${manifest.version}\n`);
} else if (args.length === 1 && args[0] === 'plan') {
  process.stdout.write(readFileSync(new URL('../docs/architecture.md', import.meta.url), 'utf8'));
} else {
  process.stderr.write('Unsupported usage. Run taskelith --help for available commands.\n');
  process.exitCode = 2;
}
