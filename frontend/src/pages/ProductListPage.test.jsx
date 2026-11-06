// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProductListPage from './ProductListPage.jsx';

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

function mockFetchOnce(body, { ok = true, status = 200 } = {}) {
  globalThis.fetch.mockResolvedValueOnce({ ok, status, json: async () => body });
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProductListPage', () => {
  it('requests GET /api/products', async () => {
    mockFetchOnce(products);
    render(<ProductListPage />);

    await screen.findByText('Wireless Headphones');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/products', expect.any(Object));
  });

  it('shows a loading state before the products arrive', () => {
    globalThis.fetch.mockReturnValueOnce(new Promise(() => {}));
    render(<ProductListPage />);

    expect(screen.getByLabelText('Loading products')).toBeInTheDocument();
  });

  it('renders one card per product and the product count', async () => {
    mockFetchOnce(products);
    render(<ProductListPage />);

    expect(await screen.findByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
    expect(screen.getByText('2 products')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('keeps out-of-stock products visible with a disabled button', async () => {
    mockFetchOnce(products);
    render(<ProductListPage />);

    expect(await screen.findByRole('button', { name: 'Sold out' })).toBeDisabled();
  });

  it('shows an empty state when the backend returns no products', async () => {
    mockFetchOnce([]);
    render(<ProductListPage />);

    expect(await screen.findByText('No products yet.')).toBeInTheDocument();
  });

  it('shows an error when the backend responds with an error status', async () => {
    mockFetchOnce({ error: 'Products could not be retrieved.' }, { ok: false, status: 500 });
    render(<ProductListPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Products could not be loaded');
  });

  it('shows an error when the network request fails', async () => {
    globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ProductListPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('loads the products again when Retry is clicked', async () => {
    globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mockFetchOnce(products);
    render(<ProductListPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Wireless Headphones')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
