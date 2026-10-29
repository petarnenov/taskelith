export { InMemoryLogSink } from './adapters/in-memory-log-sink.js';
export { InMemoryMetrics, type SeriesSummary } from './adapters/in-memory-metrics.js';
export { recordControlPlaneSnapshot, sampleControlPlane } from './application/control-plane-snapshot.js';
export { Logger, SILENT_LOGGER } from './application/logger.js';
export {
  CORRELATION_KEYS,
  LOG_LEVELS,
  pickCorrelation,
  type CorrelationKey,
  type LogCorrelation,
  type LogFields,
  type LogLevel,
  type LogRecord,
  type LogValue,
} from './domain/log-record.js';
export { isSecretFieldName, redactCorrelation, redactFields, redactText } from './domain/redaction.js';
export {
  MARKED_SECRET_RULES,
  pemPrivateKeySpans,
  REDACTED,
  redactAuthorizationValues,
  redactBearerTokens,
  redactCredsBlocks,
  redactIssuedSecrets,
  redactJwts,
  redactJwtsWithEmptyParts,
  redactKeyColonValues,
  redactKeyValuePairs,
  redactNkeySeeds,
  redactPemPrivateKeys,
  redactSchemelessUserinfo,
  redactUrlUserinfo,
  redactUrlUserinfoEvenEmpty,
  redactWith,
  replaceSpans,
  SECRET_BLOCK_MARKERS,
  SECRET_SHAPE_RULES,
  textRule,
  TOKEN_SHAPE_RULES,
  type TextRule,
  type TextSpan,
} from './domain/redaction-rules.js';
export {
  G2_SIGNALS,
  measurement,
  SIGNAL_KINDS,
  type Measurement,
  type SignalDefinition,
  type SignalKind,
  type SignalLabels,
  type SignalName,
  type SignalUnit,
} from './domain/signals.js';
export type { ControlPlaneSignals, ControlPlaneSnapshot } from './ports/control-plane-signals.js';
export { NO_LOGS, type LogSink } from './ports/log-sink.js';
export { NO_METRICS, type Metrics } from './ports/metrics.js';
export { CONTROL_PLANE_SIGNALS_CONFORMANCE, LOG_SINK_CONFORMANCE, METRICS_CONFORMANCE } from './ports/port-conformance.js';
