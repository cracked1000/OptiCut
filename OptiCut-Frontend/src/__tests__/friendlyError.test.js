/**
 * Unit tests for friendlyError() — the user-facing error translator.
 * This is the layer that turns cryptic ethers/RPC errors into actionable
 * messages, so its behaviour matters for production UX.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { friendlyError } from '../hooks/useBlockchain'

describe('friendlyError', () => {
  beforeEach(() => {
    // silence the console.error the module may produce; not required here
    vi.restoreAllMocks()
  })

  it('returns a readable fallback for a plain string', () => {
    expect(friendlyError('boom')).toBe('boom')
  })

  it('prioritises shortMessage over reason over message', () => {
    const err = { shortMessage: 'short', reason: 'reason', message: 'message' }
    expect(friendlyError(err)).toBe('short')
  })

  it('handles an error with only a message', () => {
    expect(friendlyError({ message: 'execution reverted: nope' })).toMatch(/reverted/i)
  })

  it('handles a non-object input', () => {
    expect(friendlyError(undefined)).toBe('undefined')
    expect(friendlyError(null)).toBe('null')
    expect(friendlyError(42)).toBe('42')
  })

  describe('old-contract detection', () => {
    const missingFns = ['getRevokedLabs', 'getActiveLabs', 'getStonesMintedByLab', 'cancelTransformation', 'adminReassignStone']
    for (const fn of missingFns) {
      it(`explains a missing ${fn} as an outdated deployment`, () => {
        const msg = friendlyError({
          message: `call revert exception (method="contract.${fn}(address)", errorArgs=[...])`,
        })
        expect(msg).toContain('OLD contract')
        expect(msg).toContain('Redeploy')
      })
    }
  })

  describe('RPC / provider issues', () => {
    it('explains eth_getLogs free-tier limits', () => {
      const msg = friendlyError({
        message: 'eth_getLogs and eth_newFilter are not supported. free tier only supports a block range of 10 blocks',
      })
      expect(msg).toContain('event-log scan')
    })

    it('explains block-range-limit errors', () => {
      const msg = friendlyError({ message: 'block range exceeds configured limit' })
      // the eth_getLogs branch handles this message and tells the user to shrink VITE_LOG_CHUNK_SIZE
      expect(msg).toMatch(/block[- ]range/i)
    })

    it('explains rate limiting', () => {
      expect(friendlyError({ message: 'too many requests, rate limited' })).toContain('rate-limit')
      expect(friendlyError({ message: '-32002: server error' })).toContain('rate-limit')
    })

    it('explains wallet rejection', () => {
      const msg = friendlyError({ message: 'MetaMask Tx Signature: User denied transaction signature.' })
      expect(msg).toContain('rejected in MetaMask')
    })

    it('explains insufficient funds', () => {
      const msg = friendlyError({ message: 'insufficient funds for gas * price + value' })
      expect(msg).toContain('Insufficient POL')
    })
  })

  describe('truncation', () => {
    it('truncates messages longer than 150 chars', () => {
      const long = 'x'.repeat(300)
      const msg = friendlyError({ message: long })
      expect(msg.length).toBeLessThanOrEqual(153) // 150 + ellipsis
      expect(msg.endsWith('…')).toBe(true)
    })

    it('keeps short messages whole', () => {
      expect(friendlyError({ message: 'hi' })).toBe('hi')
    })
  })
})
