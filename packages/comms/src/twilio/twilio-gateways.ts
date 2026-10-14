import type { MessageGateway, OutboundMessage } from '../message-gateway'
import type { OutboundCall, VoiceGateway } from '../voice-gateway'

type TwilioConfig = {
  accountSid: string
  authToken: string
}

async function twilioForm(
  config: TwilioConfig,
  path: string,
  params: Record<string, string>,
): Promise<{ sid: string }> {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/${path}`,
    {
      method: 'POST',
      headers: {
        authorization:
          'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    },
  )
  if (!response.ok) {
    throw new Error('Twilio request failed')
  }
  return (await response.json()) as { sid: string }
}

export class TwilioMessageGateway implements MessageGateway {
  constructor(private readonly config: TwilioConfig) {}

  async sendSms(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const result = await twilioForm(this.config, 'Messages.json', {
      To: message.to,
      From: message.from,
      Body: message.body,
    })
    return { providerMessageId: result.sid }
  }
}

export class TwilioVoiceGateway implements VoiceGateway {
  constructor(
    private readonly config: TwilioConfig,
    private readonly statusCallbackUrl?: string,
  ) {}

  async placeCall(input: OutboundCall): Promise<{ providerCallId: string }> {
    const params: Record<string, string> = {
      To: input.to,
      From: input.from,
      Twiml: '<Response><Say language="es-MX">Llamada de Basecamp.</Say></Response>',
    }
    if (this.statusCallbackUrl) {
      params.StatusCallback = this.statusCallbackUrl
      params.StatusCallbackMethod = 'POST'
    }
    const result = await twilioForm(this.config, 'Calls.json', params)
    return { providerCallId: result.sid }
  }
}
