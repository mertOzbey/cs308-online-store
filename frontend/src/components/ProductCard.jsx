import { formatPrice, getStockStatus } from '../utils/productFormat.js';
import './ProductCard.css';

// One product tile in the listing grid. Field names match the Prisma Product
// model returned by GET /api/products (category is included by the backend).
export default function ProductCard({ product, onAddToCart }) {
  const stock = getStockStatus(product.stockQuantity);

  return (
    <article className="product-card" data-stock={stock.level}>
      <div className="product-card__image" aria-hidden="true">
        <span>{product.name.charAt(0).toUpperCase()}</span>
      </div>

      <div className="product-card__body">
        {product.category && (
          <span className="product-card__category">{product.category.name}</span>
        )}
        <h3 className="product-card__name">{product.name}</h3>
        <p className="product-card__model">{product.model}</p>
        <p className="product-card__description">{product.description}</p>
      </div>

      <div className="product-card__footer">
        <div>
          <p className="product-card__price">{formatPrice(product.price)}</p>
          <p className={`product-card__stock product-card__stock--${stock.level}`}>
            {stock.label}
          </p>
        </div>
        <button
          type="button"
          className="product-card__button"
          disabled={!stock.canAddToCart}
          onClick={() => onAddToCart?.(product)}
        >
          {stock.canAddToCart ? 'Add to cart' : 'Sold out'}
        </button>
      </div>
    </article>
  );
}
