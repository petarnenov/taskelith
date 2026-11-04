// Fresh random identifiers, which become NATS subject tokens; an adapter
// makes them from a qualified random source.
export interface IdentifierSource {
  newInstallationId(): string;
  newWorkerId(): string;
  // `e` and 32 hexadecimal digits (control-plane wire contracts section 6).
  newEnrollmentTokenId(): string;
}
