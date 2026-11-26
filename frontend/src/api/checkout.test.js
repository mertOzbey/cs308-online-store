// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { submitCheckout } from './checkout.js'
import fixtures from '../../../docs/contracts/checkout/v1/examples.json'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

it('posts checkout payloads with session credentials', async () => {
  const { request, response } = fixtures.cases.approved
  fetch.mockResolvedValue({
    ok: true,
    status: response.status,
    json: async () => response.body,
  })

  await expect(submitCheckout(request)).resolves.toEqual(response)
  expect(fetch).toHaveBeenCalledWith('/api/checkout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
})

it('returns decline bodies without throwing', async () => {
  const { response } = fixtures.cases.declined
  fetch.mockResolvedValue({
    ok: false,
    status: response.status,
    json: async () => response.body,
  })

  await expect(submitCheckout(fixtures.cases.declined.request)).resolves.toEqual(response)
})
