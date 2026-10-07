import { describe, it, expect } from 'vitest';
import {
  parseSliceNotation,
  stripCharacters,
  removePrefixSuffix,
  substringBetween,
  substringBefore,
  substringAfter,
  toTitleCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  slugifyText,
  cleanWhitespace,
  truncateText,
  decodeHtmlEntities,
  roundNumber,
  formatCurrency,
  cleanPrice,
  applyStringOperation,
} from '../src/utils/stringTransform';
import { executeTransform } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';

describe('String Transformations & Slice Notation', () => {
  describe('parseSliceNotation', () => {
    const text = 'abcdefghijklmnop';

    it('handles python range slice [4:7]', () => {
      expect(parseSliceNotation(text, '4:7')).toBe('efg');
      expect(parseSliceNotation(text, '[4:7]')).toBe('efg');
    });

    it('handles slice up to negative index [:-3]', () => {
      // should cut off the last 3 characters
      expect(parseSliceNotation(text, ':-3')).toBe('abcdefghijklm');
      expect(parseSliceNotation(text, '[:-3]')).toBe('abcdefghijklm');
    });

    it('handles start from positive index [3:]', () => {
      expect(parseSliceNotation(text, '3:')).toBe('defghijklmnop');
    });

    it('handles negative start index [-4:]', () => {
      expect(parseSliceNotation(text, '-4:')).toBe('mnop');
    });

    it('handles reverse step [::-1]', () => {
      expect(parseSliceNotation('hello', '::-1')).toBe('olleh');
      expect(parseSliceNotation('12345', '[::-1]')).toBe('54321');
    });

    it('handles single character index', () => {
      expect(parseSliceNotation('AutoFlow', '0')).toBe('A');
      expect(parseSliceNotation('AutoFlow', '4')).toBe('F');
      expect(parseSliceNotation('AutoFlow', '-1')).toBe('w');
    });
  });

  describe('stripCharacters', () => {
    it('strips whitespace by default from both ends', () => {
      expect(stripCharacters('   hello world   ')).toBe('hello world');
      expect(stripCharacters('\n\t  hello \t\n')).toBe('hello');
    });

    it('strips start and end separately', () => {
      expect(stripCharacters('   hello   ', 'start')).toBe('hello   ');
      expect(stripCharacters('   hello   ', 'end')).toBe('   hello');
    });

    it('strips custom characters like quotes and slashes', () => {
      expect(stripCharacters('"hello world"', 'both', '"')).toBe('hello world');
      expect(stripCharacters("'''hello'''", 'both', "'")).toBe('hello');
      expect(stripCharacters('/path/to/item/', 'both', '/')).toBe('path/to/item');
      expect(stripCharacters('---title---', 'both', '-')).toBe('title');
    });
  });

  describe('removePrefixSuffix', () => {
    it('removes first N characters', () => {
      expect(removePrefixSuffix('ABC12345', 'first_n', 3)).toBe('12345');
      expect(removePrefixSuffix('Hello', 'first_n', 2)).toBe('llo');
      expect(removePrefixSuffix('Hi', 'first_n', 5)).toBe('');
    });

    it('removes last N characters', () => {
      expect(removePrefixSuffix('document.pdf', 'last_n', 4)).toBe('document');
      expect(removePrefixSuffix('Hello', 'last_n', 2)).toBe('Hel');
      expect(removePrefixSuffix('Hi', 'last_n', 5)).toBe('');
    });

    it('removes prefix string', () => {
      expect(removePrefixSuffix('https://google.com', 'prefix', 'https://')).toBe('google.com');
      expect(removePrefixSuffix('item_123', 'prefix', 'item_')).toBe('123');
      expect(removePrefixSuffix('no_match', 'prefix', 'other_')).toBe('no_match');
    });

    it('removes suffix string', () => {
      expect(removePrefixSuffix('filename.csv', 'suffix', '.csv')).toBe('filename');
      expect(removePrefixSuffix('test_suffix', 'suffix', '_suffix')).toBe('test');
    });
  });

  describe('substringBetween, substringBefore, substringAfter', () => {
    it('extracts between delimiters (exclusive and inclusive)', () => {
      const input = 'Order (ID: 99482) is ready';
      expect(substringBetween(input, '(', ')')).toBe('ID: 99482');
      expect(substringBetween(input, '(', ')', true)).toBe('(ID: 99482)');
    });

    it('extracts before and after delimiter', () => {
      const email = 'user.name@domain.com';
      expect(substringBefore(email, '@')).toBe('user.name');
      expect(substringAfter(email, '@')).toBe('domain.com');
    });

    it('handles search from end', () => {
      const path = '/usr/local/bin/node';
      expect(substringBefore(path, '/', true)).toBe('/usr/local/bin');
      expect(substringAfter(path, '/', true)).toBe('node');
    });
  });

  describe('Case conversions', () => {
    it('converts to Title Case', () => {
      expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox');
    });

    it('converts to camelCase', () => {
      expect(toCamelCase('User First Name')).toBe('userFirstName');
      expect(toCamelCase('user_profile_picture')).toBe('userProfilePicture');
    });

    it('converts to snake_case', () => {
      expect(toSnakeCase('userFirstName')).toBe('user_first_name');
      expect(toSnakeCase('User Profile')).toBe('user_profile');
    });

    it('converts to kebab-case', () => {
      expect(toKebabCase('User Profile Picture')).toBe('user-profile-picture');
      expect(toKebabCase('user_profile_name')).toBe('user-profile-name');
    });
  });

  describe('Text formatting utilities', () => {
    it('slugifies string', () => {
      expect(slugifyText('Apple iPhone 15 Pro Max (256GB)!')).toBe('apple-iphone-15-pro-max-256gb');
    });

    it('cleans whitespace', () => {
      expect(cleanWhitespace('Hello \t  world \n\n this   is   a   test')).toBe('Hello world this is a test');
    });

    it('truncates with word boundaries', () => {
      const longText = 'The quick brown fox jumps over the lazy dog';
      expect(truncateText(longText, 20, '...', true)).toBe('The quick brown fox...');
      expect(truncateText(longText, 16, '...', true)).toBe('The quick brown...');
    });

    it('decodes HTML entities', () => {
      expect(decodeHtmlEntities('Tom &amp; Jerry &#39;Special&#39; &gt; 10 &lt; 20')).toBe(
        "Tom & Jerry 'Special' > 10 < 20"
      );
    });
  });

  describe('Numbers & Currency', () => {
    it('rounds numbers correctly', () => {
      expect(roundNumber(3.14159, 2, 'round')).toBe(3.14);
      expect(roundNumber(3.148, 2, 'round')).toBe(3.15);
      expect(roundNumber(3.148, 2, 'floor')).toBe(3.14);
      expect(roundNumber(3.141, 2, 'ceil')).toBe(3.15);
    });

    it('formats currency', () => {
      expect(formatCurrency(1299.99, '$', 2)).toBe('$1,299.99');
      expect(formatCurrency('25000', '₹', 0)).toBe('₹25,000');
    });

    it('cleans price strings', () => {
      expect(cleanPrice('$1,299.99 USD', 'number_only')).toBe('1299.99');
      expect(cleanPrice('€ 49.50', 'number_only')).toBe('49.50');
      expect(cleanPrice('$1,299.99', 'strip_symbols')).toBe('1,299.99');
    });
  });

  describe('applyStringOperation Dispatcher', () => {
    it('applies python slice', () => {
      const res = applyStringOperation('Hello World', 'slice', { sliceExpr: '0:5' });
      expect(res).toBe('Hello');

      const res2 = applyStringOperation('Document.pdf', 'slice', { sliceExpr: ':-4' });
      expect(res2).toBe('Document');
    });

    it('applies remove_start and remove_end', () => {
      expect(applyStringOperation('ABCDEFG', 'remove_start', { count: 3 })).toBe('DEFG');
      expect(applyStringOperation('ABCDEFG', 'remove_end', { count: 3 })).toBe('ABCD');
      expect(applyStringOperation('https://test.com', 'remove_start', { prefix: 'https://' })).toBe('test.com');
      expect(applyStringOperation('image.png', 'remove_end', { suffix: '.png' })).toBe('image');
    });

    it('applies join and split', () => {
      expect(applyStringOperation(['apple', 'banana', 'cherry'], 'join', { delimiter: ' | ' })).toBe(
        'apple | banana | cherry'
      );
      expect(applyStringOperation('apple, banana, cherry', 'split', { delimiter: ',' })).toEqual([
        'apple',
        'banana',
        'cherry',
      ]);
    });

    it('applies fallback for empty input', () => {
      expect(applyStringOperation('', 'defaultFallback', { fallbackValue: 'N/A' })).toBe('N/A');
      expect(applyStringOperation(null, 'defaultFallback', { fallbackValue: 'Default' })).toBe('Default');
      expect(applyStringOperation('Existing', 'defaultFallback', { fallbackValue: 'Default' })).toBe('Existing');
    });
  });

  describe('executeTransform integration', () => {
    const mockCtx = { variables: { title: '  Super Cool Gadget (2024)  ', priceRaw: '$299.95' } } as any;

    it('executes python slice via node properties', async () => {
      const node: WorkflowNode = {
        id: 'node_1',
        type: 'transform',
        position: { x: 0, y: 0 },
        data: {
          label: 'Slice Node',
          type: 'transform',
          properties: {
            input: '{{title}}',
            operation: 'slice',
            sliceExpr: '2:12',
            outputVariable: 'slicedTitle',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(mockCtx.variables.slicedTitle).toBe('Super Cool');
    });

    it('executes cleanPrice and formatCurrency', async () => {
      const node: WorkflowNode = {
        id: 'node_2',
        type: 'transform',
        position: { x: 0, y: 0 },
        data: {
          label: 'Price Clean',
          type: 'transform',
          properties: {
            input: '{{priceRaw}}',
            operation: 'cleanPrice',
            outputVariable: 'cleanedPrice',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(mockCtx.variables.cleanedPrice).toBe('299.95');
    });

    it('executes remove starting letters', async () => {
      const node: WorkflowNode = {
        id: 'node_3',
        type: 'transform',
        position: { x: 0, y: 0 },
        data: {
          label: 'Remove Start',
          type: 'transform',
          properties: {
            input: 'ORDER_99482',
            operation: 'remove_start',
            count: 6,
            outputVariable: 'orderNum',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(mockCtx.variables.orderNum).toBe('99482');
    });

    it('executes array filter via executeTransform', async () => {
      mockCtx.variables.products = [
        { title: 'Item A', price: 29.99, in_stock: true },
        { title: 'Item B', price: 79.99, in_stock: true },
        { title: 'Item C', price: 15.0, in_stock: false },
      ];

      const node: WorkflowNode = {
        id: 'node_filter',
        type: 'transform',
        position: { x: 0, y: 0 },
        data: {
          label: 'Filter Cheap',
          type: 'transform',
          properties: {
            input: '{{products}}',
            operation: 'array_filter',
            filterExpr: 'price < 50',
            outputVariable: 'affordableItems',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(mockCtx.variables.affordableItems).toHaveLength(2);
      expect(mockCtx.variables.affordableItems[0].title).toBe('Item A');
      expect(mockCtx.variables.affordableItems[1].title).toBe('Item C');
    });

    it('executes math expression via executeTransform', async () => {
      mockCtx.variables.basePrice = 100;
      const node: WorkflowNode = {
        id: 'node_math',
        type: 'transform',
        position: { x: 0, y: 0 },
        data: {
          label: 'Calculate Total',
          type: 'transform',
          properties: {
            input: '{{basePrice}}',
            operation: 'math_expression',
            expression: '(x * 1.2) + 5',
            outputVariable: 'totalWithTaxAndShipping',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(mockCtx.variables.totalWithTaxAndShipping).toBe(125);
    });

    it('executes URL query param extraction via executeTransform', async () => {
      mockCtx.variables.targetUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s';
      const node: WorkflowNode = {
        id: 'node_url',
        type: 'transform',
        position: { x: 0, y: 0 },
        data: {
          label: 'Get Video ID',
          type: 'transform',
          properties: {
            input: '{{targetUrl}}',
            operation: 'url_extract_param',
            paramName: 'v',
            outputVariable: 'videoId',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(mockCtx.variables.videoId).toBe('dQw4w9WgXcQ');
    });
  });

  describe('Arrays & Lists Operations', () => {
    it('deduplicates primitive arrays and object arrays by key', () => {
      const urls = ['https://a.com', 'https://b.com', 'https://a.com', 'https://c.com'];
      expect(applyStringOperation(urls, 'array_deduplicate')).toEqual([
        'https://a.com',
        'https://b.com',
        'https://c.com',
      ]);

      const items = [
        { id: 1, name: 'Apple' },
        { id: 2, name: 'Banana' },
        { id: 1, name: 'Apple Copy' },
      ];
      expect(applyStringOperation(items, 'array_deduplicate', { key: 'id' })).toEqual([
        { id: 1, name: 'Apple' },
        { id: 2, name: 'Banana' },
      ]);
    });

    it('filters arrays by condition string', () => {
      const products = [
        { name: 'Shirt', price: 25, in_stock: true },
        { name: 'Jacket', price: 120, in_stock: true },
        { name: 'Hat', price: 15, in_stock: false },
      ];

      const underFifty = applyStringOperation(products, 'array_filter', { filterExpr: 'price < 50' });
      expect(underFifty.map((p: any) => p.name)).toEqual(['Shirt', 'Hat']);

      const inStock = applyStringOperation(products, 'array_filter', { filterExpr: 'in_stock == true' });
      expect(inStock.map((p: any) => p.name)).toEqual(['Shirt', 'Jacket']);
    });

    it('sorts arrays ascending and descending by property', () => {
      const items = [{ price: 99 }, { price: 15 }, { price: 45 }];
      const asc = applyStringOperation(items, 'array_sort', { sortKey: 'price', sortOrder: 'asc' });
      expect(asc.map((i: any) => i.price)).toEqual([15, 45, 99]);

      const desc = applyStringOperation(items, 'array_sort', { sortKey: 'price', sortOrder: 'desc' });
      expect(desc.map((i: any) => i.price)).toEqual([99, 45, 15]);
    });

    it('chunks array into batches of N', () => {
      const list = [1, 2, 3, 4, 5, 6, 7];
      expect(applyStringOperation(list, 'array_chunk', { chunkSize: 3 })).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7],
      ]);
    });

    it('takes and drops first N and last N items', () => {
      const list = ['A', 'B', 'C', 'D', 'E'];
      expect(applyStringOperation(list, 'array_take', { count: 2 })).toEqual(['A', 'B']);
      expect(applyStringOperation(list, 'array_take', { count: 2, fromEnd: true })).toEqual(['D', 'E']);
      expect(applyStringOperation(list, 'array_drop', { count: 2 })).toEqual(['C', 'D', 'E']);
      expect(applyStringOperation(list, 'array_drop', { count: 2, fromEnd: true })).toEqual(['A', 'B', 'C']);
    });

    it('flattens nested arrays', () => {
      const nested = [[1, 2], [3], [4, [5, 6]]];
      expect(applyStringOperation(nested, 'array_flatten')).toEqual([1, 2, 3, 4, [5, 6]]);
      expect(applyStringOperation(nested, 'array_flatten', { deep: true })).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('Dates & Timestamps Operations', () => {
    it('performs date math (+7 days, -2 hours)', () => {
      const base = '2026-01-10T12:00:00.000Z';
      const plus7 = applyStringOperation(base, 'date_math', { dateMathExpr: '+7 days' });
      expect(new Date(plus7).getUTCDate()).toBe(17);

      const minus2Hours = applyStringOperation(base, 'date_math', { dateMathExpr: '-2 hours' });
      expect(new Date(minus2Hours).getUTCHours()).toBe(10);
    });

    it('parses relative time like "2 hours ago" or "yesterday"', () => {
      const res = applyStringOperation('2 hours ago', 'date_relative_parse');
      expect(typeof res).toBe('string');
      expect(new Date(res).getTime()).toBeLessThan(Date.now());
      expect(Date.now() - new Date(res).getTime()).toBeGreaterThan(7000 * 1000);

      const yday = applyStringOperation('yesterday', 'date_relative_parse');
      expect(Date.now() - new Date(yday).getTime()).toBeGreaterThan(80000 * 1000);
    });

    it('calculates difference between two dates', () => {
      const d1 = '2026-01-15T00:00:00Z';
      const d2 = '2026-01-10T00:00:00Z';
      expect(applyStringOperation(d1, 'date_diff', { compareDate: d2, diffUnit: 'days' })).toBe(5);
    });

    it('formats date masks', () => {
      const date = '2026-05-18T14:30:00Z';
      const formatted = applyStringOperation(date, 'date_format_mask', { formatMask: 'YYYY-MM-DD' });
      expect(formatted).toMatch(/^2026-\d{2}-\d{2}$/);
    });
  });

  describe('Booleans & Logic Operations', () => {
    it('checks is_empty and is_not_empty', () => {
      expect(applyStringOperation('', 'is_empty')).toBe(true);
      expect(applyStringOperation([], 'is_empty')).toBe(true);
      expect(applyStringOperation({}, 'is_empty')).toBe(true);
      expect(applyStringOperation(null, 'is_empty')).toBe(true);
      expect(applyStringOperation('hello', 'is_empty')).toBe(false);
      expect(applyStringOperation(['item'], 'is_not_empty')).toBe(true);
    });

    it('inverts boolean flag', () => {
      expect(applyStringOperation(true, 'boolean_not')).toBe(false);
      expect(applyStringOperation(false, 'boolean_not')).toBe(true);
      expect(applyStringOperation('true', 'boolean_not')).toBe(false);
      expect(applyStringOperation('false', 'boolean_not')).toBe(true);
    });

    it('compares values', () => {
      expect(applyStringOperation(50, 'boolean_compare', { operator: '==', compareValue: 50 })).toBe(true);
      expect(applyStringOperation(50, 'boolean_compare', { operator: '<', compareValue: 100 })).toBe(true);
      expect(applyStringOperation(50, 'boolean_compare', { operator: '>', compareValue: 100 })).toBe(false);
      expect(applyStringOperation('Super Phone Pro', 'boolean_compare', { operator: 'contains', compareValue: 'Phone' })).toBe(true);
    });

    it('coerces values to genuine boolean', () => {
      expect(applyStringOperation('true', 'boolean_coerce')).toBe(true);
      expect(applyStringOperation('1', 'boolean_coerce')).toBe(true);
      expect(applyStringOperation('false', 'boolean_coerce')).toBe(false);
      expect(applyStringOperation('0', 'boolean_coerce')).toBe(false);
      expect(applyStringOperation('', 'boolean_coerce')).toBe(false);
    });
  });

  describe('URLs & Links Operations', () => {
    it('extracts query param from URL', () => {
      const url = 'https://example.com/watch?v=dQw4w9WgXcQ&page=2';
      expect(applyStringOperation(url, 'url_extract_param', { paramName: 'v' })).toBe('dQw4w9WgXcQ');
      expect(applyStringOperation(url, 'url_extract_param', { paramName: 'page' })).toBe('2');
    });

    it('extracts domain and hostname', () => {
      expect(applyStringOperation('https://sub.domain.com/path', 'url_extract_domain')).toBe('sub.domain.com');
      expect(applyStringOperation('https://www.example.com/path', 'url_extract_domain', { stripWww: true })).toBe('example.com');
    });

    it('extracts pathname', () => {
      expect(applyStringOperation('https://example.com/products/item-1?ref=promo', 'url_extract_path')).toBe('/products/item-1');
    });

    it('builds query string from object', () => {
      const params = { search: 'laptop', page: 2 };
      expect(applyStringOperation(params, 'url_build_query')).toBe('?search=laptop&page=2');
    });
  });

  describe('Numbers & Math Operations', () => {
    it('evaluates safe math expressions', () => {
      expect(applyStringOperation('100', 'math_expression', { expression: '(x * 1.2) + 5' })).toBe(125);
      expect(applyStringOperation(null, 'math_expression', { expression: '(10 * 5) + 3' })).toBe(53);
      expect(applyStringOperation('50', 'math_expression', { expression: 'x * 0.8' })).toBe(40);
    });

    it('clamps number between min and max', () => {
      expect(applyStringOperation(120, 'math_clamp', { min: 0, max: 100 })).toBe(100);
      expect(applyStringOperation(-15, 'math_clamp', { min: 0, max: 100 })).toBe(0);
      expect(applyStringOperation(42, 'math_clamp', { min: 0, max: 100 })).toBe(42);
    });

    it('generates random number in range', () => {
      const rnd = applyStringOperation(null, 'math_random', { min: 1000, max: 5000 });
      expect(rnd).toBeGreaterThanOrEqual(1000);
      expect(rnd).toBeLessThanOrEqual(5000);
      expect(Number.isInteger(rnd)).toBe(true);
    });

    it('aggregates numbers (sum, average, min, max)', () => {
      const nums = [10, 20, 30, 40];
      expect(applyStringOperation(nums, 'math_aggregate', { aggregateType: 'sum' })).toBe(100);
      expect(applyStringOperation(nums, 'math_aggregate', { aggregateType: 'average' })).toBe(25);
      expect(applyStringOperation(nums, 'math_aggregate', { aggregateType: 'min' })).toBe(10);
      expect(applyStringOperation(nums, 'math_aggregate', { aggregateType: 'max' })).toBe(40);

      const items = [{ price: 50 }, { price: 150 }];
      expect(applyStringOperation(items, 'math_aggregate', { aggregateType: 'sum', field: 'price' })).toBe(200);
    });
  });
});
