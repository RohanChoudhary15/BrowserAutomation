import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveElementAttribute, toAbsoluteUrl, extractDataset } from '../src/content/domActions';
import { executeScrapeElements, executeNavigate, executeTypeText, executeTransform, executeSmartScroll } from '../src/runtime/executors';
import { WorkflowEngine, createInspectableItem } from '../src/runtime/engine';
import { ExecutionContext } from '../src/types/execution';
import { WorkflowNode } from '../src/types/workflow';

describe('Card & Multi-Field Scraper System (scrape_elements)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('resolveElementAttribute & Smart Attribute Extraction', () => {
    it('extracts plain text correctly', () => {
      const div = document.createElement('div');
      div.textContent = '  Sony WH-1000XM5 Wireless Headphones  ';
      expect(resolveElementAttribute(div, 'text')).toBe('Sony WH-1000XM5 Wireless Headphones');
    });

    it('aggregates multiple paragraphs and bullet points', () => {
      const article = document.createElement('article');
      article.innerHTML = `
        <p>First introductory paragraph about the product.</p>
        <p>Second detailed specification paragraph.</p>
        <p>Third warranty and shipping information.</p>
      `;
      const paragraphs = resolveElementAttribute(article, 'paragraphs');
      expect(paragraphs).toContain('First introductory paragraph');
      expect(paragraphs).toContain('Second detailed specification');
      expect(paragraphs).toContain('Third warranty and shipping');
      expect(paragraphs.split('\n\n').length).toBe(3);
    });

    it('falls back to bullet points if no <p> elements exist when asking for paragraphs', () => {
      const card = document.createElement('div');
      card.innerHTML = `
        <ul>
          <li>Active Noise Canceling</li>
          <li>30-hour battery life</li>
          <li>Multipoint connection</li>
        </ul>
      `;
      const bulletList = resolveElementAttribute(card, 'paragraphs');
      expect(bulletList).toContain('• Active Noise Canceling');
      expect(bulletList).toContain('• 30-hour battery life');
    });

    it('resolves image src from lazy-loaded data-src attribute', () => {
      const img = document.createElement('img');
      img.setAttribute('src', 'data:image/svg+xml;base64,...'); // placeholder
      img.setAttribute('data-src', 'https://images.example.com/products/headphones.jpg');
      const resolved = resolveElementAttribute(img, 'src');
      expect(resolved).toBe('https://images.example.com/products/headphones.jpg');
    });

    it('resolves image from data-original or data-lazy-src', () => {
      const container = document.createElement('div');
      container.innerHTML = `<img data-original="/images/item123.png" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />`;
      const resolved = resolveElementAttribute(container, 'src');
      expect(resolved).toContain('/images/item123.png');
    });

    it('resolves image from highest resolution candidate in srcset', () => {
      const img = document.createElement('img');
      img.setAttribute('srcset', 'https://img.com/small.jpg 300w, https://img.com/large.jpg 1200w');
      const resolved = resolveElementAttribute(img, 'src');
      expect(resolved).toBe('https://img.com/large.jpg');
    });

    it('resolves image from CSS background-image style if no img tag', () => {
      const banner = document.createElement('div');
      banner.style.backgroundImage = 'url("https://cdn.example.com/banner.png")';
      const resolved = resolveElementAttribute(banner, 'src');
      expect(resolved).toBe('https://cdn.example.com/banner.png');
    });

    it('resolves link href to absolute URL', () => {
      const link = document.createElement('a');
      link.setAttribute('href', '/products/view?id=492');
      const resolved = resolveElementAttribute(link, 'href');
      expect(resolved).toContain('/products/view?id=492');
      expect(resolved.startsWith('http')).toBe(true);
    });

    it('extracts input form value and custom data attributes', () => {
      const input = document.createElement('input');
      input.value = 'user-entered-value';
      input.setAttribute('data-sku', 'SKU-9988');
      expect(resolveElementAttribute(input, 'value')).toBe('user-entered-value');
      expect(resolveElementAttribute(input, 'data-sku')).toBe('SKU-9988');
    });
  });

  describe('extractDataset (Content Script DOM Action)', () => {
    it('scrapes multi-field card elements within container elements', async () => {
      document.body.innerHTML = `
        <div class="product-grid">
          <div class="product-card">
            <h2 class="title">MacBook Pro 16</h2>
            <span class="price">$2,499</span>
            <img src="https://example.com/macbook.png" alt="MacBook" />
            <a href="/buy/macbook-pro" class="buy-btn">Buy Now</a>
            <div class="desc">
              <p>M3 Max chip with 16-core CPU.</p>
              <p>Liquid Retina XDR display.</p>
            </div>
          </div>
          <div class="product-card">
            <h2 class="title">Dell XPS 15</h2>
            <span class="price">$1,899</span>
            <img data-src="https://example.com/xps15.png" src="placeholder.png" alt="XPS" />
            <a href="/buy/dell-xps" class="buy-btn">Buy Now</a>
            <div class="desc">
              <p>Intel Core i9 with OLED touch display.</p>
            </div>
          </div>
        </div>
      `;

      const res = await extractDataset({
        containerSelector: '.product-card',
        fields: [
          { name: 'title', selector: '.title', attribute: 'text' },
          { name: 'price', selector: '.price', attribute: 'text' },
          { name: 'image', selector: 'img', attribute: 'src' },
          { name: 'link', selector: 'a.buy-btn', attribute: 'href' },
          { name: 'description', selector: '.desc p', attribute: 'paragraphs' },
        ],
      });

      expect(res.items.length).toBe(2);
      expect(res.items[0].title).toBe('MacBook Pro 16');
      expect(res.items[0].price).toBe('$2,499');
      expect(res.items[0].image).toBe('https://example.com/macbook.png');
      expect(res.items[0].link).toContain('/buy/macbook-pro');
      expect(res.items[0].description).toContain('M3 Max chip');
      expect(res.items[0].description).toContain('Liquid Retina XDR');

      expect(res.items[1].title).toBe('Dell XPS 15');
      expect(res.items[1].price).toBe('$1,899');
      expect(res.items[1].image).toBe('https://example.com/xps15.png'); // correctly preferred data-src over placeholder
      expect(res.items[1].link).toContain('/buy/dell-xps');
    });

    it('excludes card entries with empty fields when excludeEmpty is true', async () => {
      document.body.innerHTML = `
        <div class="product-grid">
          <div class="product-card">
            <h2 class="title">Product Complete</h2>
            <span class="price">$50</span>
          </div>
          <div class="product-card">
            <h2 class="title">Product Missing Price</h2>
            <span class="price">   </span>
          </div>
          <div class="product-card">
            <h2 class="title">Product Complete 2</h2>
            <span class="price">$100</span>
          </div>
        </div>
      `;

      const res = await extractDataset({
        containerSelector: '.product-card',
        fields: [
          { name: 'title', selector: '.title', attribute: 'text' },
          { name: 'price', selector: '.price', attribute: 'text' },
        ],
        excludeEmpty: true,
        filterEmptyMode: 'any',
      });

      expect(res.items.length).toBe(2);
      expect(res.items[0].title).toBe('Product Complete');
      expect(res.items[1].title).toBe('Product Complete 2');
    });

    it('extracts h3 and h4 text fields with no class or other specifics even when first element is empty', async () => {
      document.body.innerHTML = `
        <div class="cards">
          <div class="card">
            <h3 class="badge"></h3> <!-- empty first h3 -->
            <h3>Wireless Noise-Canceling Headphones</h3>
            <h4 class="category">Electronics</h4>
          </div>
          <div class="card">
            <h4></h4> <!-- empty first h4 -->
            <h4>Mechanical Gaming Keyboard</h4>
            <h3>Keyboards</h3>
          </div>
        </div>
      `;

      // Selectors have NO classes or specifics: just bare 'h3' and 'h4'
      const res = await extractDataset({
        containerSelector: '.card',
        fields: [
          { name: 'title', selector: 'h3', attribute: 'text' },
          { name: 'subtitle', selector: 'h4', attribute: 'text' },
        ],
      });

      expect(res.items.length).toBe(2);
      expect(res.items[0].title).toBe('Wireless Noise-Canceling Headphones');
      expect(res.items[0].subtitle).toBe('Electronics');

      expect(res.items[1].title).toBe('Keyboards');
      expect(res.items[1].subtitle).toBe('Mechanical Gaming Keyboard');
    });

    it('gracefully falls back to sibling heading tag when specified heading tag is not present in container', async () => {
      document.body.innerHTML = `
        <div class="product-item">
          <!-- Card only has h4, user requested h3 -->
          <h4>Logitech MX Master 3S</h4>
          <span class="price">$99.99</span>
        </div>
        <div class="product-item">
          <!-- Card only has h2, user requested h3 -->
          <h2>Apple Magic Mouse</h2>
          <span class="price">$79.99</span>
        </div>
      `;

      const res = await extractDataset({
        containerSelector: '.product-item',
        fields: [
          { name: 'title', selector: 'h3', attribute: 'text' },
          { name: 'price', selector: '.price', attribute: 'text' },
        ],
      });

      expect(res.items.length).toBe(2);
      expect(res.items[0].title).toBe('Logitech MX Master 3S');
      expect(res.items[1].title).toBe('Apple Magic Mouse');
    });

    it('extracts clean text from h3/h4 with nested elements, svgs, styles, or aria-labels', async () => {
      document.body.innerHTML = `
        <div class="list">
          <div class="entry">
            <!-- Nested span and link inside bare h3 -->
            <h3>
              <a href="/item/1">
                <span>Sony Alpha A7 IV Full-Frame Camera</span>
              </a>
            </h3>
          </div>
          <div class="entry">
            <!-- h4 with SVG icon and style tag that should be stripped -->
            <h4>
              <style>.icon { color: blue; }</style>
              <svg><path d="M0 0h24v24H0z" /></svg>
              Canon EOS R6 Mark II
            </h4>
          </div>
          <div class="entry">
            <!-- h3 with empty text but descriptive aria-label -->
            <h3 aria-label="Fujifilm X-T5 Mirrorless Camera"></h3>
          </div>
        </div>
      `;

      const res = await extractDataset({
        containerSelector: '.entry',
        fields: [
          { name: 'cameraTitle', selector: 'h3, h4', attribute: 'text' },
        ],
      });

      expect(res.items.length).toBe(3);
      expect(res.items[0].cameraTitle).toBe('Sony Alpha A7 IV Full-Frame Camera');
      expect(res.items[1].cameraTitle).toBe('Canon EOS R6 Mark II');
      expect(res.items[2].cameraTitle).toBe('Fujifilm X-T5 Mirrorless Camera');
    });
  });

  describe('executeScrapeElements (Runtime Node Executor)', () => {
    it('executes scrape_elements and saves items and count to variables', async () => {
      // Mock chrome.runtime.sendMessage to simulate DOM action response
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'extract_dataset') {
              return Promise.resolve({
                success: true,
                items: [
                  { title: 'Keyboard', price: '$99', image: 'https://img.com/kb.jpg', link: '/kb' },
                  { title: 'Mouse', price: '$49', image: 'https://img.com/ms.jpg', link: '/ms' },
                ],
              });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const mockCtx: ExecutionContext = {
        variables: {},
        signal: new AbortController().signal,
        log: vi.fn(),
      } as any;

      const node: WorkflowNode = {
        id: 'scrape-1',
        type: 'scrape_elements',
        position: { x: 0, y: 0 },
        data: {
          label: 'Scrape Products',
          type: 'scrape_elements',
          category: 'extraction',
          properties: {
            containerSelector: '.product-card',
            fields: [
              { name: 'title', selector: '.title', attribute: 'text' },
              { name: 'price', selector: '.price', attribute: 'text' },
              { name: 'image', selector: 'img', attribute: 'src' },
              { name: 'link', selector: 'a', attribute: 'href' },
            ],
            outputVariable: 'myProducts',
          },
        },
      };

      const result = await executeScrapeElements(node, mockCtx);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(2);
      expect(result.variables?.myProducts.length).toBe(2);
      expect(result.variables?.myProducts_count).toBe(2);
      expect(result.variables?.myProducts[0].title).toBe('Keyboard');
    });

    it('executeScrapeElements filters out items with empty values when excludeEmpty is enabled', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'extract_dataset') {
              return Promise.resolve({
                success: true,
                items: [
                  { title: 'Monitor', price: '$299' },
                  { title: 'Headset', price: '' }, // empty price
                  { title: 'Webcam', price: '$79' },
                ],
              });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const mockCtx: ExecutionContext = {
        variables: {},
        signal: new AbortController().signal,
        log: vi.fn(),
      } as any;

      const node: WorkflowNode = {
        id: 'scrape-filtered',
        type: 'scrape_elements',
        position: { x: 0, y: 0 },
        data: {
          label: 'Scrape Products Filtered',
          type: 'scrape_elements',
          category: 'extraction',
          properties: {
            containerSelector: '.product-card',
            fields: [
              { name: 'title', selector: '.title', attribute: 'text' },
              { name: 'price', selector: '.price', attribute: 'text' },
            ],
            excludeEmpty: true,
            filterEmptyMode: 'any',
            outputVariable: 'cleanProducts',
          },
        },
      };

      const result = await executeScrapeElements(node, mockCtx);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(2);
      expect(mockCtx.variables.cleanProducts.length).toBe(2);
      expect(mockCtx.variables.cleanProducts_count).toBe(2);
      expect(mockCtx.variables.cleanProducts[0].title).toBe('Monitor');
      expect(mockCtx.variables.cleanProducts[1].title).toBe('Webcam');
    });

    it('transparently recovers and scrapes cards when content script throws Unsupported DOM action: extract_dataset', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg) => {
            if (msg.type === 'EXECUTE_DOM_ACTION') {
              if (msg.payload.action === 'extract_dataset') {
                // Simulate an older content script that does not support extract_dataset
                return Promise.resolve({
                  success: false,
                  error: 'Unsupported DOM action: extract_dataset',
                });
              }
              if (msg.payload.action === 'extract_multiple') {
                if (msg.payload.params.selector.includes('.title')) {
                  return Promise.resolve({ success: true, items: ['Product 1', 'Product 2'] });
                }
                if (msg.payload.params.selector.includes('.price')) {
                  return Promise.resolve({ success: true, items: ['$99', '$149'] });
                }
              }
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const node: WorkflowNode = {
        id: 'scrape-fallback-node',
        type: 'scrape_elements',
        position: { x: 0, y: 0 },
        data: {
          label: 'Scrape Elements Fallback',
          type: 'scrape_elements',
          category: 'extraction',
          properties: {
            containerSelector: '.product-card',
            fields: [
              { name: 'title', selector: '.title', attribute: 'text' },
              { name: 'price', selector: '.price', attribute: 'text' },
            ],
            outputVariable: 'fallbackItems',
          },
        },
      };

      const ctx: ExecutionContext = {
        workflowId: 'test',
        executionId: 'exec-fallback',
        variables: {},
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      const result = await executeScrapeElements(node, ctx);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(2);
      expect(result.items[0]).toEqual({ title: 'Product 1', price: '$99' });
      expect(result.items[1]).toEqual({ title: 'Product 2', price: '$149' });
      expect(ctx.variables.fallbackItems.length).toBe(2);
      expect(ctx.variables.fallbackItems_count).toBe(2);
    });
  });

  describe('WorkflowEngine Loop Iteration with scrape_elements', () => {
    it('iterates each scraped card into loop body with {{currentProduct.title}}', async () => {
      const scrapedCards = [
        { title: 'Item Alpha', price: '$10', link: '/alpha' },
        { title: 'Item Beta', price: '$20', link: '/beta' },
        { title: 'Item Gamma', price: '$30', link: '/gamma' },
      ];

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'extract_dataset') {
              return Promise.resolve({
                success: true,
                items: scrapedCards,
              });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const capturedTitles: string[] = [];

      const engine = new WorkflowEngine(
        {
          id: 'wf-scrape-test',
          name: 'Test Card Scraper Workflow',
          nodes: [
            {
              id: 'scrape-node',
              type: 'scrape_elements',
              position: { x: 0, y: 0 },
              data: {
                label: 'Scrape Products',
                type: 'scrape_elements',
                category: 'extraction',
                properties: {
                  containerSelector: '.card',
                  fields: [
                    { name: 'title', selector: '.name', attribute: 'text' },
                    { name: 'price', selector: '.price', attribute: 'text' },
                  ],
                  outputVariable: 'scrapedProducts',
                  itemVariable: 'currentProduct',
                },
              },
            },
            {
              id: 'log-node',
              type: 'set_variable',
              position: { x: 200, y: 0 },
              data: {
                label: 'Log Card',
                type: 'set_variable',
                category: 'data',
                properties: {
                  name: 'lastScraped',
                  value: '{{currentProduct.title}} - {{currentProduct.price}}',
                },
              },
            },
          ],
          edges: [
            {
              id: 'edge-loop',
              source: 'scrape-node',
              target: 'log-node',
              sourceHandle: 'loop_body',
            },
          ],
          variables: {},
        },
        {
          onVariablesChange: (vars) => {
            if (vars.lastScraped && !capturedTitles.includes(vars.lastScraped)) {
              capturedTitles.push(vars.lastScraped);
            }
          },
        }
      );

      await engine.run();

      expect(capturedTitles).toContain('Item Alpha - $10');
      expect(capturedTitles).toContain('Item Beta - $20');
      expect(capturedTitles).toContain('Item Gamma - $30');
    });

    it('createInspectableItem never coerces to [object Object] and produces valid JSON string', () => {
      const card = createInspectableItem({ title: 'Gaming Laptop', price: '$1,299', link: 'https://store.com/laptop' });
      expect(String(card)).not.toBe('[object Object]');
      expect(String(card)).toContain('"title":"Gaming Laptop"');
      expect(`${card}`).toContain('"price":"$1,299"');
      expect(card.title).toBe('Gaming Laptop');
      expect(card.price).toBe('$1,299');
      expect(card.link).toBe('https://store.com/laptop');
    });

    it('updates unpacked fields across every iteration without stale values', async () => {
      document.body.innerHTML = `
        <div class="card"><h3 class="name">Product 1</h3><span class="price">$10</span></div>
        <div class="card"><h3 class="name">Product 2</h3><span class="price">$20</span></div>
      `;

      const seenShortcuts: string[] = [];
      const engine = new WorkflowEngine(
        {
          id: 'test-wf-shortcuts',
          name: 'Shortcut Variables Test',
          nodes: [
            {
              id: 'scrape-node',
              type: 'scrape_elements',
              position: { x: 0, y: 0 },
              data: {
                label: 'Scrape Products',
                type: 'scrape_elements',
                category: 'extraction',
                properties: {
                  containerSelector: '.card',
                  fields: [
                    { name: 'title', selector: '.name', attribute: 'text' },
                    { name: 'price', selector: '.price', attribute: 'text' },
                  ],
                  outputVariable: 'scrapedProducts',
                  itemVariable: 'currentProduct',
                },
              },
            },
            {
              id: 'log-node',
              type: 'set_variable',
              position: { x: 200, y: 0 },
              data: {
                label: 'Log Shortcut',
                type: 'set_variable',
                category: 'data',
                properties: {
                  name: 'shortcutVal',
                  value: '{{title}}',
                },
              },
            },
          ],
          edges: [
            {
              id: 'edge-loop',
              source: 'scrape-node',
              target: 'log-node',
              sourceHandle: 'loop_body',
            },
          ],
          variables: {},
        },
        {
          onVariablesChange: (vars) => {
            if (vars.shortcutVal && !seenShortcuts.includes(vars.shortcutVal)) {
              seenShortcuts.push(vars.shortcutVal);
            }
          },
        }
      );

      await engine.run();
      expect(seenShortcuts).toEqual(['Item Alpha', 'Item Beta', 'Item Gamma']);
    });

    it('extracts single field directly into currentProduct when itemExtractField is configured', async () => {
      document.body.innerHTML = `
        <div class="card"><h3 class="name">Product A</h3><a class="url" href="https://example.com/a">Link A</a></div>
        <div class="card"><h3 class="name">Product B</h3><a class="url" href="https://example.com/b">Link B</a></div>
      `;

      const capturedLinks: string[] = [];
      const capturedObjects: any[] = [];

      const engine = new WorkflowEngine(
        {
          id: 'test-wf-extract-field',
          name: 'Extract Link Test',
          nodes: [
            {
              id: 'scrape-node',
              type: 'scrape_elements',
              position: { x: 0, y: 0 },
              data: {
                label: 'Scrape Products',
                type: 'scrape_elements',
                category: 'extraction',
                properties: {
                  containerSelector: '.card',
                  fields: [
                    { name: 'title', selector: '.name', attribute: 'text' },
                    { name: 'link', selector: '.url', attribute: 'href' },
                  ],
                  itemVariable: 'currentProduct',
                  itemExtractField: 'link', // Extract only the link URL!
                },
              },
            },
            {
              id: 'log-node',
              type: 'set_variable',
              position: { x: 200, y: 0 },
              data: {
                label: 'Log Link',
                type: 'set_variable',
                category: 'data',
                properties: {
                  name: 'capturedLink',
                  value: '{{currentProduct}}',
                },
              },
            },
          ],
          edges: [
            {
              id: 'edge-loop',
              source: 'scrape-node',
              target: 'log-node',
              sourceHandle: 'loop_body',
            },
          ],
          variables: {},
        },
        {
          onVariablesChange: (vars) => {
            if (vars.capturedLink && !capturedLinks.includes(vars.capturedLink)) {
              capturedLinks.push(vars.capturedLink);
            }
            if (vars.currentProduct_object && !capturedObjects.includes(vars.currentProduct_object.title)) {
              capturedObjects.push(vars.currentProduct_object.title);
            }
          },
        }
      );

      await engine.run();
      expect(capturedLinks).toEqual(['/alpha', '/beta', '/gamma']);
      expect(capturedObjects).toEqual(['Item Alpha', 'Item Beta', 'Item Gamma']);
    });
  });

  describe('Intelligent Object Fallbacks for Navigate and TypeText', () => {
    it('executeNavigate extracts link/url when passed an object or JSON string', async () => {
      const mockCtx: any = {
        variables: {
          currentProduct: { title: 'Headphones', link: 'https://store.com/item/100' },
        },
        log: vi.fn(),
      };

      const node: any = {
        id: 'nav-1',
        data: {
          label: 'Navigate to Item',
          properties: {
            url: '{{currentProduct}}',
          },
        },
      };

      const result = await executeNavigate(node, mockCtx);
      expect(result.success).toBe(true);
      expect(result.output.url).toBe('https://store.com/item/100');
    });

    it('executeTypeText extracts text/title when passed an object', async () => {
      const mockCtx: any = {
        variables: {
          currentProduct: { title: 'Sony Headphones', price: '$299' },
        },
        log: vi.fn(),
      };

      const node: any = {
        id: 'type-1',
        data: {
          label: 'Type Item Title',
          properties: {
            selector: '#search-box',
            text: '{{currentProduct}}',
          },
        },
      };

      const result = await executeTypeText(node, mockCtx);
      expect(result.success).toBe(true);
      expect(mockCtx.log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Sony Headphones'),
        })
      );
    });
  });

  describe('Transform extractField / getProperty Operation', () => {
    it('extracts property from a JavaScript object variable', async () => {
      const mockCtx: any = {
        variables: {
          product: { title: 'Mechanical Keyboard', link: 'https://keebs.com/q1', specs: { switches: 'Gateron Brown' } },
        },
        log: vi.fn(),
      };

      const node: any = {
        id: 't-1',
        data: {
          properties: {
            input: '{{product}}',
            operation: 'extractField',
            field: 'link',
            outputVariable: 'extractedLink',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(res.variables?.extractedLink).toBe('https://keebs.com/q1');
    });

    it('extracts property from a JSON string input', async () => {
      const mockCtx: any = {
        variables: {
          productJson: JSON.stringify({ id: 'SKU-491', title: 'Curved Monitor', price: '$450' }),
        },
        log: vi.fn(),
      };

      const node: any = {
        id: 't-2',
        data: {
          properties: {
            input: '{{productJson}}',
            operation: 'extractField',
            field: 'title',
            outputVariable: 'monitorTitle',
          },
        },
      };

      const res = await executeTransform(node, mockCtx);
      expect(res.success).toBe(true);
      expect(res.variables?.monitorTitle).toBe('Curved Monitor');
    });
  });

  describe('Smart Scroll Speed Options', () => {
    it('configures scrollSpeed presets and smooth flag in executeSmartScroll', async () => {
      const mockCtx: any = {
        variables: {},
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      const nodeInstant: any = {
        id: 'scroll-instant',
        data: {
          label: 'Instant Scroll',
          properties: {
            mode: 'to_bottom',
            maxScrolls: 2,
            scrollSpeed: 'instant',
          },
        },
      };

      const resInstant = await executeSmartScroll(nodeInstant, mockCtx);
      expect(resInstant.success).toBe(true);
      expect(resInstant.output.scrollSpeed).toBe('instant');
      expect(resInstant.output.totalScrolls).toBe(2);

      const nodeFast: any = {
        id: 'scroll-fast',
        data: {
          label: 'Fast Scroll',
          properties: {
            mode: 'distance',
            maxScrolls: 1,
            scrollSpeed: 'fast',
          },
        },
      };

      const resFast = await executeSmartScroll(nodeFast, mockCtx);
      expect(resFast.success).toBe(true);
      expect(resFast.output.scrollSpeed).toBe('fast');
    });
  });

  describe('Scrape Elements Post-Processing & Filtering Integration', () => {
    it('applies URL normalization, price cleaning, and pattern filtering inside executeScrapeElements', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'extract_dataset') {
              return Promise.resolve({
                success: true,
                items: [
                  { title: 'Item 1', link: '/dp/B08111?ref=sr_1_1&qid=123', price: '$1,299.00' },
                  { title: 'Promo Item', link: '/sspa/click?id=ad999', price: '$19.99' },
                  { title: 'Item 2', link: '/dp/B08222?ref=sr_1_2&qid=456', price: '₹2,499.00' },
                ],
              });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const mockCtx: any = {
        variables: {},
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      const node: any = {
        id: 'scrape-post-process',
        data: {
          label: 'Scrape Products',
          properties: {
            containerSelector: '.product-card',
            fields: [
              { name: 'title', selector: '.title', attribute: 'text' },
              { name: 'link', selector: 'a', attribute: 'href' },
              { name: 'price', selector: '.price', attribute: 'text' },
            ],
            outputVariable: 'cleanProducts',
            postProcessingEnabled: true,
            urlBasePrefix: 'https://www.amazon.in',
            stripUrlQueryParams: true,
            cleanPrice: true,
            priceMode: 'number_only',
            patternFilterEnabled: true,
            patternFilterField: 'link',
            patternFilterAction: 'include_only',
            patternFilterMode: 'contains',
            patternFilterValue: '/dp/',
          },
        },
      };

      const res = await executeScrapeElements(node, mockCtx);
      expect(res.success).toBe(true);
      expect(res.items.length).toBe(2);

      // Verify URL normalization + query stripping
      expect(res.items[0].link).toBe('https://www.amazon.in/dp/B08111');
      expect(res.items[0].price).toBe('1299');

      expect(res.items[1].link).toBe('https://www.amazon.in/dp/B08222');
      expect(res.items[1].price).toBe('2499');

      // Verify filtered out row (/sspa/) was excluded
      expect(res.items.find((i: any) => i.title === 'Promo Item')).toBeUndefined();
    });

    it('cleans "./" and formats multiple user-selected urlTargetFields in executeScrapeElements', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg) => {
            if (msg.type === 'EXECUTE_DOM_ACTION' && msg.payload.action === 'extract_dataset') {
              return Promise.resolve({
                success: true,
                items: [
                  {
                    title: 'Ergonomic Chair',
                    link: './product/chair-101?ref=test_1',
                    image: './images/chair.png',
                    sku: './sku-123',
                  },
                ],
              });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const mockCtx: any = {
        variables: {},
        log: vi.fn(),
        updateNodeState: vi.fn(),
      };

      const node: any = {
        id: 'scrape-url-fields',
        data: {
          label: 'Scrape Products',
          properties: {
            containerSelector: '.product',
            fields: [
              { name: 'title', selector: 'h3', attribute: 'text' },
              { name: 'link', selector: 'a', attribute: 'href' },
              { name: 'image', selector: 'img', attribute: 'src' },
              { name: 'sku', selector: '.sku', attribute: 'text' },
            ],
            outputVariable: 'scrapedChairs',
            postProcessingEnabled: true,
            urlBasePrefix: 'https://www.furniturestore.com',
            urlTargetFields: ['link', 'image'],
            stripUrlQueryParams: true,
          },
        },
      };

      const res = await executeScrapeElements(node, mockCtx);
      expect(res.success).toBe(true);
      expect(res.items.length).toBe(1);

      // 'link' and 'image' had './' removed and base prefix applied
      expect(res.items[0].link).toBe('https://www.furniturestore.com/product/chair-101');
      expect(res.items[0].image).toBe('https://www.furniturestore.com/images/chair.png');

      // 'sku' and 'title' were not in urlTargetFields so they were not modified
      expect(res.items[0].sku).toBe('./sku-123');
      expect(res.items[0].title).toBe('Ergonomic Chair');
    });

    it('transforms data via executeTransform operations: normalizeUrl, cleanPrice, formatDate', async () => {
      const mockCtx: any = {
        variables: {
          rawUrl: '/product/view?ref=123&item=456',
          rawPrice: '$2,499.99',
          rawDate: '2026-09-22T08:00:00Z',
        },
        log: vi.fn(),
      };

      // 1. normalizeUrl
      const urlNode: any = {
        id: 't-url',
        data: {
          properties: {
            input: '{{rawUrl}}',
            operation: 'normalizeUrl',
            basePrefix: 'https://example.com',
            stripQueryParams: true,
            outputVariable: 'processedUrl',
          },
        },
      };
      await executeTransform(urlNode, mockCtx);
      expect(mockCtx.variables.processedUrl).toBe('https://example.com/product/view?item=456');

      // 2. cleanPrice
      const priceNode: any = {
        id: 't-price',
        data: {
          properties: {
            input: '{{rawPrice}}',
            operation: 'cleanPrice',
            priceMode: 'number_only',
            outputVariable: 'processedPrice',
          },
        },
      };
      await executeTransform(priceNode, mockCtx);
      expect(mockCtx.variables.processedPrice).toBe('2499.99');

      // 3. formatDate
      const dateNode: any = {
        id: 't-date',
        data: {
          properties: {
            input: '{{rawDate}}',
            operation: 'formatDate',
            dateMode: 'iso_date',
            outputVariable: 'processedDate',
          },
        },
      };
      await executeTransform(dateNode, mockCtx);
      expect(mockCtx.variables.processedDate).toBe('2026-09-22');
    });
  });
});

