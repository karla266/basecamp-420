export type OutboundCall = {
  to: string
  from: string
}

export type VoiceStatusEvent = {
  callStatus: string
  recordingUrl?: string
  recordingSid?: string
  recordingDuration?: string
}

export interface VoiceGateway {
  placeCall(input: OutboundCall): Promise<{ providerCallId: string }>
}
