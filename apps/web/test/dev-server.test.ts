// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { API_PATHS, CONTROL_PLANE_ORIGIN, devServer, devServerFiles } from '../dev-server';

const FILES = { ca: '/run/ca.pem', cert: '/run/dev.crt', key: '/run/dev.key' };
const read = (path: string) => Buffer.from(`contents of ${path}`);

describe('devServerFiles', () => {
  it('reads the CA and TLS file paths that make web-dev provides', () => {
    const env = { TASKELITH_WEB_DEV_CA: FILES.ca, TASKELITH_WEB_DEV_TLS_CERT: FILES.cert, TASKELITH_WEB_DEV_TLS_KEY: FILES.key };
    expect(devServerFiles(env)).toEqual(FILES);
  });

  it('refuses to start without them', () => {
    expect(() => devServerFiles({ TASKELITH_WEB_DEV_CA: FILES.ca })).toThrow('make web-dev');
  });
});

describe('devServer', () => {
  it('binds HTTPS to localhost only', () => {
    const options = devServer(FILES, read);
    expect(options.host).toBe('localhost');
    expect(options.strictPort).toBe(true);
    expect(options.https).toEqual({ cert: read(FILES.cert), key: read(FILES.key) });
  });

  it('proxies every path outside /app/ to the control plane, trusting only the installation CA', () => {
    const proxy = devServer(FILES, read).proxy![API_PATHS] as { target: string; secure: boolean; agent: { options: { ca: Buffer } } };
    expect(proxy.target).toBe(CONTROL_PLANE_ORIGIN);
    expect(proxy.secure).toBe(true);
    expect(proxy.agent.options.ca).toEqual(read(FILES.ca));
  });

  it('keeps the SPA and the dev server internals under /app/ local', () => {
    const pattern = new RegExp(API_PATHS);
    expect(['/session', '/projects/p1/board', '/events', '/application'].filter((path) => pattern.test(path))).toHaveLength(4);
    expect(['/app', '/app/', '/app/@vite/client', '/app/src/main.tsx'].some((path) => pattern.test(path))).toBe(false);
  });
});
