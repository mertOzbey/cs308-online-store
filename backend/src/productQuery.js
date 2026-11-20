// Turns the query string of GET /api/products into Prisma findMany arguments.
//
// Supported parameters (all optional):
//   q         keyword matched case-insensitively against name, model and description
//   category  numeric category id
//   sort      price_asc | price_desc | popularity (default: catalog order by id)
//
// Invalid values throw a ProductQueryError so the route can answer 400 instead
// of silently returning the whole catalog.

export const MAX_QUERY_LENGTH = 100;
const MAX_INT_ID = 2147483647; // PostgreSQL INTEGER upper bound
const SEARCH_FIELDS = ['name', 'model', 'description'];

// Every sort ends with id so products with equal prices or sales keep a stable order.
const SORT_ORDERS = {
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  popularity: [{ salesCount: 'desc' }, { id: 'asc' }],
};
export const SORT_OPTIONS = Object.keys(SORT_ORDERS);
const DEFAULT_ORDER = { id: 'asc' };

export class ProductQueryError extends Error {}

function singleValue(query, key) {
  const value = query?.[key];
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new ProductQueryError(`${key} must be given at most once.`);
  }
  return value;
}

export function parseSearchText(query) {
  const text = singleValue(query, 'q').trim();
  if (text.length > MAX_QUERY_LENGTH) {
    throw new ProductQueryError(`q must be at most ${MAX_QUERY_LENGTH} characters.`);
  }
  return text;
}

export function parseCategoryId(query) {
  const raw = singleValue(query, 'category').trim();
  if (raw === '') return null;
  if (!/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > MAX_INT_ID) {
    throw new ProductQueryError('category must be a positive integer id.');
  }
  return Number(raw);
}

export function parseSortOrder(query) {
  const sort = singleValue(query, 'sort').trim();
  if (sort === '') return DEFAULT_ORDER;
  if (!Object.hasOwn(SORT_ORDERS, sort)) {
    throw new ProductQueryError(`sort must be one of: ${SORT_OPTIONS.join(', ')}.`);
  }
  return SORT_ORDERS[sort];
}

export function buildProductWhere({ text = '', categoryId = null } = {}) {
  const where = {};
  if (text) {
    where.OR = SEARCH_FIELDS.map((field) => ({
      [field]: { contains: text, mode: 'insensitive' },
    }));
  }
  if (categoryId !== null) where.categoryId = categoryId;
  return Object.keys(where).length ? where : undefined;
}

export function parseProductQuery(query = {}) {
  const where = buildProductWhere({
    text: parseSearchText(query),
    categoryId: parseCategoryId(query),
  });
  const args = { include: { category: true } };
  if (where) args.where = where;
  args.orderBy = parseSortOrder(query);
  return args;
}
