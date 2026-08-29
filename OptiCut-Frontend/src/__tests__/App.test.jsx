/**
 * App-level tests — navigation gating by role, connect button.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../App'

const mockBlockchain = vi.hoisted(() => ({
  account: null,
  connect: vi.fn(),
  isLab: false,
  isNgjaAdmin: false,
  loading: false,
  contractError: null,
}))

vi.mock('../hooks/useBlockchain', () => ({
  useBlockchain: () => mockBlockchain,
}))

describe('App navigation gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mockBlockchain, {
      account: null,
      connect: vi.fn(),
      isLab: false,
      isNgjaAdmin: false,
      loading: false,
      contractError: null,
    })
  })

  it('shows only public nav + connect for a guest', () => {
    render(<App />)
    expect(screen.getByText('Verify Stone')).toBeTruthy()
    expect(screen.getByText('Connect Wallet')).toBeTruthy()
    expect(screen.queryByText('Lab Portal')).toBeNull()
    expect(screen.queryByText('NGJA Admin')).toBeNull()
  })

  it('reveals the Lab Portal for labs', () => {
    mockBlockchain.account = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    mockBlockchain.isLab = true
    render(<App />)
    expect(screen.getByText('Lab Portal')).toBeTruthy()
    expect(screen.queryByText('NGJA Admin')).toBeNull()
  })

  it('reveals the NGJA Admin for admins', () => {
    mockBlockchain.account = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    mockBlockchain.isNgjaAdmin = true
    render(<App />)
    expect(screen.getByText('NGJA Admin')).toBeTruthy()
    expect(screen.queryByText('Lab Portal')).toBeNull()
  })

  it('shows both portals for a lab that is also an admin', () => {
    mockBlockchain.account = '0xcccccccccccccccccccccccccccccccccccccccc'
    mockBlockchain.isLab = true
    mockBlockchain.isNgjaAdmin = true
    render(<App />)
    expect(screen.getByText('Lab Portal')).toBeTruthy()
    expect(screen.getByText('NGJA Admin')).toBeTruthy()
  })

  it('calls connect when the Connect Wallet button is clicked', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Connect Wallet'))
    expect(mockBlockchain.connect).toHaveBeenCalled()
  })

  it('renders the contract-error banner when present', () => {
    mockBlockchain.contractError = 'Contract not reachable — RPC down'
    render(<App />)
    expect(screen.getAllByText(/Contract not reachable/i).length).toBeGreaterThan(0)
  })
})
