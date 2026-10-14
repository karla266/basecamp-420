const E164 = /^\+[1-9]\d{7,14}$/

export function isE164(phone: string): boolean {
  return E164.test(phone)
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `***${digits.slice(-4)}`
}
