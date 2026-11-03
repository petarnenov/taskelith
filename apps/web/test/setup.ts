// jsdom has no matchMedia, which Mantine's color scheme manager reads, and
// no ResizeObserver, which Mantine's ScrollArea creates.
if (typeof window !== 'undefined') {
  stubMatchMedia(window);
  stubResizeObserver(window);
}

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

function stubResizeObserver(target: Window): void {
  class StillResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(target, 'ResizeObserver', { configurable: true, value: StillResizeObserver });
}
