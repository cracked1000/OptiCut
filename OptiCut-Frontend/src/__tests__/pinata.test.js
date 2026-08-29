/**
 * Unit tests for uploadToPinata — the IPFS upload path used by the lab portal.
 * fetch() is mocked so no real network call happens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadToPinata } from '../utils/pinata'

describe('uploadToPinata', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('throws a clear error when VITE_PINATA_JWT is not configured', async () => {
    import.meta.env.VITE_PINATA_JWT = ''
    const file = new File(['x'], 'gem.png', { type: 'image/png' })
    await expect(uploadToPinata(file)).rejects.toThrow('VITE_PINATA_JWT')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uploads and returns ipfs://{CID}', async () => {
    import.meta.env.VITE_PINATA_JWT = 'test-jwt'
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ IpfsHash: 'QmTest123' }),
    })

    const file = new File(['data'], 'gem.png', { type: 'image/png' })
    const result = await uploadToPinata(file)

    expect(result).toBe('ipfs://QmTest123')
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('https://api.pinata.cloud/pinning/pinFileToIPFS')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer test-jwt')
    expect(opts.body).toBeInstanceOf(FormData)
  })

  it('throws a descriptive error when Pinata returns a non-OK status', async () => {
    import.meta.env.VITE_PINATA_JWT = 'test-jwt'
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })

    const file = new File(['data'], 'gem.png', { type: 'image/png' })
    await expect(uploadToPinata(file)).rejects.toThrow('401')
    await expect(uploadToPinata(file)).rejects.toThrow('Unauthorized')
  })

  it('propagates network errors', async () => {
    import.meta.env.VITE_PINATA_JWT = 'test-jwt'
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const file = new File(['data'], 'gem.png', { type: 'image/png' })
    await expect(uploadToPinata(file)).rejects.toThrow('Failed to fetch')
  })
})
