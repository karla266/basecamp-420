export type OutboundMessage = {
  to: string
  from: string
  body: string
}

export interface MessageGateway {
  sendSms(message: OutboundMessage): Promise<{ providerMessageId: string }>
}
