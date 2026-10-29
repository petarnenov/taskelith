// jsdom has no matchMedia, which Mantine's color scheme manager reads.
if (typeof window !== 'undefined') stubMatchMedia(window);

function stubMatchMedia(target: Window): void {
  Object.defineProperty(target, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
