/**
 * Component tests for NgjaAdmin — the NGJA admin panel.
 * Covers access gating, lab authorization/revocation, and the gem-recovery panel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NgjaAdmin from '../pages/NgjaAdmin'

const mockBlockchain = vi.hoisted(() => ({
  account: null,
  connect: vi.fn(),
  isNgjaAdmin: false,
  loading: false,
  grantLab: vi.fn(),
  revokeLab: vi.fn(),
  getAuthorizedLabs: vi.fn(),
  getRevokedLabsWithGems: vi.fn(),
  getActiveLabs: vi.fn(),
  cancelTransformation: vi.fn(),
  adminReassignStone: vi.fn(),
}))

vi.mock('../hooks/useBlockchain', () => ({
  useBlockchain: () => mockBlockchain,
  friendlyError: (e) => (e?.message || String(e)),
}))

const ADMIN = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const LAB_A = '0x1111111111111111111111111111111111111111'
const LAB_B = '0x2222222222222222222222222222222222222222'
const NEW_LAB = '0x1234567890123456789012345678901234567890'

const labRecord = (address, name) => ({
  address,
  name,
  authorizedBy: ADMIN,
  timestamp: 1700000000,
  revoked: false,
  revokedAt: 0,
})

const stuckGem = (tokenId, custodian) => ({
  tokenId,
  weight: 100,
  stoneState: 'Rough',
  status: 1, // Pending
  timestamp: 1700000000,
  custodian,
  heldByLab: true,
})

const revokedLabWithGems = (lab, gems) => ({
  ...labRecord(lab.address, lab.name),
  revoked: true,
  gems,
  pendingCount: gems.length,
  stuckCount: gems.length,
})

describe('NgjaAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mockBlockchain, {
      account: null,
      connect: vi.fn(),
      isNgjaAdmin: false,
      loading: false,
      grantLab: vi.fn(async () => ({ hash: '0x1' })),
      revokeLab: vi.fn(async () => ({ hash: '0x2' })),
      getAuthorizedLabs: vi.fn(async () => [labRecord(LAB_A, 'Ceylon Gems'), labRecord(LAB_B, 'Blue Sapphire Labs')]),
      getRevokedLabsWithGems: vi.fn(async () => []),
      getActiveLabs: vi.fn(async () => [labRecord(LAB_A, 'Ceylon Gems'), labRecord(LAB_B, 'Blue Sapphire Labs')]),
      cancelTransformation: vi.fn(async () => ({ hash: '0x3' })),
      adminReassignStone: vi.fn(async () => ({ hash: '0x4' })),
    })
  })

  const renderAdmin = () =>
    render(
      <MemoryRouter>
        <NgjaAdmin />
      </MemoryRouter>,
    )

  it('shows a loading screen while initialising', () => {
    mockBlockchain.loading = true
    renderAdmin()
    expect(screen.getByText(/Loading admin panel/i)).toBeTruthy()
  })

  it('prompts to connect when no wallet is connected', () => {
    renderAdmin()
    expect(screen.getByText('NGJA Admin Panel')).toBeTruthy()
    fireEvent.click(screen.getByText('Connect Wallet'))
    expect(mockBlockchain.connect).toHaveBeenCalled()
  })

  it('shows access denied for a connected non-admin wallet', () => {
    mockBlockchain.account = LAB_A
    mockBlockchain.isNgjaAdmin = false
    renderAdmin()
    expect(screen.getByText('Access Denied')).toBeTruthy()
  })

  it('loads and lists registered laboratories for an admin', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    renderAdmin()
    expect(await screen.findByText('Ceylon Gems')).toBeTruthy()
    expect(screen.getByText('Blue Sapphire Labs')).toBeTruthy()
    expect(mockBlockchain.getAuthorizedLabs).toHaveBeenCalled()
  })

  it('rejects an invalid lab address in the grant form', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('e.g. Ceylon Gem Labs'), { target: { value: 'New Lab' } })
    fireEvent.change(screen.getByPlaceholderText('0x...'), { target: { value: 'not-an-address' } })
    await act(async () => {
      fireEvent.submit(screen.getByText('Grant Lab Access').closest('form'))
    })

    expect(await screen.findByText(/Invalid Ethereum address/i)).toBeTruthy()
    expect(mockBlockchain.grantLab).not.toHaveBeenCalled()
  })

  it('rejects a missing lab name in the grant form', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('0x...'), { target: { value: NEW_LAB } })
    await act(async () => {
      fireEvent.submit(screen.getByText('Grant Lab Access').closest('form'))
    })

    expect(await screen.findByText(/Lab name is required/i)).toBeTruthy()
  })

  it('grants lab access with address + name on valid input', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('e.g. Ceylon Gem Labs'), { target: { value: 'Ceylon Gem Labs' } })
    fireEvent.change(screen.getByPlaceholderText('0x...'), { target: { value: NEW_LAB } })
    await act(async () => {
      fireEvent.submit(screen.getByText('Grant Lab Access').closest('form'))
    })

    await waitFor(() => expect(mockBlockchain.grantLab).toHaveBeenCalledWith(NEW_LAB, 'Ceylon Gem Labs'))
    expect(await screen.findByText(/successfully authorized/i)).toBeTruthy()
  })

  it('revokes a lab after confirmation', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    renderAdmin()
    expect(await screen.findByText('Ceylon Gems')).toBeTruthy()

    fireEvent.click(screen.getAllByText('Revoke')[0])
    expect(screen.getByText(/Are you sure you want to revoke/i)).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Revoke Access'))
    })
    await waitFor(() => expect(mockBlockchain.revokeLab).toHaveBeenCalledWith(LAB_A))
  })

  it('renders the recovery panel for revoked labs with stuck gems', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    mockBlockchain.getRevokedLabsWithGems = vi.fn(async () => [
      revokedLabWithGems({ address: LAB_B, name: 'Doomed Lab' }, [stuckGem(7, LAB_B)]),
    ])
    renderAdmin()

    expect(await screen.findByText('Doomed Lab')).toBeTruthy()
    expect(await screen.findByText('1 stuck')).toBeTruthy()
    // expand the revoked-lab card to reveal its gem actions
    fireEvent.click(screen.getByText('Doomed Lab'))
    expect(await screen.findByText('Release')).toBeTruthy()
    expect(screen.getByText('Reassign')).toBeTruthy()
  })

  it('releases a stuck gem via cancelTransformation', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    mockBlockchain.getRevokedLabsWithGems = vi.fn(async () => [
      revokedLabWithGems({ address: LAB_B, name: 'Doomed Lab' }, [stuckGem(7, LAB_B)]),
    ])
    renderAdmin()
    expect(await screen.findByText('Doomed Lab')).toBeTruthy()
    fireEvent.click(screen.getByText('Doomed Lab')) // expand
    expect(await screen.findByText('Release')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Release'))
    })
    await waitFor(() => expect(mockBlockchain.cancelTransformation).toHaveBeenCalledWith(7))
  })

  it('reassigns a stuck gem to a destination lab', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    mockBlockchain.getRevokedLabsWithGems = vi.fn(async () => [
      revokedLabWithGems({ address: LAB_B, name: 'Doomed Lab' }, [stuckGem(7, LAB_B)]),
    ])
    renderAdmin()
    expect(await screen.findByText('Doomed Lab')).toBeTruthy()
    fireEvent.click(screen.getByText('Doomed Lab')) // expand
    expect(await screen.findByText('Reassign')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Reassign'))
    })
    expect(await screen.findByText(/Reassign Gem #7/i)).toBeTruthy()

    // choose the active lab destination INSIDE the dialog
    const dialog = screen.getByText(/Reassign Gem #7/i).closest('.modal-content')
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Ceylon Gems'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Reassign & Activate'))
    })
    await waitFor(() =>
      expect(mockBlockchain.adminReassignStone).toHaveBeenCalledWith(7, LAB_A),
    )
  })

  it('restores a revoked lab via the Restore Access button', async () => {
    mockBlockchain.account = ADMIN
    mockBlockchain.isNgjaAdmin = true
    mockBlockchain.getRevokedLabsWithGems = vi.fn(async () => [
      revokedLabWithGems({ address: LAB_B, name: 'Doomed Lab' }, [stuckGem(7, LAB_B)]),
    ])
    renderAdmin()
    expect(await screen.findByText('Doomed Lab')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Restore Access'))
    })

    await waitFor(() =>
      expect(mockBlockchain.grantLab).toHaveBeenCalledWith(LAB_B, 'Doomed Lab'),
    )
  })
})
