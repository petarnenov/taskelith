import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import type { ServerOptions } from 'vite';

// The development server of make web-dev: HTTPS on localhost only, with every
// path outside the SPA's base proxied to the control plane's browser endpoint.

export const CONTROL_PLANE_ORIGIN = 'https://127.0.0.1:8443';
export const API_PATHS = '^/(?!app(?:/|$))';

export interface DevServerFiles {
  readonly ca: string;
  readonly cert: string;
  readonly key: string;
}

export type ReadFile = (path: string) => Buffer;

export function devServerFiles(env: Readonly<Record<string, string | undefined>>): DevServerFiles {
  const { TASKELITH_WEB_DEV_CA: ca, TASKELITH_WEB_DEV_TLS_CERT: cert, TASKELITH_WEB_DEV_TLS_KEY: key } = env;
  if (!ca || !cert || !key) {
    throw new Error('Start the development server with make web-dev, which provides its CA and TLS files.');
  }
  return { ca, cert, key };
}

export function devServer(files: DevServerFiles, read: ReadFile = (path) => readFileSync(path)): ServerOptions {
  return {
    host: 'localhost',
    strictPort: true,
    https: { cert: read(files.cert), key: read(files.key) },
    proxy: {
      [API_PATHS]: { target: CONTROL_PLANE_ORIGIN, secure: true, agent: new Agent({ ca: read(files.ca) }) },
    },
  };
}
