// Preloaded into the OpenSpec CLI by the adapter tests: pins its clock to the
// fixtures' archive date, 2026-10-24 (UTC noon, with TZ=UTC).
const FIXED_TIME = Date.parse('2026-10-24T12:00:00Z');
const SystemDate = Date;

globalThis.Date = new Proxy(SystemDate, {
  construct: (target, args, newTarget) => Reflect.construct(target, args.length === 0 ? [FIXED_TIME] : args, newTarget),
  apply: () => new SystemDate(FIXED_TIME).toString(),
  get: (target, key, receiver) => (key === 'now' ? () => FIXED_TIME : Reflect.get(target, key, receiver)),
});
