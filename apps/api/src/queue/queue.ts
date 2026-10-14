export const QUEUE_NAMES = [
  'messages.outbound',
  'messages.inbound',
  'calls.outbound',
  'calls.status',
  'automations.tick',
] as const

export type QueueName = (typeof QUEUE_NAMES)[number]

export interface JobEnqueuer {
  enqueue(queue: QueueName, data: Record<string, unknown>): Promise<void>
}
