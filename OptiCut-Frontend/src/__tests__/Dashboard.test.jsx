/**
 * Component tests for Dashboard — the lab portal.
 * useBlockchain and uploadToPinata are mocked; no real blockchain/IPFS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'

const mockBlockchain = vi.hoisted(() => ({
  account: null,
  connect: vi.fn(),
  isLab: false,
  loading: false,
  registerGenesis: vi.fn(),
  requestTransformation: vi.fn(),
  completeTransformation: vi.fn(),
  getMintedTokenId: vi.fn(),
  getStonesForAccount: vi.fn(),
}))

vi.mock('../hooks/useBlockchain', () => ({
  useBlockchain: () => mockBlockchain,
  friendlyError: (e) => (e?.message || String(e)),
}))

vi.mock('../utils/pinata', () => ({
  uploadToPinata: vi.fn(async () => 'ipfs://QmUploaded'),
}))

const LAB_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mockBlockchain, {
      account: null,
      connect: vi.fn(),
      isLab: false,
      loading: false,
      registerGenesis: vi.fn(async () => ({ hash: '0x1', logs: [] })),
      requestTransformation: vi.fn(async () => ({ hash: '0x2' })),
      completeTransformation: vi.fn(async () => ({ hash: '0x3' })),
      getMintedTokenId: vi.fn(() => 5),
      getStonesForAccount: vi.fn(async () => []),
    })
  })

  const renderDash = () =>
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

  it('shows a loading screen while initialising', () => {
    mockBlockchain.loading = true
    renderDash()
    expect(screen.getByText(/Loading dashboard/i)).toBeTruthy()
  })

  it('prompts to connect when no wallet is connected', () => {
    renderDash()
    expect(screen.getByText(/Authorized Laboratory Portal/i)).toBeTruthy()
    fireEvent.click(screen.getByText('Connect Wallet'))
    expect(mockBlockchain.connect).toHaveBeenCalled()
  })

  it('shows access denied for a connected non-lab wallet', () => {
    mockBlockchain.account = LAB_ADDR
    mockBlockchain.isLab = false
    renderDash()
    expect(screen.getByText('Access Denied')).toBeTruthy()
    expect(screen.getByText(/does not have LAB_ROLE/i)).toBeTruthy()
  })

  it('renders the lab tools for an authorized lab', async () => {
    mockBlockchain.account = LAB_ADDR
    mockBlockchain.isLab = true
    renderDash()
    expect(await screen.findByText('Register New Stone')).toBeTruthy()
    expect(screen.getByText('Request Transformation')).toBeTruthy()
    expect(screen.getByText('Complete Transformation')).toBeTruthy()
    expect(screen.getByText('My Registered Stones')).toBeTruthy()
  })

  it('mints a genesis stone and shows the success modal with the token id', async () => {
    mockBlockchain.account = LAB_ADDR
    mockBlockchain.isLab = true
    renderDash()

    fireEvent.change(screen.getByPlaceholderText('e.g. 5.20'), { target: { value: '2.5' } })
    const mintForm = screen.getByText('Mint Genesis Token').closest('form')
    await act(async () => {
      fireEvent.submit(mintForm)
    })

    await waitFor(() => expect(mockBlockchain.registerGenesis).toHaveBeenCalledTimes(1))
    // note: the ×100 centi-carat conversion lives inside the (mocked) hook,
    // so the page passes the raw string through untouched
    expect(mockBlockchain.registerGenesis).toHaveBeenCalledWith('', '2.5', 'Rough')
    expect(await screen.findByText('Stone Minted Successfully')).toBeTruthy()
    expect((await screen.findAllByText(/Stone #5/i)).length).toBeGreaterThan(0)
  })

  it('surfaces a mint failure as an error toast', async () => {
    mockBlockchain.account = LAB_ADDR
    mockBlockchain.isLab = true
    mockBlockchain.registerGenesis = vi.fn(async () => {
      throw new Error('Weight must be positive')
    })
    renderDash()

    const mintForm = screen.getByText('Mint Genesis Token').closest('form')
    await act(async () => {
      fireEvent.submit(mintForm)
    })

    expect((await screen.findAllByText(/Weight must be positive/i)).length).toBeGreaterThan(0)
  })

  it('requests a transformation with the entered token id', async () => {
    mockBlockchain.account = LAB_ADDR
    mockBlockchain.isLab = true
    renderDash()

    // Section is open by default in the desktop layout — just fill it in.
    fireEvent.change(screen.getByPlaceholderText('Enter Token ID'), { target: { value: '9' } })
    await act(async () => {
      fireEvent.submit(screen.getByText('Lock Token (Pending)').closest('form'))
    })

    await waitFor(() => expect(mockBlockchain.requestTransformation).toHaveBeenCalledWith('9'))
  })

  it('completes a transformation and clears the form', async () => {
    mockBlockchain.account = LAB_ADDR
    mockBlockchain.isLab = true
    renderDash()

    // Section is open by default in the desktop layout — just fill it in.
    fireEvent.change(screen.getByPlaceholderText('ID of stone being cut'), { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('2.50'), { target: { value: '1.5' } })
    await act(async () => {
      fireEvent.submit(screen.getByText('Burn Parent & Mint Children').closest('form'))
    })

    await waitFor(() => expect(mockBlockchain.completeTransformation).toHaveBeenCalled())
    const [parentId, weights] = mockBlockchain.completeTransformation.mock.calls[0]
    expect(parentId).toBe('3')
    expect(weights).toEqual(['1.5'])
  })

  it('loads and lists the lab own stones', async () => {
    mockBlockchain.account = LAB_ADDR
    mockBlockchain.isLab = true
    mockBlockchain.getStonesForAccount = vi.fn(async () => [
      { tokenId: 1, weight: 500, stoneState: 'Rough', status: 0, timestamp: 1700000000 },
    ])
    renderDash()
    expect(await screen.findByText(/5.00 ct/i)).toBeTruthy()
    expect(mockBlockchain.getStonesForAccount).toHaveBeenCalledWith(LAB_ADDR)
  })
})
