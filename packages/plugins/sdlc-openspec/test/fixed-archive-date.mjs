// Preloaded into the OpenSpec CLI by the adapter tests: pins its clock to the
// fixtures' archive date, 2026-10-24 (UTC noon, with TZ=UTC).
const FIXED_TIME = Date.parse('2026-10-24T12:00:00Z');
const SystemDate = Date;

globalThis.Date = class FixedDate extends SystemDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED_TIME);
    else super(...args);
  }

  static now() {
    return FIXED_TIME;
  }
};
