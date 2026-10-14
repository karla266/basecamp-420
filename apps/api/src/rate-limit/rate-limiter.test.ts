import { describe, expect, it } from 'vitest'
import { MemoryRateLimiter } from './rate-limiter'

describe('memory rate limiter', () => {
  it('limits sends per organization inside the window', async () => {
    let now = 0
    const limiter = new MemoryRateLimiter(2, 60_000, () => now)
    await limiter.consume('org-1')
    await limiter.consume('org-1')
    await expect(limiter.consume('org-1')).rejects.toMatchObject({ status: 429 })
    await limiter.consume('org-2')
    now = 60_001
    await limiter.consume('org-1')
  })
})
