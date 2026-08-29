/**
 * Minimal hook tests for useBlockchain — provider contract guarantees that
 * every page relies on (throwing outside the provider, safe no-wallet init).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BlockchainProvider, useBlockchain } from '../hooks/useBlockchain'

function Probe() {
  const ctx = useBlockchain()
  return (
    <div>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="account">{ctx.account || 'none'}</span>
      <span data-testid="err">{ctx.contractError || 'no-error'}</span>
    </div>
  )
}

describe('useBlockchain provider contract', () => {
  beforeEach(() => {
    delete window.ethereum
  })

  it('throws when used outside <BlockchainProvider>', () => {
    expect(() => render(<Probe />)).toThrow('useBlockchain must be inside <BlockchainProvider>')
  })

  it('safely initialises without a wallet injected (no MetaMask)', async () => {
    render(
      <BlockchainProvider>
        <Probe />
      </BlockchainProvider>,
    )
    // init() returns early and sets loading=false; no crash, no error
    expect(screen.getByTestId('account').textContent).toBe('none')
    expect(screen.getByTestId('err').textContent).toBe('no-error')
    // loading resolves to false after the effect
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })
})
