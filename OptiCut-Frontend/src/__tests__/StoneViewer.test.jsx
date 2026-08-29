/**
 * Component tests for StoneViewer — the public "Verify Gemstone" page.
 * useBlockchain is mocked; routing is real except useNavigate (spied).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StoneViewer from '../pages/StoneViewer'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

const mockBlockchain = vi.hoisted(() => ({
  getStoneDetails: vi.fn(),
  getChildIds: vi.fn(),
  getLineage: vi.fn(),
}))

vi.mock('../hooks/useBlockchain', () => ({
  useBlockchain: () => mockBlockchain,
}))

const genesisStone = {
  parentTokenId: 0,
  weight: 1234,
  stoneState: 'Rough',
  ipfsUri: 'ipfs://QmX',
  status: 0,
  timestamp: 1700000000,
  custodian: '0x1234567890abcdef1234567890abcdef12345678',
}

// Builds an id-aware mock "chain database" so recursive resolution can be
// exercised the way it actually runs against the contract.
function mockStoneGraph(stones) {
  mockBlockchain.getStoneDetails.mockImplementation(async (id) => {
    const s = stones[id];
    if (!s) return { ...genesisStone, timestamp: 0 };
    return { ...genesisStone, ...s };
  })
  mockBlockchain.getChildIds.mockImplementation(async (id) => {
    return stones[id]?.children ?? [];
  })
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StoneViewer />
    </MemoryRouter>,
  )
}

describe('StoneViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBlockchain.getStoneDetails.mockResolvedValue(genesisStone)
    mockBlockchain.getChildIds.mockResolvedValue([])
    mockBlockchain.getLineage.mockResolvedValue([{ id: 1, ...genesisStone }])
  })

  it('shows the search UI when no stone id is in the URL', () => {
    renderAt('/')
    expect(screen.getByText('Verify')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Enter Stone ID/i)).toBeTruthy()
    expect(screen.getByText(/Ready to Verify/i)).toBeTruthy()
  })

  it('renders full stone details for a valid id', async () => {
    renderAt('/?id=1')
    expect((await screen.findAllByText('12.34 ct')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rough').length).toBeGreaterThanOrEqual(2) // header + badge
    expect(screen.getByText(/Genesis \(None\)/i)).toBeTruthy()
    expect(screen.getByText(/Certified & Active/i)).toBeTruthy()
    expect(screen.getByText(/Provenance Timeline/i)).toBeTruthy()
    expect(screen.getByText(/Certificate QR Code/i)).toBeTruthy()
    expect(mockBlockchain.getStoneDetails).toHaveBeenCalledWith(1)
  })

  it('shows an error for a stone that does not exist', async () => {
    mockBlockchain.getStoneDetails.mockResolvedValue({ ...genesisStone, timestamp: 0 })
    renderAt('/?id=999')
    expect(await screen.findByText(/does not exist on the blockchain/i)).toBeTruthy()
  })

  it('shows an error for an invalid stone id in the URL', () => {
    renderAt('/?id=abc')
    expect(screen.getByText(/Invalid stone ID/i)).toBeTruthy()
  })

  it('redirects straight to the single live child of a burned stone', async () => {
    mockStoneGraph({
      1: { status: 2, children: [7] },
      7: { status: 0, parentTokenId: 1, stoneState: 'Preform' },
    })
    renderAt('/?id=1')
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    expect(navigateMock).toHaveBeenCalledWith('/?id=7&from=1', { replace: true })
  })

  it('collapses a multi-level single-branch chain straight to the current stone (A -> B -> D)', async () => {
    // A is cut into a single stone B, which is itself cut into a single stone D (still active).
    // Entering A should jump straight to D, not stop at the intermediate B.
    mockStoneGraph({
      1: { status: 2, children: [2] },            // A
      2: { status: 2, parentTokenId: 1, children: [3] }, // B (also cut)
      3: { status: 0, parentTokenId: 2, stoneState: 'Polished' }, // D (current)
    })
    renderAt('/?id=1')
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    expect(navigateMock).toHaveBeenCalledWith('/?id=3&from=1', { replace: true })
  })

  it('shows the disambiguation view for a burned stone with multiple direct children', async () => {
    mockStoneGraph({
      1: { status: 2, children: [2, 3] },
      2: { status: 0, parentTokenId: 1, stoneState: 'Cut' },
      3: { status: 0, parentTokenId: 1, stoneState: 'Cut' },
    })
    renderAt('/?id=1')
    expect(await screen.findByText(/Currently Existing Stones \(2\)/i)).toBeTruthy()
  })

  it('resolves multi-level branching to the CURRENT stones, not the intermediate ones (A -> B,C -> D,E)', async () => {
    // A is cut into B and C. B is later cut into D. C is later cut into E.
    // Entering A should show D and E directly — never a dead-end on B or C.
    mockStoneGraph({
      1: { status: 2, children: [2, 3] },                 // A
      2: { status: 2, parentTokenId: 1, children: [4] },  // B (also cut)
      3: { status: 2, parentTokenId: 1, children: [5] },  // C (also cut)
      4: { status: 0, parentTokenId: 2, stoneState: 'Polished' }, // D (current)
      5: { status: 0, parentTokenId: 3, stoneState: 'Polished' }, // E (current)
    })
    renderAt('/?id=1')
    expect(await screen.findByText(/Currently Existing Stones \(2\)/i)).toBeTruthy()
    // The two CURRENT stones (D=#4, E=#5) are offered as destinations.
    expect(screen.getByText('#4')).toBeTruthy()
    expect(screen.getByText('#5')).toBeTruthy()
    // The intermediate stones (#2, #3) only appear inside the "via" breadcrumb,
    // never as their own clickable destination card.
    expect(screen.getAllByText(/via/i).length).toBe(2)
  })

  it('navigates when a valid id is searched', async () => {
    renderAt('/')
    fireEvent.change(screen.getByPlaceholderText(/Enter Stone ID/i), { target: { value: '42' } })
    fireEvent.submit(screen.getByText('Verify').closest('form'))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/?id=42'))
  })

  it('rejects a non-numeric search input', () => {
    renderAt('/')
    fireEvent.change(screen.getByPlaceholderText(/Enter Stone ID/i), { target: { value: 'hello' } })
    fireEvent.submit(screen.getByText('Verify').closest('form'))
    expect(screen.getByText(/Please enter a valid stone ID/i)).toBeTruthy()
  })

  it('shows the genesis empty-state when the stone has no lineage', async () => {
    mockBlockchain.getLineage.mockResolvedValue([])
    renderAt('/?id=1')
    expect(await screen.findByText('Genesis Stone')).toBeTruthy()
  })

  it('opens a snapshot modal when a past timeline step is tapped, without navigating away', async () => {
    mockBlockchain.getLineage.mockResolvedValue([
      { id: 1, ...genesisStone, status: 2, stoneState: 'Rough' },
      { id: 3, ...genesisStone, parentTokenId: 1, status: 0, stoneState: 'Polished' },
    ])
    mockBlockchain.getStoneDetails.mockResolvedValue({ ...genesisStone, parentTokenId: 1, status: 0, stoneState: 'Polished' })
    mockBlockchain.getChildIds.mockResolvedValue([])
    renderAt('/?id=3')

    await screen.findByText(/Provenance Timeline/i)
    const originNode = screen.getByText(/Origin/i).closest('button')
    fireEvent.click(originNode)

    expect(await screen.findByText(/View Full Certificate on IPFS|Weight/i)).toBeTruthy()
    // Still on the same page — no navigation happened.
    expect(navigateMock).not.toHaveBeenCalled()
  })
})