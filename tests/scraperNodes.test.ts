import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NODE_REGISTRY, CATEGORIES, getNodeDefinition } from '../src/nodes/registry';
import {
  executeYouTubeScraper,
  executeInstagramScraper,
  executeRedditScraper,
  executeLinkedInScraper,
  executeAmazonScraper,
  executeTwitterScraper,
  executeGoogleSearchScraper,
} from '../src/runtime/executors';
import { WorkflowEngine } from '../src/runtime/engine';
import { WorkflowNode, WorkflowEdge } from '../src/types/workflow';
import { ExecutionContext } from '../src/types/execution';

describe('Free Keyless Scraper Nodes', () => {
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockCtx = {
      workflowId: 'test-scraper-wf',
      executionId: 'exec-123',
      variables: {},
      log: vi.fn(),
      updateNodeState: vi.fn(),
      signal: new AbortController().signal,
    };
  });

  describe('Registry & Categorization', () => {
    it('registers the "scrapers" category in CATEGORIES with distinct color', () => {
      const scraperCat = CATEGORIES.find((c) => c.id === 'scrapers');
      expect(scraperCat).toBeDefined();
      expect(scraperCat?.label).toBe('Scrapers');
      expect(scraperCat?.color).toBe('#f97316');
    });

    it('registers all 7 scraper node types in NODE_REGISTRY with scraperNode reactFlowType', () => {
      const expectedTypes = [
        'youtube_scraper',
        'instagram_scraper',
        'reddit_scraper',
        'linkedin_scraper',
        'amazon_scraper',
        'twitter_scraper',
        'google_search_scraper',
      ] as const;

      for (const t of expectedTypes) {
        const def = getNodeDefinition(t);
        expect(def).toBeDefined();
        expect(def.category).toBe('scrapers');
        expect(def.reactFlowType).toBe('scraperNode');
        expect(def.defaultProperties.outputVariable).toBeDefined();
        expect(def.defaultProperties.itemVariable).toBeDefined();
      }
    });
  });

  describe('YouTube Scraper Executor', () => {
    it('extracts YouTube results and sets variables and count', async () => {
      const node: WorkflowNode = {
        id: 'node-yt',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            mode: 'search',
            query: 'modern browser automation',
            maxResults: 10,
            autoScrollPasses: 0,
            outputVariable: 'ytVideos',
            itemVariable: 'video',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items!.length).toBeGreaterThan(0);
      expect(mockCtx.variables['ytVideos']).toEqual(result.items);
      expect(mockCtx.variables['ytVideos_count']).toBe(result.items!.length);
      expect(mockCtx.variables['ytVideos_table']).toBeDefined();
      expect(mockCtx.variables['ytVideos_csv']).toBeDefined();
      expect(mockCtx.variables['ytVideos_htmlTable']).toBeDefined();
    });

    it('extracts video script (transcripts) and provides fullScript + table outputs', async () => {
      const node: WorkflowNode = {
        id: 'node-yt-script',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            mode: 'video_script',
            target: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            scriptLanguage: 'en',
            scriptFormat: 'timestamped',
            outputVariable: 'ytScript',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items!.length).toBe(2);
      expect(result.items![0].text).toContain('Welcome');
      expect(mockCtx.variables['ytScript']).toEqual(result.items);
      expect(mockCtx.variables['ytScript_script']).toBeDefined();
      expect(typeof mockCtx.variables['ytScript_script']).toBe('string');
      expect(mockCtx.variables['ytScript_script']).toContain('[00:00]');
      expect(mockCtx.variables['ytScript_transcript']).toEqual(result.items);
      expect(mockCtx.variables['ytScript_table']).toBeDefined();
      expect(mockCtx.variables['ytScript_csv']).toContain('Welcome');
    });

    it('supports youtubei.js engine for search, details, transcripts, and comments', async () => {
      const node: WorkflowNode = {
        id: 'node-yt-innertube',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            mode: 'video_details',
            engine: 'youtubei_js',
            target: 'https://www.youtube.com/watch?v=mock123',
            outputVariable: 'ytDetails',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items!.length).toBeGreaterThan(0);
      const firstStream = result.items![0];
      expect(firstStream.itag).toBeDefined();
      expect(firstStream.mimeType).toBeDefined();
      expect(firstStream.title).toBeDefined();
      expect(firstStream.description).toBeDefined();
      expect(firstStream.thumbnail).toBeDefined();
      expect(firstStream.likes).toBeDefined();
      expect(firstStream.views).toBeDefined();
      expect(firstStream.comments).toBeDefined();
      expect(mockCtx.variables['ytDetails']).toEqual(result.items);
      expect(mockCtx.variables['ytDetails_table']).toBeDefined();
      expect(mockCtx.variables['ytDetails_title']).toBeDefined();
      expect(mockCtx.variables['ytDetails_description']).toBeDefined();
      expect(mockCtx.variables['ytDetails_thumbnail']).toBeDefined();
      expect(mockCtx.variables['ytDetails_likes']).toBeDefined();
      expect(mockCtx.variables['ytDetails_views']).toBeDefined();
      expect(mockCtx.variables['ytDetails_comments']).toBeDefined();
    });
  });

  describe('Instagram Scraper Executor', () => {
    it('extracts Instagram posts and stores in output variable', async () => {
      const node: WorkflowNode = {
        id: 'node-ig',
        type: 'instagram_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Instagram Scraper',
          category: 'scrapers',
          type: 'instagram_scraper',
          properties: {
            mode: 'profile_posts',
            target: 'nature',
            maxResults: 5,
            autoScrollPasses: 0,
            outputVariable: 'igPosts',
          },
        },
      };

      const result = await executeInstagramScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(mockCtx.variables['igPosts']).toBeDefined();
    });
  });

  describe('Reddit Scraper Executor (Keyless Fast Fetch + DOM)', () => {
    it('extracts subreddit posts and populates output and item list', async () => {
      const node: WorkflowNode = {
        id: 'node-reddit',
        type: 'reddit_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Reddit Scraper',
          category: 'scrapers',
          type: 'reddit_scraper',
          properties: {
            mode: 'subreddit',
            subreddit: 'webscraping',
            sortBy: 'hot',
            maxResults: 10,
            outputVariable: 'redditPosts',
            itemVariable: 'post',
          },
        },
      };

      const result = await executeRedditScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(mockCtx.variables['redditPosts']).toEqual(result.items);
      expect(mockCtx.variables['redditPosts_count']).toBe(result.items.length);
    });
  });

  describe('LinkedIn Scraper Executor', () => {
    it('extracts LinkedIn job postings and stores them in context', async () => {
      const node: WorkflowNode = {
        id: 'node-linkedin',
        type: 'linkedin_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'LinkedIn Scraper',
          category: 'scrapers',
          type: 'linkedin_scraper',
          properties: {
            mode: 'jobs_search',
            keywords: 'Frontend Engineer',
            location: 'Remote',
            maxResults: 5,
            autoScrollPasses: 0,
            outputVariable: 'jobListings',
          },
        },
      };

      const result = await executeLinkedInScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(mockCtx.variables['jobListings']).toEqual(result.items);
    });
  });

  describe('Amazon Scraper Executor', () => {
    it('extracts Amazon products and filters by Prime eligibility when requested', async () => {
      const node: WorkflowNode = {
        id: 'node-amazon',
        type: 'amazon_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Amazon Scraper',
          category: 'scrapers',
          type: 'amazon_scraper',
          properties: {
            mode: 'search',
            query: 'mechanical keyboard',
            primeOnly: true,
            maxResults: 10,
            autoScrollPasses: 0,
            outputVariable: 'amazonProducts',
          },
        },
      };

      const result = await executeAmazonScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      // In mock data, item 0 isPrime: true, item 1 isPrime: false
      for (const item of result.items) {
        expect(item.isPrime).toBe(true);
      }
      expect(mockCtx.variables['amazonProducts']).toEqual(result.items);
    });
  });

  describe('X / Twitter Scraper Executor', () => {
    it('extracts tweets with metrics into target variable', async () => {
      const node: WorkflowNode = {
        id: 'node-twitter',
        type: 'twitter_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Twitter Scraper',
          category: 'scrapers',
          type: 'twitter_scraper',
          properties: {
            mode: 'search',
            query: 'AI automation',
            maxResults: 5,
            autoScrollPasses: 0,
            outputVariable: 'tweetFeed',
          },
        },
      };

      const result = await executeTwitterScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(mockCtx.variables['tweetFeed']).toEqual(result.items);
    });
  });

  describe('Google Search Scraper Executor', () => {
    it('extracts organic Google search snippets and urls', async () => {
      const node: WorkflowNode = {
        id: 'node-google',
        type: 'google_search_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Google Scraper',
          category: 'scrapers',
          type: 'google_search_scraper',
          properties: {
            mode: 'organic_search',
            query: 'autoflow browser automation extension',
            maxResults: 10,
            outputVariable: 'searchResults',
          },
        },
      };

      const result = await executeGoogleSearchScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(mockCtx.variables['searchResults']).toEqual(result.items);
    });
  });

  describe('Workflow Engine Loop Body Streaming Integration', () => {
    it('iterates over each scraped item via loop_body edge into downstream nodes', async () => {
      // Node 1: Reddit Scraper
      const scraperNode: WorkflowNode = {
        id: 'scraper-1',
        type: 'reddit_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Reddit Scraper',
          category: 'scrapers',
          type: 'reddit_scraper',
          properties: {
            mode: 'subreddit',
            subreddit: 'webscraping',
            maxResults: 2,
            outputVariable: 'redditResults',
            itemVariable: 'post',
          },
        },
      };

      // Node 2: Downstream node inside loop body that accumulates processed items
      const loopBodyNode: WorkflowNode = {
        id: 'step-2',
        type: 'set_variable',
        position: { x: 200, y: 0 },
        data: {
          label: 'Process Post',
          category: 'data',
          type: 'set_variable',
          properties: {
            name: 'lastProcessedTitle',
            value: '{{post.title}}',
          },
        },
      };

      // Node 3: Done handler node
      const doneNode: WorkflowNode = {
        id: 'step-3',
        type: 'set_variable',
        position: { x: 400, y: 0 },
        data: {
          label: 'Scrape Done',
          category: 'data',
          type: 'set_variable',
          properties: {
            name: 'scrapeFinished',
            value: true,
          },
        },
      };

      const edges: WorkflowEdge[] = [
        {
          id: 'e1',
          source: 'scraper-1',
          target: 'step-2',
          sourceHandle: 'loop_body',
        },
        {
          id: 'e2',
          source: 'scraper-1',
          target: 'step-3',
          sourceHandle: 'loop_done',
        },
      ];

      const wf = {
        id: 'test-wf',
        name: 'Test Workflow',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        variables: {},
        nodes: [scraperNode, loopBodyNode, doneNode],
        edges,
        settings: {
          timeout: 10000,
          retryCount: 0,
          retryDelay: 100,
          stopOnError: true,
          highlightElements: false,
        },
      };

      const engine = new WorkflowEngine(wf);

      await engine.run();
      const vars = engine.getVariables();
      expect(vars['redditResults']).toBeDefined();
      expect(vars['scrapeFinished']).toBe(true);
      expect(vars['lastProcessedTitle']).toBeDefined();
      expect(typeof vars['lastProcessedTitle']).toBe('string');
    });
  });

  describe('Dedicated Tab Launching & Headless Mode', () => {
    const originalChrome = (globalThis as any).chrome;

    afterEach(() => {
      (globalThis as any).chrome = originalChrome;
    });

    it('launches a dedicated tab even when other tabs (like YouTube Music) are open', async () => {
      const mockQuery = vi.fn((_query: any, cb: (tabs: any[]) => void) => {
        cb([
          { id: 99, url: 'https://mail.google.com', active: false },
          { id: 555, url: 'https://music.youtube.com', title: 'YouTube Music', active: true },
        ]);
      });
      const mockCreate = vi.fn((opts: any, cb: (t: any) => void) => {
        cb({ id: 777, status: 'complete', ...opts });
      });
      const mockRemove = vi.fn((_id: number, cb?: () => void) => {
        if (cb) cb();
      });

      (globalThis as any).chrome = {
        tabs: {
          query: mockQuery,
          get: vi.fn((_id: number, cb: (t: any) => void) => cb({ id: 777, status: 'complete', url: 'https://www.youtube.com/results?search_query=automation' })),
          create: mockCreate,
          remove: mockRemove,
          onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        },
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'EXECUTE_DOM_ACTION') {
              return {
                success: true,
                items: [{ title: 'Automation Video', url: 'https://www.youtube.com/watch?v=auto123' }],
              };
            }
            return { success: true };
          }),
        },
      };

      const node: WorkflowNode = {
        id: 'node-yt-music-coexist',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            mode: 'search',
            query: 'automation',
            headless: false,
            autoCloseTab: false,
            outputVariable: 'ytOut',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      // Confirms it created a new dedicated tab with active: true, NOT reusing the music.youtube.com tab (555)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, url: expect.stringContaining('youtube.com/results?search_query=automation') }),
        expect.any(Function)
      );
      expect(mockCtx.currentTabId).toBe(777);
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('headless mode opens a background tab (active: false) and closes it automatically when done', async () => {
      const mockCreate = vi.fn((opts: any, cb: (t: any) => void) => {
        cb({ id: 888, status: 'complete', ...opts });
      });
      const mockRemove = vi.fn((_id: number, cb?: () => void) => {
        if (cb) cb();
      });

      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn((_q: any, cb: (tabs: any[]) => void) => cb([])),
          get: vi.fn((_id: number, cb: (t: any) => void) => cb({ id: 888, status: 'complete' })),
          create: mockCreate,
          remove: mockRemove,
          onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        },
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'EXECUTE_DOM_ACTION') {
              return {
                success: true,
                items: [{ title: 'Background Headless Video', url: 'https://www.youtube.com/watch?v=bg123' }],
              };
            }
            return { success: true };
          }),
        },
      };

      const node: WorkflowNode = {
        id: 'node-headless-yt',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            mode: 'search',
            query: 'ai tools',
            headless: true,
            autoCloseTab: true,
            outputVariable: 'headlessOut',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ active: false, url: expect.stringContaining('youtube.com') }),
        expect.any(Function)
      );
      expect(mockRemove).toHaveBeenCalledWith(888, expect.any(Function));
    });

    it('leaves background tab open when autoCloseTab is false', async () => {
      const mockCreate = vi.fn((opts: any, cb: (t: any) => void) => {
        cb({ id: 999, status: 'complete', ...opts });
      });
      const mockRemove = vi.fn((_id: number, cb?: () => void) => {
        if (cb) cb();
      });

      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn((_q: any, cb: (tabs: any[]) => void) => cb([])),
          get: vi.fn((_id: number, cb: (t: any) => void) => cb({ id: 999, status: 'complete' })),
          create: mockCreate,
          remove: mockRemove,
          onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        },
        runtime: {
          sendMessage: vi.fn(async (msg: any) => {
            if (msg.type === 'EXECUTE_DOM_ACTION') {
              return {
                success: true,
                items: [{ title: 'Kept Open Video', url: 'https://www.youtube.com/watch?v=keep123' }],
              };
            }
            return { success: true };
          }),
        },
      };

      const node: WorkflowNode = {
        id: 'node-keep-yt',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            mode: 'search',
            query: 'music',
            headless: true,
            autoCloseTab: false,
            outputVariable: 'keptOut',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ active: false }),
        expect.any(Function)
      );
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('does NOT open any browser tab when engine is youtubei.js', async () => {
      const mockCreate = vi.fn();
      (globalThis as any).chrome = {
        tabs: {
          create: mockCreate,
          query: vi.fn(),
        },
        runtime: {},
      };

      const node: WorkflowNode = {
        id: 'node-yt-zero-tab',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            engine: 'youtubei_js',
            mode: 'video_details',
            query: 'dQw4w9WgXcQ',
            outputVariable: 'ytStreams',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(result.items!.length).toBeGreaterThan(0);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockCtx.variables['ytStreams']).toBeDefined();
    });

    it('does NOT open any browser tab for video_script when engine is youtubei.js (strict zero-tab)', async () => {
      const mockCreate = vi.fn();
      (globalThis as any).chrome = {
        tabs: {
          create: mockCreate,
          query: vi.fn((_q, cb) => cb([])),
        },
        runtime: {},
      };

      const node: WorkflowNode = {
        id: 'node-yt-zero-tab-script',
        type: 'youtube_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'YouTube Scraper',
          category: 'scrapers',
          type: 'youtube_scraper',
          properties: {
            engine: 'youtubei_js',
            mode: 'video_script',
            browserFallback: false,
            target: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            outputVariable: 'ytScriptStrictZero',
          },
        },
      };

      const result = await executeYouTubeScraper(node, mockCtx);
      expect(result.success).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockCtx.variables['ytScriptStrictZero']).toBeDefined();
      expect(mockCtx.variables['ytScriptStrictZero_transcript']).toBeDefined();
    });

    it('does NOT open any browser tab when engines are amazon_buddy, syndication_api, or google_sr', async () => {
      const mockCreate = vi.fn();
      (globalThis as any).chrome = {
        tabs: {
          create: mockCreate,
          query: vi.fn(),
        },
        runtime: {},
      };

      // Amazon amazon-buddy
      const amazonNode: WorkflowNode = {
        id: 'node-amz-zero-tab',
        type: 'amazon_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Amazon Scraper',
          category: 'scrapers',
          type: 'amazon_scraper',
          properties: {
            engine: 'amazon_buddy',
            query: 'wireless mouse',
            outputVariable: 'amzItems',
          },
        },
      };
      const amzRes = await executeAmazonScraper(amazonNode, mockCtx);
      expect(amzRes.success).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockCtx.variables['amzItems']).toBeDefined();

      // Twitter twitter_scraper (zero-tab)
      const twitterNode: WorkflowNode = {
        id: 'node-tw-zero-tab',
        type: 'twitter_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Twitter Scraper',
          category: 'scrapers',
          type: 'twitter_scraper',
          properties: {
            engine: 'twitter_scraper',
            mode: 'profile_tweets',
            username: 'nasa',
            outputVariable: 'twItems',
          },
        },
      };
      const twRes = await executeTwitterScraper(twitterNode, mockCtx);
      expect(twRes.success).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockCtx.variables['twItems']).toBeDefined();

      // Google google_sr
      const googleNode: WorkflowNode = {
        id: 'node-goog-zero-tab',
        type: 'google_search_scraper',
        position: { x: 0, y: 0 },
        data: {
          label: 'Google Scraper',
          category: 'scrapers',
          type: 'google_search_scraper',
          properties: {
            engine: 'google_sr',
            query: 'browser automation',
            outputVariable: 'googItems',
          },
        },
      };
      const googRes = await executeGoogleSearchScraper(googleNode, mockCtx);
      expect(googRes.success).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockCtx.variables['googItems']).toBeDefined();
    });
  });

  describe('Authentic Error Handling & Zero Fake Data Guarantee', () => {
    it('Amazon Scraper never fabricates fake "Pro Edition" items when 0 products found', async () => {
      // Mock fetch to simulate empty or blocked response
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '<html>Robot Check</html>',
      } as any);

      try {
        const node: WorkflowNode = {
          id: 'node-amz-empty',
          type: 'amazon_scraper',
          position: { x: 0, y: 0 },
          data: {
            label: 'Amazon Scraper',
            category: 'scrapers',
            type: 'amazon_scraper',
            properties: {
              engine: 'amazon_buddy',
              query: 'nonexistent-random-product-xyz-12345',
              outputVariable: 'amzTestOut',
            },
          },
        };

        const result = await executeAmazonScraper(node, mockCtx);
        expect(result.items).toEqual([]);
        expect(mockCtx.variables['amzTestOut']).toEqual([]);
        expect(mockCtx.variables['amzTestOut_count']).toBe(0);
        // Verify no fake "Pro Edition" item was created
        const anyFake = (result.items || []).some((item: any) =>
          String(item.title || '').includes('Pro Edition')
        );
        expect(anyFake).toBe(false);
        expect(result.error).toBeDefined();
        expect(mockCtx.updateNodeState).toHaveBeenCalledWith(
          'node-amz-empty',
          expect.objectContaining({ status: 'error' })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('X / Twitter Scraper never fabricates fake "TechExplorer" items when syndication fails', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Rate Limited',
        text: async () => 'Rate limit exceeded',
      } as any);

      try {
        const node: WorkflowNode = {
          id: 'node-tw-empty',
          type: 'twitter_scraper',
          position: { x: 0, y: 0 },
          data: {
            label: 'Twitter Scraper',
            category: 'scrapers',
            type: 'twitter_scraper',
            properties: {
              engine: 'twitter_scraper',
              mode: 'profile_tweets',
              username: 'some_nonexistent_user_99999',
              outputVariable: 'twTestOut',
            },
          },
        };

        const result = await executeTwitterScraper(node, mockCtx);
        expect(result.items).toEqual([]);
        expect(mockCtx.variables['twTestOut']).toEqual([]);
        expect(mockCtx.variables['twTestOut_count']).toBe(0);
        // Verify no fake "TechExplorer" tweet was created
        const anyFake = (result.items || []).some((item: any) =>
          String(item.author || '').includes('TechExplorer') || String(item.text || '').includes('Exploring keyless')
        );
        expect(anyFake).toBe(false);
        expect(result.error).toBeDefined();
        expect(mockCtx.updateNodeState).toHaveBeenCalledWith(
          'node-tw-empty',
          expect.objectContaining({ status: 'error' })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Google Search Scraper never fabricates fake "Official Guide & Resources" items when search fails', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => '<html>enablejs</html>',
      } as any);

      try {
        const node: WorkflowNode = {
          id: 'node-goog-empty',
          type: 'google_search_scraper',
          position: { x: 0, y: 0 },
          data: {
            label: 'Google Scraper',
            category: 'scrapers',
            type: 'google_search_scraper',
            properties: {
              engine: 'google_sr',
              query: 'xyznonexistenttermquery999',
              outputVariable: 'googTestOut',
            },
          },
        };

        const result = await executeGoogleSearchScraper(node, mockCtx);
        expect(result.items).toEqual([]);
        expect(mockCtx.variables['googTestOut']).toEqual([]);
        expect(mockCtx.variables['googTestOut_count']).toBe(0);
        // Verify no fake "Official Guide & Resources" item was created
        const anyFake = (result.items || []).some((item: any) =>
          String(item.title || '').includes('Official Guide & Resources')
        );
        expect(anyFake).toBe(false);
        expect(result.error).toBeDefined();
        expect(mockCtx.updateNodeState).toHaveBeenCalledWith(
          'node-goog-empty',
          expect.objectContaining({ status: 'error' })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Amazon Scraper extracts authentic fields when real product cards are returned', async () => {
      const sampleAmazonHtml = `
        <div data-asin="B094QH5MWN">
          <h2><span>E-YOOSO Wireless Mouse 4800 DPI</span></h2>
          <span class="a-offscreen">$14.99</span>
          <span class="a-icon-alt">4.4 out of 5 stars</span>
          <span aria-label="8,457 ratings">8,457</span>
          <i class="a-icon-prime"></i>
          <img class="s-image" src="https://m.media-amazon.com/mouse.jpg" />
        </div>
      `;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => sampleAmazonHtml,
      } as any);

      try {
        const node: WorkflowNode = {
          id: 'node-amz-real',
          type: 'amazon_scraper',
          position: { x: 0, y: 0 },
          data: {
            label: 'Amazon Scraper',
            category: 'scrapers',
            type: 'amazon_scraper',
            properties: {
              engine: 'amazon_buddy',
              query: 'mouse',
              outputVariable: 'amzRealOut',
            },
          },
        };

        const result = await executeAmazonScraper(node, mockCtx);
        expect(result.items.length).toBe(1);
        const item = result.items[0];
        expect(item.asin).toBe('B094QH5MWN');
        expect(item.title).toBe('E-YOOSO Wireless Mouse 4800 DPI');
        expect(item.price).toBe('$14.99');
        expect(item.rating).toBe('4.4 out of 5 stars');
        expect(item.reviewsCount).toBe('8,457');
        expect(item.isPrime).toBe(true);
        expect(item.image).toBe('https://m.media-amazon.com/mouse.jpg');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
