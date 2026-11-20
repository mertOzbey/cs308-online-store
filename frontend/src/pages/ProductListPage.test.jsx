// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderView, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import ProductListPage from './ProductListPage.jsx';

function render(view, path = '/products') {
  return renderView(<MemoryRouter initialEntries={[path]}>{view}</MemoryRouter>);
}

const products = [
  {
    id: 1, name: 'Wireless Headphones', model: 'WH-100', description: 'Headphones',
    stockQuantity: 12, price: '1299.50', category: { id: 1, name: 'Audio' },
  },
  {
    id: 2, name: 'Mechanical Keyboard', model: 'MK-87', description: 'Keyboard',
    stockQuantity: 0, price: '2499.00', category: { id: 2, name: 'Peripherals' },
  },
];
const categories = [{ id: 1, name: 'Audio' }, { id: 2, name: 'Peripherals' }];

// Fake backend: filters like GET /api/products does (SCRUM-79) and records each URL.
// A test can queue one-off replies for the products endpoint in `productReplies`.
let catalog;
let productReplies;
let categoryReply;
const reply = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

function fakeServer(url) {
  const { pathname, searchParams } = new URL(url, 'http://localhost');
  if (pathname === '/api/categories') return categoryReply();
  if (productReplies.length) return productReplies.shift()();
  const q = (searchParams.get('q') ?? '').toLowerCase();
  const category = searchParams.get('category');
  return reply(catalog.filter((product) =>
    (!category || String(product.category.id) === category) &&
    (!q || [product.name, product.model, product.description].some((text) => text.toLowerCase().includes(q)))));
}

const productCalls = () => globalThis.fetch.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/products'));

beforeEach(() => {
  catalog = products;
  productReplies = [];
  categoryReply = () => reply(categories);
  globalThis.fetch = vi.fn(async (url) => fakeServer(url));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProductListPage', () => {
  it('combines a trimmed case-insensitive search with the selected category and resets both', async () => {
    render(<ProductListPage />);
    await screen.findByText('Wireless Headphones');
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: '  WH-100  ' } });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getByText('1 product')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '2' } });
    expect(await screen.findByText('No products match your search and category.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
  });

  it('sends the search text and category to GET /api/products', async () => {
    render(<ProductListPage />, '/products?q=%20key%20&category=2');
    await screen.findByText('Mechanical Keyboard');
    expect(productCalls()).toEqual(['/api/products?q=key&category=2']);
  });

  it('waits until typing pauses before searching', async () => {
    render(<ProductListPage />);
    await screen.findByText('Wireless Headphones');
    const input = screen.getByLabelText('Search products');
    for (const value of ['k', 'ke', 'key']) fireEvent.change(input, { target: { value } });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(productCalls()).toEqual(['/api/products', '/api/products?q=key']);
  });

  it('restores filters from the URL and keeps sold-out matches visible', async () => {
    render(<ProductListPage />, '/products?q=keyboard&category=2');
    expect(await screen.findByRole('button', { name: 'Sold out' })).toBeDisabled();
    expect(screen.queryByText('Wireless Headphones')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search products')).toHaveValue('keyboard');
    expect(screen.getByLabelText('Category')).toHaveValue('2');
  });

  it('lists every category from GET /api/categories, even ones not in the results', async () => {
    render(<ProductListPage />, '/products?q=keyboard');
    await screen.findByText('Mechanical Keyboard');
    await screen.findByRole('option', { name: 'Audio' });
    expect(screen.getByRole('option', { name: 'Peripherals' })).toBeInTheDocument();
  });

  it('still shows products when the categories cannot be loaded', async () => {
    categoryReply = () => reply({ error: 'down' }, { ok: false, status: 500 });
    render(<ProductListPage />);
    expect(await screen.findByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a reset for a category no longer present in the catalog', async () => {
    render(<ProductListPage />, '/products?category=999');
    expect(await screen.findByRole('option', { name: 'Unavailable category' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Show all products' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
  });

  it('does not send a malformed category id to the backend', async () => {
    render(<ProductListPage />, '/products?category=abc');
    await screen.findByText('Wireless Headphones');
    expect(productCalls()).toEqual(['/api/products']);
  });

  it('requests GET /api/products', async () => {
    render(<ProductListPage />);

    await screen.findByText('Wireless Headphones');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/products', expect.any(Object));
  });

  it('shows a loading state before the products arrive', () => {
    productReplies.push(() => new Promise(() => {}));
    render(<ProductListPage />);

    expect(screen.getByLabelText('Loading products')).toBeInTheDocument();
  });

  it('renders one card per product and the product count', async () => {
    render(<ProductListPage />);

    expect(await screen.findByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
    expect(screen.getByText('2 products')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('keeps out-of-stock products visible with a disabled button', async () => {
    render(<ProductListPage />);

    expect(await screen.findByRole('button', { name: 'Sold out' })).toBeDisabled();
  });

  it('shows an empty state when the backend returns no products', async () => {
    catalog = [];
    render(<ProductListPage />);

    expect(await screen.findByText('No products yet.')).toBeInTheDocument();
  });

  it('shows an error when the backend responds with an error status', async () => {
    productReplies.push(() => reply({ error: 'Products could not be retrieved.' }, { ok: false, status: 500 }));
    render(<ProductListPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Products could not be loaded');
  });

  it('shows an error when the network request fails', async () => {
    productReplies.push(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<ProductListPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('loads the products again when Retry is clicked', async () => {
    productReplies.push(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<ProductListPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Wireless Headphones')).toBeInTheDocument();
    expect(productCalls()).toHaveLength(2);
  });
});
