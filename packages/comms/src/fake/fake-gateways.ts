import type { MessageGateway, OutboundMessage } from '../message-gateway'
import type { OutboundCall, VoiceGateway, VoiceStatusEvent } from '../voice-gateway'

export class FakeMessageGateway implements MessageGateway {
  readonly sent: OutboundMessage[] = []
  failuresRemaining = 0

  async sendSms(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1
      throw new Error('GatewayUnavailable')
    }
    this.sent.push(message)
    return { providerMessageId: `SM${this.sent.length}` }
  }
}

export class FakeVoiceGateway implements VoiceGateway {
  readonly placed: Array<OutboundCall & { providerCallId: string }> = []

  async placeCall(input: OutboundCall): Promise<{ providerCallId: string }> {
    const providerCallId = `CA${this.placed.length + 1}`
    this.placed.push({ ...input, providerCallId })
    return { providerCallId }
  }

  statusSequence(providerCallId: string): VoiceStatusEvent[] {
    return [
      { callStatus: 'ringing' },
      { callStatus: 'in-progress' },
      {
        callStatus: 'completed',
        recordingUrl: `https://recordings.example/${providerCallId}`,
        recordingSid: `RE${providerCallId}`,
        recordingDuration: '12',
      },
    ]
  }
}
