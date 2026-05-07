/**
 * Lambda event handlers module.
 *
 * Exports SQS Lambda handlers for audit, memory, alert, workflow, and learning events.
 */
export { createAuditHandler } from './audit-handler.js';
export type { AuditHandlerConfig, SQSEvent, SQSRecord, SQSBatchResponse } from './audit-handler.js';

export { createMemoryHandler } from './memory-handler.js';
export type { MemoryHandlerConfig } from './memory-handler.js';

export { createAlertHandler } from './alert-handler.js';
export type { AlertHandlerConfig, AlertSeverity, FormattedAlert } from './alert-handler.js';

export { createWorkflowHandler } from './workflow-handler.js';
export type { WorkflowHandlerConfig } from './workflow-handler.js';

export { createLearningHandler, LearningEventHandler } from '../learning/handler.js';
export type { LearningHandlerConfig, LearningEvent } from '../learning/handler.js';

export { createSMEHandler, SMEEventHandler, HeartbeatRuntimeIntegration } from './sme-handler.js';
export type { SMEHandlerConfig, SMEEvent, SMEEventType } from './sme-handler.js';

export { createBaselineUpdatedHandler, handler as baselineUpdatedHandler } from './baseline-updated-handler.js';
export type {
  BaselineUpdatedHandlerConfig,
  BaselineUpdatedEvent,
  TrainingCascadeNotification,
  QualityGateReloadNotification,
} from './baseline-updated-handler.js';
