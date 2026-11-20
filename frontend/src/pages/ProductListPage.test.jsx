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
    stockQuantity: 12, price: '1299.50', salesCount: 40, category: { id: 1, name: 'Audio' },
  },
  {
    id: 2, name: 'Mechanical Keyboard', model: 'MK-87', description: 'Keyboard',
    stockQuantity: 0, price: '2499.00', salesCount: 15, category: { id: 2, name: 'Peripherals' },
  },
  {
    id: 3, name: 'USB Microphone', model: 'MIC-1', description: 'Microphone',
    stockQuantity: 4, price: '899.90', salesCount: 90, category: { id: 1, name: 'Audio' },
  },
];
const byPrice = (a, b) => Number(a.price) - Number(b.price) || a.id - b.id;
const SORTS = {
  price_asc: byPrice,
  price_desc: (a, b) => Number(b.price) - Number(a.price) || a.id - b.id,
  popularity: (a, b) => b.salesCount - a.salesCount || a.id - b.id,
};
const categories = [{ id: 1, name: 'Audio' }, { id: 2, name: 'Peripherals' }];

// Fake backend: filters and sorts like GET /api/products does (SCRUM-79, SCRUM-81).
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
  const matches = catalog.filter((product) =>
    (!category || String(product.category.id) === category) &&
    (!q || [product.name, product.model, product.description].some((text) => text.toLowerCase().includes(q))));
  const sort = searchParams.get('sort');
  return reply(sort ? [...matches].sort(SORTS[sort]) : matches);
}

const cardNames = () => screen.getAllByRole('article').map((card) => card.querySelector('h2, h3').textContent);
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
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
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
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
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
    expect(screen.getByText('3 products')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
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

  describe('sorting (SCRUM-81)', () => {
    it('offers featured, price and popularity orders', async () => {
      render(<ProductListPage />);
      await screen.findByText('Wireless Headphones');
      const options = [...screen.getByLabelText('Sort by').options].map((option) => option.textContent);
      expect(options).toEqual(['Featured', 'Price: low to high', 'Price: high to low', 'Most popular']);
      expect(screen.getByLabelText('Sort by')).toHaveValue('');
    });

    it('sorts by price from low to high', async () => {
      render(<ProductListPage />);
      await screen.findByText('Wireless Headphones');
      fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price_asc' } });
      await waitFor(() => expect(cardNames()).toEqual(['USB Microphone', 'Wireless Headphones', 'Mechanical Keyboard']));
      expect(productCalls().at(-1)).toBe('/api/products?sort=price_asc');
    });

    it('sorts by price from high to low', async () => {
      render(<ProductListPage />);
      await screen.findByText('Wireless Headphones');
      fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price_desc' } });
      await waitFor(() => expect(cardNames()).toEqual(['Mechanical Keyboard', 'Wireless Headphones', 'USB Microphone']));
    });

    it('puts the most popular products first', async () => {
      render(<ProductListPage />);
      await screen.findByText('Wireless Headphones');
      fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'popularity' } });
      await waitFor(() => expect(cardNames()).toEqual(['USB Microphone', 'Wireless Headphones', 'Mechanical Keyboard']));
      expect(productCalls().at(-1)).toBe('/api/products?sort=popularity');
    });

    it('combines the sort with search and category and restores it from the URL', async () => {
      render(<ProductListPage />, '/products?q=o&category=1&sort=price_desc');
      await waitFor(() => expect(cardNames()).toEqual(['Wireless Headphones', 'USB Microphone']));
      expect(productCalls()).toEqual(['/api/products?q=o&category=1&sort=price_desc']);
      expect(screen.getByLabelText('Sort by')).toHaveValue('price_desc');
    });

    it('keeps the chosen sort when the filters are cleared', async () => {
      render(<ProductListPage />, '/products?category=2&sort=popularity');
      await screen.findByText('Mechanical Keyboard');
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      await waitFor(() => expect(cardNames()).toEqual(['USB Microphone', 'Wireless Headphones', 'Mechanical Keyboard']));
      expect(screen.getByLabelText('Sort by')).toHaveValue('popularity');
    });

    it('ignores an unknown sort in the URL instead of showing an error', async () => {
      render(<ProductListPage />, '/products?sort=cheapest');
      await screen.findByText('Wireless Headphones');
      expect(productCalls()).toEqual(['/api/products']);
      expect(screen.getByLabelText('Sort by')).toHaveValue('');
    });
  });
});
