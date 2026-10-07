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
  });
});
