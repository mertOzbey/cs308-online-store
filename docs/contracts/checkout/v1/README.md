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

## Order storage (SCRUM-87)

Order.id supplies orderId. Copy User.name, email and homeAddress into customerName, customerEmail and deliveryAddress when confirming the purchase. Each OrderItem keeps its own product name and unitPrice. Calculate lineTotal from quantity × catalog price and Order.total from the sum of the lines in the same checkout transaction. Serialize decimals with two fractional digits. Prisma's in_transit enum member maps to the PostgreSQL and HTTP value `in-transit`.

For customer history, filter by customerId and sort by purchasedAt descending, then id descending. The composite history index follows that order. OrderItem's (orderId, productId) primary key groups the lines of an order and admits one line per aggregated product. Its productId index supports lookups from a product.

The (customerId, idempotencyKey) unique constraint prevents duplicate confirmed orders for one customer's attempt. Replaying terminal payment responses, validating reuse against the normalized request and handling declined attempts belong to the checkout service. No payment token is stored on the order.

## Mock bank boundary (SCRUM-88)

The v1 HTTP contract remains token-based: clients send `mock_approve` or
`mock_decline`, never card fields or an amount. The server-side mock payment
service resolves those tokens to deliberately synthetic, in-process test cards,
loads current prices from the catalog and calculates the TRY total in kuruş.
It rejects any client-supplied `amount` field.

The isolated bank adapter validates its synthetic card fields and returns both
approved and declined results with a deterministic `mock-pay-*` transaction
reference. It scopes attempt keys by customer and replays the first result for
an identical retry without creating a second payment. Its in-memory attempt
record contains only the amount, currency, decision and a SHA-256 digest of the
normalized item/token request; card numbers, security codes and cardholder data
are neither stored nor logged. A changed request under the same key raises
`IDEMPOTENCY_KEY_REUSED`.

This differs from a direct card-form API intentionally: SCRUM-86 defines
`paymentToken` as the public field, while card-shaped values exist only behind
the mock adapter boundary. SCRUM-92 composes this service with authentication,
stock mutation and order persistence at `POST /api/checkout`. The contract
test imports the real token resolver so fixture drift is detected.

## Approved order service (SCRUM-90)

Pass the result of the SCRUM-88 payment service directly to `confirmApprovedOrder(db, { customerId, idempotencyKey, ...authorization })` from `backend/src/approvedOrder.js`. Here `authorization` comes from the server's `service.authorize(customerId, request)` and supplies `payment`, `quote` and normalized `items`. Use the authenticated session customer ID. A decline raises `PAYMENT_DECLINED` before any database write. The transaction captures the current catalog and invoice customer data, checks that the total still matches the approval and returns the persisted Prisma order with its items in product ID order. Send checkout success only after this call resolves. Serialize the purchase snapshot according to the fixtures above.

A stock conflict carries `code` and `items`. Changed cart contents on an existing confirmed key produce `IDEMPOTENCY_KEY_REUSED`. The checkout route and mock bank own payment-token matching, bank references and replay of terminal HTTP responses. The order service can retry a database transaction without repeating a bank call.

## Live checkout route (SCRUM-92)

`POST /api/checkout` authenticates and checks the configured application
origin before parsing the checkout body. The route always uses `req.user.id`;
the public body accepts only `items`, `paymentToken` and `idempotencyKey`.
It normalizes duplicate items, loads catalog prices on the server, authorizes
the in-process mock bank and passes that exact authorization to
`confirmApprovedOrder`. The response serializes the persisted purchase
snapshot rather than any client-side product name or price.

Identical requests for one customer and idempotency key share one in-flight or
terminal response. A changed normalized cart or payment token for that key
returns `IDEMPOTENCY_KEY_REUSED`. Declines and stock conflicts never create an
order or mutate inventory; approval is returned only after the atomic order
transaction commits.

The dependency schema has no PaymentAttempt table: only approved attempts are
durable through the unique `Order(customerId, idempotencyKey)` constraint.
Mock-bank and non-order terminal response replay is therefore process-local,
matching the existing in-memory SCRUM-88 adapter. A multi-process or
restart-durable payment integration would require a persisted attempt/result
record; SCRUM-92 does not add that unapproved schema change.

## Shared invoice data and PDF (SCRUM-93)

`createInvoiceData(order)` is the only presentation transformer for invoices.
It maps the persisted Order and OrderItem purchase snapshots to the shared
screen/PDF shape: invoice and order identifiers, purchase time, currency,
customer name/email/delivery address, item names, quantities, unit prices,
line totals and the order total. `loadInvoiceData` scopes the read to both the
authenticated customer and order ID; it never reads the current Product row.

The dependency schema differs from a design with a separate Invoice table:
SCRUM-87 already stores a unique, stable `Order.invoiceNumber`, the customer
snapshot and every item price, while SCRUM-90 assigns the number when it first
claims the order. SCRUM-93 therefore reuses those fields and adds no duplicate
invoice record or number generator. Values are normalized with exact base-10,
half-up rounding to two fractional digits before either representation sees
them. The PDF renderer consumes that normalized object directly and embeds the
Noto Sans Latin Extended font for Turkish characters.

No HTTP route is mounted by this ticket. SCRUM-95 can return the object from
`loadInvoiceData` for the on-screen invoice and use `loadInvoiceDocuments` for
the PDF response, guaranteeing the two endpoints consume the same fields and
rounding result.
