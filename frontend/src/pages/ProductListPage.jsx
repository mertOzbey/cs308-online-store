import { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard.jsx';
import { fetchProducts } from '../api/products.js';
import './ProductListPage.css';

export default function ProductListPage() {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [reloadKey, setReloadKey] = useState(0);

  function retry() {
    setStatus('loading');
    setReloadKey((key) => key + 1); // a new key re-runs the effect below
  }

  useEffect(() => {
    // AbortController cancels the request if the page unmounts before it ends.
    const controller = new AbortController();

    fetchProducts({ signal: controller.signal })
      .then((data) => {
        setProducts(data);
        setStatus('success');
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        console.error(error);
        setStatus('error');
      });

    return () => controller.abort();
  }, [reloadKey]);

  return (
    <section className="product-list-page">
      <header className="product-list-page__header">
        <h1>All products</h1>
        {status === 'success' && (
          <p className="product-list-page__count">
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </p>
        )}
      </header>

      {status === 'loading' && (
        <div className="product-grid" aria-busy="true" aria-label="Loading products">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="product-skeleton" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="product-list-page__message" role="alert">
          <p>Products could not be loaded. Please try again.</p>
          <button type="button" className="btn btn-primary" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && products.length === 0 && (
        <div className="product-list-page__message">
          <p>No products yet.</p>
        </div>
      )}

      {status === 'success' && products.length > 0 && (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
