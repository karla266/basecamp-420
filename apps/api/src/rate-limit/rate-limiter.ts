import type { Redis } from 'ioredis'
import { Errors } from '../errors'

export interface RateLimiter {
  consume(organizationId: string): Promise<void>
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async consume(organizationId: string): Promise<void> {
    const time = this.now()
    const recent = (this.hits.get(organizationId) ?? []).filter((hit) => time - hit < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(organizationId, recent)
      throw Errors.rateLimit()
    }
    recent.push(time)
    this.hits.set(organizationId, recent)
  }
}

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
  ) {}

  async consume(organizationId: string): Promise<void> {
    const bucket = Math.floor(Date.now() / 60_000)
    const key = `ratelimit:sms:${organizationId}:${bucket}`
    const count = await this.redis.incr(key)
    if (count === 1) await this.redis.expire(key, 70)
    if (count > this.limit) throw Errors.rateLimit()
  }
}
