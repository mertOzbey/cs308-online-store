import { Link } from 'react-router-dom';
import { useState } from 'react';
import { formatPrice } from '../utils/productFormat.js';

function QuantityEditor({ product, quantity, cart }) {
  const [draft, setDraft] = useState(String(quantity));
  return (
    <form className="d-flex flex-wrap align-items-end gap-2" onSubmit={async (event) => {
      event.preventDefault();
      const accepted = await cart.updateQuantity(product.id, Number(draft));
      if (!accepted) setDraft(String(quantity));
    }}>
      <label>
        Quantity for {product.name}
        <input type="number" className="form-control" min="1" step="1" required
          style={{ width: '7rem' }} value={draft} disabled={cart.busy}
          onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button type="submit" className="btn btn-outline-secondary" disabled={cart.busy}>Update quantity</button>
    </form>
  );
}

export default function CartPage({ cart }) {
  return (
    <section aria-busy={cart.busy}>
      <h1>Cart</h1>
      <p>Your cart is kept while this page is open. Availability is checked with the store when you add or change items.</p>
      {cart.message && <p role="status">{cart.message}</p>}
      {cart.items.length === 0 ? <p>Your cart is empty. <Link to="/products">Browse products</Link></p> : (
        <>
          <ul className="list-group mb-3">
            {cart.items.map(({ product, quantity }) => (
              <li key={product.id} className="list-group-item d-flex flex-wrap align-items-center gap-3">
                <div className="me-auto"><h2 className="h5">{product.name}</h2><span>{formatPrice(product.price)} each</span></div>
                <QuantityEditor key={quantity} product={product} quantity={quantity} cart={cart} />
                <button type="button" className="btn btn-outline-danger" disabled={cart.busy}
                  aria-label={`Remove ${product.name}`} onClick={() => cart.removeItem(product.id)}>Remove</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={cart.checkStock} disabled={cart.busy}>Check stock availability</button>
        </>
      )}
    </section>
  );
}
