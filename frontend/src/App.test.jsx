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
    if (url === '/api/auth/me') return { ok: false, status: 401, json: async () => ({}) };
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

it('links a homepage category to its matching catalog filter', async () => {
  stubApi();
  render(<MemoryRouter><App /></MemoryRouter>);
  const category = await screen.findByRole('link', { name: 'Explore Makeup products' });
  expect(category).toHaveAttribute('href', '/products?category=1');
  fireEvent.click(category);
  await screen.findByRole('heading', { name: 'All products' });
  expect(screen.getByLabelText('Category')).toHaveValue('1');
});

it('registers, signs in and signs out without discarding the guest cart', async () => {
  const user = { id: 1, name: 'Ada Example', email: 'ada@example.test' };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url === '/api/auth/me') return { ok: false, status: 401, json: async () => ({}) };
    if (url === '/api/auth/register' || url === '/api/auth/login') {
      return { ok: true, json: async () => ({ user }) };
    }
    if (url === '/api/auth/logout') return { ok: true, status: 204 };
    if (url.startsWith('/api/categories')) return { ok: true, json: async () => [product.category] };
    if (url.startsWith('/api/products')) return { ok: true, json: async () => [product] };
    return stockReply(true);
  }));
  render(<MemoryRouter initialEntries={['/products']}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
  await screen.findByRole('link', { name: 'Cart with 1 items' });
  fireEvent.click(screen.getByRole('link', { name: 'Login' }));
  fireEvent.click(screen.getByRole('link', { name: 'Create an account' }));
  const fill = (name, value) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
  const password = 'Password2026!';
  fill('Full name', user.name);
  fill('Email address', user.email);
  fill('Tax ID', '001');
  fill('Home address', 'Test street 1');
  fill('Password', password);
  fill('Confirm password', password);
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText('Account created. Sign in to continue.');
  const registration = fetch.mock.calls.find(([url]) => url === '/api/auth/register')[1];
  expect(JSON.parse(registration.body)).toEqual({
    email: user.email, password, name: user.name, taxId: '001', homeAddress: 'Test street 1',
  });
  expect(screen.getByLabelText('Email address')).toHaveValue(user.email);
  fill('Password', password);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('heading', { name: 'Cart', level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cart with 1 items' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('link', { name: 'Login' });
  expect(screen.getByRole('link', { name: 'Cart with 1 items' })).toBeInTheDocument();
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
