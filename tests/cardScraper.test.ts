import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveElementAttribute, toAbsoluteUrl, extractDataset } from '../src/content/domActions';
import { executeScrapeElements } from '../src/runtime/executors';
import { WorkflowEngine } from '../src/runtime/engine';
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
  });
});
