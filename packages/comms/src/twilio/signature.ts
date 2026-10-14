import { createHmac, timingSafeEqual } from 'node:crypto'

export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const keys = Object.keys(params).sort()
  let data = url
  for (const key of keys) data += key + params[key]
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}

export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false
  const expected = computeTwilioSignature(authToken, url, params)
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length) return false
  return timingSafeEqual(actual, wanted)
}
