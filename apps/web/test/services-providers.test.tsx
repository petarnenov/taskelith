import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardServices } from '../src/board/BoardServices';
import { useWorkersGateway } from '../src/workers/WorkersServices';

// React reports a render that threw on the console; the throw is the point.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('the services hooks', () => {
  it.each([
    ['useBoardServices', useBoardServices, 'useBoardServices needs a BoardServicesProvider.'],
    ['useWorkersGateway', useWorkersGateway, 'useWorkersGateway needs a WorkersServicesProvider.'],
  ])('%s refuses to run outside its provider', (_, hook, message) => {
    function Orphan() {
      hook();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(message);
  });
});
