export { InMemoryFleetRegistry, InMemoryInstallationRecord } from './adapters/in-memory-fleet.js';
export { InMemoryWorkerAdmissions, type InMemoryWorkerAdmissionsOptions } from './adapters/in-memory-worker-admissions.js';
export {
  EnrollmentService,
  type Enrollment,
  type EnrollmentServiceDependencies,
  type RotatedCredentials,
  type WorkerRevocation,
} from './application/enrollment-service.js';
export {
  InstallationService,
  type InitializedInstallation,
  type InstallationServiceDependencies,
} from './application/installation-service.js';
export {
  commonProtocolVersion,
  credentialGenerations,
  expiredPredecessor,
  hostMismatch,
  isExpired,
  revocationOf,
  rotateCredentials,
  validGenerations,
  type BrokerRevocation,
  type CredentialGeneration,
  type EnrolledWorker,
  type EnrollmentRequest,
  type EnrollmentToken,
  type HostArchitecture,
  type HostConstraints,
  type HostPlatform,
  type ProtocolWindow,
  type Rotation,
  type WorkerCapacity,
  type WorkerCredentials,
  type WorkerHost,
  type WorkerPrincipal,
} from './domain/enrollment.js';
export { FLEET_LIMITS, type FleetLimits } from './domain/fleet-limits.js';
export {
  FIRST_RECOVERY_EPOCH,
  installationIdentity,
  isSameInstallation,
  parseInstallationId,
  parseWorkerId,
  type InstallationIdentity,
} from './domain/installation.js';
export type { BrokerCredentials, IssuedBrokerCredential } from './ports/broker-credentials.js';
export type { WorkerCommandConsumers } from './ports/command-consumers.js';
export {
  CERTIFICATE_ISSUER_CONFORMANCE,
  type CertificateInspector,
  type CertificateIssuerConformanceTarget,
} from './ports/certificate-issuer-conformance.js';
export { FLEET_REGISTRY_CONFORMANCE, INSTALLATION_TABLE_CONFORMANCE, fleetToken, fleetWorker } from './ports/fleet-conformance.js';
export type { EnrollmentClient } from './ports/enrollment-client.js';
export type { FleetRegistry } from './ports/fleet-registry.js';
export type { IdentifierSource } from './ports/identifier-source.js';
export type { InstallationRecord, InstallationTable } from './ports/installation-records.js';
export {
  AUTHORITY_VALIDITY_DAYS,
  SERVER_CERTIFICATE_BACKDATE_MILLISECONDS,
  SERVER_CERTIFICATE_VALIDITY_DAYS,
  authorityValidity,
  hasExpired,
  serverCertificateValidity,
  type CertificateValidity,
} from './domain/installation-certificates.js';
export type {
  AuthorityRequest,
  CertificateIssuer,
  IssuedCertificate,
  ServerCertificateRequest,
  ServerHost,
} from './ports/certificate-issuer.js';
export {
  LINUX_CONTAINMENT_CHECK_ID,
  LINUX_CONTAINMENT_SCOPE,
  REQUIRED_SELF_CHECKS,
  WORKER_ADMISSION_STATES,
  decideWorkerAdmission,
  notApplicableReason,
  type SelfCheckScope,
  type StartFacts,
  type WorkerAdmissionDecision,
  type WorkerAdmissionState,
} from './domain/worker-admission.js';
export type { SelfCheckRun, WorkerAdmissionCheck } from './ports/worker-admission-check.js';
export { WORKER_ADMISSION_CONFORMANCE, stubAdmissionCheck, type WorkerAdmissionFixture } from './ports/worker-admission-conformance.js';
export type {
  AdmissionRecording,
  WorkerAdmissionEntry,
  WorkerAdmissionSnapshot,
  WorkerAdmissions,
  WorkerAdmissionView,
} from './ports/worker-admissions.js';
