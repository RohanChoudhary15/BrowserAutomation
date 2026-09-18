import { Workflow } from '../types/workflow';

export const STARTER_WORKFLOW: Workflow = {
  id: 'starter_example_automation',
  name: 'Example Web Automation',
  description: 'Automates navigating to example.com, waiting for heading, extracting text, condition check, and screenshot.',
  version: 1,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  variables: {},
  settings: {
    timeout: 30000,
    retryCount: 1,
    retryDelay: 1000,
    stopOnError: true,
    highlightElements: true,
    humanMode: false,
    humanIntensity: 'natural',
    humanCursor: true,
  },
  nodes: [
    {
      id: 'node_nav',
      type: 'customNode',
      position: { x: 250, y: 50 },
      data: {
        label: 'Navigate',
        category: 'browser',
        type: 'navigate',
        properties: {
          url: 'https://example.com',
          waitUntil: 'load',
          timeout: 15000,
        },
      },
    },
    {
      id: 'node_wait_el',
      type: 'customNode',
      position: { x: 250, y: 180 },
      data: {
        label: 'Wait For Element',
        category: 'wait',
        type: 'wait_for_element',
        properties: {
          selector: 'h1',
          timeout: 10000,
          visible: true,
        },
      },
    },
    {
      id: 'node_extract',
      type: 'customNode',
      position: { x: 250, y: 310 },
      data: {
        label: 'Extract Text',
        category: 'extraction',
        type: 'extract_text',
        properties: {
          selector: 'h1',
          outputVariable: 'pageTitle',
          timeout: 10000,
        },
      },
    },
    {
      id: 'node_cond',
      type: 'conditionNode',
      position: { x: 250, y: 440 },
      data: {
        label: 'Condition',
        category: 'logic',
        type: 'condition',
        properties: {
          leftValue: '{{pageTitle}}',
          operator: 'contains',
          rightValue: 'Example',
        },
      },
    },
    {
      id: 'node_screenshot',
      type: 'customNode',
      position: { x: 120, y: 590 },
      data: {
        label: 'Screenshot',
        category: 'utility',
        type: 'screenshot',
        properties: {
          outputVariable: 'finalScreenshot',
        },
      },
    },
  ],
  edges: [
    { id: 'edge_1', source: 'node_nav', target: 'node_wait_el', animated: true },
    { id: 'edge_2', source: 'node_wait_el', target: 'node_extract', animated: true },
    { id: 'edge_3', source: 'node_extract', target: 'node_cond', animated: true },
    { id: 'edge_4', source: 'node_cond', target: 'node_screenshot', sourceHandle: 'true', label: 'TRUE', animated: true },
  ],
};

/**
 * Real-world workflow: Hacker News Top Stories Scraper & Digest Webhook
 */
export const HACKER_NEWS_WORKFLOW: Workflow = {
  id: 'hn_live_scraper',
  name: 'Hacker News Live Intel & Webhook',
  description: 'Navigates to Hacker News, extracts the top story headline and all 30 front-page titles, verifies content, captures a screenshot, and posts the digest to a webhook.',
  version: 1,
  createdAt: 1700000001000,
  updatedAt: 1700000001000,
  variables: {},
  settings: {
    timeout: 30000,
    retryCount: 1,
    retryDelay: 1000,
    stopOnError: true,
    highlightElements: true,
    humanMode: false,
    humanIntensity: 'natural',
    humanCursor: true,
  },
  nodes: [
    {
      id: 'hn_nav',
      type: 'customNode',
      position: { x: 250, y: 40 },
      data: {
        label: 'Navigate to Hacker News',
        category: 'browser',
        type: 'navigate',
        properties: {
          url: 'https://news.ycombinator.com',
          waitUntil: 'load',
          timeout: 20000,
        },
      },
    },
    {
      id: 'hn_wait',
      type: 'customNode',
      position: { x: 250, y: 170 },
      data: {
        label: 'Wait for Stories',
        category: 'wait',
        type: 'wait_for_element',
        properties: {
          selector: '.athing',
          timeout: 10000,
          visible: true,
        },
      },
    },
    {
      id: 'hn_extract_top',
      type: 'customNode',
      position: { x: 250, y: 300 },
      data: {
        label: 'Extract #1 Story Title',
        category: 'extraction',
        type: 'extract_text',
        properties: {
          selector: '.titleline > a',
          outputVariable: 'topStory',
          timeout: 10000,
        },
      },
    },
    {
      id: 'hn_extract_all',
      type: 'customNode',
      position: { x: 250, y: 430 },
      data: {
        label: 'Extract All 30 Headlines',
        category: 'extraction',
        type: 'extract_multiple',
        properties: {
          selector: '.titleline > a',
          outputVariable: 'allHeadlines',
          timeout: 10000,
        },
      },
    },
    {
      id: 'hn_cond',
      type: 'conditionNode',
      position: { x: 250, y: 560 },
      data: {
        label: 'Verify Top Story Exists',
        category: 'logic',
        type: 'condition',
        properties: {
          leftValue: '{{topStory}}',
          operator: 'is_not_empty',
          rightValue: '',
        },
      },
    },
    {
      id: 'hn_screenshot',
      type: 'customNode',
      position: { x: 100, y: 710 },
      data: {
        label: 'Capture Front Page',
        category: 'utility',
        type: 'screenshot',
        properties: {
          outputVariable: 'hnScreenshot',
        },
      },
    },
    {
      id: 'hn_webhook',
      type: 'customNode',
      position: { x: 100, y: 840 },
      data: {
        label: 'Post Intel to Webhook',
        category: 'utility',
        type: 'http_request',
        properties: {
          method: 'POST',
          url: 'https://httpbin.org/post',
          headers: { 'Content-Type': 'application/json' },
          body: {
            source: 'Hacker News Live Scraper',
            topStory: '{{topStory}}',
            summary: 'Scraped successfully via AutoFlow',
          },
          outputVariable: 'webhookResponse',
        },
      },
    },
  ],
  edges: [
    { id: 'hn_e1', source: 'hn_nav', target: 'hn_wait', animated: true },
    { id: 'hn_e2', source: 'hn_wait', target: 'hn_extract_top', animated: true },
    { id: 'hn_e3', source: 'hn_extract_top', target: 'hn_extract_all', animated: true },
    { id: 'hn_e4', source: 'hn_extract_all', target: 'hn_cond', animated: true },
    { id: 'hn_e5', source: 'hn_cond', target: 'hn_screenshot', sourceHandle: 'true', label: 'TRUE', animated: true },
    { id: 'hn_e6', source: 'hn_screenshot', target: 'hn_webhook', animated: true },
  ],
};

