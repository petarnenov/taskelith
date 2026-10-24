import { readFileSync } from 'node:fs';

// Run from the repository root. Output contains only public registry metadata.
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const npmPins = [...workflow.matchAll(/npm install --global npm@([\d.]+) --ignore-scripts/g)]
  .map(match => match[1]);
if (npmPins.length !== 2 || new Set(npmPins).size !== 1) {
  throw new Error('Expected matching explicit npm pins in both workflow jobs');
}

const packages: Record<string, string> = { ...manifest.devDependencies, npm: npmPins[0] };
const records = await Promise.all(Object.entries(packages).map(async ([name, version]) => {
  const source = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${name}: registry returned ${response.status}`);
  const pack = await response.json();
  const metadata = pack.versions[version];
  if (!metadata) throw new Error(`Missing registry version: ${name}@${version}`);
  return {
    name, version, source,
    published: pack.time[version],
    latest: pack['dist-tags'].latest,
    latestPublished: pack.time[pack['dist-tags'].latest],
    license: metadata.license,
    engines: metadata.engines ?? null,
    repository: metadata.repository,
    integrity: metadata.dist.integrity,
  };
}));

process.stdout.write(JSON.stringify({ checkedOn: new Date().toISOString().slice(0, 10), records }, null, 2) + '\n');
