/** SCRUM-91 client for POST /api/checkout. Live route lands with SCRUM-92. */
export async function submitCheckout(payload) {
  let response
  try {
    response = await fetch('/api/checkout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Unable to complete payment. Please try again.')
  }

  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}
