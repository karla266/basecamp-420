import type { ZodType } from 'zod'
import { Errors } from '../errors'

export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw Errors.badRequest('Datos inválidos')
  return result.data
}
