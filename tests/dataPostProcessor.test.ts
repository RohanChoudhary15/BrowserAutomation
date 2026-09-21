import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  cleanPrice,
  formatDateString,
  matchesPattern,
  processDataset,
} from '../src/utils/dataPostProcessor';

describe('Data Post-Processor Utility (dataPostProcessor)', () => {
  describe('normalizeUrl', () => {
    it('prepends base URL prefix to relative path starting with slash', () => {
      const result = normalizeUrl('/product/dp/B08XYZ', {
        basePrefix: 'https://www.amazon.in',
      });
      expect(result).toBe('https://www.amazon.in/product/dp/B08XYZ');
    });

    it('prepends base URL prefix when relative path has no leading slash', () => {
      const result = normalizeUrl('item/view?id=123', {
        basePrefix: 'https://example.com/store/',
      });
      expect(result).toBe('https://example.com/store/item/view?id=123');
    });

    it('handles base URL without protocol by adding https://', () => {
      const result = normalizeUrl('/product/456', {
        basePrefix: 'amazon.in',
      });
      expect(result).toBe('https://amazon.in/product/456');
    });

    it('removes "." from leading "./" in relative URLs', () => {
      const resultNoBase = normalizeUrl('./product/dp/B08XYZ');
      expect(resultNoBase).toBe('/product/dp/B08XYZ');

      const resultWithBase = normalizeUrl('./product/dp/B08XYZ', {
        basePrefix: 'https://www.amazon.in',
      });
      expect(resultWithBase).toBe('https://www.amazon.in/product/dp/B08XYZ');
    });

    it('removes "." from embedded "/./" segments in URLs', () => {
      const result = normalizeUrl('https://www.amazon.in/./dp/./B08XYZ');
      expect(result).toBe('https://www.amazon.in/dp/B08XYZ');

      const relativeResult = normalizeUrl('/category/./items/./detail');
      expect(relativeResult).toBe('/category/items/detail');
    });

    it('preserves query parameter values while cleaning "./" from path', () => {
      const result = normalizeUrl('./search?q=./test&filter=1');
      expect(result).toBe('/search?q=./test&filter=1');
    });

    it('handles protocol-relative URLs (//cdn.example.com/item)', () => {
      const result = normalizeUrl('//cdn.example.com/item.png', {
        basePrefix: 'https://mysite.com',
      });
      expect(result).toBe('https://cdn.example.com/item.png');
    });

    it('strips tracking query parameters (ref, qid, utm_*, etc.) while keeping valid params', () => {
      const raw = 'https://www.amazon.in/product/dp/B08XYZ?ref=sr_1_1&qid=1726000&id=42&utm_source=email&pd_rd_w=abc';
      const result = normalizeUrl(raw, {
        stripQueryParams: true,
      });
      expect(result).toContain('id=42');
      expect(result).not.toContain('ref=');
      expect(result).not.toContain('qid=');
      expect(result).not.toContain('utm_source=');
      expect(result).not.toContain('pd_rd_w=');
    });

    it('strips all query parameters when stripAllQueryParams is true', () => {
      const raw = 'https://www.amazon.in/product/dp/B08XYZ?ref=sr_1_1&page=2&sort=desc';
      const result = normalizeUrl(raw, {
        stripAllQueryParams: true,
      });
      expect(result).toBe('https://www.amazon.in/product/dp/B08XYZ');
    });

    it('normalizes relative URL and strips tracking query params together', () => {
      const raw = '/dp/B08XYZ?ref=sr_1_1&qid=99999&variant=blue';
      const result = normalizeUrl(raw, {
        basePrefix: 'https://www.amazon.com',
        stripQueryParams: true,
      });
      expect(result).toBe('https://www.amazon.com/dp/B08XYZ?variant=blue');
    });

    it('preserves non-http schemes like data: and blob:', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
      expect(normalizeUrl(dataUri, { basePrefix: 'https://example.com' })).toBe(dataUri);
    });

    it('gracefully handles empty/null input', () => {
      expect(normalizeUrl('', { basePrefix: 'https://example.com' })).toBe('');
      expect(normalizeUrl(null, { basePrefix: 'https://example.com' })).toBe('');
    });
  });

  describe('cleanPrice', () => {
    it('extracts number from standard US currency string', () => {
      expect(cleanPrice('$1,299.99')).toBe('1299.99');
      expect(cleanPrice('$49.00')).toBe('49');
      expect(cleanPrice('$0.99')).toBe('0.99');
    });

    it('extracts number from Indian Rupee format', () => {
      expect(cleanPrice('₹1,299.00')).toBe('1299');
      expect(cleanPrice('₹ 99,999.50')).toBe('99999.5');
    });

    it('extracts number from European currency format (dots for thousands, comma for decimals)', () => {
      expect(cleanPrice('1.299,50 €')).toBe('1299.5');
      expect(cleanPrice('€ 45,99')).toBe('45.99');
    });

    it('strips currency symbols without flattening decimals when in strip_symbols mode', () => {
      const result = cleanPrice('$1,299.99', { mode: 'strip_symbols' });
      expect(result).toBe('1,299.99');
      expect(cleanPrice('₹ 5,000', { mode: 'strip_symbols' })).toBe('5,000');
    });

    it('handles negative prices or discounts', () => {
      expect(cleanPrice('-$15.50')).toBe('-15.5');
    });

    it('gracefully returns empty string for empty input', () => {
      expect(cleanPrice('')).toBe('');
      expect(cleanPrice(null)).toBe('');
    });
  });

  describe('formatDateString', () => {
    it('formats ISO date from standard date strings', () => {
      const result = formatDateString('2026-09-22T14:30:00Z', { mode: 'iso_date' });
      expect(result).toBe('2026-09-22');
    });

    it('formats ISO datetime when requested', () => {
      const result = formatDateString('2026-09-22T14:30:00.000Z', { mode: 'iso_datetime' });
      expect(result).toBe('2026-09-22T14:30:00.000Z');
    });

    it('formats timestamp when requested', () => {
      const result = formatDateString('2026-09-22T00:00:00.000Z', { mode: 'timestamp' });
      expect(result).toBe(new Date('2026-09-22T00:00:00.000Z').getTime().toString());
    });

    it('parses relative "yesterday" and "today"', () => {
      const today = formatDateString('today', { mode: 'iso_date' });
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const yesterday = formatDateString('yesterday', { mode: 'iso_date' });
      expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('parses relative "2 hours ago" or "15 mins ago"', () => {
      const result = formatDateString('2 hours ago', { mode: 'iso_date' });
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns original string if unparseable', () => {
      expect(formatDateString('not a real date')).toBe('not a real date');
    });
  });

  describe('matchesPattern', () => {
    it('matches contains mode (simple string)', () => {
      expect(matchesPattern('https://amazon.in/dp/B08XYZ', '/dp/')).toBe(true);
      expect(matchesPattern('https://amazon.in/other/item', '/dp/')).toBe(false);
    });

    it('matches wildcard contains mode (*)', () => {
      expect(matchesPattern('https://www.amazon.in/item-name/dp/12345', '*amazon*dp*')).toBe(true);
      expect(matchesPattern('https://www.flipkart.com/item-name/dp/12345', '*amazon*dp*')).toBe(false);
    });

    it('matches starts_with mode', () => {
      expect(matchesPattern('https://amazon.in/product', 'https://amazon.in', 'starts_with')).toBe(true);
      expect(matchesPattern('http://amazon.in/product', 'https://amazon.in', 'starts_with')).toBe(false);
    });

    it('matches ends_with mode', () => {
      expect(matchesPattern('image.png', '.png', 'ends_with')).toBe(true);
      expect(matchesPattern('image.jpg', '.png', 'ends_with')).toBe(false);
    });

    it('matches regex pattern mode', () => {
      expect(matchesPattern('https://site.com/dp/B08XYZ', '/dp/[A-Z0-9]{6,10}', 'regex')).toBe(true);
      expect(matchesPattern('https://site.com/dp/invalid-id!', '/dp/[A-Z0-9]{6,10}$', 'regex')).toBe(false);
    });
  });

  describe('processDataset', () => {
    it('applies URL normalization, price cleaning, and date formatting across dataset items', () => {
      const rawItems = [
        {
          title: 'Mechanical Keyboard',
          link: '/dp/B08ABC?ref=sr_1_1&qid=123',
          price: '$149.99',
          date: '2026-09-20T12:00:00Z',
        },
        {
          title: 'Wireless Gaming Mouse',
          link: '/dp/B08DEF?ref=sr_1_2&qid=456',
          price: '$79.00',
          date: '2026-09-21T12:00:00Z',
        },
      ];

      const res = processDataset(rawItems, {
        urlBasePrefix: 'https://www.amazon.in',
        stripUrlQueryParams: true,
        cleanPrice: true,
        formatDate: true,
        dateMode: 'iso_date',
      });

      expect(res.items.length).toBe(2);
      expect(res.modifiedCount).toBe(2);
      expect(res.filteredCount).toBe(0);

      expect(res.items[0].link).toBe('https://www.amazon.in/dp/B08ABC');
      expect(res.items[0].price).toBe('149.99');
      expect(res.items[0].date).toBe('2026-09-20');

      expect(res.items[1].link).toBe('https://www.amazon.in/dp/B08DEF');
      expect(res.items[1].price).toBe('79');
      expect(res.items[1].date).toBe('2026-09-21');
    });

    it('filters rows with patternFilter condition ("include_only")', () => {
      const rawItems = [
        { title: 'Product 1', link: 'https://amazon.in/dp/12345' },
        { title: 'Sponsored Ad', link: 'https://googleads.com/track/ad123' },
        { title: 'Product 2', link: 'https://amazon.in/dp/67890' },
        { title: 'Blog Post', link: 'https://blog.amazon.in/news/update' },
      ];

      const res = processDataset(rawItems, {
        patternFilterEnabled: true,
        patternFilterField: 'link',
        patternFilterAction: 'include_only',
        patternFilterMode: 'contains',
        patternFilterValue: '/dp/',
      });

      expect(res.items.length).toBe(2);
      expect(res.filteredCount).toBe(2);
      expect(res.items[0].title).toBe('Product 1');
      expect(res.items[1].title).toBe('Product 2');
    });

    it('filters rows with patternFilter condition ("exclude_matching")', () => {
      const rawItems = [
        { title: 'Item 1', link: 'https://amazon.in/dp/111' },
        { title: 'Ad Item', link: 'https://amazon.in/sspa/click?tag=sponsored' },
        { title: 'Item 2', link: 'https://amazon.in/dp/222' },
      ];

      const res = processDataset(rawItems, {
        patternFilterEnabled: true,
        patternFilterField: 'link',
        patternFilterAction: 'exclude_matching',
        patternFilterMode: 'contains',
        patternFilterValue: '/sspa/',
      });

      expect(res.items.length).toBe(2);
      expect(res.filteredCount).toBe(1);
      expect(res.items.map((i) => i.title)).toEqual(['Item 1', 'Item 2']);
    });

    it('applies URL formatting only to specified multiple urlFields', () => {
      const rawItems = [
        {
          title: './title-not-a-url',
          link: './dp/B08123?ref=123',
          image: './images/photo.png?qid=456',
          other: './other/path',
        },
      ];

      // Format both 'link' and 'image', but NOT 'other' or 'title'
      const res = processDataset(rawItems, {
        urlBasePrefix: 'https://www.amazon.in',
        urlFields: ['link', 'image'],
        stripUrlQueryParams: true,
      });

      expect(res.items[0].link).toBe('https://www.amazon.in/dp/B08123');
      expect(res.items[0].image).toBe('https://www.amazon.in/images/photo.png');
      expect(res.items[0].other).toBe('./other/path');
      expect(res.items[0].title).toBe('./title-not-a-url');
    });
  });
});
