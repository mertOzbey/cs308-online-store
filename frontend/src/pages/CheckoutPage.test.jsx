// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import CheckoutPage from './CheckoutPage.jsx'
import { formatPrice } from '../utils/productFormat.js'
import fixtures from '../../../docs/contracts/checkout/v1/examples.json'

const { approved, declined, stockConflict, unauthenticated } =
  fixtures.cases

const cart = {
  busy: false,
  items: approved.response.body.order.items.map((item) => ({
    product: {
      id: item.productId,
      name: item.name,
      price: item.unitPrice,
    },
    quantity: item.quantity,
  })),
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderCheckout(
  submitCheckout = vi.fn(),
  currentCart = cart
) {
  const onSuccess = vi.fn()

  render(
    <MemoryRouter>
      <CheckoutPage
        cart={currentCart}
        submitCheckout={submitCheckout}
        onSuccess={onSuccess}
      />
    </MemoryRouter>
  )

  return { submitCheckout, onSuccess }
}

function selectCard(token = 'mock_approve') {
  fireEvent.change(screen.getByLabelText('Test card'), {
    target: { value: token },
  })
}

function pay() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Pay now' })
  )
}

it('displays products, quantities and total', () => {
  renderCheckout()

  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
  expect(screen.getByText('Notebook')).toBeInTheDocument()
  expect(screen.getByText('Quantity: 2')).toBeInTheDocument()
  expect(screen.getByText('Quantity: 1')).toBeInTheDocument()

  expect(
    screen.getByText(formatPrice('290.90'))
  ).toBeInTheDocument()
})

it('shows an empty cart without a payment button', () => {
  renderCheckout(vi.fn(), { items: [], busy: false })

  expect(
    screen.getByText('Your cart is empty.')
  ).toBeInTheDocument()

  expect(
    screen.queryByRole('button', { name: 'Pay now' })
  ).not.toBeInTheDocument()
})

it('requires a labelled test card before submitting', () => {
  const { submitCheckout } = renderCheckout()

  const field = screen.getByLabelText('Test card')

  field.focus()
  expect(field).toHaveFocus()

  pay()

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Please select a test card.'
  )

  expect(submitCheckout).not.toHaveBeenCalled()
})

it('prevents duplicate payment requests', async () => {
  let resolvePayment

  const submitCheckout = vi.fn(
    () => new Promise((resolve) => {
      resolvePayment = resolve
    })
  )

  const { onSuccess } = renderCheckout(submitCheckout)

  selectCard()

  const button = screen.getByRole('button', {
    name: 'Pay now',
  })

  const form = button.closest('form')

  fireEvent.click(button)
  fireEvent.click(button)
  fireEvent.submit(form)

  expect(submitCheckout).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()

  expect(screen.getByRole('status')).toHaveTextContent(
    'Submitting payment...'
  )

  await act(async () => {
    resolvePayment(approved.response)
  })

  expect(onSuccess).toHaveBeenCalledTimes(1)
})

it('shows a bank decline and allows another attempt', async () => {
  const submitCheckout = vi.fn()
    .mockResolvedValueOnce(declined.response)
    .mockResolvedValueOnce(approved.response)

  const { onSuccess } = renderCheckout(submitCheckout)

  selectCard('mock_decline')
  pay()

  expect(
    await screen.findByRole('alert')
  ).toHaveTextContent(declined.response.body.error)

  expect(onSuccess).not.toHaveBeenCalled()
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()

  selectCard('mock_approve')
  pay()

  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledWith(7001)
  })

  expect(submitCheckout).toHaveBeenCalledTimes(2)

  const first = submitCheckout.mock.calls[0][0]
  const second = submitCheckout.mock.calls[1][0]

  expect(first.idempotencyKey).not.toBe(
    second.idempotencyKey
  )
})

it('shows stock conflicts and available quantities', async () => {
  const submitCheckout = vi.fn()
    .mockResolvedValue(stockConflict.response)

  const { onSuccess } = renderCheckout(submitCheckout)

  selectCard()
  pay()

  const alert = await screen.findByRole('alert')

  expect(alert).toHaveTextContent(
    stockConflict.response.body.error
  )

  expect(alert).toHaveTextContent('Available: 1')
  expect(alert).toHaveTextContent('Requested: 2')
  expect(onSuccess).not.toHaveBeenCalled()
})

it('shows the authentication error', async () => {
  const submitCheckout = vi.fn()
    .mockResolvedValue(unauthenticated.response)

  const { onSuccess } = renderCheckout(submitCheckout)

  selectCard()
  pay()

  expect(
    await screen.findByRole('alert')
  ).toHaveTextContent('Authentication required.')

  expect(onSuccess).not.toHaveBeenCalled()
})

it('returns the order ID after successful payment', async () => {
  const submitCheckout = vi.fn()
    .mockResolvedValue(approved.response)

  const { onSuccess } = renderCheckout(submitCheckout)

  selectCard()
  pay()

  expect(
    await screen.findByText('Payment successful!')
  ).toBeInTheDocument()

  expect(
    screen.getByText('Order number: 7001')
  ).toBeInTheDocument()

  expect(onSuccess).toHaveBeenCalledExactlyOnceWith(7001)

  expect(submitCheckout).toHaveBeenCalledWith({
    items: approved.request.items,
    paymentToken: approved.request.paymentToken,
    idempotencyKey: expect.any(String),
  })
})

it('reuses the attempt key after a network failure', async () => {
  const submitCheckout = vi.fn()
    .mockRejectedValueOnce(new Error('Network error'))
    .mockResolvedValueOnce(approved.response)

  const { onSuccess } = renderCheckout(submitCheckout)

  selectCard()
  pay()

  expect(
    await screen.findByRole('alert')
  ).toHaveTextContent('Unable to complete payment.')

  pay()

  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledWith(7001)
  })

  expect(submitCheckout.mock.calls[0][0].idempotencyKey)
    .toBe(submitCheckout.mock.calls[1][0].idempotencyKey)
})