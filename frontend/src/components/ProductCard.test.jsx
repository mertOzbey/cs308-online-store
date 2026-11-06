// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProductCard from './ProductCard.jsx';

const baseProduct = {
  id: 1,
  name: 'Wireless Headphones',
  model: 'WH-100',
  description: 'Over-ear headphones with noise cancelling.',
  stockQuantity: 12,
  price: '1299.50',
  category: { id: 1, name: 'Audio' },
};

afterEach(cleanup);

describe('ProductCard', () => {
  it('shows name, model, category, price and stock', () => {
    render(<ProductCard product={baseProduct} />);

    expect(screen.getByRole('heading', { name: 'Wireless Headphones' })).toBeInTheDocument();
    expect(screen.getByText('WH-100')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('₺1.299,50')).toBeInTheDocument();
    expect(screen.getByText('12 in stock')).toBeInTheDocument();
  });

  it('calls onAddToCart with the product when the button is clicked', () => {
    const onAddToCart = vi.fn();
    render(<ProductCard product={baseProduct} onAddToCart={onAddToCart} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(onAddToCart).toHaveBeenCalledWith(baseProduct);
  });

  it('disables the button for an out-of-stock product but still shows it', () => {
    const onAddToCart = vi.fn();
    render(
      <ProductCard product={{ ...baseProduct, stockQuantity: 0 }} onAddToCart={onAddToCart} />,
    );

    const button = screen.getByRole('button', { name: 'Sold out' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAddToCart).not.toHaveBeenCalled();
    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
  });

  it('renders without a category', () => {
    render(<ProductCard product={{ ...baseProduct, category: null }} />);
    expect(screen.queryByText('Audio')).not.toBeInTheDocument();
  });
});
