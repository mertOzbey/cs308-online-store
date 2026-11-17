import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { fetchProducts } from '../api/products.js';
import './ProductListPage.css';

export default function ProductListPage({ onAddToCart, cartBusy = false, cartMessage = '' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const categoryId = searchParams.get('category') ?? '';
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [reloadKey, setReloadKey] = useState(0);
  const categories = [...new Map(products.filter((product) => product.category)
    .map((product) => [String(product.category.id), product.category])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProducts = products.filter((product) =>
    (!categoryId || String(product.category?.id) === categoryId) &&
    (!normalizedQuery || [product.name, product.model, product.description]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))));

  function updateFilter(key, value) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }

  function clearFilters() {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('q');
      next.delete('category');
      return next;
    });
  }

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
          <p className="product-list-page__count" role="status">
            {visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}
          </p>
        )}
      </header>

      <div className="product-list-page__filters" role="search" aria-label="Filter products">
        <div>
          <label htmlFor="product-search" className="form-label">Search products</label>
          <input id="product-search" type="search" className="form-control"
            placeholder="Search name, model or description" value={query}
            onChange={(event) => updateFilter('q', event.target.value)} />
        </div>
        <div>
          <label htmlFor="product-category" className="form-label">Category</label>
          <select id="product-category" className="form-select" value={categoryId}
            onChange={(event) => updateFilter('category', event.target.value)}>
            <option value="">All categories</option>
            {categoryId && !categories.some((category) => String(category.id) === categoryId) && (
              <option value={categoryId}>Unavailable category</option>
            )}
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={clearFilters}
          disabled={!query && !categoryId}>Clear filters</button>
      </div>
      {cartMessage && <p role="status">{cartMessage}</p>}

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

      {status === 'success' && products.length > 0 && visibleProducts.length === 0 && (
        <div className="product-list-page__message">
          <p>No products match your search and category.</p>
          <button type="button" className="btn btn-primary" onClick={clearFilters}>Show all products</button>
        </div>
      )}

      {status === 'success' && visibleProducts.length > 0 && (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} cartBusy={cartBusy} />
          ))}
        </div>
      )}
    </section>
  );
}
