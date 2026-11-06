// API client for the product catalog (backend: SCRUM-71, GET /api/products).
//
// In development the request goes to the Vite dev server, which proxies /api
// to the Express backend on port 3000 (see vite.config.js). Set
// VITE_API_BASE_URL only if the backend is served from another origin.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function fetchProducts({ signal } = {}) {
  const response = await fetch(`${API_BASE_URL}/api/products`, { signal });

  if (!response.ok) {
    throw new Error(`GET /api/products failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('GET /api/products did not return a list.');
  }
  return data;
}
