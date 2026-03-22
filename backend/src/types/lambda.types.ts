/**
 * Shared Lambda type definitions for EventBridge-triggered functions.
 */

export interface ScheduledEvent {
  source: string;
  action: string;
}
