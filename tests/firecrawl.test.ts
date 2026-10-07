import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFirecrawl } from '../src/runtime/executors';
import { WorkflowNode } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('Firecrawl (Keyless) Node', () => {
  let mockContext: ExecutionContext;
  let interceptedFetchCalls: Array<{ url: string; init?: any }> = [];

  beforeEach(() => {
    interceptedFetchCalls = [];
    mockContext = {
      workflowId: 'test-wf',
      currentTabId: 101,
      currentUrl: 'https://news.ycombinator.com',
      variables: {
        pageTitle: 'Hacker News',
        searchTopic: 'Autonomous AI Agents',
      },
      signal: new AbortController().signal,
      log: vi.fn(),
      updateNodeState: vi.fn(),
      getVariable: (name: string) => mockContext.variables[name],
      setVariable: (name: string, val: any) => {
        mockContext.variables[name] = val;
      },
    };

    // Mock chrome.runtime.sendMessage for safeFetch PROXY_FETCH and DOM actions
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: any) => {
          if (msg.type === 'PROXY_FETCH') {
            interceptedFetchCalls.push({ url: msg.payload.url, init: msg.payload.options });

            const body = typeof msg.payload.options?.body === 'string'
              ? JSON.parse(msg.payload.options.body)
              : msg.payload.options?.body;

            // Mock Scrape response
            if (msg.payload.url.endsWith('/scrape')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    success: true,
                    data: {
                      markdown: '# Hacker News\n\nTop stories from the tech community.',
                      html: '<h1>Hacker News</h1><p>Top stories from the tech community.</p>',
                      links: ['https://news.ycombinator.com/item?id=123', 'https://github.com'],
                      metadata: {
                        title: 'Hacker News',
                        description: 'Social news website focusing on computer science.',
                        statusCode: 200,
                      },
                      screenshot: 'https://firecrawl.dev/screenshots/test.png',
                    },
                  }),
                },
              };
            }

            // Mock Search response
            if (msg.payload.url.includes('/search')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    success: true,
                    data: [
                      {
                        title: 'Autonomous Agents 2026',
                        url: 'https://example.com/agents',
                        markdown: 'Overview of autonomous agents in 2026.',
                      },
                      {
                        title: 'Next Gen AI Automation',
                        url: 'https://example.com/automation',
                        markdown: 'Browser automation with AI workflows.',
                      },
                    ],
                  }),
                },
              };
            }

            // Mock Map response
            if (msg.payload.url.endsWith('/map')) {
              return {
                success: true,
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: { 'content-type': 'application/json' },
                  text: JSON.stringify({
                    success: true,
                    data: {
                      links: [
                        'https://example.com/about',
                        'https://example.com/docs',
                        'https://example.com/pricing',
                      ],
                    },
                  }),
                },
              };
            }
          }

          // Handle mock DOM actions
          if (msg.type === 'EXECUTE_DOM_ACTION' || msg.type === 'DOM_ACTION') {
            if (msg.payload?.action === 'extract_text') {
              return { success: true, text: 'Simulated local DOM body text fallback' };
            }
            if (msg.payload?.action === 'extract_html') {
              return { success: true, html: '<p>Simulated local DOM body text fallback</p>' };
            }
          }

          return { success: true };
        }),
      },
      tabs: {
        sendMessage: vi.fn(async (tabId: number, msg: any) => {
          if (msg.type === 'EXECUTE_DOM_ACTION' || msg.type === 'DOM_ACTION') {
            if (msg.payload?.action === 'extract_text') {
              return { success: true, text: 'Simulated local DOM body text fallback' };
            }
            if (msg.payload?.action === 'extract_html') {
              return { success: true, html: '<p>Simulated local DOM body text fallback</p>' };
            }
          }
          return { success: true };
        }),
      },
    };
  });

  it('performs keyless scrape without Authorization header by default', async () => {
    const node: WorkflowNode = {
      id: 'fc_node_1',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Firecrawl Scraper',
        properties: {
          mode: 'scrape',
          url: '{{currentUrl}}',
          formats: ['markdown', 'links'],
          onlyMainContent: true,
          waitFor: 1000,
          outputVariable: 'hnScraped',
        },
      },
    };

    const result = await executeFirecrawl(node, mockContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain('# Hacker News');
    expect(result.variables?.hnScraped).toContain('# Hacker News');
    expect(result.variables?.hnScraped_title).toBe('Hacker News');
    expect(result.variables?.hnScraped_links).toHaveLength(2);
    expect(result.variables?.hnScraped_screenshot).toBe('https://firecrawl.dev/screenshots/test.png');

    // Verify keyless request headers
    expect(interceptedFetchCalls.length).toBe(1);
    const call = interceptedFetchCalls[0];
    expect(call.url).toBe('https://api.firecrawl.dev/v1/scrape');
    expect(call.init.headers['Authorization']).toBeUndefined(); // Keyless MUST NOT send Authorization header

    const sentBody = JSON.parse(call.init.body);
    expect(sentBody.url).toBe('https://news.ycombinator.com');
    expect(sentBody.formats).toEqual(['markdown', 'links']);
    expect(sentBody.onlyMainContent).toBe(true);
  });

  it('sends Authorization header when a custom API key is supplied', async () => {
    const node: WorkflowNode = {
      id: 'fc_node_2',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Firecrawl Scraper',
        properties: {
          mode: 'scrape',
          url: 'https://docs.firecrawl.dev',
          apiKey: 'fc-test-key-12345',
          apiUrl: 'https://api.firecrawl.dev/v1',
          outputVariable: 'docMarkdown',
        },
      },
    };

    const result = await executeFirecrawl(node, mockContext);

    expect(result.success).toBe(true);
    expect(interceptedFetchCalls.length).toBe(1);
    const call = interceptedFetchCalls[0];
    expect(call.init.headers['Authorization']).toBe('Bearer fc-test-key-12345');
  });

  it('supports custom self-hosted API URL', async () => {
    const node: WorkflowNode = {
      id: 'fc_node_3',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Self-Hosted Firecrawl',
        properties: {
          mode: 'scrape',
          url: 'https://github.com/trending',
          apiUrl: 'http://localhost:3002/v1/',
          outputVariable: 'trendingData',
        },
      },
    };

    const result = await executeFirecrawl(node, mockContext);

    expect(result.success).toBe(true);
    expect(interceptedFetchCalls[0].url).toBe('http://localhost:3002/v1/scrape');
  });

  it('executes Firecrawl search and stores search results with variable interpolation', async () => {
    const node: WorkflowNode = {
      id: 'fc_node_4',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Firecrawl Search',
        properties: {
          mode: 'search',
          searchQuery: 'Latest developments in {{searchTopic}}',
          limit: 3,
          outputVariable: 'searchResults',
        },
      },
    };

    const result = await executeFirecrawl(node, mockContext);

    expect(result.success).toBe(true);
    expect(Array.isArray(result.output)).toBe(true);
    expect(result.output).toHaveLength(2);
    expect(result.variables?.searchResults_count).toBe(2);

    expect(interceptedFetchCalls[0].url).toBe('https://api.firecrawl.dev/v2/search');
    const sentBody = JSON.parse(interceptedFetchCalls[0].init.body);
    expect(sentBody.query).toBe('Latest developments in Autonomous AI Agents');
    expect(sentBody.limit).toBe(3);
  });

  it('correctly handles Firecrawl v2 nested { success: true, data: { web: [...] } } search shape and outputs rich markdown', async () => {
    (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
      if (msg.type === 'PROXY_FETCH' && msg.payload.url.includes('/search')) {
        return {
          success: true,
          response: {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            text: JSON.stringify({
              success: true,
              data: {
                web: [
                  {
                    title: 'Deep Research with Firecrawl',
                    url: 'https://firecrawl.dev/blog/deep-research',
                    description: 'Explore the web with AI search capabilities.',
                    content: 'Detailed guide on AI search using Firecrawl.',
                  },
                ],
              },
            }),
          },
        };
      }
      return { success: false };
    });

    const node: WorkflowNode = {
      id: 'fc_v2_search',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Firecrawl v2 Search',
        properties: {
          mode: 'search',
          searchQuery: 'Deep research',
          searchOutputFormat: 'markdown',
          outputVariable: 'firecrawlMarkdown',
        },
      },
    };

    const result = await executeFirecrawl(node, mockContext);

    expect(result.success).toBe(true);
    expect(result.variables?.firecrawlMarkdown).toContain('### Deep Research with Firecrawl');
    expect(result.variables?.firecrawlMarkdown).toContain('https://firecrawl.dev/blog/deep-research');
    expect(result.variables?.firecrawlMarkdown).toContain('Detailed guide on AI search using Firecrawl.');
    expect(result.variables?.firecrawlMarkdown).not.toBe('### Result 1');
    expect(mockContext.variables.firecrawlMarkdown).toContain('Deep Research');
  });

  it('executes Firecrawl map operation to discover all links', async () => {
    const node: WorkflowNode = {
      id: 'fc_node_5',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Firecrawl Map',
        properties: {
          mode: 'map',
          url: 'https://example.com',
          outputVariable: 'siteMap',
        },
      },
    };

    const result = await executeFirecrawl(node, mockContext);

    expect(result.success).toBe(true);
    expect(Array.isArray(result.output)).toBe(true);
    expect(result.output).toHaveLength(3);
    expect(result.variables?.siteMap_count).toBe(3);
    expect(interceptedFetchCalls[0].url).toBe('https://api.firecrawl.dev/v1/map');
  });

  it('falls back to local browser DOM extraction when keyless rate limit (429) is hit', async () => {
    // Override fetch mock to simulate 429 Too Many Requests
    (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
      if (msg.type === 'PROXY_FETCH') {
        return {
          success: true,
          response: {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'content-type': 'application/json' },
            text: JSON.stringify({
              success: false,
              error: { message: 'Rate limit exceeded for keyless tier. Please wait or provide an API key.' },
            }),
          },
        };
      }
      if (msg.type === 'EXECUTE_DOM_ACTION' || msg.type === 'DOM_ACTION') {
        if (msg.payload?.action === 'extract_text') {
          return { success: true, text: 'Recovered paragraph text from browser DOM' };
        }
        if (msg.payload?.action === 'extract_html') {
          return { success: true, html: '<p>Recovered paragraph text from browser DOM</p>' };
        }
      }
      return { success: true };
    });

    const node: WorkflowNode = {
      id: 'fc_node_6',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Firecrawl Resilient Scraper',
        properties: {
          mode: 'scrape',
          url: 'https://news.ycombinator.com',
          fallbackToBrowser: true,
          outputVariable: 'resilientOutput',
        },
      },
    };

    const result = await executeFirecrawl(node, mockContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain('Recovered paragraph text from browser DOM');
    expect(result.variables?.resilientOutput).toContain('Recovered paragraph text from browser DOM');
    expect(mockContext.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('Using browser DOM extraction fallback'),
      })
    );
  });

  it('throws an error if fallback is disabled and API fails', async () => {
    (globalThis as any).chrome.runtime.sendMessage = vi.fn(async (msg: any) => {
      if (msg.type === 'PROXY_FETCH') {
        return {
          success: true,
          response: {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'content-type': 'application/json' },
            text: JSON.stringify({ error: { message: 'Upstream server failure' } }),
          },
        };
      }
      return { success: true };
    });

    const node: WorkflowNode = {
      id: 'fc_node_7',
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'firecrawl',
        label: 'Strict Firecrawl',
        properties: {
          mode: 'scrape',
          url: 'https://bad-gateway.com',
          fallbackToBrowser: false,
        },
      },
    };

    await expect(executeFirecrawl(node, mockContext)).rejects.toThrow('Firecrawl scrape error (500)');
  });
});
