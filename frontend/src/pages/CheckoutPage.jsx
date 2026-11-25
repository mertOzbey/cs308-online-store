import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../utils/productFormat.js'
import './CheckoutPage.css'

function calculateTotal(items) {
  const total = items.reduce((sum, { product, quantity }) => {
    const [whole, fraction = ''] = String(product.price).split('.')
    const cents = BigInt(whole) * 100n
      + BigInt(fraction.padEnd(2, '0'))

    return sum + cents * BigInt(quantity)
  }, 0n)

  return `${total / 100n}.${String(total % 100n).padStart(2, '0')}`
}

export default function CheckoutPage({
  cart,
  submitCheckout,
  onSuccess,
}) {
  const [paymentToken, setPaymentToken] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [stockConflicts, setStockConflicts] = useState([])
  const [orderId, setOrderId] = useState(null)

  const submitting = useRef(false)
  const completed = useRef(false)
  const attempt = useRef(null)

  const items = cart.items
  const total = calculateTotal(items)

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitting.current || completed.current ||
        items.length === 0 || cart.busy) return

    setError('')
    setStockConflicts([])

    if (!paymentToken) {
      setError('Please select a test card.')
      return
    }

    submitting.current = true
    setPending(true)

    let confirmedOrderId = null

    try {
      const requestItems = items.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
      }))

      const signature = JSON.stringify({
        items: requestItems,
        paymentToken,
      })

      if (attempt.current?.signature !== signature) {
        attempt.current = {
          signature,
          key: globalThis.crypto.randomUUID(),
        }
      }

      const response = await submitCheckout({
        items: requestItems,
        paymentToken,
        idempotencyKey: attempt.current.key,
      })

      const { status, body } = response

      if (
        status === 201 &&
        body.payment?.status === 'approved' &&
        Number.isInteger(body.order?.orderId)
      ) {
        confirmedOrderId = body.order.orderId
        completed.current = true
        setOrderId(confirmedOrderId)
        attempt.current = null
      } else {
        if (status >= 400 && status < 500) {
          attempt.current = null
        }

        if (status === 409 && body.code === 'STOCK_CONFLICT') {
          setStockConflicts(body.items ?? [])
        }

        setError(
          body.error || 'Payment could not be completed.'
        )
      }
    } catch {
      setError('Unable to complete payment. Please try again.')
    } finally {
      submitting.current = false
      setPending(false)
    }

    if (confirmedOrderId !== null) {
      onSuccess(confirmedOrderId)
    }
  }

  return (
    <section
      className="checkout-page"
      aria-labelledby="checkout-title"
      aria-busy={pending}
    >
      <Link className="checkout-back" to="/cart">
        ← Back to cart
      </Link>

      <p className="checkout-eyebrow">SULINA EXCLUSIVE</p>
      <h1 id="checkout-title">Checkout</h1>

      {orderId !== null ? (
        <div className="checkout-success" role="status">
          <h2>Payment successful!</h2>
          <p>Order number: {orderId}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="checkout-empty">
          <p>Your cart is empty.</p>
          <Link to="/products">Browse products</Link>
        </div>
      ) : (
        <div className="checkout-layout">
          <div className="checkout-summary">
            <h2>Order summary</h2>

            <ul className="checkout-items">
              {items.map(({ product, quantity }) => (
                <li key={product.id}>
                  <div>
                    <h3>{product.name}</h3>
                    <p>Quantity: {quantity}</p>
                  </div>
                  <span>
                    {formatPrice(product.price)} each
                  </span>
                </li>
              ))}
            </ul>

            <div className="checkout-total">
              <strong>Total</strong>
              <strong>{formatPrice(total)}</strong>
            </div>
          </div>

          <form
            className="checkout-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <h2>Payment details</h2>

            <p className="checkout-hint" id="test-card-hint">
              This is a test payment. Do not enter real card
              information.
            </p>

            <label htmlFor="test-card">
              Test card
            </label>

            <select
              id="test-card"
              name="paymentToken"
              value={paymentToken}
              disabled={pending}
              required
              aria-describedby="test-card-hint"
              onChange={(event) => {
                setPaymentToken(event.target.value)
                setError('')
                setStockConflicts([])
              }}
            >
              <option value="">Select a test card</option>
              <option value="mock_approve">
                Approved test card
              </option>
              <option value="mock_decline">
                Declined test card
              </option>
            </select>

            {error && (
              <div className="checkout-error" role="alert">
                <p>{error}</p>

                {stockConflicts.length > 0 && (
                  <ul>
                    {stockConflicts.map((item) => (
                      <li key={item.productId}>
                        {items.find(
                          ({ product }) =>
                            product.id === item.productId
                        )?.product.name ?? item.productId}
                        {' — Available: '}
                        {item.availableQuantity}
                        {' / Requested: '}
                        {item.requestedQuantity}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              className="checkout-submit"
              type="submit"
              disabled={pending || cart.busy}
            >
              {pending ? 'Processing payment...' : 'Pay now'}
            </button>

            {pending && (
              <p role="status">Submitting payment...</p>
            )}
          </form>
        </div>
      )}
    </section>
  )
}