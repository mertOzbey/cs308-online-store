// Turns the query string of GET /api/products into Prisma findMany arguments.
//
// Supported parameters (all optional):
//   q         keyword matched case-insensitively against name, model and description
//   category  numeric category id
//
// Invalid values throw a ProductQueryError so the route can answer 400 instead
// of silently returning the whole catalog.

export const MAX_QUERY_LENGTH = 100;
const MAX_INT_ID = 2147483647; // PostgreSQL INTEGER upper bound
const SEARCH_FIELDS = ['name', 'model', 'description'];

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
  args.orderBy = { id: 'asc' };
  return args;
}
