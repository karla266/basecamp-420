import type { AppContext } from '../context'
import type { QueueName } from './queue'

export async function dispatchJob(
  app: AppContext,
  job: { queue: QueueName; data: Record<string, unknown> },
): Promise<void> {
  const requestId = typeof job.data.requestId === 'string' ? job.data.requestId : undefined
  switch (job.queue) {
    case 'messages.outbound':
      await app.messaging.deliverOutbound(String(job.data.messageId), requestId)
      return
    case 'messages.inbound':
      await app.messaging.processInbound({
        messageSid: String(job.data.messageSid),
        from: String(job.data.from),
        to: String(job.data.to),
        body: String(job.data.body),
        requestId,
      })
      return
    case 'calls.outbound':
      await app.calls.dial(String(job.data.callId), requestId)
      return
    case 'calls.status':
      await app.calls.applyStatus({
        callSid: String(job.data.callSid),
        callStatus: String(job.data.callStatus),
        recordingUrl: typeof job.data.recordingUrl === 'string' ? job.data.recordingUrl : undefined,
        recordingSid: typeof job.data.recordingSid === 'string' ? job.data.recordingSid : undefined,
        recordingDuration:
          typeof job.data.recordingDuration === 'string' ? job.data.recordingDuration : undefined,
        requestId,
      })
      return
    case 'automations.tick':
      await app.automations.processDue()
      return
    default:
      return
  }
}
