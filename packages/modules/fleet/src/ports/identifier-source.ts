// Fresh random identifiers, which become NATS subject tokens; an adapter
// makes them from a qualified random source.
export interface IdentifierSource {
  newInstallationId(): string;
  newWorkerId(): string;
}
