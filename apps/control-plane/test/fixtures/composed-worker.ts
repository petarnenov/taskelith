import { registerHooks } from 'node:module';

// The worker process of a crash scenario. Every import of the worker journal
// resolves to the armed journal, so the hook comes before the worker loads.
const ARMED_JOURNAL = new URL('./armed-journal.ts', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@taskelith/worker-journal' && context.parentURL !== ARMED_JOURNAL) return { url: ARMED_JOURNAL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

await import('./worker-composition.ts');
