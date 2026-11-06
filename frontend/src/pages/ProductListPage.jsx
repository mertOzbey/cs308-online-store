import ProductCard from '../components/ProductCard.jsx';
import { sampleProducts } from '../data/sampleProducts.js';
import './ProductListPage.css';

// SCRUM-67: listing page layout with sample data.
// SCRUM-72 replaces sampleProducts with data from GET /api/products.
export default function ProductListPage() {
  const products = sampleProducts;

  return (
    <section className="product-list-page">
      <header className="product-list-page__header">
        <h1>All products</h1>
        <p className="product-list-page__count">
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </p>
      </header>

      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
