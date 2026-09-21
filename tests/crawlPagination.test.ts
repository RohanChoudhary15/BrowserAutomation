import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { findAndClickNextPage } from '../src/content/domActions';
import { executeCrawlPagination } from '../src/runtime/executors';
import { WorkflowEngine } from '../src/runtime/engine';
import { ExecutionContext } from '../src/types/execution';
import { Workflow } from '../src/types/workflow';

function makeCtx(variables: Record<string, any> = {}): ExecutionContext {
  return {
    workflowId: 'wf_crawl',
    executionId: 'exec_crawl',
    variables,
    signal: new AbortController().signal,
    log: vi.fn(),
    updateNodeState: vi.fn(),
  };
}

describe('Next-Page Auto-Crawler Node (crawl_pagination)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  describe('findAndClickNextPage DOM Action heuristics', () => {
    it('detects and clicks <a rel="next">', async () => {
      let clicked = false;
      const link = document.createElement('a');
      link.rel = 'next';
      link.href = '#page-2';
      link.textContent = 'Page 2';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        clicked = true;
      });
      document.body.appendChild(link);

      const res = await findAndClickNextPage({});
      expect(res.clicked).toBe(true);
      expect(res.selectorFound).toBe('a[rel="next"]');
      expect(clicked).toBe(true);
    });

    it('detects and clicks button with aria-label="Next Page"', async () => {
      let clicked = false;
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Next Page');
      btn.textContent = '›';
      btn.addEventListener('click', () => {
        clicked = true;
      });
      document.body.appendChild(btn);

      const res = await findAndClickNextPage({});
      expect(res.clicked).toBe(true);
      expect(res.matchedText).toBe('›');
      expect(clicked).toBe(true);
    });

    it('detects and clicks element with class .pagination-next', async () => {
      let clicked = false;
      const btn = document.createElement('a');
      btn.className = 'pagination-next button';
      btn.textContent = 'Next';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        clicked = true;
      });
      document.body.appendChild(btn);

      const res = await findAndClickNextPage({});
      expect(res.clicked).toBe(true);
      expect(clicked).toBe(true);
    });

    it('detects and clicks element with "Next" text heuristic', async () => {
      let clicked = false;
      const div = document.createElement('div');
      div.className = 'custom-pager-btn';
      div.textContent = 'Next ›';
      div.addEventListener('click', () => {
        clicked = true;
      });
      document.body.appendChild(div);

      const res = await findAndClickNextPage({});
      expect(res.clicked).toBe(true);
      expect(clicked).toBe(true);
    });

    it('uses custom nextSelector when provided', async () => {
      let clicked = false;
      const btn = document.createElement('button');
      btn.id = 'my-custom-next-btn';
      btn.textContent = 'Go to Next';
      btn.addEventListener('click', () => {
        clicked = true;
      });
      document.body.appendChild(btn);

      const res = await findAndClickNextPage({ nextSelector: '#my-custom-next-btn' });
      expect(res.clicked).toBe(true);
      expect(res.selectorFound).toBe('#my-custom-next-btn');
      expect(clicked).toBe(true);
    });

    it('stops when the next button is disabled or aria-disabled="true"', async () => {
      const btn = document.createElement('button');
      btn.className = 'next-page';
      btn.setAttribute('disabled', 'true');
      btn.textContent = 'Next';
      document.body.appendChild(btn);

      const res = await findAndClickNextPage({});
      expect(res.clicked).toBe(false);
      expect(res.reason).toBe('disabled');
    });

    it('returns clicked: false when no pagination button exists', async () => {
      document.body.innerHTML = '<div><h1>Articles</h1><p>No more pages</p></div>';

      const res = await findAndClickNextPage({});
      expect(res.clicked).toBe(false);
      expect(res.reason).toBe('not_found');
    });
  });

  describe('executeCrawlPagination Runtime Executor', () => {
    it('crawls multiple pages, appends rows to single dataset, and deduplicates', async () => {
      let currentPage = 1;

      // Mock chrome runtime DOM actions
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg: any) => {
            const { action, params } = msg.payload;

            if (action === 'extract_multiple') {
              if (currentPage === 1) {
                return Promise.resolve({
                  items: ['Laptop A - $999', 'Laptop B - $1299', 'Laptop C - $799'],
                  count: 3,
                });
              } else if (currentPage === 2) {
                // Returns 1 duplicate and 2 new items
                return Promise.resolve({
                  items: ['Laptop C - $799', 'Laptop D - $1499', 'Laptop E - $1899'],
                  count: 3,
                });
              } else {
                return Promise.resolve({ items: [], count: 0 });
              }
            }

            if (action === 'paginate_next' || action === 'find_and_click_next_page') {
              if (currentPage === 1) {
                currentPage = 2;
                return Promise.resolve({ clicked: true, selectorFound: '.next-btn' });
              } else {
                return Promise.resolve({ clicked: false, reason: 'disabled' });
              }
            }

            return Promise.resolve({ success: true });
          }),
        },
      };

      const ctx = makeCtx();
      const node = {
        id: 'crawl_1',
        data: {
          label: 'Crawl Products',
          properties: {
            itemSelector: '.product-card',
            mode: 'next_button',
            nextSelector: '.next-btn',
            maxPages: 5,
            pageDelay: 10,
            deduplicate: true,
            outputVariable: 'allProducts',
          },
        },
      } as any;

      const result = await executeCrawlPagination(node, ctx);

      expect(result.success).toBe(true);
      expect(result.output.pageCount).toBe(2);
      expect(result.output.totalCount).toBe(5); // 3 on page 1 + 2 unique on page 2
      expect(ctx.variables.allProducts).toEqual([
        'Laptop A - $999',
        'Laptop B - $1299',
        'Laptop C - $799',
        'Laptop D - $1499',
        'Laptop E - $1899',
      ]);
      expect(ctx.variables.crawlPageCount).toBe(2);
      expect(ctx.variables.crawlTotalCount).toBe(5);
    });

    it('respects maxPages limit', async () => {
      let currentPage = 1;

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg: any) => {
            const { action } = msg.payload;
            if (action === 'extract_multiple') {
              return Promise.resolve({
                items: [`Item on page ${currentPage}`],
                count: 1,
              });
            }
            if (action === 'paginate_next' || action === 'find_and_click_next_page') {
              currentPage++;
              return Promise.resolve({ clicked: true });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const ctx = makeCtx();
      const node = {
        id: 'crawl_max_pages',
        data: {
          label: 'Crawl 2 pages max',
          properties: {
            itemSelector: '.item',
            mode: 'auto_detect',
            maxPages: 2,
            pageDelay: 10,
            outputVariable: 'crawledItems',
          },
        },
      } as any;

      const result = await executeCrawlPagination(node, ctx);

      expect(result.success).toBe(true);
      expect(result.output.pageCount).toBe(2);
      expect(ctx.variables.crawledItems).toHaveLength(2);
    });

    it('stops when infinite scroll triggers but yields no new items', async () => {
      let callCount = 0;

      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg: any) => {
            const { action } = msg.payload;
            if (action === 'extract_multiple') {
              callCount++;
              // Same items returned every time
              return Promise.resolve({
                items: ['Post 1', 'Post 2'],
                count: 2,
              });
            }
            if (action === 'scroll') {
              return Promise.resolve({ success: true });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const ctx = makeCtx();
      const node = {
        id: 'crawl_infinite',
        data: {
          label: 'Infinite Scroll Crawl',
          properties: {
            itemSelector: '.post',
            mode: 'infinite_scroll',
            maxPages: 5,
            pageDelay: 10,
            outputVariable: 'feedPosts',
          },
        },
      } as any;

      const result = await executeCrawlPagination(node, ctx);

      expect(result.success).toBe(true);
      // Stopped after finding no new items on 2nd iteration
      expect(result.output.totalCount).toBe(2);
      expect(ctx.variables.feedPosts).toHaveLength(2);
    });
  });

  describe('WorkflowEngine integration with crawl_pagination', () => {
    it('runs crawl_pagination and exposes final dataset downstream', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation((msg: any) => {
            const { action } = msg.payload;
            if (action === 'extract_multiple') {
              return Promise.resolve({
                items: ['Book 1', 'Book 2'],
                count: 2,
              });
            }
            if (action === 'paginate_next' || action === 'find_and_click_next_page') {
              return Promise.resolve({ clicked: false, reason: 'not_found' });
            }
            return Promise.resolve({ success: true });
          }),
        },
      };

      const nodes = [
        {
          id: 'crawl_node',
          type: 'iteratorNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Crawl Books',
            category: 'actions',
            type: 'crawl_pagination',
            properties: {
              itemSelector: '.book',
              mode: 'auto_detect',
              maxPages: 3,
              outputVariable: 'scrapedBooks',
            },
          },
        },
        {
          id: 'next_node',
          type: 'defaultNode',
          position: { x: 200, y: 0 },
          data: {
            label: 'Process Dataset',
            category: 'data',
            type: 'set_variable',
            properties: {
              name: 'booksCount',
              value: '{{scrapedBooks.length}}',
            },
          },
        },
      ];

      const edges = [
        { id: 'e1', source: 'crawl_node', sourceHandle: 'output', target: 'next_node' },
      ];

      const workflow: Workflow = {
        id: 'wf_crawl_pipeline',
        name: 'Crawl Pipeline',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        settings: { timeout: 5000, retryCount: 0, retryDelay: 100, stopOnError: true, highlightElements: false },
        nodes: nodes as any,
        edges,
      };

      const engine = new WorkflowEngine(workflow);
      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(engine.getVariables().scrapedBooks).toEqual(['Book 1', 'Book 2']);
      expect(engine.getVariables().booksCount).toBe(2);
    });
  });
});
