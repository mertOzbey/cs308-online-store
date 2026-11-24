# Checkout and delivery contract v1 (SCRUM-86)

The shared [JSON fixtures](examples.json) contain four independent calls with two products each. Send `cases.<name>.request` as the JSON body of `POST /api/checkout`; compare the HTTP status and body with `response.status` and `response.body`. The envelope is for tests and is never sent. Frontend mocks and backend contract tests should load this same file. All IDs and bank tokens are synthetic.

## Request and authority

Send JSON with the session cookie (credentials included) and the configured application origin. Use the authenticated `req.user.id` as customer ID. Accept only `items`, `idempotencyKey` and `paymentToken` on the request. Neither the customer ID nor the price, total, approval outcome or remaining stock is client input. The mock payment adapter consumes a test token from the checkout form; the fixture tokens select deterministic sandbox responses. Never persist or log card details.

Map each React cart entry `{product, quantity}` to `{productId: product.id, quantity}` as in the existing cart client. Require 1–100 entries. Reuse the cart parser's positive integer and duplicate aggregation rules, then reject an empty cart. Compute prices and stock from current catalog data at confirmation. Monetary fields are nonnegative base-10 **strings with exactly two fractional digits**, decimal point, no grouping, in TRY. Use decimal arithmetic or integer kuruş. The example total is 2 × 125.50 + 39.90 = 290.90.

An idempotency key is a client-generated UUID per intentional payment attempt, scoped to the authenticated customer. Keep the key on network retries, including a lost success response. Compare normalized items and payment token: identical input replays the same terminal status and body; changed input under the same key returns 409 `IDEMPOTENCY_KEY_REUSED`. Concurrent identical attempts must converge on one result, one charge and one stock update. A deliberate retry after a decline or cart correction uses a fresh key. Authenticate before looking up any earlier attempt.

## Outcomes and UI actions

| HTTP | Stable discriminator | Client action |
| --- | --- | --- |
| 201 | payment.status = approved | Clear the cart only after receiving the confirmed order. Open its invoice. |
| 401 | HTTP 401 | Keep the cart and prompt for login. The existing middleware returns only the error string shown in the fixture. |
| 402 | PAYMENT_DECLINED | Show the decline and retain the cart for another attempt. |
| 409 | STOCK_CONFLICT | Show affected items and available quantities. Allow quantity corrections. |
| 409 | IDEMPOTENCY_KEY_REUSED | Report the conflicting attempt; do not treat it as success. |
| 400 | INVALID_CHECKOUT | Correct invalid checkout fields before retrying. |

Domain errors use `{code, error}` with a stable machine code and a display message. Middleware failures retain their current HTTP and JSON behavior, including untrusted origin (403) and malformed JSON (400). Stock conflicts list only failed lines, using cart reason values INSUFFICIENT_STOCK, OUT_OF_STOCK or PRODUCT_NOT_FOUND. A decline or stock conflict creates no confirmed charge, order, invoice or inventory change. Confirm stock and sales-count updates and the order together; expose approval only after persistence succeeds.

## Shared records

- **Order.** The approved fixture's `order` is the canonical purchase snapshot. Reuse its integer orderId and customerId, UTC ISO 8601 purchasedAt, currency, total, invoiceNumber and item fields in order history and invoice reads. Product names, quantities and prices describe the purchase at that time. History exposes the current delivery status and is scoped to the session customer.
- **Invoice.** Both screen and PDF render the same invoiceNumber, orderId, purchasedAt, currency, items and total from the confirmed order, plus a customer snapshot shaped like `invoiceCustomer` in the fixture. Capture name, email and deliveryAddress from the customer's stored profile (homeAddress) at purchase. The invoice number stays fixed across retries. Customer reads enforce ownership. Mail delivery failure leaves the order confirmed.
- **Delivery.** New orders start at `processing`. A PRODUCT_MANAGER can advance exactly one step to `in-transit`, then to `delivered` (terminal). Target orderId comes from the resource path. The fixture shows the first update request and response; updatedAt is server-generated UTC. Reject skipped, backward or stale transitions (409); reject unauthorized roles (403). Subsequent history reads reflect the persisted status.

## Integration boundary on main (244acd3)

The live Express app mounts /api/auth, catalog routes and POST /api/cart/validate. Cart validation permits guests and an empty cart, returns HTTP 200 with valid=false for shortages, and does not reserve stock. The session middleware supplies req.user; authentication failures have no JSON code field. React restores the session via /api/auth/me, retains its local cart and sends signed-in customers with items to /cart. Catalog price is Prisma Decimal(12,2); checkout serialization explicitly pads trailing zeros.

Checkout, orders, invoices, the mock bank and delivery updates are planned interfaces. No checkout route or persistent order model exists on this baseline. The fixtures define their wire format for subsequent tickets; they are not evidence of a live purchase. The contract test checks the real cart and authentication HTTP routes and the arithmetic and references in the approved example.
