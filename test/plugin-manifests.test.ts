import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PLUGIN_API_VERSION, registerPlugin } from '@taskelith/plugin-sdk';

// Every bundled plugin's manifest, exported as `*_PLUGIN_MANIFEST`, must
// accept the plugin API version that the SDK implements.

const PLUGINS = join(import.meta.dirname, '..', 'packages', 'plugins');

async function bundledManifests(): Promise<Map<string, { readonly id: string; readonly port: string; readonly pluginApiRange: string }>> {
  const manifests = new Map();
  for (const dir of readdirSync(PLUGINS).sort()) {
    const { name } = JSON.parse(readFileSync(join(PLUGINS, dir, 'package.json'), 'utf8')) as { name: string };
    const exports = (await import(name)) as Record<string, unknown>;
    for (const [key, manifest] of Object.entries(exports)) {
      if (key.endsWith('_PLUGIN_MANIFEST')) manifests.set(`${name} ${key}`, manifest);
    }
  }
  return manifests;
}

test('every bundled plugin manifest accepts the SDK plugin API version', async () => {
  const manifests = await bundledManifests();
  assert.deepEqual([...manifests.values()].map((manifest) => manifest.id).sort(), ['scm-github', 'sdlc-openspec']);
  for (const [name, manifest] of manifests) {
    const registered = registerPlugin(manifest, { ports: [manifest.port] });
    assert.ok(registered.ok, `${name} declares ${manifest.pluginApiRange}, which excludes ${PLUGIN_API_VERSION}`);
  }
});
