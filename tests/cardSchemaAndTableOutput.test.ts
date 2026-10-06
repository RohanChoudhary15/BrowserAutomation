import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BUILTIN_CARD_SCHEMAS,
  loadCustomCardSchemas,
  getAllCardSchemas,
  saveCardSchema,
  deleteCardSchema,
  exportCardSchemasAsJson,
  importCardSchemasFromJson,
} from '../src/storage/cardSchemaStore';
import {
  extractDataset,
  resolveElementAttribute,
  findRepeatingCardContainers,
} from '../src/content/domActions';
import { formatScraperTableOutput, executeScrapeElements } from '../src/runtime/executors';
import { ExecutionContext } from '../src/types/execution';
import { WorkflowNode } from '../src/types/workflow';

describe('Card Schema Store & Table Output Enhancements', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  describe('Card Schema Store', () => {
    it('provides all expected built-in presets', () => {
      expect(BUILTIN_CARD_SCHEMAS.length).toBeGreaterThanOrEqual(7);
      const names = BUILTIN_CARD_SCHEMAS.map((s) => s.name);
      expect(names).toContain('Amazon Products');
      expect(names).toContain('E-Commerce Products');
      expect(names).toContain('eBay Item Listings');
      expect(names).toContain('GitHub Repositories');
      expect(names).toContain('Articles & Blogs');
      expect(names).toContain('Job Listings');
      expect(names).toContain('Real Estate Listings');

      // Verify Amazon has asin container and offscreen price
      const amazon = BUILTIN_CARD_SCHEMAS.find((s) => s.id === 'builtin_amazon');
      expect(amazon).toBeDefined();
      expect(amazon?.containerSelector).toContain('.s-result-item[data-asin]');
      const priceField = amazon?.fields.find((f) => f.name === 'price');
      expect(priceField?.selector).toContain('.a-price .a-offscreen');
    });

    it('saves custom card schema with parent div and fields', async () => {
      const saved = await saveCardSchema({
        name: 'Custom Shopify Store',
        containerSelector: 'div.grid-product__content',
        fields: [
          { name: 'product_title', selector: '.grid-product__title', attribute: 'text' },
          { name: 'price', selector: '.grid-product__price', attribute: 'text' },
          { name: 'image', selector: 'img.grid-product__image', attribute: 'src' },
          { name: 'url', selector: 'a.grid-product__link', attribute: 'href' },
        ],
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Custom Shopify Store');
      expect(saved.containerSelector).toBe('div.grid-product__content');
      expect(saved.fields).toHaveLength(4);

      const all = await getAllCardSchemas();
      expect(all.some((s) => s.name === 'Custom Shopify Store')).toBe(true);
    });

    it('updates existing schema if saved with same name', async () => {
      await saveCardSchema({
        name: 'Target Store',
        containerSelector: '.product-card',
        fields: [{ name: 'title', selector: 'h2', attribute: 'text' }],
      });

      const updated = await saveCardSchema({
        name: 'Target Store',
        containerSelector: '.product-card-updated',
        fields: [
          { name: 'title', selector: 'h2', attribute: 'text' },
          { name: 'price', selector: '.price', attribute: 'text' },
        ],
      });

      expect(updated.containerSelector).toBe('.product-card-updated');
      expect(updated.fields).toHaveLength(2);

      const custom = await loadCustomCardSchemas();
      const targetItems = custom.filter((s) => s.name.toLowerCase() === 'target store');
      expect(targetItems).toHaveLength(1);
    });

    it('deletes custom schema but prevents deleting built-ins', async () => {
      const custom = await saveCardSchema({
        name: 'Temporary Schema',
        containerSelector: '.temp-card',
        fields: [{ name: 'val', selector: 'span', attribute: 'text' }],
      });

      // Try deleting built-in - should return false
      const deleteBuiltInResult = await deleteCardSchema('builtin_amazon');
      expect(deleteBuiltInResult).toBe(false);

      // Delete custom - should succeed
      const deleteResult = await deleteCardSchema(custom.id);
      expect(deleteResult).toBe(true);

      const remaining = await loadCustomCardSchemas();
      expect(remaining.some((s) => s.id === custom.id)).toBe(false);
    });

    it('exports and imports card schemas as JSON', async () => {
      await saveCardSchema({
        name: 'Exportable Schema 1',
        containerSelector: '.item-one',
        fields: [{ name: 'f1', selector: 'div', attribute: 'text' }],
      });

      const exportedJson = await exportCardSchemasAsJson();
      expect(typeof exportedJson).toBe('string');
      const parsed = JSON.parse(exportedJson);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.some((s: any) => s.name === 'Exportable Schema 1')).toBe(true);

      // Import test
      const importPayload = JSON.stringify([
        {
          name: 'Imported Store Cards',
          containerSelector: '.imported-card',
          fields: [
            { name: 'title', selector: 'h3', attribute: 'text' },
            { name: 'price', selector: '.cost', attribute: 'text' },
          ],
        },
      ]);

      const imported = await importCardSchemasFromJson(importPayload);
      expect(imported.some((s) => s.name === 'Imported Store Cards')).toBe(true);
    });
  });

  describe('DOM Card Extraction Fixes (Missing Data Across Cards)', () => {
    it('extracts links when the container itself is an anchor <a> tag', async () => {
      document.body.innerHTML = `
        <div id="product-list">
          <a class="product-card" href="https://example.com/products/item-1">
            <h2 class="title">Product One</h2>
            <span class="price">$19.99</span>
          </a>
          <a class="product-card" href="https://example.com/products/item-2">
            <h2 class="title">Product Two</h2>
            <span class="price">$29.99</span>
          </a>
        </div>
      `;

      const result = await extractDataset({
        containerSelector: 'a.product-card',
        fields: [
          { name: 'title', selector: '.title', attribute: 'text' },
          { name: 'price', selector: '.price', attribute: 'text' },
          { name: 'link', selector: 'a', attribute: 'href' },
        ],
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].link).toBe('https://example.com/products/item-1');
      expect(result.items[1].link).toBe('https://example.com/products/item-2');
    });

    it('extracts lazy-loaded images bypassing placeholder 1x1 gifs', () => {
      document.body.innerHTML = `
        <div class="product-card">
          <img
            class="product-image"
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            data-src="https://m.media-amazon.com/images/I/71xyz._AC_UY218_.jpg"
          />
          <img
            class="product-image-hires"
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            data-old-hires="https://m.media-amazon.com/images/I/71xyz_hires.jpg"
          />
        </div>
      `;

      const imgEl = document.querySelector('.product-image') as HTMLImageElement;
      expect(resolveElementAttribute(imgEl, 'src')).toBe('https://m.media-amazon.com/images/I/71xyz._AC_UY218_.jpg');

      const imgHiRes = document.querySelector('.product-image-hires') as HTMLImageElement;
      expect(resolveElementAttribute(imgHiRes, 'src')).toBe('https://m.media-amazon.com/images/I/71xyz_hires.jpg');
    });

    it('extracts Amazon offscreen screen-reader prices properly', async () => {
      document.body.innerHTML = `
        <div class="s-result-item" data-asin="B08XYZ1234">
          <h2><span class="a-size-medium">Noise Cancelling Earbuds</span></h2>
          <span class="a-price" data-a-size="l" data-a-color="base">
            <span class="a-offscreen">$79.99</span>
            <span aria-hidden="true">
              <span class="a-price-symbol">$</span>
              <span class="a-price-whole">79<span class="a-price-decimal">.</span></span>
              <span class="a-price-fraction">99</span>
            </span>
          </span>
          <a class="a-link-normal" href="/dp/B08XYZ1234">View Product</a>
        </div>
      `;

      const result = await extractDataset({
        containerSelector: '.s-result-item[data-asin]',
        fields: [
          { name: 'title', selector: 'h2 span', attribute: 'text' },
          { name: 'price', selector: '.a-price .a-offscreen', attribute: 'text' },
          { name: 'link', selector: 'a', attribute: 'href' },
        ],
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Noise Cancelling Earbuds');
      expect(result.items[0].price).toBe('$79.99');
    });

    it('findRepeatingCardContainers detects Amazon search results and product-card containers', () => {
      document.body.innerHTML = `
        <div id="search-results">
          <div class="s-result-item" data-asin="B01">Item 1</div>
          <div class="s-result-item" data-asin="B02">Item 2</div>
          <div class="s-result-item" data-asin="B03">Item 3</div>
        </div>
      `;

      const containers = findRepeatingCardContainers();
      expect(containers.length).toBeGreaterThan(0);
      expect(containers[0].getAttribute('data-asin')).toBe('B01');
      expect(containers).toHaveLength(3);
    });
  });

  describe('Table Output Preservation Across All Scrapers & scrape_elements', () => {
    it('formatScraperTableOutput preserves ALL items without 10-row truncation', () => {
      const mockContext: ExecutionContext = {
        workflowId: 'test-wf',
        executionId: 'test-exec',
        variables: {},
        signal: new AbortController().signal,
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      // Create 25 mock scraped items
      const items = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        title: `Video #${i + 1}`,
        channel: `Creator ${i % 3}`,
        views: `${(i + 1) * 1000} views`,
      }));

      const formatted = formatScraperTableOutput(items, 'yt_videos', mockContext, 'node-1', 'Scrape YouTube');

      // count and rows in table MUST preserve all 25 items
      expect(formatted.table.count).toBe(25);
      expect(formatted.table.rows).toHaveLength(25);
      expect(formatted.items).toHaveLength(25);
      expect(mockContext.variables.yt_videos).toHaveLength(25);
      expect(mockContext.variables.yt_videos_count).toBe(25);
      expect(mockContext.variables.yt_videos_table.rows).toHaveLength(25);

      // Verify node state dynamicState has full table rows
      expect(mockContext.updateNodeState).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          status: 'success',
          dynamicState: expect.objectContaining({
            count: 25,
            table: expect.objectContaining({
              count: 25,
              rows: items,
            }),
          }),
        })
      );
    });

    it('executeScrapeElements generates tableData, csvData, and htmlTable with all items', async () => {
      const items15 = Array.from({ length: 15 }, (_, i) => ({
        name: `Product ${i + 1}`,
        price: `$${(i + 1) * 10}`,
        url: `https://example.com/p/${i + 1}`,
      }));

      // Mock chrome messaging to return our 15 extracted items
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload?.action === 'extract_dataset') {
              return Promise.resolve({
                success: true,
                items: items15,
                count: items15.length,
              });
            }
            return Promise.resolve({ success: true });
          }),
        },
        tabs: {
          sendMessage: vi.fn(),
        },
      };

      const mockContext: ExecutionContext = {
        workflowId: 'test-wf',
        executionId: 'test-exec',
        variables: {},
        signal: new AbortController().signal,
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      const mockNode: WorkflowNode = {
        id: 'node-scrape',
        type: 'scrape_elements',
        position: { x: 0, y: 0 },
        data: {
          label: 'Scrape Products',
          type: 'scrape_elements',
          category: 'browser',
          properties: {
            containerSelector: '.product-item',
            fields: [
              { name: 'name', selector: '.prod-name', attribute: 'text' },
              { name: 'price', selector: '.prod-price', attribute: 'text' },
              { name: 'url', selector: 'a', attribute: 'href' },
            ],
            outputVariable: 'scrapedProducts',
          },
        },
      };

      const result = await executeScrapeElements(mockNode, mockContext);

      expect(result.output).toHaveLength(15);
      expect(result.items).toHaveLength(15);
      expect(result.table).toBeDefined();
      expect(result.table.count).toBe(15);
      expect(result.table.rows).toHaveLength(15);

      // Verify variables exposed in context
      expect(mockContext.variables.scrapedProducts).toHaveLength(15);
      expect(mockContext.variables.scrapedProducts_count).toBe(15);
      expect(mockContext.variables.scrapedProducts_table).toBeDefined();
      expect(mockContext.variables.scrapedProducts_table.rows).toHaveLength(15);
      expect(mockContext.variables.scrapedProducts_csv).toBeDefined();
      expect(mockContext.variables.scrapedProducts_htmlTable).toBeDefined();
      expect(mockContext.variables.scrapedProducts_htmlTable).toContain('<table');

      // Verify node state dynamicState has full table rows
      expect(mockContext.updateNodeState).toHaveBeenCalledWith(
        'node-scrape',
        expect.objectContaining({
          status: 'success',
          dynamicState: expect.objectContaining({
            count: 15,
            table: expect.objectContaining({
              count: 15,
              rows: items15,
            }),
          }),
        })
      );
    });
  });
});
