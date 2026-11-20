import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_QUERY_LENGTH, ProductQueryError, buildProductWhere, escapeLikePattern, parseCategoryId, parseProductQuery, parseSearchText,
} from '../src/productQuery.js';

test('no parameters keep the original catalog query', () => {
  assert.deepEqual(parseProductQuery({}), { include: { category: true }, orderBy: { id: 'asc' } });
  assert.deepEqual(parseProductQuery(), { include: { category: true }, orderBy: { id: 'asc' } });
});

test('search text is trimmed and blank text is ignored', () => {
  assert.equal(parseSearchText({ q: '  lipstick  ' }), 'lipstick');
  assert.equal(parseSearchText({ q: '   ' }), '');
  assert.equal(parseProductQuery({ q: '   ' }).where, undefined);
});

test('search matches name, model and description case-insensitively', () => {
  assert.deepEqual(parseProductQuery({ q: 'Red' }).where, {
    OR: [
      { name: { contains: 'Red', mode: 'insensitive' } },
      { model: { contains: 'Red', mode: 'insensitive' } },
      { description: { contains: 'Red', mode: 'insensitive' } },
    ],
  });
});

test('search text up to the length limit is accepted, longer text is rejected', () => {
  assert.equal(parseSearchText({ q: 'a'.repeat(MAX_QUERY_LENGTH) }).length, MAX_QUERY_LENGTH);
  assert.throws(() => parseSearchText({ q: 'a'.repeat(MAX_QUERY_LENGTH + 1) }), ProductQueryError);
});

test('repeated or nested parameters are rejected', () => {
  assert.throws(() => parseSearchText({ q: ['a', 'b'] }), /at most once/);
  assert.throws(() => parseCategoryId({ category: ['1', '2'] }), /at most once/);
  assert.throws(() => parseSearchText({ q: { $ne: '' } }), ProductQueryError);
});

test('category accepts positive integer ids', () => {
  assert.equal(parseCategoryId({}), null);
  assert.equal(parseCategoryId({ category: '' }), null);
  assert.equal(parseCategoryId({ category: '7' }), 7);
  assert.equal(parseCategoryId({ category: ' 12 ' }), 12);
  assert.equal(parseCategoryId({ category: '2147483647' }), 2147483647);
});

test('category rejects non-numeric, zero, negative, fractional and oversized ids', () => {
  for (const category of ['abc', '0', '-1', '1.5', '01', '1e3', '2147483648', '99999999999']) {
    assert.throws(() => parseCategoryId({ category }), ProductQueryError, category);
  }
});

test('keyword and category are combined with AND', () => {
  assert.deepEqual(buildProductWhere({ text: 'mask', categoryId: 3 }), {
    OR: [
      { name: { contains: 'mask', mode: 'insensitive' } },
      { model: { contains: 'mask', mode: 'insensitive' } },
      { description: { contains: 'mask', mode: 'insensitive' } },
    ],
    categoryId: 3,
  });
  assert.deepEqual(parseProductQuery({ category: '3' }).where, { categoryId: 3 });
});

test('unknown parameters are ignored', () => {
  assert.deepEqual(parseProductQuery({ page: '2', foo: 'bar' }), parseProductQuery({}));
});

test('% and _ in search text are matched literally, not as wildcards', () => {
  assert.equal(escapeLikePattern('50%'), '50\\%');
  assert.equal(escapeLikePattern('a_b'), 'a\\_b');
  assert.equal(escapeLikePattern('back\\slash'), 'back\\\\slash');
  assert.equal(escapeLikePattern('plain text'), 'plain text');
  assert.equal(parseProductQuery({ q: '%' }).where.OR[0].name.contains, '\\%');
});
