import type { Result } from '@taskelith/kernel';

// The port a harness plugin implements (agent harness port contract). Plain
// data, which the module parses: plugin output is untrusted.
export const AGENT_HARNESS_PORT_VERSION = '0.1.0';

export const HARNESS_CAPABILITIES = Object.freeze([
  'chat',
  'prompt-correlation',
  'resume',
  'permission-requests',
  'input-requests',
  'interruption',
  'exit-observation',
  'delegation',
  'terminal',
] as const);

export type HarnessCapability = (typeof HARNESS_CAPABILITIES)[number];

// Every harness declares these; the others are optional, and an operation
// of an undeclared one fails with `unavailable`.
export const REQUIRED_HARNESS_CAPABILITIES = Object.freeze([
  'chat',
  'prompt-correlation',
  'permission-requests',
  'interruption',
  'exit-observation',
] as const satisfies readonly HarnessCapability[]);

export const SUBSCRIPTION_MECHANISMS = Object.freeze(['subscription-token', 'device-login'] as const);

export type SubscriptionMechanism = (typeof SUBSCRIPTION_MECHANISMS)[number];

export const ACCOUNT_SIGNALS = Object.freeze(['usage', 'limit', 'reset-time'] as const);

export type AccountSignal = (typeof ACCOUNT_SIGNALS)[number];

export const HARNESS_PLATFORMS = Object.freeze(['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const);

export type HarnessPlatform = (typeof HARNESS_PLATFORMS)[number];

export const TURN_OUTCOMES = Object.freeze([
  'completed',
  'interrupted',
  'turn-limit-reached',
  'account-limit-reached',
  'failed',
] as const);

export type TurnOutcome = (typeof TURN_OUTCOMES)[number];

export const HARNESS_FAILURES = Object.freeze(['authentication', 'transport', 'harness-exited', 'protocol', 'internal'] as const);

export type HarnessFailure = (typeof HARNESS_FAILURES)[number];

export const SESSION_END_REASONS = Object.freeze(['closed', 'exited', 'failed'] as const);

export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export const PERMISSION_DECISIONS = Object.freeze(['allow', 'deny'] as const);

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

export const DELEGATION_OUTCOMES = Object.freeze(['completed', 'rejected', 'failed', 'cancelled'] as const);

export type DelegationOutcome = (typeof DELEGATION_OUTCOMES)[number];

// Native actions a plugin may classify; the host maps them to standing rule
// operations, so a push to the task's branch becomes push-to-task-branch.
export const CLASSIFIED_OPERATION_KINDS = Object.freeze(['push'] as const);

export type ClassifiedOperationKind = (typeof CLASSIFIED_OPERATION_KINDS)[number];

export const MAX_HARNESS_TEXT_LENGTH = 65_536;

export interface PinnedBinaryData {
  readonly platform: string;
  readonly version: string;
  readonly sha256: string;
}

export interface AgentHarnessCapabilities {
  readonly supported: readonly string[];
  readonly subscriptionMechanisms: readonly string[];
  readonly accountSignals: readonly string[];
  readonly binaries: readonly PinnedBinaryData[];
}

// The slot credential, injected into this session only; it never enters an
// event, a failure, or a log.
export interface SlotCredentialData {
  readonly mechanism: string;
  readonly secret: string;
}

// `generation` counts the native processes of one session, starting at 1;
// every start or resume uses the next one.
export interface StartSessionRequest {
  readonly sessionId: string;
  readonly generation: number;
  readonly workingDirectory: string;
  readonly stateDirectory: string;
  readonly credential: SlotCredentialData;
}

export interface ResumeSessionRequest extends StartSessionRequest {
  readonly nativeSessionId: string;
}

export interface SessionHandleData {
  readonly nativeSessionId: string;
}

export interface SessionRequest {
  readonly nativeSessionId: string;
  readonly generation: number;
}

export interface TurnRequest extends SessionRequest {
  readonly turnId: string;
  readonly text: string;
}

export interface InterruptRequest extends SessionRequest {
  readonly turnId: string;
}

export type ResponseData =
  | { readonly kind: 'permission'; readonly decision: string; readonly message?: string }
  | { readonly kind: 'input'; readonly text: string }
  | { readonly kind: 'delegation-result'; readonly delegationId: string; readonly outcome: string; readonly summary: string };

export interface RespondRequest extends SessionRequest {
  readonly nativeRequestId: string;
  readonly response: ResponseData;
}

export interface TerminalProgramData {
  readonly argv: readonly string[];
  readonly workingDirectory: string;
}

export interface ClassifiedOperationData {
  readonly kind: string;
  readonly ref: string;
}

export type HarnessEventData =
  | { readonly kind: 'output'; readonly turnId: string; readonly text: string }
  | {
    readonly kind: 'permission-request';
    readonly turnId: string;
    readonly nativeRequestId: string;
    readonly summary: string;
    readonly operation?: ClassifiedOperationData;
  }
  | { readonly kind: 'input-request'; readonly turnId: string; readonly nativeRequestId: string; readonly prompt: string }
  | { readonly kind: 'delegation-request'; readonly turnId: string; readonly nativeRequestId: string; readonly instructions: string }
  | { readonly kind: 'account-signal'; readonly signal: 'usage'; readonly usage: number }
  | { readonly kind: 'account-signal'; readonly signal: 'limit'; readonly resetsAt?: string }
  | { readonly kind: 'turn-ended'; readonly turnId: string; readonly outcome: string; readonly failure?: string }
  | { readonly kind: 'session-ended'; readonly reason: string; readonly exitCode?: number; readonly signal?: string };

// Operations return expected outcomes as kernel Results and never throw;
// `events` has one subscriber per generation and ends after session-ended.
export interface AgentHarness {
  readonly capabilities: AgentHarnessCapabilities;
  startSession(request: StartSessionRequest): Promise<Result<SessionHandleData>>;
  resumeSession(request: ResumeSessionRequest): Promise<Result<SessionHandleData>>;
  events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>>;
  submitTurn(request: TurnRequest): Promise<Result<void>>;
  interrupt(request: InterruptRequest): Promise<Result<void>>;
  respond(request: RespondRequest): Promise<Result<void>>;
  terminalProgram(request: SessionRequest): Promise<Result<TerminalProgramData>>;
  closeSession(request: SessionRequest): Promise<Result<void>>;
}

export type AgentHarnessOperation = Exclude<keyof AgentHarness, 'capabilities'>;
