// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import App from '../App.jsx'
import fixtures from '../../../docs/contracts/checkout/v1/examples.json'

const product = {
  id: 101,
  name: 'Desk lamp',
  model: 'LAMP',
  description: 'Bright desk lamp',
  price: '125.50',
  stockQuantity: 5,
  category: { id: 1, name: 'Home' },
}
const user = { id: 42, name: 'Demo Customer', email: 'customer@example.test' }
const { approved, declined, stockConflict } = fixtures.cases

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function json(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data }
}

function stubGuestSession(checkoutQueue = []) {
  const queue = [...checkoutQueue]
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    if (url === '/api/auth/me') return json({}, 401)
    if (url === '/api/auth/login') return json({ user })
    if (url.startsWith('/api/categories')) return json([product.category])
    if (url.startsWith('/api/products')) return json([product])
    if (url === '/api/cart/validate') {
      return json({ valid: true, items: [{ productId: product.id, availableQuantity: 5, reason: null }] })
    }
    if (url === '/api/checkout') {
      const next = queue.length > 1 ? queue.shift() : queue[0]
      return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body }
    }
    throw new Error(`Unexpected fetch: ${url} ${options.method || 'GET'}`)
  }))
}

async function guestAddsItemAndOpensCart() {
  render(<MemoryRouter initialEntries={['/products']}><App /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Add to cart' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Cart with 1 items' }))
  expect(screen.getByRole('heading', { name: 'Cart', level: 1 })).toBeInTheDocument()
}

it('SCRUM-91: sends a guest through login and resumes checkout with the same cart', async () => {
  stubGuestSession([approved.response])
  await guestAddsItemAndOpensCart()

  fireEvent.click(screen.getByRole('link', { name: 'Sign in to checkout' }))
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password2026!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument()
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
  expect(screen.getByText('Quantity: 1')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Cart with 1 items' })).toBeInTheDocument()
})

it('SCRUM-91: keeps the cart after decline or stock conflict, then clears it on approval', async () => {
  stubGuestSession([declined.response, stockConflict.response, approved.response])
  await guestAddsItemAndOpensCart()

  fireEvent.click(screen.getByRole('link', { name: 'Sign in to checkout' }))
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password2026!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Checkout' })

  fireEvent.change(screen.getByLabelText('Test card'), { target: { value: 'mock_decline' } })
  fireEvent.click(screen.getByRole('button', { name: 'Pay now' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(declined.response.body.error)
  expect(screen.getByRole('link', { name: 'Cart with 1 items' })).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Test card'), { target: { value: 'mock_approve' } })
  fireEvent.click(screen.getByRole('button', { name: 'Pay now' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(stockConflict.response.body.error)
  expect(screen.getByText(/Available: 1/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Cart with 1 items' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Pay now' }))
  expect(await screen.findByText('Payment successful!')).toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByRole('link', { name: 'Cart with 0 items' })).toBeInTheDocument()
  })
})
