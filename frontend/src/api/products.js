// API client for the product catalog.
//   GET /api/products   (SCRUM-71, search filters: SCRUM-79)
//   GET /api/categories (SCRUM-79)
//
// In development the request goes to the Vite dev server, which proxies /api
// to the Express backend on port 3000 (see vite.config.js). Set
// VITE_API_BASE_URL only if the backend is served from another origin.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Only non-empty filters are sent, so an unfiltered request stays /api/products.
export function buildProductsUrl({ q = '', category = '' } = {}) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  const query = params.toString();
  return `${API_BASE_URL}/api/products${query ? `?${query}` : ''}`;
}

async function getList(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`GET ${url} did not return a list.`);
  }
  return data;
}

export function fetchProducts({ signal, ...filters } = {}) {
  return getList(buildProductsUrl(filters), signal);
}

export function fetchCategories({ signal } = {}) {
  return getList(`${API_BASE_URL}/api/categories`, signal);
}
