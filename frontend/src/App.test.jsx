// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import App from './App.jsx';

const product = { id: 1, name: 'Lipstick', model: 'L1', description: 'Red lipstick',
  price: '25.00', stockQuantity: 5, category: { id: 1, name: 'Makeup' } };
const stockReply = (valid, reason = null, availableQuantity = 5) => ({ ok: true,
  json: async () => ({ valid, items: [{ productId: 1, reason, availableQuantity }] }) });
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
// Catalog requests are answered by URL; the remaining calls (cart stock checks) take `cartReplies` in order.
function stubApi(...cartReplies) {
  const last = cartReplies.at(-1);
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.startsWith('/api/categories')) return { ok: true, json: async () => [product.category] };
    if (url.startsWith('/api/products')) return { ok: true, json: async () => [product] };
    return cartReplies.length > 1 ? cartReplies.shift() : last;
  }));
}

it('submits navbar search and carries an approved item into the cart, updates and removes it', async () => {
  stubApi(stockReply(true));
  render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search beauty products' }), { target: { value: 'Lipstick' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit search' }));
  expect(await screen.findByRole('heading', { name: 'Lipstick' })).toBeInTheDocument();
  expect(screen.getByLabelText('Search products')).toHaveValue('Lipstick');
  fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Cart with 1 items' }));
  expect(screen.getByRole('heading', { name: 'Cart', level: 1 })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Quantity for Lipstick'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update quantity' }));
  await screen.findByRole('link', { name: 'Cart with 2 items' });
  fireEvent.click(screen.getByRole('button', { name: 'Check stock availability' }));
  expect(await screen.findByText(/All cart items are currently in stock/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Lipstick' }));
  expect(screen.getByText(/Your cart is empty/)).toBeInTheDocument();
});

it('restores the accepted quantity after the server rejects an update', async () => {
  stubApi(stockReply(true), stockReply(false, 'INSUFFICIENT_STOCK', 2), stockReply(true));
  render(<MemoryRouter initialEntries={['/products']}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Cart with 1 items' }));
  fireEvent.change(screen.getByLabelText('Quantity for Lipstick'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update quantity' }));
  await screen.findByText(/only 2 available/);
  await waitFor(() => expect(screen.getByLabelText('Quantity for Lipstick')).toHaveValue(1));
  expect(screen.getByRole('link', { name: 'Cart with 1 items' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Check stock availability' }));
  await screen.findByText(/All cart items are currently in stock/);
  expect(screen.getByLabelText('Quantity for Lipstick')).toHaveValue(1);
});

it('shows a changed-stock warning in the cart and preserves the accepted item count', async () => {
  stubApi(stockReply(true), stockReply(false, 'INSUFFICIENT_STOCK', 1));
  render(<MemoryRouter initialEntries={['/products']}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Cart with 1 items' }));
  fireEvent.change(screen.getByLabelText('Quantity for Lipstick'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update quantity' }));
  expect(await screen.findByText(/only 1 available/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cart with 1 items' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Lipstick' })).toBeEnabled());
});
