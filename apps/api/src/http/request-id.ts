import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { AuthedRequest } from './http'

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id')
  const requestId = incoming && incoming.length > 0 && incoming.length < 80 ? incoming : randomUUID()
  res.setHeader('x-request-id', requestId)
  ;(req as AuthedRequest).requestId = requestId
  next()
}