/**
 * Real-world workflow: Quotes to Scrape Interactive Filter & Scraper
 */
export const QUOTES_SCRAPER_WORKFLOW: Workflow = {
  id: 'quotes_live_scraper',
  name: 'Quotes to Scrape Interactive Automation',
  description: 'Navigates to quotes.toscrape.com, extracts the featured quote and list of authors, clicks the "inspirational" tag filter, waits for DOM update, and captures the filtered results.',
  version: 1,
  createdAt: 1700000002000,
  updatedAt: 1700000002000,
  variables: {},
  settings: {
    timeout: 30000,
    retryCount: 1,
    retryDelay: 1000,
    stopOnError: true,
    highlightElements: true,
    humanMode: false,
    humanIntensity: 'natural',
    humanCursor: true,
  },
  nodes: [
    {
      id: 'q_nav',
      type: 'customNode',
      position: { x: 250, y: 40 },
      data: {
        label: 'Open Quotes to Scrape',
        category: 'browser',
        type: 'navigate',
        properties: {
          url: 'https://quotes.toscrape.com',
          waitUntil: 'load',
          timeout: 20000,
        },
      },
    },
    {
      id: 'q_wait',
      type: 'customNode',
      position: { x: 250, y: 170 },
      data: {
        label: 'Wait for Quotes',
        category: 'wait',
        type: 'wait_for_element',
        properties: {
          selector: '.quote',
          timeout: 10000,
          visible: true,
        },
      },
    },
    {
      id: 'q_extract_text',
      type: 'customNode',
      position: { x: 250, y: 300 },
      data: {
        label: 'Extract Featured Quote',
        category: 'extraction',
        type: 'extract_text',
        properties: {
          selector: '.quote .text',
          outputVariable: 'featuredQuote',
          timeout: 10000,
        },
      },
    },
    {
      id: 'q_extract_authors',
      type: 'customNode',
      position: { x: 250, y: 430 },
      data: {
        label: 'Extract All Authors',
        category: 'extraction',
        type: 'extract_multiple',
        properties: {
          selector: '.quote .author',
          outputVariable: 'authorsList',
          timeout: 10000,
        },
      },
    },
    {
      id: 'q_click_tag',
      type: 'customNode',
      position: { x: 250, y: 560 },
      data: {
        label: 'Filter by "Inspirational"',
        category: 'interaction',
        type: 'click',
        properties: {
          selector: 'a[href="/tag/inspirational/"]',
          clickType: 'left',
          timeout: 10000,
        },
      },
    },
    {
      id: 'q_wait_tag',
      type: 'customNode',
      position: { x: 250, y: 690 },
      data: {
        label: 'Wait for Filtered Page',
        category: 'wait',
        type: 'wait_for_text',
        properties: {
          text: 'inspirational',
          timeout: 10000,
        },
      },
    },
    {
      id: 'q_screenshot',
      type: 'customNode',
      position: { x: 250, y: 820 },
      data: {
        label: 'Screenshot Results',
        category: 'utility',
        type: 'screenshot',
        properties: {
          outputVariable: 'filteredScreenshot',
        },
      },
    },
  ],
  edges: [
    { id: 'q_e1', source: 'q_nav', target: 'q_wait', animated: true },
    { id: 'q_e2', source: 'q_wait', target: 'q_extract_text', animated: true },
    { id: 'q_e3', source: 'q_extract_text', target: 'q_extract_authors', animated: true },
    { id: 'q_e4', source: 'q_extract_authors', target: 'q_click_tag', animated: true },
    { id: 'q_e5', source: 'q_click_tag', target: 'q_wait_tag', animated: true },
    { id: 'q_e6', source: 'q_wait_tag', target: 'q_screenshot', animated: true },
  ],
};

export const ALL_TEMPLATES: Workflow[] = [
  HACKER_NEWS_WORKFLOW,
  QUOTES_SCRAPER_WORKFLOW,
  STARTER_WORKFLOW,
];
