import { Controller, Inject, Post, Req } from '@nestjs/common'
import { validateTwilioSignature } from '@basecamp/comms'
import { APP_CONTEXT, type AppContext } from '../context'
import { AppError } from '../errors'
import { requestIdOf, type AuthedRequest } from '../http/http'

function formParams(body: unknown): Record<string, string> {
  const params: Record<string, string> = {}
  if (!body || typeof body !== 'object') return params
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') params[key] = value
  }
  return params
}

@Controller('webhooks/twilio')
export class WebhooksController {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  @Post('sms')
  async sms(@Req() req: AuthedRequest) {
    this.assertSignature(req, '/webhooks/twilio/sms')
    const params = formParams(req.body)
    return this.app.messaging.acceptInboundWebhook({
      messageSid: params.MessageSid ?? '',
      from: params.From ?? '',
      to: params.To ?? '',
      body: params.Body ?? '',
      requestId: requestIdOf(req),
    })
  }

  @Post('voice')
  async voice(@Req() req: AuthedRequest) {
    this.assertSignature(req, '/webhooks/twilio/voice')
    const params = formParams(req.body)
    return this.app.calls.acceptStatusWebhook({
      callSid: params.CallSid ?? '',
      callStatus: params.CallStatus ?? '',
      recordingUrl: params.RecordingUrl,
      recordingSid: params.RecordingSid,
      recordingDuration: params.RecordingDuration,
      requestId: requestIdOf(req),
    })
  }

  private assertSignature(req: AuthedRequest, path: string): void {
    const token = process.env.TWILIO_AUTH_TOKEN
    if (!token) {
      const dev = headerValue(req.headers['x-basecamp-dev-webhook'])
      if (dev && process.env.AUTH_SECRET && dev === process.env.AUTH_SECRET) return
      throw new AppError(403, 'Webhook no configurado', 'forbidden')
    }
    const base = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`
    const header = req.header?.('x-twilio-signature') ?? headerValue(req.headers['x-twilio-signature'])
    const valid = validateTwilioSignature(token, `${base}${path}`, formParams(req.body), header)
    if (!valid) throw new AppError(403, 'Firma inválida', 'forbidden')
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
