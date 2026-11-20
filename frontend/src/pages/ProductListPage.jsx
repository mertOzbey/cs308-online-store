import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { fetchCategories, fetchProducts } from '../api/products.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import './ProductListPage.css';

const SEARCH_DELAY_MS = 300;
const isCategoryId = (value) => /^[1-9]\d*$/.test(value);

export default function ProductListPage({ onAddToCart, cartBusy = false, cartMessage = '' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const categoryId = searchParams.get('category') ?? '';
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [loadedRequest, setLoadedRequest] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [categories, setCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // Search and filtering run on the server (SCRUM-79). Typing is debounced;
  // an id that the backend would reject is not sent.
  const searchText = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const categoryFilter = isCategoryId(categoryId) ? categoryId : '';
  const filtersActive = Boolean(query.trim() || categoryId);
  const selectedCategoryKnown = categories.some((category) => String(category.id) === categoryId);
  // While new results load, the previous ones stay on screen marked as busy.
  const request = `${searchText}|${categoryFilter}|${reloadKey}`;
  const refreshing = loadedRequest !== request;

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
    // AbortController cancels the request if the filters change or the page
    // unmounts first, so an older, slower response can never replace a newer one.
    const controller = new AbortController();

    fetchProducts({ q: searchText, category: categoryFilter, signal: controller.signal })
      .then((data) => {
        setProducts(data);
        setStatus('success');
        setLoadedRequest(request);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        console.error(error);
        setStatus('error');
        setLoadedRequest(request);
      });

    return () => controller.abort();
  }, [searchText, categoryFilter, reloadKey, request]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories({ signal: controller.signal })
      .then((data) => {
        setCategories(data);
        setCategoriesLoaded(true);
      })
      .catch((error) => {
        // The page still works without the dropdown entries.
        if (error.name !== 'AbortError') console.error(error);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="product-list-page">
      <header className="product-list-page__header">
        <h1>All products</h1>
        {status === 'success' && (
          <p className="product-list-page__count" role="status">
            {products.length} {products.length === 1 ? 'product' : 'products'}
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
            {categoryId && !selectedCategoryKnown && (
              <option value={categoryId}>{categoriesLoaded ? 'Unavailable category' : 'Selected category'}</option>
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

      {status === 'success' && products.length === 0 && !filtersActive && (
        <div className="product-list-page__message">
          <p>No products yet.</p>
        </div>
      )}

      {status === 'success' && products.length === 0 && filtersActive && (
        <div className="product-list-page__message">
          <p>No products match your search and category.</p>
          <button type="button" className="btn btn-primary" onClick={clearFilters}>Show all products</button>
        </div>
      )}

      {status === 'success' && products.length > 0 && (
        <div className="product-grid" aria-busy={refreshing}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} cartBusy={cartBusy} />
          ))}
        </div>
      )}
    </section>
  );
}
